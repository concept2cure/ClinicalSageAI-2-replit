#!/usr/bin/env node
/**
 * deploy-migrate.mjs — THE production deploy-time schema migration entrypoint.
 *
 * ── The gap this closes (C2C-DB-001 / REM-7) ──────────────────────────────────
 * There was no production migration mechanism at all. The container CMD is
 * `npm run start` → `NODE_ENV=production node dist/index.js`, which applies
 * nothing; .github/workflows/deploy-aws.yml contained ZERO migration references
 * across all eight jobs; and the runtime image did not even carry db/migrations
 * or scripts/db, so nothing inside it *could* migrate. Schema changes reached
 * real databases only when a human remembered to run an applier by hand. That is
 * the mechanism behind "merged ≠ applied": code that reads a table ships on a
 * deploy, the table does not.
 *
 * This script is the mechanism. deploy-aws.yml runs it as a one-off ECS task on
 * the SAME digest-pinned image the services are about to run, inside the same
 * VPC as the database, and refuses to roll the API/worker services unless it
 * exits 0.
 *
 * ── What it deliberately does NOT do ──────────────────────────────────────────
 * It does not provision a blank database. From-scratch provisioning is
 * scripts/db/install-fresh.mjs, which shells out to `drizzle-kit push` — a
 * devDependency that the production image does not contain (`npm ci --omit=dev`).
 * So on a database that was never provisioned this script FAILS LOUDLY at the
 * preflight below rather than applying an island of tables onto an empty schema
 * and letting the app boot against a schema nobody owns. Half-provisioned is the
 * state nobody can reason about; absent is at least honest, and /readyz reports
 * it (server/db/ensureCoreTables.ts).
 *
 * It also does not apply the governed-content tree (db/migrations/*_gcc_*.sql).
 * Those are psql-authored, carry their own uuid-keyed tenancy and their own RLS,
 * and are deliberately never combined with the integer-keyed app RLS rollout —
 * see the header of install-fresh.mjs.
 *
 * ── Order and atomicity ───────────────────────────────────────────────────────
 *   1. Preflight — the base app schema must already exist.
 *   2. Advisory lock — one migration at a time, cluster-wide.
 *   3. Authoring subsystem — four files as ONE transaction (all or none), plus
 *      the tenant_isolation_policy the apply path must install itself because
 *      0021_enable_rls_everywhere has long since run and never revisits new
 *      tables. See scripts/db/authoring-subsystem.mjs.
 *   4. The out-of-band migration set — scripts/db/migration-set.mjs, one
 *      transaction per file, STOPPING at the first failure.
 *   5. Refresh the non-superuser runtime role's grants (app_service) so tables
 *      this deploy created are reachable by the request-serving pool. No-op
 *      unless APP_SERVICE_DB_PASSWORD is set. See scripts/db/provision-app-role.mjs.
 *   6. Verify the readiness contract /readyz enforces at boot, so a deploy can
 *      never report success while leaving the state that fails readiness.
 *
 * Every step is idempotent; re-running a successful migration is a no-op.
 *
 * ── TLS ───────────────────────────────────────────────────────────────────────
 * The connection verifies the server certificate (scripts/db/connection.mjs).
 * For AWS RDS, supply the Amazon RDS CA bundle via NODE_EXTRA_CA_CERTS rather
 * than disabling verification.
 *
 * Usage:  DATABASE_URL='postgres://…' node scripts/db/deploy-migrate.mjs
 * Exit:   0 success · 1 migration/verification failure · 3 not provisioned
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import {
  applyAuthoringSubsystem,
  AUTHORING_SUBSYSTEM_TABLES,
  AUTHORING_SUBSYSTEM_FK_CONSTRAINTS,
} from './authoring-subsystem.mjs';
import { C2C_MIGRATION_FILES, applyMigrationFiles } from './migration-set.mjs';
import { resolveDatabaseUrl, sslFor, APPLY_URL_VARS } from './connection.mjs';
import { provisionAppServiceRole } from './provision-app-role.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** Exit code for "this database has never been provisioned" — distinct so the
 *  deploy job can tell a first-run infrastructure problem from a bad migration. */
const EXIT_NOT_PROVISIONED = 3;

/**
 * Tables that exist ONLY after a full provisioning run. `organizations` and
 * `users` come from the Drizzle schema (drizzle-kit push); the c2c_* pair comes
 * from the raw migrations/ overlay. Requiring one from each source means a
 * database that got half of the from-scratch install fails preflight too,
 * instead of looking provisioned because push happened to succeed.
 */
const BASE_SCHEMA_SENTINELS = ['organizations', 'users', 'c2c_documents', 'regulatory_programs'];

/**
 * Advisory-lock key. Two ECS deploy tasks racing (a redeploy issued while the
 * previous one is still applying) would interleave DDL. `pg_advisory_lock` is
 * session-scoped and released when this process's connection closes, including
 * on crash — so a killed task cannot wedge the next deploy.
 */
const MIGRATION_LOCK_KEY = 4210251975;

const log = (m) => console.info(m);
const errorLog = (m) => console.error(m);

/** Which of `tables` are absent from the public schema. */
async function missingTables(client, tables) {
  const res = await client.query(
    `SELECT t AS name, to_regclass('public.' || t) IS NOT NULL AS present
       FROM unnest($1::text[]) AS t`,
    [tables],
  );
  return res.rows.filter((r) => !r.present).map((r) => r.name);
}

async function preflight(client) {
  const missing = await missingTables(client, BASE_SCHEMA_SENTINELS);
  if (missing.length === 0) {
    log(`  ✓ base schema present (${BASE_SCHEMA_SENTINELS.join(', ')})`);
    return;
  }
  errorLog('');
  errorLog('✗ This database has not been provisioned — refusing to migrate.');
  errorLog(`  Missing base tables: ${missing.join(', ')}`);
  errorLog('');
  errorLog('  This script applies INCREMENTAL migrations onto an existing app schema.');
  errorLog('  From-scratch provisioning is a separate, one-time step that needs');
  errorLog('  devDependencies (drizzle-kit), so it runs from a repo checkout — not');
  errorLog('  from the production image:');
  errorLog('');
  errorLog("      DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs");
  errorLog('');
  errorLog('  Applying this set onto an empty database would create an island of');
  errorLog('  tables with no base schema under them, and the app would boot against');
  errorLog('  a schema it does not own. Failing instead.');
  process.exit(EXIT_NOT_PROVISIONED);
}

/**
 * The contract server/db/ensureCoreTables.ts enforces at boot. Verified HERE so
 * a deploy cannot report success and then have every task fail its readiness
 * probe — the failure surfaces in the migration job, where it is diagnosable,
 * rather than as an opaque rollback.
 */
async function verifyReadinessContract(client) {
  const missing = await missingTables(client, AUTHORING_SUBSYSTEM_TABLES);
  log(
    `  authoring subsystem: ${AUTHORING_SUBSYSTEM_TABLES.length - missing.length}/${AUTHORING_SUBSYSTEM_TABLES.length} tables present`,
  );
  if (missing.length) {
    throw new Error(
      `authoring subsystem incomplete — /readyz would fail closed. Missing tables: ${missing.join(', ')}`,
    );
  }

  // Tenant-consistent parentage. RLS filters each row by its own tenant; only
  // these composite FKs stop a child row from structurally pointing at another
  // tenant's parent. Tables-without-constraints is the 'partial' state
  // ensureCoreTables downgrades to, so it must fail here too.
  const cons = await client.query(`SELECT conname FROM pg_constraint WHERE conname = ANY($1::text[])`, [
    AUTHORING_SUBSYSTEM_FK_CONSTRAINTS,
  ]);
  const have = new Set(cons.rows.map((r) => r.conname));
  const missingFks = AUTHORING_SUBSYSTEM_FK_CONSTRAINTS.filter((c) => !have.has(c));
  log(
    `  tenant-parentage FKs: ${AUTHORING_SUBSYSTEM_FK_CONSTRAINTS.length - missingFks.length}/${AUTHORING_SUBSYSTEM_FK_CONSTRAINTS.length} present`,
  );
  if (missingFks.length) {
    throw new Error(
      `authoring subsystem present but tenant-parentage FKs absent — /readyz reports 'partial'. Missing: ${missingFks.join(', ')}`,
    );
  }

  // Tenant isolation. A subsystem table with no policy is fully readable across
  // tenants under RLS_ENFORCE=on — a cross-tenant leak that nothing else in the
  // stack would report.
  const pol = await client.query(
    `SELECT tablename FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname = 'tenant_isolation_policy'
        AND tablename = ANY($1::text[])`,
    [AUTHORING_SUBSYSTEM_TABLES],
  );
  const policied = new Set(pol.rows.map((r) => r.tablename));
  const unpolicied = AUTHORING_SUBSYSTEM_TABLES.filter((t) => !policied.has(t));
  log(
    `  tenant_isolation_policy: ${AUTHORING_SUBSYSTEM_TABLES.length - unpolicied.length}/${AUTHORING_SUBSYSTEM_TABLES.length} tables policied`,
  );
  if (unpolicied.length) {
    throw new Error(
      `authoring tables without tenant_isolation_policy — cross-tenant readable under RLS_ENFORCE=on: ${unpolicied.join(', ')}`,
    );
  }
}

async function main() {
  const url = resolveDatabaseUrl(APPLY_URL_VARS);
  const pool = new Pool({ connectionString: url, ssl: sslFor(url), max: 1 });

  // One client for the whole run: pg_advisory_lock is SESSION-scoped, so the
  // lock must be held on the same connection that does the work.
  const client = await pool.connect();
  let locked = false;

  try {
    log('▶ 1/5 Preflight — database already provisioned?');
    await preflight(client);

    log('\n▶ 2/5 Acquire migration lock');
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    locked = true;
    log('  ✓ lock held (released automatically if this task dies)');

    log('\n▶ 3/5 Apply migrations');
    await applyAuthoringSubsystem(client, REPO_ROOT, { log });
    const { applied, failures } = await applyMigrationFiles(client, REPO_ROOT, C2C_MIGRATION_FILES, {
      log: (m) => log(`  ${m}`),
      error: (m) => errorLog(`  ${m}`),
      // Stop at the first failure: a deploy must not keep applying DDL on top of
      // a schema move it has already failed to complete.
      stopOnFirstFailure: true,
    });
    if (failures.length) {
      throw new Error(
        `migration halted at ${failures[0].file} — ${failures[0].error} ` +
          `(${applied.length}/${C2C_MIGRATION_FILES.length} applied before the failure)`,
      );
    }
    log(`  ✓ ${applied.length}/${C2C_MIGRATION_FILES.length} migration files applied`);

    // The readiness contract (server/db/ensureCoreTables.ts requiredSchemas)
    // demands the `extensions` schema, and until this line NOTHING on the
    // deploy path created it — startup did, via CREATE SCHEMA IF NOT EXISTS on
    // the request pool, which the non-superuser runtime role must refuse. On a
    // single-pass fresh estate the schema therefore did not exist when the
    // grant refresh below enumerated schemas, app_service never received USAGE,
    // and /readyz honestly reported `schemas missing: extensions` forever — the
    // production-boot-smoke CI job caught exactly this: provisioning converged
    // only on the SECOND deploy-migrate run (schema born late in run one,
    // granted in run two). Creating it here, before the grant refresh, makes
    // one pass sufficient. Reproduced and verified against PostgreSQL 16.
    log('\n▶ 4/5 Runtime role — required schemas + refresh non-superuser grants');
    await client.query('CREATE SCHEMA IF NOT EXISTS extensions');
    // Re-apply the app_service grants so any table this deploy just created is
    // reachable by the request-serving pool. GRANT ... ON ALL TABLES only
    // covers tables that existed when it ran, so a role provisioned by a prior
    // install would otherwise be locked out of every new table until the next
    // full provisioning. No-op unless APP_SERVICE_DB_PASSWORD is set. Runs as
    // the owner (this connection), which is what GRANT requires.
    const roleResult = await provisionAppServiceRole(client, { log });
    if (roleResult.skipped) {
      log(`  • ${roleResult.role} grants not refreshed (APP_SERVICE_DB_PASSWORD unset)`);
    }

    log('\n▶ 5/5 Verify readiness contract');
    await verifyReadinessContract(client);

    log('\n✅ Schema migration complete — safe to roll services.');
  } catch (err) {
    errorLog(`\n❌ Deploy migration failed: ${err.message}`);
    errorLog('   Services were NOT rolled. The database is unchanged past the last');
    errorLog('   successfully committed file; this script is idempotent, so fix the');
    errorLog('   cause and re-run it.');
    process.exitCode = 1;
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    }
    client.release();
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
