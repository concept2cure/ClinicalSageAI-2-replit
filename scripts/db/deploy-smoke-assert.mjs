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

// Tables that carry a tenant column but are deliberately NOT policied — the
// canonical RLS allowlist (server/db/rlsAllowlist.ts → RLS_ALLOWLIST). This MUST
// match the sweep, 0021, and rls-coverage-check.sql; ci:rls-allowlist-sync fails
// the build on drift between the four. Requiring a policy on an allowlisted table
// would be a false failure here — and, worse, would pressure the sweep back into
// policing api_keys, the pre-auth lookup whose isolation-under-enforce breaks all
// api-key authentication (ledger C-44).
const TENANT_ALLOWLIST = [
  'organization_users',
  '__drizzle_migrations',
  'stripe_events',
  'billing_budgets',
  'billing_alerts',
  'api_keys',
];

// ── 1. No integer-tenant table is left unisolated (the C-33 sweep invariant) ──
// This is the leak the whole tenant_isolation_sweep exists to prevent, asserted
// across the ENTIRE database rather than the 19 readiness tables deploy-migrate
// already checks — a new tenant table added anywhere that the sweep somehow
// misses would surface here.
//
// The policy-presence NOT EXISTS is SCHEMA-QUALIFIED (p.schemaname = c.table_schema).
// A tablename-only match silently false-passes: a public table with no policy is
// masked the moment any OTHER schema has a same-named table that does carry one
// (this repo has vault.documents, core.programs, … alongside their public twins).
// That is the exact schema-conflation bug C-35 fixed in the reachability guard;
// it is not allowed to live on in the assertion that guards isolation.
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
           WHERE p.schemaname = c.table_schema
             AND p.tablename = c.table_name
             AND p.policyname = 'tenant_isolation_policy'
        )
      ORDER BY 1`,
    [TENANT_ALLOWLIST],
  );
  if (rows.length === 0) ok('every integer-tenant table carries tenant_isolation_policy');
  else fail(`${rows.length} integer-tenant table(s) unpoliced`, rows.map((r) => r.table_name).join(', '));
}

// ── 1b. Every policied table is FORCED (the owner-bypass invariant, C-43) ─────
// A tenant_isolation_policy WITHOUT `FORCE ROW LEVEL SECURITY` is bypassed for the
// table OWNER. The boot guard (server/db/rlsEnforcement.ts) verifies the runtime
// role is not a superuser and does not hold BYPASSRLS — but NOT that it is a
// non-owner. FORCE closes that gap unconditionally, so "policied" is only real
// isolation when it is also "forced". Checked across ALL schemas, schema-qualified.
{
  const { rows } = await client.query(
    `SELECT n.nspname || '.' || c.relname AS rel
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_policies p
         ON p.schemaname = n.nspname AND p.tablename = c.relname
        AND p.policyname = 'tenant_isolation_policy'
      WHERE c.relkind = 'r' AND c.relforcerowsecurity = false
      GROUP BY 1
      ORDER BY 1`,
  );
  if (rows.length === 0) ok('every tenant_isolation_policy table has FORCE row-level security');
  else fail(`${rows.length} policied table(s) not FORCED (owner-bypass)`, rows.map((r) => r.rel).join(', '));
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
  // The consumer that motivated this probe (cerGenerator.ts) was deleted in
  // the D11b dead-path purge; the column remains in the shipped migration.
  ['templates.sections (C-39; ex-cerGenerator, deleted D11b)', `SELECT sections FROM templates WHERE id = 'smoke'`],
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

// ── 1c. Every NON-PUBLIC uuid-tenant table is policied or explicitly exempt ───
// The public checks above are integer-keyed and public-only. The non-public
// schemas use a uuid tenant key; C-46 policied the tenant-owned ones with the
// context-less-safe COALESCE policy and left two cross-tenant-by-design tables
// exempt. This asserts no non-public uuid-tenant BASE TABLE is left with NO
// policy at all (any policy name counts — these schemas use per-subsystem names),
// so a newly-provisioned uuid-tenant table that nobody policied fails the build.
const UUID_TENANT_EXEMPT = ['federated_ml.federation_participants', 'audit.event_log'];
{
  const { rows } = await client.query(
    `WITH tt AS (
       SELECT DISTINCT c.table_schema AS s, c.table_name AS t
         FROM information_schema.columns c
         JOIN information_schema.tables tb
           ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
          AND tb.table_type = 'BASE TABLE'
        WHERE c.table_schema NOT IN ('public','pg_catalog','information_schema')
          AND c.table_schema NOT LIKE 'pg_%'
          AND c.column_name IN ('organization_id','org_id','tenant_id')
          AND c.data_type = 'uuid'
     )
     SELECT s || '.' || t AS rel FROM tt
      WHERE (s || '.' || t) <> ALL ($1)
        AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = tt.s AND p.tablename = tt.t)
      ORDER BY 1`,
    [UUID_TENANT_EXEMPT],
  );
  if (rows.length === 0) ok('every non-public uuid-tenant table is policied or exempt (C-46)');
  else fail(`${rows.length} non-public uuid-tenant table(s) unpoliced`, rows.map((r) => r.rel).join(', '));
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
