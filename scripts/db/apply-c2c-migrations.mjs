#!/usr/bin/env node
/**
 * Apply the c2c session migrations (AI governance, PV operational tables,
 * commitments) to the configured database, idempotently.
 *
 * These three live in the root `migrations/` folder as raw .sql (the established
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
// PV + commitments create their own tables.
const FILES = [
  '20260603_ai_capability_governance.sql',
  '20260603_pv_operational.sql',
  '20260603_commitments.sql',
];

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
  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');

  let failed = 0;
  for (const file of FILES) {
    const full = path.join(migrationsDir, file);
    if (!fs.existsSync(full)) {
      console.error(`✗ missing: ${file}`);
      failed++;
      continue;
    }
    const sql = fs.readFileSync(full, 'utf8');
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('COMMIT');
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
