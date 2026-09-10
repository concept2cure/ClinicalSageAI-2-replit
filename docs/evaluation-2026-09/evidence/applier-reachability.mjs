#!/usr/bin/env node
/**
 * Which .sql files does each applier apply, and how many appliers are there?
 *
 * ── WHY THIS EXISTS, AND WHAT AN EARLIER VERSION GOT WRONG ───────────────────
 * A first version of this script modelled two appliers (deploy-migrate's
 * C2C_MIGRATION_FILES and install-fresh's root overlay) and concluded that 69
 * tables were "referenced by server code and created by nothing". That was
 * wrong. It was caught by checking an implausible result against a known-good
 * case: the list included `vault.documents`, and a document vault that does not
 * exist in any database is not a thing that goes unnoticed.
 *
 * The cause was an incomplete model. There are FIVE paths that apply SQL here,
 * not two, and they cover different subsets:
 *
 *   1. scripts/db/deploy-migrate.mjs      C2C_MIGRATION_FILES. The production
 *                                         deploy path. Explicitly does NOT
 *                                         apply db/migrations/*_gcc_*.sql, and
 *                                         preflights that a base schema exists.
 *   2. scripts/db/install-fresh.mjs       every migrations/*.sql except six
 *                                         named RLS files, PLUS the authoring
 *                                         subsystem, PLUS a named list of
 *                                         pre-overlay creators from
 *                                         db/migrations/, PLUS the whole
 *                                         governed-content tree
 *                                         db/migrations/*_gcc_*.sql at step 6.
 *                                         (A second correction: an earlier
 *                                         revision of this script missed step 6
 *                                         and reported 044c_gcc_vault_schema.sql
 *                                         as CI-test-only, i.e. that
 *                                         vault.documents existed in no real
 *                                         database. It does exist.)
 *   3. scripts/db_migrate.sh              db/migrations/ — bootstrap, 0XX, 1XX
 *                                         and date-prefixed, excluding _legacy/
 *                                         and _consolidated/. The operator
 *                                         provisioning path, and the reason the
 *                                         gcc tree exists in a real database.
 *   4. the psql loop in ci.yml            db/migrations/*_gcc_*.sql, against
 *                                         localhost/concept2cure-ri_test — a CI
 *                                         database only.
 *   5. drizzle runtime migrate()          the journaled baseline in
 *                                         migrations/meta/_journal.json.
 *
 * So "on no applier" is a much smaller and much less alarming set than a
 * two-applier model suggests. The multiplicity is itself the finding: five
 * paths, different subsets, and no single place states which schema a given
 * environment has.
 *
 * This script therefore reports COVERAGE PER APPLIER and does not attempt a
 * "these tables do not exist" claim, which cannot be made from the repository
 * alone — it needs a live database, which is what ci:tables-live-schema is for.
 *
 * Re-runnable: node docs/evaluation-2026-09/evidence/applier-reachability.mjs
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const setSrc = readFileSync('scripts/db/migration-set.mjs', 'utf8');
const setSrcFresh = readFileSync('scripts/db/install-fresh.mjs', 'utf8');
/**
 * install-fresh's RLS_MIGRATIONS (scripts/db/install-fresh.mjs:91).
 *
 * ── CORRECTED 2026-09-10 ─────────────────────────────────────────────────────
 * An earlier revision of this script called this set FRESH_EXCLUDED and
 * subtracted it from install-fresh's coverage, on the strength of the overlay
 * step's comment: "RLS migrations are applied separately in their required
 * order (next step), so exclude them here."
 *
 * The words that mattered were "applied separately", not "excluded". These six
 * files ARE applied by install-fresh — at step 5, in exactly this order
 * (0005 seeds CSR-knowledge RLS; 0019 -> 0020 -> 0021 is the tenant rollout,
 * audit then coerce column types then enable RLS everywhere; the two dated
 * files add AI-placement and research-admin policies). Excluding them reported
 * migrations/0021_enable_rls_everywhere.sql — the sweep that policies every
 * tenant-keyed table in EVERY schema — as reachable by no applier at all.
 *
 * That is the worst possible file to get wrong here, and it was wrong in the
 * direction that understates protection: it would have supported a conclusion
 * that a fresh install ships with no RLS rollout. Ordering within an applier is
 * not exclusion from it.
 */
const FRESH_RLS_ORDERED = new Set([
  '0005_csr_knowledge_database.sql', '0019_tenant_column_audit.sql',
  '0020_coerce_text_tenant_columns.sql', '0021_enable_rls_everywhere.sql',
  '20260608_ai_placement_policies.sql', '20260612_rls_research_admin.sql',
]);
const journal = existsSync('migrations/meta/_journal.json')
  ? new Set(JSON.parse(readFileSync('migrations/meta/_journal.json', 'utf8')).entries.map((e) => `migrations/${e.tag}.sql`))
  : new Set();

/** db_migrate.sh: maxdepth 1 under db/migrations, three name shapes. */
const dbMigrateSh = (rel) => {
  if (path.dirname(rel) !== 'db/migrations') return false;
  const b = path.basename(rel);
  return /^0\d\d_.*\.sql$/.test(b) || /^1\d\d_.*\.sql$/.test(b) || /^20\d{6}_.*\.sql$/.test(b);
};

// Fail loudly if install-fresh's list and this model's copy of it drift apart.
{
  const declared = [...(setSrcFresh.match(/const RLS_MIGRATIONS = \[([\s\S]*?)\]/)?.[1] ?? '')
    .matchAll(/'([^']+\.sql)'/g)].map((m) => m[1]);
  const missing = declared.filter((f) => !FRESH_RLS_ORDERED.has(f));
  const extra = [...FRESH_RLS_ORDERED].filter((f) => !declared.includes(f));
  if (declared.length && (missing.length || extra.length)) {
    console.error(
      '[applier-reachability] install-fresh RLS_MIGRATIONS drifted from this model:' +
        (missing.length ? `\n  in install-fresh, not here: ${missing.join(', ')}` : '') +
        (extra.length ? `\n  here, not in install-fresh: ${extra.join(', ')}` : ''),
    );
    process.exit(1);
  }
}

const APPLIERS = {
  'deploy-migrate (production)': (rel) => setSrc.includes(`'${rel}'`),
  'install-fresh': (rel) =>
    // steps 3 and 5: the whole root tree. The RLS six are applied at step 5
    // rather than in the overlay, which is an ordering difference, not an
    // exclusion — see FRESH_RLS_ORDERED.
    path.dirname(rel) === 'migrations' ||
    // step 6: the governed-content tree
    (path.dirname(rel) === 'db/migrations' && path.basename(rel).includes('_gcc_')) ||
    // step 4: the authoring subsystem
    /^db\/migrations\/20260725_authoring_/.test(rel),
  'db_migrate.sh (operator)': dbMigrateSh,
  'ci psql loop (TEST DB ONLY)': (rel) => path.dirname(rel) === 'db/migrations' && path.basename(rel).includes('_gcc_'),
  'drizzle journal': (rel) => journal.has(rel),
};

const ARCHIVED = ['_legacy/', '_deprecated_migrations/', 'docs/archive/', '_consolidated/', 'node_modules/'];
const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (ARCHIVED.some((a) => p.includes(a))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.sql')) out.push(p);
  }
  return out;
};

/**
 * The two migration lineages, PLUS the other places .sql lives in this repo.
 *
 * Added 2026-09-10 (WO-1). The earlier version walked only the two lineages,
 * which quietly assumed every .sql outside them was irrelevant. It is not:
 * `scripts/db-verify/00_bootstrap_base.sql` and four files under `sql/` each
 * carry CREATE TABLE for tables a lineage also creates, and they show up in
 * ci:duplicate-table-ddl as collisions. Walking them here lets the model say
 * "on no applier" about them explicitly rather than by omission — which is the
 * difference between a fact and a gap.
 */
const files = [...walk('db/migrations'), ...walk('migrations'), ...walk('sql'), ...walk('scripts/db-verify')];
const coverage = {};
for (const [name, fn] of Object.entries(APPLIERS)) coverage[name] = files.filter(fn);

/** A file no DURABLE applier applies — CI-only does not count as durable. */
const DURABLE = Object.entries(APPLIERS).filter(([n]) => !n.includes('TEST DB ONLY')).map(([, fn]) => fn);
const unreached = files.filter((f) => !DURABLE.some((fn) => fn(f)));
const ciOnly = files.filter((f) => !DURABLE.some((fn) => fn(f)) && APPLIERS['ci psql loop (TEST DB ONLY)'](f));

console.info(`.sql files scanned (non-archived): ${files.length}\n`);
console.info('coverage per applier:');
for (const [name, list] of Object.entries(coverage)) {
  console.info(`  ${String(list.length).padStart(4)}  ${name}`);
}
console.info(`\n  ${String(unreached.length).padStart(4)}  reached by NO durable applier`);
console.info(`  ${String(ciOnly.length).padStart(4)}    ...of which applied ONLY to the CI test database`);

writeFileSync(new URL('03-applier-reachability.json', import.meta.url), JSON.stringify({
  generated: new Date().toISOString(),
  note: 'Coverage per applier. Deliberately makes NO claim about which tables exist in a deployed database — that needs a live DB (ci:tables-live-schema).',
  totals: { files: files.length, unreachedByDurableApplier: unreached.length, ciTestDbOnly: ciOnly.length },
  coverage: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, v.length])),
  unreached, ciOnly,
  /**
   * Per-file applier list. The aggregate counts above answer "how many"; this
   * answers "which", which is what you need to decide what a duplicate
   * CREATE TABLE actually costs. Two definitions on the SAME applier race on
   * order; two on DIFFERENT appliers give two environments different shapes;
   * one on an applier and one on nothing is dead DDL.
   */
  byFile: Object.fromEntries(
    files.map((f) => [f, Object.entries(APPLIERS).filter(([, fn]) => fn(f)).map(([n]) => n)]),
  ),
}, null, 2) + '\n');

if (ciOnly.length) {
  console.info('\nfiles whose ONLY applier is the CI test database:');
  for (const f of ciOnly.slice(0, 15)) console.info('   ' + f);
}
