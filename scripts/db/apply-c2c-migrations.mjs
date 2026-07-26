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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dependency-safe order: governance ALTERs ana_capability_registry (pre-existing),
// PV + commitments create their own tables, council provisioning seeds the four
// drafting-council agents into the lumen schema.
//
// Entries are repo-relative so a root-lineage file can declare a prerequisite that
// lives in the canonical db/migrations lineage. 044b is that prerequisite: it owns
// the ONLY definition of lumen.data_atoms, and the council file that follows it
// reads from that table. Applying it here means this out-of-band path provisions
// the same shape the manifest lineage does, instead of racing it under
// CREATE TABLE IF NOT EXISTS. See ledger C-12.
const FILES = [
  'migrations/20260603_ai_capability_governance.sql',
  'migrations/20260603_pv_operational.sql',
  'migrations/20260603_commitments.sql',
  'db/migrations/044b_gcc_lumen_schema_prerequisite.sql',
  'migrations/20260724_lumen_council_provisioning.sql',
  'migrations/20260724_ana_deep_investigations.sql',
];

/** Files that open their own transaction must not be wrapped in a second one. */
const selfTransacting = (sql) => /^\s*BEGIN\s*;/im.test(sql);

function getDatabaseUrl() {
  for (const name of ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL']) {
    const v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  throw new Error('No DATABASE_URL found in environment');
}

async function main() {
  if (process.env.APPLY_C2C_MIGRATIONS !== 'true') {
    console.error('APPLY_C2C_MIGRATIONS is not "true". Aborting (safe guard).');
    process.exit(2);
  }
  const pool = new Pool({ connectionString: getDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  const repoRoot = path.resolve(__dirname, '..', '..');

  let failed = 0;
  for (const file of FILES) {
    const full = path.join(repoRoot, file);
    if (!fs.existsSync(full)) {
      console.error(`✗ missing: ${file}`);
      failed++;
      continue;
    }
    const sql = fs.readFileSync(full, 'utf8');
    const wrap = !selfTransacting(sql);
    try {
      if (wrap) await pool.query('BEGIN');
      await pool.query(sql);
      if (wrap) await pool.query('COMMIT');
      console.info(`✓ applied: ${file}`);
    } catch (err) {
      await pool.query('ROLLBACK').catch(() => {});
      console.error(`✗ failed:  ${file} — ${err.message}${err.detail ? ` (${err.detail})` : ''}`);
      failed++;
    }
  }

  await pool.end();
  console.info(failed === 0 ? '\nAll c2c migrations applied.' : `\n${failed} file(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
