#!/usr/bin/env node
/**
 * provision.mjs — ONE command from an empty PostgreSQL database to the schema
 * /readyz reports `schema: ok` on.
 *
 *     DATABASE_OWNER_URL='postgres://owner@…/db' \
 *     APP_DATABASE_URL='postgres://app_service:…@…/db' \
 *     APP_SERVICE_DB_PASSWORD='…' \
 *     node scripts/db/provision.mjs            # npm run db:provision
 *
 * ── Why (2026-09-20, launch row D1) ──────────────────────────────────────────
 * Turning an empty database into one the server will serve from took FOUR
 * things an operator had to know, in order, none of which the scripts stated
 * as one path:
 *
 *   1. pgvector had to be available on the SERVER before install-fresh ran.
 *      install-fresh degrades without it and exits 1, but by then drizzle-kit
 *      push has read the schema once, and its header explains why a second run
 *      over that database cannot repair it: repair means an EMPTY database.
 *      So the check belongs BEFORE the first write, and it lives here.
 *   2. install-fresh had to run as a role that can CREATE EXTENSION and
 *      CREATE ROLE. Three governed-content files (005/017/080 _gcc_) create
 *      roles; run as a plain database owner they fail, install-fresh records
 *      six governed-content shortfalls, and the database is "INCOMPLETE" with
 *      no repair path other than starting over.
 *   3. deploy-migrate had to run next, as the same owner. install-fresh alone
 *      leaves `public.licenses` (SECURITY_CRITICAL in /readyz) and
 *      `audit.tamper_proof_log` (the Part 11 store) absent — both are created
 *      only by files in C2C_MIGRATION_FILES. Measured on 2026-09-20.
 *   4. The runtime role had to be minted (APP_SERVICE_DB_PASSWORD) and the app
 *      pointed at it (APP_DATABASE_URL), or production refuses to boot under
 *      RLS_ENFORCE=on.
 *
 * This script is those four things in that order, with the role split made
 * explicit: the OWNER connection provisions, the APP connection is what the
 * final readiness check runs as, so what is verified is what the server will
 * see — not what the superuser can see.
 *
 * ── Connections ──────────────────────────────────────────────────────────────
 *   DATABASE_OWNER_URL   owner/admin — CREATE EXTENSION, CREATE ROLE, DDL, GRANT.
 *                        Falls back to DATABASE_URL with a WARNING: the fallback
 *                        is the single-role posture, which is exactly what D3
 *                        (tenant isolation proven) forbids in production.
 *   APP_DATABASE_URL     the request-serving role (app_service). Falls back to
 *                        DATABASE_URL. Must name the same database as the owner
 *                        URL; refused otherwise.
 *   APP_SERVICE_DB_PASSWORD  when set, install-fresh / deploy-migrate mint or
 *                        align the app_service role and grant it every schema
 *                        (scripts/db/provision-app-role.mjs). Unset → no role
 *                        is minted and the readiness check runs as the owner.
 *
 * ── Fail-closed contract ─────────────────────────────────────────────────────
 * Every refusal is BEFORE the first write when it can be, names the cause, and
 * names the fix. Nothing is retried, skipped or assumed. Exit codes:
 *   0  provisioned and the readiness contract holds on the app connection
 *   2  configuration (URLs missing / mismatched, psql absent)
 *   4  pgvector is not available on the server — nothing was written
 *   5  the owner role cannot CREATE ROLE / CREATE EXTENSION — nothing was written
 *   6  install-fresh failed (its own exit code and log say why)
 *   7  deploy-migrate failed
 *   8  provisioned, but the readiness contract does NOT hold on the app
 *      connection — /readyz would report schema: down
 *
 * ── Re-runs ──────────────────────────────────────────────────────────────────
 * Safe over a COMPLETE database (every step is idempotent). Over a partial one
 * it is not a repair — see install-fresh's header — and the preflight says so
 * when it sees that shape.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { sslFor } from './connection.mjs';
import { AUTHORING_SUBSYSTEM_TABLES } from './authoring-subsystem.mjs';
import { resolveAppServiceRole } from './provision-app-role.mjs';
import { verifyReadinessContract, BASE_SCHEMA_SENTINELS } from './readiness-contract.mjs';

dotenv.config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const EXIT_CONFIG = 2;
const EXIT_NO_PGVECTOR = 4;
const EXIT_OWNER_PRIVILEGES = 5;
const EXIT_INSTALL_FAILED = 6;
const EXIT_MIGRATE_FAILED = 7;
const EXIT_CONTRACT_FAILED = 8;

const log = (m = '') => console.info(m);
const warn = (m) => console.warn(m);
const errorLog = (m) => console.error(m);

/** Strip a pasted `psql '…'` wrapper, like connection.mjs does. */
function cleanUrl(v) {
  return String(v).replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
}

/** `user@host:port/db` with the password removed — safe for a transcript. */
function describeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.username || '(no user)'}@${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}

function dbNameOf(url) {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

function hostOf(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}`;
  } catch {
    return '';
  }
}

function fail(code, lines) {
  errorLog('');
  for (const l of lines) errorLog(l);
  process.exit(code);
}

/** Resolve the two connection strings and the posture they imply. */
function resolveConnections(env) {
  const ownerRaw = env.DATABASE_OWNER_URL;
  const appRaw = env.APP_DATABASE_URL;
  const generic = env.DATABASE_URL;

  let ownerUrl;
  let ownerFallback = false;
  if (ownerRaw) {
    ownerUrl = cleanUrl(ownerRaw);
  } else if (generic) {
    ownerUrl = cleanUrl(generic);
    ownerFallback = true;
  }
  const appUrl = appRaw ? cleanUrl(appRaw) : generic ? cleanUrl(generic) : undefined;

  if (!ownerUrl) {
    fail(EXIT_CONFIG, [
      '✗ No owner connection string.',
      '  Set DATABASE_OWNER_URL to the owner/admin connection (CREATE EXTENSION,',
      '  CREATE ROLE, DDL, GRANT). DATABASE_URL is accepted as a fallback.',
    ]);
  }
  if (!appUrl) {
    fail(EXIT_CONFIG, [
      '✗ No app connection string.',
      '  Set APP_DATABASE_URL to the request-serving (app_service) connection, or',
      '  DATABASE_URL for a single-role install.',
    ]);
  }
  if (dbNameOf(ownerUrl) !== dbNameOf(appUrl) || hostOf(ownerUrl) !== hostOf(appUrl)) {
    fail(EXIT_CONFIG, [
      '✗ Owner and app connection strings name different databases.',
      `  owner: ${describeUrl(ownerUrl)}`,
      `  app:   ${describeUrl(appUrl)}`,
      '  Provisioning one database and verifying another would report readiness',
      '  for a database this run never touched. Point both at the same host and',
      '  database name.',
    ]);
  }
  return { ownerUrl, appUrl, ownerFallback };
}

async function connect(url) {
  const client = new Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();
  return client;
}

/**
 * Preflight on the owner connection. Nothing here writes to the application
 * schema. `CREATE EXTENSION IF NOT EXISTS vector` is the one DDL statement and
 * it is the same statement install-fresh's step 1 would issue: issuing it here
 * means a role that cannot install the extension is refused BEFORE drizzle-kit
 * push reads the schema, while a role that can (RDS master users are not
 * rolsuper but may create vector) is not wrongly refused by a superuser test.
 */
async function preflight(client, { appRoleWanted }) {
  const server = await client.query(
    `SELECT current_setting('server_version') AS version,
            current_setting('server_version_num')::int AS num,
            current_database() AS db, current_user AS role`,
  );
  const { version, num, db, role } = server.rows[0];
  const major = Math.floor(num / 10000);
  log(`  server PostgreSQL ${version}, database ${db}, connected as ${role}`);

  // 1. pgvector availability on the SERVER (not just in this database).
  const avail = await client.query(
    `SELECT default_version, installed_version FROM pg_available_extensions WHERE name = 'vector'`,
  );
  if (avail.rowCount === 0) {
    fail(EXIT_NO_PGVECTOR, [
      '✗ pgvector is NOT available on this PostgreSQL server — refusing to provision.',
      '  pg_available_extensions has no row for "vector": the extension package is',
      '  not installed on the server, so CREATE EXTENSION vector cannot succeed for',
      '  any role. Eleven tables in shared/schema.ts and the CSR-knowledge and',
      '  governed-content trees need the vector type; provisioning without it',
      '  produces a database that install-fresh cannot repair later (see its header',
      '  on why a second run over a partly-installed database emits nothing).',
      '',
      `  Install it on the server for PostgreSQL ${major}, then run this again:`,
      `      apt-get install -y postgresql-${major}-pgvector      # Debian / Ubuntu`,
      '      (RDS / Aurora: pgvector ships with the engine — CREATE EXTENSION vector',
      '       as the master user; Neon: enable it from the console)',
      '',
      '  Nothing was written to the database.',
    ]);
  }
  const installed = avail.rows[0].installed_version;
  log(
    `  ✓ pgvector available (package ${avail.rows[0].default_version}` +
      `${installed ? `, installed ${installed}` : ', not yet installed in this database'})`,
  );

  // 2. Owner privileges: CREATE ROLE (three *_gcc_* files) and CREATE EXTENSION.
  const priv = await client.query(
    `SELECT rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = current_user`,
  );
  const { rolsuper, rolcreaterole } = priv.rows[0];
  const problems = [];
  if (!rolsuper && !rolcreaterole) {
    problems.push(
      `role ${role} has neither SUPERUSER nor CREATEROLE. db/migrations/005_gcc_database_roles.sql, ` +
        '017_gcc_shadow_agent_rbac.sql and 080_gcc_21cfr_part11_compliance.sql each CREATE ROLE' +
        (appRoleWanted ? ', and APP_SERVICE_DB_PASSWORD asks this run to mint the app_service role' : '') +
        '. Run as a role with CREATEROLE (the RDS master user has it; locally: ALTER ROLE … CREATEROLE).',
    );
  }
  if (!installed) {
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      log('  ✓ CREATE EXTENSION vector succeeded as the owner');
    } catch (err) {
      problems.push(
        `role ${role} cannot CREATE EXTENSION vector: ${String(err.message).split('\n')[0]}. ` +
          'vector is not a trusted extension, so a superuser (or the provider\'s admin role) must ' +
          'create it — either run this script as that role, or pre-create it: ' +
          `psql -U postgres -d ${db} -c 'CREATE EXTENSION vector'.`,
      );
    }
  }
  if (problems.length) {
    fail(EXIT_OWNER_PRIVILEGES, [
      '✗ The owner connection cannot provision this database — refusing before the first write.',
      ...problems.map((p) => `  • ${p}`),
      '',
      '  Nothing else was written to the database.',
    ]);
  }
  log(`  ✓ owner role ${role} can CREATE ROLE (${rolsuper ? 'superuser' : 'CREATEROLE'})`);

  // 3. psql — install-fresh step 6 (governed content) shells out to it.
  const psql = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  if (psql.error || psql.status !== 0) {
    fail(EXIT_CONFIG, [
      '✗ psql is not on PATH. install-fresh applies the governed-content tree',
      '  (db/migrations/*_gcc_*.sql — the audit schema and Part 11 tables) through',
      '  psql, and without it records the install INCOMPLETE. Install the',
      '  postgresql client (apt-get install -y postgresql-client) and run again.',
    ]);
  }
  log(`  ✓ ${psql.stdout.trim()}`);

  // 4. What shape is this database in?
  const sent = await client.query(
    `SELECT t AS name, EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = t AND c.relkind IN ('r','p')) AS present
       FROM unnest($1::text[]) AS t`,
    [BASE_SCHEMA_SENTINELS],
  );
  const present = sent.rows.filter((r) => r.present).map((r) => r.name);
  const publicTables = await client.query(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`,
  );
  const n = publicTables.rows[0].n;
  if (n === 0) {
    log('  ✓ database is empty (0 public tables) — fresh provisioning');
  } else if (present.length === BASE_SCHEMA_SENTINELS.length) {
    log(`  • database already provisioned (${n} public tables) — every step below is idempotent; re-running`);
  } else {
    warn(
      `  ⚠ database is PARTIALLY provisioned (${n} public tables; base sentinels present: ` +
        `${present.join(', ') || 'none'}). install-fresh cannot repair a partial step 2 — if this run ` +
        'does not converge, drop the database and provision into an empty one.',
    );
  }
}

/** Run one of the installers as the OWNER, with the URL precedence pinned. */
function runAsOwner(label, script, ownerUrl, env) {
  const childEnv = { ...env };
  // Every URL name any of the appliers or drizzle.config.ts consults is set to
  // the owner URL, so no leftover NEON_* / DATABASE_NEON_NEW_SECRET / *_ADMIN
  // variable in the operator's shell can redirect one step at a different
  // database than the others.
  for (const name of [
    'DATABASE_URL',
    'DATABASE_URL_ADMIN',
    'NEON_DATABASE_URL',
    'NEON_DATABASE_URL_ADMIN',
    'DATABASE_NEON_NEW_SECRET',
  ]) {
    childEnv[name] = ownerUrl;
  }
  // The installers must never see the runtime URL: they run as the owner.
  delete childEnv.APP_DATABASE_URL;
  delete childEnv.DATABASE_OWNER_URL;

  log(`\n▶ ${label}`);
  log(`  $ node ${path.relative(REPO_ROOT, script)}    (as ${describeUrl(ownerUrl)})`);
  const res = spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    env: childEnv,
    stdio: 'inherit',
  });
  if (res.error) return { ok: false, detail: res.error.message, status: null };
  return { ok: res.status === 0, status: res.status, detail: `exit ${res.status}` };
}

async function main() {
  log('▶ 0/4 Connections');
  const { ownerUrl, appUrl, ownerFallback } = resolveConnections(process.env);
  const appRoleWanted = Boolean(process.env.APP_SERVICE_DB_PASSWORD);
  const appRole = resolveAppServiceRole(process.env);

  log(`  owner: ${describeUrl(ownerUrl)}${ownerFallback ? '   (DATABASE_URL fallback)' : ''}`);
  log(`  app:   ${describeUrl(appUrl)}`);
  if (ownerFallback) {
    warn(
      '  ⚠ DATABASE_OWNER_URL is not set — using DATABASE_URL as the owner connection.\n' +
        '    This is the single-role posture: migrations and the request-serving pool share\n' +
        '    one role, RLS is inert on it if it owns the tables, and production refuses to\n' +
        '    boot on it under RLS_ENFORCE=on. Fine for a laptop; not for staging or production.',
    );
  }
  if (appRoleWanted) {
    log(`  runtime role: ${appRole} will be minted/aligned (APP_SERVICE_DB_PASSWORD is set)`);
    if (appUrl === ownerUrl) {
      warn(
        `  ⚠ APP_SERVICE_DB_PASSWORD is set but APP_DATABASE_URL is not: the role ${appRole} will be\n` +
          '    provisioned, but the readiness check below runs as the OWNER, and so will the\n' +
          '    server until APP_DATABASE_URL points at the role.',
      );
    }
  } else {
    log('  runtime role: not minted (APP_SERVICE_DB_PASSWORD unset) — the app connects as the owner');
  }

  log('\n▶ 1/4 Preflight (owner connection, nothing written except CREATE EXTENSION vector)');
  const owner = await connect(ownerUrl).catch((err) =>
    fail(EXIT_CONFIG, [`✗ cannot connect as the owner: ${err.message}`]),
  );
  try {
    await preflight(owner, { appRoleWanted });
  } finally {
    await owner.end().catch(() => {});
  }

  const install = runAsOwner(
    '2/4 install-fresh — base schema, RLS, authoring subsystem, governed content',
    path.join(__dirname, 'install-fresh.mjs'),
    ownerUrl,
    process.env,
  );
  if (!install.ok) {
    fail(EXIT_INSTALL_FAILED, [
      `✗ install-fresh did not complete (${install.detail}). Its log above names the`,
      '  incomplete area(s). Not continuing to deploy-migrate: applying the C2C set',
      '  onto an incomplete base is the state nobody can reason about.',
    ]);
  }

  const migrate = runAsOwner(
    '3/4 deploy-migrate — the C2C migration set (licenses, audit.tamper_proof_log, …) + grant refresh',
    path.join(__dirname, 'deploy-migrate.mjs'),
    ownerUrl,
    process.env,
  );
  if (!migrate.ok) {
    fail(EXIT_MIGRATE_FAILED, [
      `✗ deploy-migrate did not complete (${migrate.detail}). See its log above; it is`,
      '  idempotent, so fix the cause and re-run this command.',
    ]);
  }

  log('\n▶ 4/4 Readiness contract — as the APP connection, the way /readyz will see it');
  const asRuntimeRole = appRoleWanted && appUrl !== ownerUrl;
  const app = await connect(appUrl).catch((err) =>
    fail(EXIT_CONTRACT_FAILED, [
      `✗ cannot connect as the app: ${err.message}`,
      '  The database is provisioned, but the server would fail the same way at boot.',
    ]),
  );
  let result;
  try {
    result = await verifyReadinessContract(app, {
      log,
      authoringTables: AUTHORING_SUBSYSTEM_TABLES,
      asRuntimeRole,
    });
  } finally {
    await app.end().catch(() => {});
  }
  if (!result.ok) {
    fail(EXIT_CONTRACT_FAILED, [
      '✗ Provisioned, but the readiness contract does NOT hold on the app connection.',
      '  /readyz would report schema: down with:',
      ...result.failures.map((f) => `    • ${f}`),
    ]);
  }
  if (!asRuntimeRole) {
    warn(
      '  ⚠ verified as the OWNER (no APP_DATABASE_URL / APP_SERVICE_DB_PASSWORD split): the\n' +
        '    SELECT-reach and non-superuser checks did not run. Production needs the split.',
    );
  }

  log('\n✅ Database provisioned and the /readyz schema contract holds.');
  log('   Next:');
  log('   • boot the server with DATABASE_URL / APP_DATABASE_URL pointed at this database;');
  log('     GET /readyz must report schema: ok (ana is down until an AI provider key is set).');
  log('   • production: RLS_ENFORCE=on, AUDIT_TRAIL_ENABLED=true, and APP_DATABASE_URL on the');
  log(`     ${appRole} role — the boot refuses a superuser under RLS_ENFORCE=on.`);
  log('   • every later deploy re-runs deploy-migrate only (the AWS pipeline does this).');
}

main().catch((err) => {
  errorLog(`\n❌ provision failed: ${err.message}`);
  process.exit(1);
});
