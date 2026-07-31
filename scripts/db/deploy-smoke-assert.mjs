#!/usr/bin/env node
/**
 * Post-deploy invariant assertions — the checks a real deploy sequence must
 * satisfy that no STATIC guard can prove.
 *
 * The reachability / identity / isolation work (ledger C-31 → C-40) is guarded
 * statically at many levels — ci:migration-reachability, ci:duplicate-table-ddl,
 * ci:unbacked-tables, the PGlite contract tests. Every one of those reasons about
 * the SQL text; none of them RUNS the deploy. That gap is exactly how this class
 * of defect kept recurring: a migration that reads perfectly can still fail to
 * apply, apply against the wrong base, break on the second (idempotent) run, or
 * leave a tenant table cross-tenant readable — and only a real database shows it.
 *
 * The deploy-smoke CI job runs the ACTUAL production sequence — install-fresh,
 * then deploy-migrate twice — against a real pgvector Postgres, then calls this to
 * assert the invariants the whole program exists to hold. If any regresses, this
 * fails the build with the specific broken invariant, on a real database, before
 * a deploy ever ships.
 *
 * Usage:  DATABASE_URL=postgres://… node scripts/db/deploy-smoke-assert.mjs
 */

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[deploy-smoke] DATABASE_URL is required');
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const failures = [];
const ok = (label) => console.log(`  ✓ ${label}`);
const fail = (label, detail) => {
  failures.push(label);
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
};

// Tables that intentionally hold no tenant-scoped rows (mirrors the sweep).
const TENANT_ALLOWLIST = ['organizations', 'organization_users', 'stripe_events', 'ectd_agency_configs'];

// ── 1. No integer-tenant table is left unisolated (the C-33 sweep invariant) ──
// This is the leak the whole tenant_isolation_sweep exists to prevent, asserted
// across the ENTIRE database rather than the 19 readiness tables deploy-migrate
// already checks — a new tenant table added anywhere that the sweep somehow
// misses would surface here.
{
  const { rows } = await client.query(
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
  if (rows.length === 0) ok('every integer-tenant table carries tenant_isolation_policy');
  else fail(`${rows.length} integer-tenant table(s) unpoliced`, rows.map((r) => r.table_name).join(', '));
}

// ── 2. The identity fixes actually landed (C-36 / C-38) ───────────────────────
// A CREATE TABLE IF NOT EXISTS that no-op'd against a pre-existing broken shape
// would leave these as uuid; the FKs would be absent. Assert the shape, not the
// migration text.
{
  const { rows } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name='lumen_knowledge_graph_edges'
        AND column_name IN ('source_atom_id','target_atom_id')`,
  );
  const allInt = rows.length === 2 && rows.every((r) => r.data_type === 'integer');
  allInt ? ok('enhanced-cortex atom keys are integer (C-36)') : fail('enhanced-cortex atom keys not integer', JSON.stringify(rows));

  const { rows: fk } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.table_constraints
      WHERE constraint_type='FOREIGN KEY' AND table_name='lumen_knowledge_graph_edges'`,
  );
  fk[0].n === 2 ? ok('the two previously-impossible atom FKs exist (C-36)') : fail(`expected 2 atom FKs, found ${fk[0].n}`);
}

// ── 3. The consumer queries that were the ACTUAL defects execute (C-31/36/39) ──
// These are the real statements the services issue. Provisioning a table is not
// enough — its columns must match what the caller selects. Each ran red before
// its remediation.
const CONSUMER_QUERIES = [
  ['templates.sections (cerGenerator, C-39)', `SELECT sections FROM templates WHERE id = 'smoke'`],
  ['doc_sections.id (command-executor, C-39)', `SELECT id, code, title FROM doc_sections WHERE id = '00000000-0000-0000-0000-000000000000'`],
  ['atom quality JOIN (conflictDetection, C-36)', `SELECT a.id, q.overall_score FROM lumen_data_atoms a LEFT JOIN lumen_atom_quality_scores q ON a.id = q.atom_id LIMIT 1`],
  ['sequence-continuity UNION (validator, C-31)', `SELECT sequence_number FROM ectd_compilations WHERE application_number = 'x' UNION SELECT sequence_number FROM ectd_submissions WHERE application_number = 'x'`],
  ['maud validations (maudDb, C-39)', `SELECT * FROM maud_validations WHERE document_id = 'x' AND organization_id = 1`],
  ['ind milestones (preIndRoutes, C-39)', `SELECT id FROM ind_milestones WHERE pre_ind_data_id = '00000000-0000-0000-0000-000000000000'`],
  ['literature buckets (regulatory-programs, C-39)', `SELECT COUNT(*)::int FROM literature_entries WHERE organization_id::text = '1'::text`],
];
for (const [label, sql] of CONSUMER_QUERIES) {
  try {
    await client.query(sql);
    ok(`consumer query executes: ${label}`);
  } catch (err) {
    fail(`consumer query FAILS: ${label}`, err.message.split('\n')[0]);
  }
}

// ── 4. pgvector actually loaded and the C-37 tables exist ─────────────────────
{
  const { rows } = await client.query(`SELECT extversion FROM pg_extension WHERE extname='vector'`);
  rows.length ? ok(`pgvector present (${rows[0].extversion})`) : fail('pgvector extension not installed');
  const { rows: t } = await client.query(
    `SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema='predicate' AND table_name IN ('fda_510k_clearances','fda_product_codes')`,
  );
  t[0].n === 2 ? ok('pgvector clearance-universe tables exist (C-37)') : fail(`expected 2 predicate.* tables, found ${t[0].n}`);
}

await client.end();

console.log('');
if (failures.length) {
  console.error(`[deploy-smoke] ❌ ${failures.length} invariant(s) failed on a real deployed database.`);
  process.exit(1);
}
console.log('[deploy-smoke] ✅ all post-deploy invariants hold on a real deployed database.');
