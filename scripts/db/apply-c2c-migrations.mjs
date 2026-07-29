#!/usr/bin/env node
/**
 * Apply the c2c session migrations (AI governance, PV operational tables,
 * commitments, drafting-council provisioning) to the configured database,
 * idempotently.
 *
 * These live in the root `migrations/` folder as raw .sql (the established
 * convention for phase migrations here), which drizzle's runtime migrate() does
 * NOT apply (only the journaled baseline is). This script gives a single,
 * standard, idempotent command to apply them on the out-of-band path — for the
 * preview DB and deploys. Each file is CREATE/ALTER ... IF NOT EXISTS, so it is
 * safe to run repeatedly.
 *
 * Usage: APPLY_C2C_MIGRATIONS=true npm run db:apply-c2c
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { applyAuthoringSubsystem } from './authoring-subsystem.mjs';
import { C2C_MIGRATION_FILES, applyMigrationFiles } from './migration-set.mjs';
import { resolveDatabaseUrl, sslFor, APPLY_URL_VARS } from './connection.mjs';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The ordered out-of-band migration set now lives in scripts/db/migration-set.mjs
// so this manual applier and the deploy-time applier (scripts/db/deploy-migrate.mjs,
// run as a one-off ECS task before the services roll) can never drift apart.
// Divergence between "what a human ran" and "what a deploy runs" is the exact
// failure mode — merged ≠ applied — that this list exists to close.

// The four db/migrations/20260725_authoring_* files that back the IND authoring
// loop. They are provisioned as ONE atomic unit by applyAuthoringSubsystem()
// BEFORE the FILES loop above, so the two guarded authoring ALTERs in that list
// find their tables present.
//
// This supersedes an earlier cession that removed the loop-tables file from
// FILES. That cession was right to refuse adding the loop tables ALONE (loop
// tables without the audit/signature companions = a working freeze with no
// audit row and a failing e-sign, worse on a Part 11 surface than plain
// absence). The correct resolution is not to omit the subsystem but to
// provision all four files TOGETHER, atomically — which is what the helper does.
// See scripts/db/authoring-subsystem.mjs.

async function main() {
  if (process.env.APPLY_C2C_MIGRATIONS !== 'true') {
    console.error('APPLY_C2C_MIGRATIONS is not "true". Aborting (safe guard).');
    process.exit(2);
  }
  // Verified TLS via the shared helper. This connection carries schema DDL, and
  // it previously ran with rejectUnauthorized:false — see scripts/db/connection.mjs.
  const url = resolveDatabaseUrl(APPLY_URL_VARS);
  const pool = new Pool({ connectionString: url, ssl: sslFor(url) });
  const repoRoot = path.resolve(__dirname, '..', '..');

  let failed = 0;

  // Authoring subsystem FIRST — as an atomic unit, so the two guarded authoring
  // ALTERs in FILES below find their tables present. A failure here is counted
  // like any other and does not abort the rest of the run (the guarded ALTERs
  // simply no-op if the subsystem did not come up).
  try {
    await applyAuthoringSubsystem(pool, repoRoot, { log: (m) => console.info(m) });
  } catch (err) {
    console.error(`✗ failed:  authoring subsystem — ${err.message}`);
    failed++;
  }

  // Report EVERY problem in one run (stopOnFirstFailure: false) so an operator
  // driving this by hand sees the full picture rather than fixing one file at a
  // time. The deploy applier makes the opposite choice, deliberately.
  const { failures } = await applyMigrationFiles(pool, repoRoot, C2C_MIGRATION_FILES, {
    log: (m) => console.info(m),
    error: (m) => console.error(m),
  });
  failed += failures.length;

  await pool.end();
  console.info(failed === 0 ? '\nAll c2c migrations applied.' : `\n${failed} file(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
