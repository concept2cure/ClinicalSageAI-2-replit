#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const envPaths = ['.env', '.env.codespace', '.env.local']
  .map(p => path.resolve(process.cwd(), p))
  .filter(p => fs.existsSync(p));

for (const envPath of envPaths) {
  dotenv.config({ path: envPath, override: true });
}

const REQUIRED_SECRETS = [
  'DATABASE_URL',
  'KIMI_API_KEY',
  'JWT_SECRET',
  'NEON_PROJECT_ID',
];

const REQUIRED_TABLES = [
  'users',
  'regulatory_atoms',
  'audit_logs',
  'workbench_sessions',
];

const REQUIRED_INDEXES = [
  'idx_atoms_submission_jurisdiction',
  'idx_audit_timestamp',
  'idx_users_email',
];

const connectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL/NEON_DATABASE_URL missing');
  process.exit(1);
}

(async () => {
  console.log('🔍 Validating Enterprise Environment...');

  for (const secret of REQUIRED_SECRETS) {
    if (!process.env[secret] || process.env[secret].length < 20) {
      console.error(`❌ ${secret} missing or invalid`);
      process.exit(1);
    }
  }
  console.log('✅ All secrets present');

  const db = neon(connectionString);
  const tables = await db`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  const tableNames = tables.map(t => t.table_name);

  for (const table of REQUIRED_TABLES) {
    if (!tableNames.includes(table)) {
      console.error(`❌ Table ${table} not found`);
      process.exit(1);
    }
  }
  console.log('✅ All required tables exist');

  const indexes = await db`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
  const indexNames = indexes.map(i => i.indexname);

  for (const index of REQUIRED_INDEXES) {
    if (!indexNames.includes(index)) {
      console.error(`❌ Index ${index} missing (run npm run db:optimize)`);
      process.exit(1);
    }
  }
  console.log('✅ All performance indexes present');

  const rls = await db`SELECT tablename FROM pg_tables WHERE rowsecurity = true`;
  if (rls.length < 5) {
    console.error('❌ Row Level Security not enabled on all tables');
    process.exit(1);
  }
  console.log('✅ Row Level Security enabled');

  console.log('\n🎯 Environment validated. Ready for enterprise deployment.');
  process.exit(0);
})();
