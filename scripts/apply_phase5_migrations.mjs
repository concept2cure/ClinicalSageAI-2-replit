#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDatabaseUrl() {
  const envs = ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL'];
  for (const name of envs) {
    let v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  throw new Error('No DATABASE_URL found in environment');
}

async function main() {
  const applyFlag = process.env.APPLY_PHASE5_MIGRATIONS === 'true';
  if (!applyFlag) {
    logger.error('APPLY_PHASE5_MIGRATIONS is not set to "true". Aborting (safe guard).');
    process.exit(2);
  }

  const dbUrl = getDatabaseUrl();
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  const migrationsDir = path.resolve(__dirname, '..', 'db', 'migrations');
  const migrationFile = path.join(migrationsDir, '20260129_phase5_intelligent_document_system.sql');

  if (!fs.existsSync(migrationFile)) {
    logger.error(`Migration file not found: ${migrationFile}`);
    await pool.end();
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, 'utf8');

  logger.info('Applying Phase 5 migration:', migrationFile);

  try {
    await pool.query(sql);
    logger.info('Phase 5 migration applied (idempotent run).');
    await pool.end();
    process.exit(0);
  } catch (err) {
    logger.error('Error applying Phase 5 migration:', err.message);
    if (err.detail) logger.error('Detail:', err.detail);
    await pool.end();
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
