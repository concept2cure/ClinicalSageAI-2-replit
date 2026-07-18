#!/usr/bin/env node
/**
 * install-fresh.mjs — Canonical from-scratch DB provisioning (app schema + RLS).
 *
 * The problem this solves: there was no single, verified command that turns an
 * empty Postgres into a correct Concept2Cure app schema. `drizzle-kit push`
 * alone fails on a bare DB ("schema vault does not exist") and, once the
 * prereqs exist, still creates ZERO row-level-security policies (push cannot
 * emit policies). Replaying the 162-file migrations/ tree is not idempotent and
 * fails. This script is the one supported path for the application schema.
 *
 * What it does (idempotent — safe to re-run):
 *   1. Create the named schemas + extensions the Drizzle schema references.
 *   2. `drizzle-kit push` to lay down all tables from shared/schema.ts.
 *   3. Apply the RLS-bearing raw migrations that push cannot express, tracking
 *      applied files in an _install_applied_migrations ledger.
 *   4. Verify: table count and pg_policies count (fails if no policies).
 *
 * SEPARATE, NOT run here: the governed-content tree db/migrations/*_gcc_*.sql
 * (named `audit` schema, Part-11 tables, its own RLS). Those files are
 * psql-authored and CI applies them on their own database, never combined with
 * the RLS rollout below (their uuid tenant columns are incompatible with the
 * app RLS policy). The app BOOTS without them (tamper-proof audit degrades
 * non-fatally); apply them for full Part-11 audit, via psql, as CI does:
 *   for f in $(ls db/migrations/*_gcc_*.sql | sort); do \
 *     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
 *
 * Usage:
 *   DATABASE_URL='postgres://…' node scripts/db/install-fresh.mjs
 *
 * After this completes, set RLS_ENFORCE=on and restart to turn the tenant
 * isolation policies from shadow-mode into enforcing.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'migrations');

// RLS lives only in these raw migrations — drizzle-kit push cannot emit
// policies, so they must be applied explicitly after the tables exist. Order
// matters: 0005 seeds CSR-knowledge RLS; the 0019→0020→0021 trio is the tenant
// RLS rollout (audit → coerce tenant column types → enable RLS everywhere);
// the dated files add AI-placement and research-admin policies.
const RLS_MIGRATIONS = [
  '0005_csr_knowledge_database.sql',
  '0019_tenant_column_audit.sql',
  '0020_coerce_text_tenant_columns.sql',
  '0021_enable_rls_everywhere.sql',
  '20260608_ai_placement_policies.sql',
  '20260612_rls_research_admin.sql',
];

function getDatabaseUrl() {
  for (const name of ['DATABASE_URL', 'DATABASE_URL_ADMIN', 'NEON_DATABASE_URL', 'NEON_DATABASE_URL_ADMIN']) {
    const v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  throw new Error('No DATABASE_URL found in environment');
}

/**
 * Local/non-SSL Postgres vs a remote managed DB (Neon). Remote connections
 * verify the server certificate (rejectUnauthorized: true) — Neon presents a
 * publicly-trusted cert, and disabling verification would expose the
 * provisioning connection to MITM. Local sockets use no TLS.
 */
function sslFor(url) {
  const u = url.toLowerCase();
  if (u.includes('sslmode=disable') || u.includes('@localhost') || u.includes('@127.0.0.1')) {
    return false;
  }
  return { rejectUnauthorized: true };
}

const url = getDatabaseUrl();
const pool = new Pool({ connectionString: url, ssl: sslFor(url) });

async function step(label, fn) {
  process.stdout.write(`\n▶ ${label}\n`);
  await fn();
}

async function main() {
  await step('1/4 Prerequisites — schemas + extensions', async () => {
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS vault;
      CREATE SCHEMA IF NOT EXISTS precedent;
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE EXTENSION IF NOT EXISTS vector;
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
    `);
    console.log('  ✓ schemas (vault, precedent) + extensions (pgcrypto, uuid-ossp, vector, pg_trgm)');
  });

  await step('2/4 Tables — drizzle-kit push', async () => {
    // `echo ""` answers drizzle-kit's interactive prompt; a fresh DB has no
    // destructive changes so it proceeds. Inherit env so drizzle.config.ts
    // resolves the same DATABASE_URL.
    const res = spawnSync('npx', ['drizzle-kit', 'push'], {
      cwd: path.resolve(__dirname, '..', '..'),
      input: '\n',
      encoding: 'utf8',
      env: process.env,
    });
    if (res.status !== 0) {
      console.error(res.stdout || '');
      console.error(res.stderr || '');
      throw new Error(`drizzle-kit push failed (exit ${res.status})`);
    }
    console.log('  ✓ schema pushed from shared/schema.ts');
  });

  await step('3/4 Row-Level Security policies (raw migrations)', async () => {
    // Bookkeeping ledger: these raw migrations use bare CREATE POLICY (no
    // IF NOT EXISTS), so re-running a file would error on an already-present
    // policy. Record what has been applied so the installer is safely
    // re-runnable, and tolerate objects that already exist out-of-band.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public._install_applied_migrations (
        filename   text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const record = (file) =>
      pool.query(
        'INSERT INTO public._install_applied_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file],
      );
    const isDuplicate = (err) =>
      err.code === '42710' || // duplicate_object (policy/role)
      err.code === '42P07' || // duplicate_table
      /already exists/i.test(err.message || '');

    for (const file of RLS_MIGRATIONS) {
      const already = await pool.query(
        'SELECT 1 FROM public._install_applied_migrations WHERE filename = $1',
        [file],
      );
      if (already.rowCount > 0) {
        console.log(`  • ${file} — already applied, skipping`);
        continue;
      }
      const full = path.join(MIGRATIONS_DIR, file);
      if (!fs.existsSync(full)) throw new Error(`missing RLS migration: ${file}`);
      const sql = fs.readFileSync(full, 'utf8');
      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query('COMMIT');
        await record(file);
        console.log(`  ✓ applied ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        if (isDuplicate(err)) {
          await record(file);
          console.log(`  • ${file} — objects already present, recorded`);
          continue;
        }
        throw new Error(`failed applying ${file}: ${err.message}`);
      }
    }
  });

  await step('4/4 Verify', async () => {
    const tables = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`,
    );
    const policies = await pool.query(`SELECT count(*)::int AS n FROM pg_policies`);
    const tableCount = tables.rows[0].n;
    const policyCount = policies.rows[0].n;
    console.log(`  tables (public): ${tableCount}`);
    console.log(`  RLS policies:    ${policyCount}`);
    if (tableCount < 100) throw new Error(`expected the full schema (100s of tables); only ${tableCount} created`);
    if (policyCount < 1) throw new Error('no RLS policies created — tenant isolation would be absent');
    console.log('\n✅ Application schema install complete.');
    console.log('   Next:');
    console.log('   • set RLS_ENFORCE=on and restart to enforce tenant isolation;');
    console.log('   • leave SEED_DEMO_USER unset in production (no known-password admin);');
    console.log('   • for full 21 CFR Part 11 tamper-proof audit, also apply the governed-');
    console.log('     content tree (creates the `audit` schema) via psql:');
    console.log('       for f in $(ls db/migrations/*_gcc_*.sql | sort); do \\');
    console.log('         psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done');
  });
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(`\n❌ Install failed: ${err.message}`);
    await pool.end().catch(() => {});
    process.exit(1);
  });
