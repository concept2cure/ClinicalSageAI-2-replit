#!/usr/bin/env node
/**
 * up.mjs — one command from a clean checkout to an app you can sign into.
 *
 * The problem this solves: every piece of this already existed — install-fresh,
 * deploy-migrate, provision-app-role, seed-admin — and nothing said in what
 * order to run them, which of the 222 keys in .env.example actually matter, or
 * which database role the server connects as. The default .env pointed at a
 * role with no grants on any of the 963 tables, so a correct install still
 * failed every query. Somebody who wanted to SEE the product had no path to it.
 *
 * This runs the existing scripts in the one order that works, writes the two
 * env values the runtime actually needs into .env.local, seeds an account, and
 * prints where to go and who to sign in as. It is idempotent — re-run it any
 * time; it repairs rather than duplicates.
 *
 *   npm run up
 *
 * Environment (all optional):
 *   DATABASE_URL      provisioning connection (owner/superuser). Default: local postgres.
 *   ADMIN_EMAIL       account to seed.       Default: jm.smith@concept2cure.pro
 *   ADMIN_PASSWORD    its password.          Default: generated and printed.
 *   PORT              app port.              Default: 5000
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';

const PORT = process.env.PORT || '5000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jm.smith@concept2cure.pro';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || `c2c-${randomBytes(9).toString('base64url')}`;
const APP_ROLE = process.env.APP_SERVICE_DB_ROLE || 'app_service';

const ADMIN_URL = process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';

let step = 0;
const say = (m) => console.log(`\n[${++step}] ${m}`);
const ok = (m) => console.log(`    ✓ ${m}`);
const die = (m, hint) => {
  console.error(`\n✗ ${m}`);
  if (hint) console.error(`\n${hint}\n`);
  process.exit(1);
};

/** Same connection string, different database name. */
function withDatabase(url, name) {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

/** Same connection string, different role + password. */
function withRole(url, role, password) {
  const u = new URL(url);
  u.username = role;
  u.password = password;
  return u.toString();
}

function run(label, argv, env) {
  const r = spawnSync(argv[0], argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) die(`${label} failed (exit ${r.status}).`);
}

const dbName = new URL(ADMIN_URL).pathname.replace(/^\//, '') || 'postgres';
const targetDb = process.env.C2C_DB_NAME || (dbName === 'postgres' ? 'clinicalsage' : dbName);

async function main() {
  console.log('Concept2Cure — local bring-up');

  // ── 1. Postgres reachable? ────────────────────────────────────────────
  say('Checking Postgres');
  const probe = new pg.Client({ connectionString: withDatabase(ADMIN_URL, 'postgres') });
  try {
    await probe.connect();
  } catch (error) {
    die(
      `Cannot reach Postgres at ${new URL(ADMIN_URL).host} — ${error.message}`,
      'Start one, then re-run `npm run up`:\n\n' +
        '  docker run -d --name c2c-pg -p 5432:5432 \\\n' +
        '    -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=clinicalsage postgres:16\n\n' +
        'Or point DATABASE_URL at an existing server:\n\n' +
        '  DATABASE_URL=postgresql://user:pass@host:5432/clinicalsage npm run up',
    );
  }
  ok(`connected to ${new URL(ADMIN_URL).host}`);

  // ── 2. Database exists ────────────────────────────────────────────────
  say(`Ensuring database "${targetDb}"`);
  const { rows } = await probe.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
  if (rows.length === 0) {
    // Identifier, not a value — quoted rather than parameterised.
    await probe.query(`CREATE DATABASE "${targetDb.replace(/"/g, '""')}"`);
    ok('created');
  } else {
    ok('already present');
  }
  await probe.end();

  const ownerUrl = withDatabase(ADMIN_URL, targetDb);
  const appPassword = process.env.APP_SERVICE_DB_PASSWORD
    || `svc-${randomBytes(12).toString('base64url')}`;

  // ── 3-4. Schema, via the canonical scripts ────────────────────────────
  const provisionEnv = {
    DATABASE_URL: ownerUrl,
    APP_SERVICE_DB_PASSWORD: appPassword,
    APP_SERVICE_DB_ROLE: APP_ROLE,
  };
  say('Provisioning schema (install-fresh) — this takes a few minutes');
  run('install-fresh', ['node', 'scripts/db/install-fresh.mjs'], provisionEnv);
  say('Applying migrations and verifying the readiness contract (deploy-migrate)');
  run('deploy-migrate', ['node', 'scripts/db/deploy-migrate.mjs'], provisionEnv);

  // ── 5. The runtime role must actually be able to read ─────────────────
  say(`Verifying the runtime role "${APP_ROLE}" can read`);
  const appUrl = withRole(ownerUrl, APP_ROLE, appPassword);
  const app = new pg.Client({ connectionString: appUrl });
  try {
    await app.connect();
    await app.query('SELECT 1 FROM organizations LIMIT 1');
    ok('reads the application schema');
  } catch (error) {
    die(
      `${APP_ROLE} cannot read the schema it was just granted — ${error.message}`,
      'This is the failure that makes a correct install look broken: the server\n' +
        'connects as APP_DATABASE_URL and every query returns permission denied.',
    );
  } finally {
    await app.end().catch(() => {});
  }

  // ── 6. Write the two values the runtime needs ─────────────────────────
  say('Writing .env.local');
  const lines = [
    '# Written by `npm run up`. Git-ignored. Delete and re-run to regenerate.',
    `APP_DATABASE_URL=${appUrl}`,
    `DATABASE_URL=${ownerUrl}`,
    `PORT=${PORT}`,
    'NODE_ENV=development',
    '',
  ].join('\n');
  fs.writeFileSync('.env.local', lines);
  ok('.env.local written (APP_DATABASE_URL is the one the server reads)');

  // ── 7. An account to sign in as ───────────────────────────────────────
  say('Seeding an administrator');
  run('seed-admin', ['node', 'scripts/seed-admin.mjs'], {
    DATABASE_URL: appUrl,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
  });

  console.log(`
────────────────────────────────────────────────────────────
  Ready.

    npm run dev

  Then open   http://localhost:${PORT}/auth
    Email     ${ADMIN_EMAIL}
    Password  ${ADMIN_PASSWORD}

  These credentials are for local development only.
────────────────────────────────────────────────────────────
`);
}

main().catch((error) => die(error.stack || error.message));
