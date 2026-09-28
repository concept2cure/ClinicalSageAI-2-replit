#!/usr/bin/env node
/**
 * CI Guard: a table the server QUERIES must be created by something a real
 * deployment actually RUNS.
 *
 * WHY THIS EXISTS — the blind spot in ci:unbacked-tables.
 * That guard asks "does any file create this table?" and counts, by its own
 * documented rule, "a non-archived .sql migration (db/migrations/, migrations/)".
 * It never asks whether an applier RUNS that .sql. So a migration that sits in
 * db/migrations/ and is on no apply path — not `_gcc_` (the CI psql loop), not in
 * the drizzle journal, not in C2C_MIGRATION_FILES, not in AUTHORING_SUBSYSTEM_
 * FILES, not named by install-fresh — makes its tables look "backed" while they
 * exist on no real database. The endpoints that query them 500 with
 * missing-relation errors, and every guard in CI stays green.
 *
 * That is the exact failure this codebase keeps rediscovering under different
 * names (ledger C-6, C-8, C-10, C-11, C-16, C-19, C-20, C-23, C-29, C-30, C-31,
 * C-32): "merged, green, and never applied". ci:journey-migration-reachability
 * already closes it for migrations a golden journey declares. This guard closes
 * the general case: EVERY server-referenced table, whatever surfaced it.
 *
 * WHAT COUNTS AS DURABLE (the paths a real environment actually runs):
 *   • journal       — migrations/meta/_journal.json → drizzle migrate() replays it
 *   • gcc           — db/migrations/*_gcc_*.sql → the CI psql apply loop
 *   • c2c-set       — C2C_MIGRATION_FILES → deploy-migrate (prod) + apply-c2c
 *   • authoring     — AUTHORING_SUBSYSTEM_FILES → same deploy path
 *   • install-fresh — files install-fresh.mjs names explicitly (pre-overlay
 *                     creators, the authoring step, the root overlay tree)
 *   • push          — the drizzle push surface (pgTable/pgView in shared/).
 *                     Counted HERE, unlike in the journey guard: this guard's
 *                     question is "can this table exist on a real database at
 *                     all?", and push genuinely provisions fresh installs.
 *
 * BASELINE. Findings are pinned in migration-reachability-baseline.json so that
 * pre-existing debt does not block unrelated work, while anything NEW fails
 * immediately. The debt started at 112 and was ratcheted to **0** across ledger
 * C-32 → C-40; the baseline is now EMPTY, which means any finding at all is a
 * regression. Keep it that way: resolving a table (put its migration on an
 * applier, or delete the dead reference) is always preferable to re-baselining.
 *
 * If you are tempted to run --write-baseline to make a failure go away, read the
 * finding first. Every entry it would record is an endpoint that 500s on a real
 * deploy while CI stays green — that is the entire point of the guard.
 *
 * Usage:
 *   node scripts/ci/check-migration-reachability.mjs
 *   node scripts/ci/check-migration-reachability.mjs --write-baseline
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { C2C_MIGRATION_FILES } from '../db/migration-set.mjs';
import { AUTHORING_SUBSYSTEM_FILES } from '../db/authoring-subsystem.mjs';
import { qualify, drizzleColumns, stripSqlComments } from './lib/sql-columns.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');
const TAG = '[ci:migration-reachability]';
const BASELINE = path.join(repoRoot, 'scripts', 'ci', 'migration-reachability-baseline.json');
const writeBaseline = process.argv.includes('--write-baseline');

const read = (p) => fs.readFileSync(p, 'utf8');
// Schema-qualified names must capture BOTH parts. Capturing only the first
// identifier — as an earlier revision of this guard did — silently records the
// SCHEMA as the table name: `CREATE TABLE regulatory.submissions` became a table
// called "regulatory", and `FROM predicate.fda_510k_clearances` a reference to
// "predicate". Both sides agreed, so nothing looked wrong, while the ~337
// schema-qualified tables in this repo went completely unchecked — the guard
// reporting green over a blind spot, which is the exact failure it exists to stop
// (ledger C-35). `("?)` + backreference keeps a quoted identifier from swallowing
// the dot.
const QUALIFIED = String.raw`(?:"?([a-z0-9_]+)"?\s*\.\s*)?"?([a-z0-9_]+)"?`;
const CREATE_TABLE_RE = new RegExp(
  String.raw`CREATE\s+(?:UNLOGGED\s+|TEMP\s+|TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?` + QUALIFIED,
  'gi',
);
const CREATE_VIEW_RE = new RegExp(
  String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?` + QUALIFIED,
  'gi',
);

// Canonical table identity (`public.foo` and `foo` are the same relation; any
// other schema is kept) is `qualify` in lib/sql-columns.mjs, shared with the
// column guards so the table and column levels cannot disagree about what a
// relation's name is.

// Comment stripping (`stripSqlComments`) lives in lib/sql-columns.mjs with the
// other shared SQL helpers; see the rationale there.

const tablesIn = (sql) => {
  const out = new Set();
  const body = stripSqlComments(sql);
  for (const re of [CREATE_TABLE_RE, CREATE_VIEW_RE]) {
    re.lastIndex = 0;
    for (const m of body.matchAll(re)) out.add(qualify(m[1], m[2]));
  }
  return out;
};

/**
 * Words that follow FROM/JOIN/INTO/UPDATE in SQL but are not relations. This is a
 * backstop only — the primary defence against prose is `sqlishSegments` below.
 */
const NOT_A_RELATION = new Set([
  'only', 'lateral', 'unnest', 'select', 'values', 'generate_series', 'jsonb_array_elements',
  'jsonb_to_recordset', 'json_array_elements', 'json_to_recordset', 'each', 'dual',
  'information_schema', 'pg_catalog',
]);

/**
 * Extract the parts of a .ts file that are plausibly SQL, so the reference scan
 * never reads English.
 *
 * The reference side reads whole TypeScript files, which are full of prose — FDA
 * guidance text, prompt strings, comments. Scanning that raw text matched
 * ordinary sentences: "Summary of nonclinical safety findings FROM STUDIES
 * completed during the reporting period" registered a reference to a table named
 * `studies`, and "Results FROM STUDIES Evaluating Diagnostic Tests" a second one.
 * A keyword blocklist cannot fix this — `studies` is a perfectly plausible table
 * name, and the next false positive will be a different ordinary noun.
 *
 * So instead of filtering words, filter CONTEXT: consider only quoted segments
 * (template literals, single- and double-quoted strings) that contain a SQL verb
 * — SELECT / INSERT INTO / UPDATE … SET / DELETE FROM / a CTE. Prose almost never
 * does; real queries always do.
 *
 * This direction of error is the safe one. Missing a table because its query was
 * built in some exotic way costs a finding the OTHER guards may still catch; a
 * stream of phantom findings gets the whole guard ignored, which costs all of
 * them (ledger C-35 / C-39).
 */
const SQL_VERB = /\b(SELECT\s|INSERT\s+INTO\s|UPDATE\s+[a-z_."]+\s+SET\s|DELETE\s+FROM\s|WITH\s+[a-z_]+\s+AS\s*\()/i;
function sqlishSegments(src) {
  const out = [];
  // Template literals, then ordinary quoted strings. Non-greedy, newline-aware
  // for backticks (multi-line queries are the norm here).
  for (const re of [/`([\s\S]*?)`/g, /'((?:[^'\\\n]|\\.)*)'/g, /"((?:[^"\\\n]|\\.)*)"/g]) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      if (m[1] && SQL_VERB.test(m[1])) out.push(m[1]);
    }
  }
  return out;
}

/** Walk a directory for files matching `test`, skipping vendored/archived trees. */
function walk(dir, test, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!/^(node_modules|dist|_archive|__tests__|coverage)$/.test(e.name)) walk(p, test, acc);
    } else if (test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

// The pure parsing helpers are exported so tests can pin them directly
// (tests/schema-contract/migration-reachability-guard.contract.test.ts, ledger
// C-35). Everything below runs only when this file is the entry point — importing
// it must not walk the repo or call process.exit.

// ── The reference scan, as a reusable unit ──────────────────────────────────
// Same qualification rule as the creator side — see the note above. A reference to
// `regulatory.information_requests` must resolve to that table, not to a phantom
// relation named after its schema.
/**
 * Keywords after which FROM/UPDATE is NOT introducing a relation. Each entry is
 * a phantom this parser actually produced, found by resolving its output against
 * a live database (check-tables-against-live-schema.mjs):
 *
 *   FOR UPDATE SKIP LOCKED         → a table named `skip`
 *   … IS DISTINCT FROM expected_prev → a table named `expected_prev`
 *   EXTRACT(YEAR FROM created_at)  → a table named `created_at`
 *
 * All three are row-locking or expression syntax, never a relation. The
 * sibling guard (check-unbacked-tables.mjs) carries the same FOR-UPDATE
 * lookbehind for the same reason; the other two were invisible until every
 * extracted name had to resolve to a real relation.
 */
const NOT_A_RELATION_LEAD =
  String.raw`(?<!\bFOR\s)(?<!\bFOR\s{2})(?<!\bDISTINCT\s)(?<!\bDISTINCT\s{2})` +
  String.raw`(?<!\b(?:YEAR|MONTH|DAY|HOUR|MINUTE|SECOND|EPOCH|DOW|DOY|WEEK|QUARTER|ISODOW|ISOYEAR|CENTURY|DECADE|MILLENNIUM|MICROSECONDS|MILLISECONDS|TIMEZONE|TIMEZONE_HOUR|TIMEZONE_MINUTE|JULIAN)\s)`;

const REF_RE = new RegExp(
  NOT_A_RELATION_LEAD +
    // `INTO` must be `INSERT INTO`. A bare INTO also appears inside VALUES
    // prose — `'AnA batch draft accepted into document'` yielded a table called
    // `document` — and in PL/pgSQL's `SELECT … INTO <variable>`, which names a
    // variable, not a relation.
    String.raw`(?:\bFROM|\bJOIN|\bINSERT\s+INTO|\bUPDATE)\s+(?:"?([a-z][a-z0-9_]*)"?\s*\.\s*)?"?([a-z][a-z0-9_]{3,})"?` +
    // A qualified name whose OBJECT half is a template expression —
    // `FROM regulatory_intel.${table}` in services/precedent-engine.ts — is
    // composed at runtime and cannot be resolved statically. Without this, the
    // schema-qualified alternative fails to match `${…}`, the engine backtracks
    // to the unqualified branch, and the SCHEMA name is captured as if it were a
    // table. `regulatory_intel` then resolves against no relation on a live
    // database — the phantom-named-after-its-schema this file's header warns
    // about, arriving through the dynamic-name door instead of the qualified one.
    //
    // `(?!\w)` first, and not merely for tidiness: without it the engine answers
    // the rejection by backtracking to a SHORTER object name — `regulatory_inte`
    // — which satisfies the lookahead and produces a phantom one character off
    // the original. The name must end where the identifier ends.
    String.raw`(?!\w)(?!\s*\.\s*\$)`,
  'gi',
);

/**
 * Names a single query binds for itself: CTEs (`WITH x AS (…)`, and each further
 * `, y AS (…)`) plus window definitions, which share the syntax. Lowercased, to
 * match the reference side.
 */
export function cteNames(sql) {
  const out = new Set();
  // `AS [NOT] MATERIALIZED (` is a CTE too (PostgreSQL 12+). Without it,
  // `WITH scoped AS MATERIALIZED (…) … FROM scoped` read as a table `scoped`.
  for (const m of sql.matchAll(/(?:\bWITH|,)\s+(?:RECURSIVE\s+)?([a-zA-Z_][\w]*)\s+AS\s*(?:(?:NOT\s+)?MATERIALIZED\s*)?\(/gi)) {
    out.add(m[1].toLowerCase());
  }
  return out;
}

/**
 * The server source files whose SQL the reference side reads: .ts, .js AND .mjs,
 * tests excluded.
 *
 * .js and .mjs were missing until 2026-09-22. A mounted router written in .js —
 * server/api/enterprise/rbac-routes.js reading `roles`, server/routes/
 * smart-blocks.js reading four tables — queried relations that exist on no
 * database, and this guard, the live-schema guard and the column guard all
 * reported green: the first two never opened the file, and the third skipped
 * the table as "the table guard's finding". A guard that defers to another must
 * be looking at the same files, so there is one walk and every reference-side
 * guard uses it.
 *
 * @param {string} [dir] absolute directory to scan; defaults to server/
 * @returns {string[]} absolute paths
 */
export function serverSqlFiles(dir = path.join(repoRoot, 'server')) {
  return walk(dir, (n) => /\.(ts|js|mjs)$/.test(n) && !/\.test\.|\.spec\./.test(n));
}

/**
 * The relations one SQL-looking string segment binds, qualified. The reference
 * scan's per-segment step, exported so the column guard can require that a
 * table be bound as a RELATION — not merely mentioned — without a second copy of
 * this parser.
 *
 * @param {string} raw one segment from `sqlishSegments`
 * @returns {Set<string>}
 */
export function relationsIn(raw) {
  const out = new Set();
  // Comments inside a query are prose, and prose discusses joins: the line
  // `-- fails to match and the LEFT JOIN yields a null name.` inside a
  // template literal registered a table called `yields`. The CREATE side has
  // stripped comments since C-35; the reference side had not, and nothing
  // could see it until every name had to resolve against a real database.
  const segment = stripSqlComments(raw);
  // A CTE is defined by the query itself, so `WITH ranked AS (…) SELECT …
  // FROM ranked` references no storage at all. This guard's own finding rule
  // hid the omission — a CTE name is never in `deadCreators`, so it could
  // never become a finding here — but the live-schema guard resolves every
  // referenced name against a real database, where `ranked`, `latest`,
  // `descendants` and two dozen other CTE names come back as missing tables.
  // Filtering them at the source keeps both guards honest; the alternative
  // is a baseline full of entries no migration can ever satisfy.
  const ctes = cteNames(segment);
  REF_RE.lastIndex = 0;
  for (const m of segment.matchAll(REF_RE)) {
    if (NOT_A_RELATION.has((m[2] || '').toLowerCase())) continue;
    const t = qualify(m[1], m[2]);
    if (!m[1] && ctes.has(t)) continue; // unqualified name bound by this query
    out.add(t);
  }
  return out;
}

/**
 * Every table the server's raw SQL names, mapped to the files that name it.
 *
 * Exported, and used by this guard through the export, because a SECOND guard
 * asks the same question against a live database
 * (check-tables-against-live-schema.mjs). Two copies of this parser is exactly
 * how the pair would drift: the regexes here carry three rounds of hard-won
 * corrections (schema-qualified capture, comment stripping, prose rejection),
 * and a private copy in the sibling guard would start out identical, then
 * silently stop matching what this one matches — leaving the two guards
 * disagreeing about which tables the server even references, with no test able
 * to tell which one is right.
 *
 * @param {string} [dir] absolute directory to scan; defaults to server/
 * @returns {Map<string, Set<string>>} qualified table name -> repo-relative files
 */
export function referencedTables(dir = path.join(repoRoot, 'server')) {
  const referenced = new Map();
  for (const abs of serverSqlFiles(dir)) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    // Only SQL-looking string segments — never the whole file. See sqlishSegments.
    for (const raw of sqlishSegments(read(abs))) {
      for (const t of relationsIn(raw)) {
        if (!referenced.has(t)) referenced.set(t, new Set());
        referenced.get(t).add(rel);
      }
    }
  }
  return referenced;
}

// ── The durable surface, as a reusable unit ─────────────────────────────────
// Exported because ci:column-reachability asks this guard's question one level
// down and must get the same answer. The column guard skips a table that nothing
// durable creates, as THIS guard's finding; if the two disagreed about which
// tables are durable, that skip would land on a table this guard also passes,
// and neither would report it.

/**
 * The files drizzle-kit push reads: every `schema` entry in drizzle.config.ts,
 * plus whatever those files `export * from`, recursively.
 *
 * Scoped the way drizzle scopes it, NOT by walking shared/. Walking the whole
 * tree counted tables that drizzle never creates — shared/cmc-schema.ts declares
 * quality_specifications, project_workflows, module_documents, defense_packets
 * and document_audit_logs, none of which is re-exported, all of which are
 * queried by live server code, and none of which any migration creates either.
 * They were registered as "durably created" here, so this guard reported green
 * while those tables existed on no database and their endpoints 500'd.
 *
 * Read from drizzle.config.ts rather than assumed to be shared/schema.ts: the
 * config lists three entries, and an earlier revision that hard-coded the first
 * one never saw the tables of the other two.
 */
export function drizzlePushFiles() {
  const configSrc = fs.existsSync(path.join(repoRoot, 'drizzle.config.ts'))
    ? read(path.join(repoRoot, 'drizzle.config.ts'))
    : '';
  const schemaDecl = /\bschema\s*:\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/.exec(configSrc);
  const entries = schemaDecl
    ? [...schemaDecl[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => path.resolve(repoRoot, m[1]))
    : [path.join(repoRoot, 'shared/schema.ts')];
  const files = [];
  const seen = new Set();
  const visit = (abs) => {
    if (seen.has(abs) || !fs.existsSync(abs)) return;
    seen.add(abs);
    files.push(abs);
    for (const m of read(abs).matchAll(/export\s+\*\s+from\s+['"](\.[^'"]+)['"]/g)) {
      for (const ext of ['.ts', '/index.ts', '']) {
        const candidate = path.resolve(path.dirname(abs), `${m[1].replace(/\.js$/, '')}${ext}`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          visit(candidate);
          break;
        }
      }
    }
  };
  entries.forEach(visit);
  return files;
}

let surfaceMemo = null;

/**
 * Which .sql files a real deployment runs, which tables they create, and in what
 * order — computed once per process.
 *
 * `applyIndex(rel)` is a file's position in C2C_MIGRATION_FILES, or -1 for the
 * base every deploy applies the set ON TOP OF (drizzle push, the root migrations/
 * overlay, the gcc tree, the authoring subsystem), or null when nothing runs it.
 * `creatorIndex` maps a table to the earliest apply position that creates it
 * (+Infinity for tables only runtime server DDL creates, which happens at boot,
 * after every migration). Order matters to anything that vouches for a column
 * added by a catalog sweep: a sweep only touches tables that already exist.
 */
export function durableSurface({ setFiles } = {}) {
  // `setFiles` replaces C2C_MIGRATION_FILES for one call — how a test shows the
  // guards failing on a real defect by un-wiring its migration. Only the default
  // surface is memoized.
  if (!setFiles && surfaceMemo) return surfaceMemo;
  const set = setFiles ?? C2C_MIGRATION_FILES;
  const journal = fs.existsSync(path.join(repoRoot, 'migrations/meta/_journal.json'))
    ? read(path.join(repoRoot, 'migrations/meta/_journal.json'))
    : '';
  const installFresh = read(path.join(repoRoot, 'scripts/db/install-fresh.mjs'));
  const namedDurable = new Set([...set, ...AUTHORING_SUBSYSTEM_FILES]);
  const setIndex = new Map(set.map((f, i) => [f, i]));

  /** Is this repo-relative .sql on a path a real deployment runs? */
  const isDurable = (rel) => {
    const base = path.basename(rel);
    if (namedDurable.has(rel)) return true;
    if (/_gcc_/.test(base)) return true;
    if (journal.includes(base.replace(/\.sql$/, ''))) return true;
    if (installFresh.includes(rel) || installFresh.includes(base)) return true;
    // The root migrations/ tree is the drizzle lineage install-fresh overlays —
    // its TOP LEVEL only. install-fresh lists it with a flat readdirSync, so a
    // subdirectory is never applied: migrations/_legacy/ holds files moved out
    // precisely because a canonical creator supersedes them (its README), and
    // counting them durable let a table look created by a file nothing runs.
    if (/^migrations\/[^/]+\.sql$/.test(rel)) return true;
    return false;
  };
  const applyIndex = (rel) => (!isDurable(rel) ? null : setIndex.has(rel) ? setIndex.get(rel) : -1);

  const durableTables = new Set();
  const deadCreators = new Map(); // table -> [files]
  const creatorIndex = new Map(); // table -> earliest apply index
  const noteCreator = (t, idx) => {
    durableTables.add(t);
    if (!creatorIndex.has(t) || idx < creatorIndex.get(t)) creatorIndex.set(t, idx);
  };

  for (const abs of walk(path.join(repoRoot, 'db/migrations'), (n) => n.endsWith('.sql'))) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    if (rel.includes('/_legacy/') || rel.includes('/_archive/')) continue;
    const created = tablesIn(read(abs));
    if (isDurable(rel)) {
      for (const t of created) noteCreator(t, applyIndex(rel));
    } else {
      for (const t of created) {
        if (!deadCreators.has(t)) deadCreators.set(t, []);
        deadCreators.get(t).push(rel);
      }
    }
  }
  for (const abs of walk(path.join(repoRoot, 'migrations'), (n) => n.endsWith('.sql'))) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    if (!isDurable(rel)) continue; // a subdirectory: see isDurable
    for (const t of tablesIn(read(abs))) noteCreator(t, -1);
  }
  // drizzle push surface. Push creates nothing outside `public`
  // (scripts/db/install-fresh.mjs, step 2): a pgSchema('vault').table(…) is
  // durable only if SQL creates it, so only unqualified names count here.
  const drizzleFiles = drizzlePushFiles();
  for (const abs of drizzleFiles) {
    const src = read(abs);
    for (const m of src.matchAll(/pg(?:Table|View|MaterializedView)\(\s*['"]([a-z0-9_]+)['"]/gi)) {
      noteCreator(m[1].toLowerCase(), -1);
    }
    for (const t of drizzleColumns(src).tables) if (!t.includes('.')) noteCreator(t, -1);
  }
  // runtime DDL in server code is a real (if discouraged) provisioning path.
  for (const abs of walk(path.join(repoRoot, 'server'), (n) => n.endsWith('.ts'))) {
    const src = read(abs);
    if (!/CREATE\s+TABLE/i.test(src)) continue;
    for (const t of tablesIn(src)) noteCreator(t, Number.POSITIVE_INFINITY);
  }

  const surface = { isDurable, applyIndex, durableTables, deadCreators, creatorIndex, drizzleFiles };
  if (!setFiles) surfaceMemo = surface;
  return surface;
}

export { qualify, tablesIn, stripSqlComments, NOT_A_RELATION, sqlishSegments, REF_RE, repoRoot };

const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (!isEntryPoint) {
  // Imported for its helpers; skip the scan.
} else {

// ── 1. The durable creator set ──────────────────────────────────────────────
const { durableTables, deadCreators } = durableSurface();

// ── 2. Tables the server actually queries ───────────────────────────────────
// The scan itself lives in `referencedTables` above, so this guard and the
// live-schema guard cannot drift apart on what "the server references" means.
const referenced = referencedTables(); // table -> Set(files)

// ── 3. The finding: referenced, created ONLY by a deploy-dead migration ─────
const findings = {};
for (const [table, creators] of [...deadCreators.entries()].sort()) {
  if (durableTables.has(table)) continue; // also created somewhere durable — fine
  if (!referenced.has(table)) continue; // never queried — dead spec, not a 500
  findings[table] = {
    createdOnlyBy: [...new Set(creators)].sort(),
    referencedBy: [...referenced.get(table)].sort().slice(0, 6),
  };
}

const names = Object.keys(findings).sort();

if (writeBaseline) {
  fs.writeFileSync(
    BASELINE,
    `${JSON.stringify(
      {
        _comment:
          'Tables the server queries whose ONLY creator is a migration on no durable apply path — they exist on no real database, so those endpoints 500. ci:unbacked-tables cannot see this class: it counts any .sql file as a creator regardless of whether an applier runs it. Anything NEW fails the build. Resolve an entry (put its migration on an applier, or delete the dead reference), then remove it here to ratchet down. Goal: 0.',
        _durablePaths: [
          'migrations/meta/_journal.json (drizzle migrate)',
          'db/migrations/*_gcc_*.sql (CI psql loop)',
          'C2C_MIGRATION_FILES (deploy-migrate + apply-c2c)',
          'AUTHORING_SUBSYSTEM_FILES (same deploy path)',
          'files install-fresh.mjs names explicitly',
          'the drizzle push surface (pgTable/pgView in shared/)',
        ],
        count: names.length,
        tables: findings,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`${TAG} baseline written: ${names.length} table(s).`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(read(BASELINE)) : { tables: {} };
const baselined = new Set(Object.keys(baseline.tables || {}));
const added = names.filter((t) => !baselined.has(t));
const resolved = [...baselined].filter((t) => !names.includes(t));

console.log(
  `${TAG} ${durableTables.size} durably-created tables; ${names.length} server-referenced table(s) created only by a deploy-dead migration; ${baselined.size} baselined`,
);

if (resolved.length) {
  console.log(
    `${TAG} ✅ ${resolved.length} baselined table(s) now reachable — remove from the baseline to ratchet down:`,
  );
  for (const t of resolved.slice(0, 20)) console.log(`    • ${t}`);
}

if (added.length) {
  console.error(`\n${TAG} ❌ ${added.length} NEW unreachable table reference(s):\n`);
  for (const t of added) {
    console.error(`  ${t}`);
    console.error(`    created only by : ${findings[t].createdOnlyBy.join(', ')}`);
    console.error(`    referenced by   : ${findings[t].referencedBy.join(', ')}`);
  }
  console.error(`\n  A migration in db/migrations/ is NOT applied by anything on its own.`);
  console.error(`  Put it on a durable path — usually C2C_MIGRATION_FILES in`);
  console.error(`  scripts/db/migration-set.mjs — or the table will exist on no real`);
  console.error(`  database and every endpoint that queries it will 500 in production,`);
  console.error(`  while ci:unbacked-tables still reports it "backed".`);
  // db/migrations/_consolidated/ is a snapshot of a legacy schema that is refused
  // on purpose (migration-set.mjs). "Put it on an applier" is the wrong advice
  // there: those files are not replay-safe and their shapes are not this schema's.
  const consolidatedOnly = added.filter((t) =>
    findings[t].createdOnlyBy.every((f) => f.startsWith('db/migrations/_consolidated/')),
  );
  if (consolidatedOnly.length) {
    console.error(`\n  EXCEPT ${consolidatedOnly.join(', ')}: created only under db/migrations/_consolidated/,`);
    console.error(`  which must never be wired. Delete the dead reference, move it onto the`);
    console.error(`  canonical store, or write a NEW replay-safe migration in the set.`);
  }
  process.exit(1);
}

console.log(`${TAG} ✅ no new unreachable table references.`);

} // end entry-point guard
