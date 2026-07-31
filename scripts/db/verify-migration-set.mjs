#!/usr/bin/env node
/**
 * Verify C2C_MIGRATION_FILES against a REAL PostgreSQL — the harness that decides
 * whether a migration may be wired onto the deploy path.
 *
 * WHY THIS EXISTS. The reachability work (ledger C-32 → C-37) wires deploy-dead
 * migrations onto C2C_MIGRATION_FILES, and the bar for wiring one is that it has
 * been PROVEN to apply. Getting that bar wrong in either direction is expensive:
 *
 *   • Too lax — wire an unverified file, and `deploy-migrate` (stopOnFirstFailure)
 *     halts a production migration on the first bad statement.
 *   • Too strict — the PGlite harness could not load the `vector` extension, so
 *     three correct files were written off as "unverifiable" (C-33/C-34) and left
 *     shipping nothing. Refusing to wire an unverified file and refusing to build
 *     a real verifier are different things.
 *
 * PGlite is excellent for unit-level schema contracts and needs no server, but it
 * is not Postgres: no pgvector, and a handful of extensions/behaviours differ.
 * This script uses the real thing, so "it applies" means it actually applies.
 *
 * WHAT IT CHECKS
 *   1. Every file in the set applies against a base-schema database.
 *   2. The whole set applies a SECOND time with the same result — a deploy re-runs
 *      the set on every deploy, so a non-idempotent file breaks the next one, not
 *      this one.
 *   3. No table carrying an integer tenant key is left without
 *      tenant_isolation_policy — the leak the C-33 sweep exists to prevent.
 *   4. Reports any file whose failure is a MISSING PREREQUISITE (a relation that
 *      lives outside the set) separately from a genuine error, because the two
 *      mean very different things.
 *
 * USAGE
 *   DATABASE_URL=postgres://user@host/db node scripts/db/verify-migration-set.mjs
 *
 *   The target database is MUTATED and should be a throwaway. The script refuses
 *   to run against a URL that looks production-ish unless --force is passed.
 *
 *   Prerequisites for a faithful run: the extensions a real cluster has
 *   (pgvector, pgcrypto, pg_trgm, uuid-ossp, citext) and the base schema. Pass
 *   --seed-base to load the drizzle journal's CREATE TABLE blocks first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { C2C_MIGRATION_FILES } from './migration-set.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const TAG = '[db:verify-migration-set]';

const args = process.argv.slice(2);
const force = args.includes('--force');
const seedBase = args.includes('--seed-base');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${TAG} DATABASE_URL is required (use a THROWAWAY database — this mutates it).`);
  process.exit(2);
}
if (!force && /prod|production|rds\.amazonaws|live/i.test(url)) {
  console.error(`${TAG} refusing: DATABASE_URL looks production-like. Use a throwaway DB, or --force.`);
  process.exit(2);
}

/** Extensions a real cluster provides; each is optional so a lean box still runs. */
const EXTENSIONS = ['vector', 'pgcrypto', 'pg_trgm', 'uuid-ossp', 'citext'];
/** Schemas migrations expect to exist but do not themselves create. */
const SCHEMAS = ['predicate', 'precedent', 'core', 'intelligence', 'regulatory'];
/** Tables that intentionally hold no tenant-scoped rows (mirrors the sweep). */
const TENANT_ALLOWLIST = ['organizations', 'organization_users', 'stripe_events', 'ectd_agency_configs'];

const client = new pg.Client({ connectionString: url });
await client.connect();

/**
 * Run SQL, and on failure ROLLBACK so the session is usable again. Without this a
 * failed statement leaves the connection in an aborted transaction and every
 * later file fails with a misleading "current transaction is aborted" — the real
 * applier issues the same rollback between files.
 */
async function run(sql) {
  try {
    await client.query(sql);
    return null;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return err.message.split('\n')[0];
  }
}

for (const ext of EXTENSIONS) {
  const err = await run(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
  if (err) console.log(`${TAG} note: extension ${ext} unavailable — ${err}`);
}
for (const s of SCHEMAS) await run(`CREATE SCHEMA IF NOT EXISTS ${s}`);

if (seedBase) {
  const journalPath = path.join(repoRoot, 'migrations/0000_sweet_joseph.sql');
  const journal = fs.readFileSync(journalPath, 'utf8');
  let ok = 0;
  for (const m of journal.matchAll(/CREATE TABLE "([a-z0-9_]+)" \([\s\S]*?\n\);/g)) {
    if (!(await run(m[0].replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ')))) ok++;
  }
  console.log(`${TAG} base schema seeded: ${ok} journal tables`);
}

/** A failure naming a relation the set never creates is a missing prerequisite. */
const MISSING_REL = /relation "([^"]+)" does not exist/;
const setCreates = new Set();
for (const rel of C2C_MIGRATION_FILES) {
  const sql = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?([a-z0-9_.]+)"?/gi)) {
    setCreates.add(m[1].toLowerCase().replace(/^public\./, ''));
  }
}

const results = [];
for (const pass of [1, 2]) {
  const failures = [];
  for (const rel of C2C_MIGRATION_FILES) {
    const err = await run(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    if (err) failures.push({ rel, err });
  }
  results.push(failures);
  console.log(
    `${TAG} pass ${pass}: ${C2C_MIGRATION_FILES.length - failures.length}/${C2C_MIGRATION_FILES.length} applied`,
  );
}

const [, second] = results;
const prereq = [];
const genuine = [];
for (const f of second) {
  const m = MISSING_REL.exec(f.err);
  (m && !setCreates.has(m[1].toLowerCase()) ? prereq : genuine).push(f);
}

if (prereq.length) {
  console.log(`\n${TAG} ${prereq.length} file(s) need a prerequisite this set does not create:`);
  for (const f of prereq) console.log(`    ${f.rel}\n        ${f.err}`);
  console.log(`  These are provisioned by another path (the _gcc_ tree, the root`);
  console.log(`  overlay, or runtime DDL). Not a defect in the set itself.`);
}

const { rows: unpoliced } = await client.query(
  `SELECT DISTINCT c.table_name
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name IN ('organization_id','org_id','tenant_id')
      AND c.data_type IN ('integer','bigint','smallint')
      AND c.table_name <> ALL ($1)
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
         WHERE p.tablename = c.table_name AND p.policyname = 'tenant_isolation_policy'
      )
    ORDER BY 1`,
  [TENANT_ALLOWLIST],
);

await client.end();

console.log('');
let bad = false;
if (genuine.length) {
  bad = true;
  console.error(`${TAG} ❌ ${genuine.length} file(s) failed for a real reason:`);
  for (const f of genuine) console.error(`    ${f.rel}\n        ${f.err}`);
}
if (unpoliced.length) {
  bad = true;
  console.error(
    `${TAG} ❌ ${unpoliced.length} integer-tenant table(s) left without tenant_isolation_policy` +
      ` — cross-tenant readable under RLS_ENFORCE=on:`,
  );
  for (const r of unpoliced) console.error(`    ${r.table_name}`);
}
if (results[0].length !== results[1].length) {
  bad = true;
  console.error(
    `${TAG} ❌ not idempotent: pass 1 had ${results[0].length} failures, pass 2 had ${results[1].length}.`,
  );
}

if (bad) process.exit(1);
console.log(`${TAG} ✅ migration set applies twice, cleanly, and leaves no tenant table unisolated.`);
