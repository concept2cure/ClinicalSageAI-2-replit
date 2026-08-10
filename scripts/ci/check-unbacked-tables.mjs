#!/usr/bin/env node
/**
 * CI Guard: detect server code that reads or writes a table NOTHING creates.
 *
 * WHY THIS EXISTS
 * ---------------
 * This is the single most expensive defect class in the repository. Five separate
 * findings — ledger C-8, C-10, C-11, C-12, C-14 — are all the same shape:
 *
 *     shipped code + no storage = a feature that cannot work,
 *     and nothing in CI notices.
 *
 * It stays invisible because of how the failures present:
 *
 *   - unit tests `vi.mock` the db module, so a mock accepts any table name;
 *   - a write wrapped in try/catch degrades to a silent no-op (the Part 11
 *     authoring audit trail wrote to a table that never existed, logged
 *     "CRITICAL", and continued — for the whole life of the feature);
 *   - an UNGUARDED query throws "relation does not exist", the route's catch
 *     turns it into a 500, and the endpoint simply never worked (POST
 *     /docs/:id/export, GET /docs/:id/diff-since-export).
 *
 * WHAT COUNTS AS "CREATED"
 * ------------------------
 * A table is backed if ANY of these defines it — all three are real provisioning
 * paths in this repo, and a guard that knew only one would be wrong:
 *
 *   1. a non-archived .sql migration          (db/migrations/, migrations/)
 *   2. the drizzle push surface               (pgTable/pgView in shared/)
 *   3. runtime DDL in TypeScript              (CREATE TABLE IF NOT EXISTS in a
 *                                              .ts file — e.g. the authoring
 *                                              router's ensure*TableExists)
 *
 * WHAT THIS ENFORCES
 *   - Referencing a table nothing creates fails the build.
 *   - Known pre-existing references live in a baseline and do not fail; anything
 *     NEW fails immediately.
 *   - The baseline pins table -> exact referencing file set, so an already-listed
 *     table cannot silently acquire new call sites.
 *
 * MODES
 *   (default)          fail on any unbacked reference not in the baseline
 *   --strict           fail on ANY unbacked reference, baseline included
 *   --write-baseline   snapshot current state; run intentionally, commit result
 *   --json <path>      also write the full report as JSON
 *
 * KNOWN LIMITS (stated rather than hidden)
 *   - Only raw SQL in string literals is analysed. Drizzle query-builder calls
 *     are typechecked against shared/schema.ts already, so they are out of scope.
 *   - Dynamically composed table names (`FROM ${tbl}`) cannot be resolved and are
 *     skipped, so this guard under-reports rather than guessing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..', '..');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const WRITE_BASELINE = args.includes('--write-baseline');
const jsonIdx = args.indexOf('--json');
const JSON_OUT = jsonIdx !== -1 ? args[jsonIdx + 1] : null;

const BASELINE_PATH = path.join(repoRoot, 'scripts', 'ci', 'unbacked-tables-baseline.json');

const ARCHIVED = ['_legacy/', '_deprecated_migrations/', 'docs/archive/', '_consolidated/', 'node_modules/'];
const isArchived = (p) => ARCHIVED.some((a) => p.includes(a));

/** Directories whose raw SQL is analysed. */
const SCANNED = ['server'];

function collect(dir, exts, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      collect(full, exts, acc);
    } else if (exts.some((x) => e.name.endsWith(x))) {
      acc.push(path.relative(repoRoot, full));
    }
  }
  return acc;
}

/** Prose that mentions DDL is not DDL (see the duplicate-table guard's C-12 note). */
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

const CREATE_RE =
  /CREATE\s+(?:TABLE|(?:MATERIALIZED\s+)?VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)?)/gi;

// ── 1..3: everything that creates storage ────────────────────────────────────

const created = new Set();
const addCreated = (name) => created.add(name.toLowerCase());

for (const f of collect(repoRoot, ['.sql']).filter((p) => !isArchived(p))) {
  const sql = stripComments(fs.readFileSync(path.join(repoRoot, f), 'utf8'));
  for (const m of sql.matchAll(CREATE_RE)) addCreated(m[1]);
}

for (const f of collect(path.join(repoRoot, 'shared'), ['.ts'])) {
  const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
  for (const m of src.matchAll(/pg(?:Table|View|MaterializedView)\(\s*['"`]([\w.]+)['"`]/g)) addCreated(m[1]);
}

for (const f of collect(path.join(repoRoot, 'server'), ['.ts'])) {
  const src = stripComments(fs.readFileSync(path.join(repoRoot, f), 'utf8'));
  for (const m of src.matchAll(CREATE_RE)) addCreated(m[1]);
}

// ── references in raw SQL ────────────────────────────────────────────────────

/**
 * Captures the keyword, the name, and whether the name is followed by `(`.
 *
 * A trailing `(` means a set-returning FUNCTION when it follows FROM/JOIN —
 * `FROM ectd.seed_project_hierarchy($1::uuid, ...)` — and a function is not
 * storage. But it means a COLUMN LIST after INSERT INTO, where the name is a
 * real table. The distinction has to be made per keyword, so it is made below
 * rather than in the pattern.
 *
 * Deliberately NOT done with a `(?!\s*\()` lookahead: that makes the name group
 * backtrack one character to satisfy the assertion, so `INSERT INTO users (id…)`
 * silently yields a table named `user`. It produced 400+ off-by-one phantoms.
 */
/**
 * `FOR UPDATE` / `FOR NO KEY UPDATE` are ROW-LOCKING clauses, not statements
 * that write a table. Without the lookbehind, `SELECT … FOR UPDATE OF c`
 * matched the `UPDATE` alternative and yielded a phantom table named `of`,
 * failing the Lint job on valid, idiomatic SQL.
 *
 * The lookbehind is deliberately narrow — it suppresses ONLY an `UPDATE`
 * preceded by `FOR`, which is never a table update. Adding 'of' to
 * NOT_A_TABLE would also have silenced it, but that is the weaker fix: it
 * treats the symptom and would additionally hide a genuine reference to a
 * table actually named `of`.
 *
 * Third phantom-table variant this pattern has had to absorb; see the note
 * above about the two earlier ones.
 */
const REF_RE =
  /\b(?<!FOR\s)(?<!FOR\s{2})(FROM|JOIN|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?([a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)?)(\s*\()?/gi;

/** SQL keywords and set-returning functions that follow FROM/JOIN but are not tables. */
const NOT_A_TABLE = new Set([
  'select', 'where', 'set', 'values', 'on', 'as', 'and', 'or', 'not', 'null', 'case', 'when',
  'then', 'else', 'end', 'lateral', 'unnest', 'generate_series', 'json_array_elements',
  'jsonb_array_elements', 'jsonb_array_elements_text', 'json_to_recordset', 'jsonb_to_recordset',
  'string_to_table', 'regexp_split_to_table', 'each', 'row', 'dual', 'only', 'distinct', 'all',
  'table', 'if', 'exists', 'in', 'into', 'using', 'returning', 'limit', 'order', 'group',
  'having', 'with', 'union', 'except', 'intersect', 'the', 'a', 'an',
]);

/**
 * A literal is treated as SQL only when it begins with a STRUCTURALLY complete
 * statement head — not merely a keyword.
 *
 * Two rounds of tightening, each driven by a phantom this guard produced:
 *
 *   contains-a-keyword  → 'Failed to update section' yields a table `section`
 *   starts-with-keyword → "Update failed" yields a table `failed`, and
 *                         "Delete from the list" yields `the`
 *
 * Requiring `UPDATE <name> SET`, `INSERT INTO <name> (`, and so on eliminates
 * both classes, because prose does not carry SQL's structure. A phantom entry in
 * a baseline is worse than a miss: it becomes an accepted "known defect" that
 * nobody can ever resolve, and it fails future files for discussing it (the
 * lesson from the duplicate-table guard's `if` entry, ledger C-12).
 */
const SQL_SMELL = new RegExp(
  '^\\s*(?:' +
    'SELECT\\b' +
    '|INSERT\\s+INTO\\s+[\\w.]+\\s*[({]' +
    '|UPDATE\\s+[\\w.]+\\s+SET\\b' +
    '|DELETE\\s+FROM\\s+[\\w.]+\\s*(?:$|WHERE\\b|USING\\b|RETURNING\\b|;)' +
    '|WITH\\s+(?:RECURSIVE\\s+)?[\\w]+\\s+AS\\s*\\(' +
    ')',
  'i',
);

/** table -> Set<file> */
const refs = new Map();

for (const f of SCANNED.flatMap((d) => collect(path.join(repoRoot, d), ['.ts']))) {
  if (f.includes('__tests__') || f.includes('.test.') || f.includes('.spec.')) continue;
  const src = fs.readFileSync(path.join(repoRoot, f), 'utf8');
  const literals = [
    ...(src.match(/`[^`]*`/g) ?? []),
    ...(src.match(/'(?:[^'\\\n]|\\.)*'/g) ?? []),
    ...(src.match(/"(?:[^"\\\n]|\\.)*"/g) ?? []),
  ];
  for (const lit of literals) {
    const body = stripComments(lit.slice(1, -1));
    if (!SQL_SMELL.test(body)) continue;
    // CTE names are defined by the query itself.
    const ctes = new Set(
      [...body.matchAll(/(?:WITH|,)\s+(?:RECURSIVE\s+)?([a-zA-Z_][\w]*)\s+AS\s*\(/gi)].map((m) =>
        m[1].toLowerCase(),
      ),
    );
    for (const m of body.matchAll(REF_RE)) {
      const keyword = m[1];
      const t = m[2].toLowerCase();
      const looksLikeCall = Boolean(m[3]);
      if (looksLikeCall && /^(?:FROM|JOIN)$/i.test(keyword)) continue; // set-returning function
      if (NOT_A_TABLE.has(t) || ctes.has(t)) continue;
      // System catalogs are provided by Postgres.
      if (t.startsWith('pg_') || t.startsWith('information_schema.')) continue;
      // `FROM ${expr}` — the name is not statically known.
      if (t.startsWith('$')) continue;
      if (!refs.has(t)) refs.set(t, new Set());
      refs.get(t).add(f);
    }
  }
}

const isBacked = (t) =>
  created.has(t) || created.has(`public.${t}`) || created.has(t.replace(/^public\./, ''));

const unbacked = [...refs.entries()]
  .filter(([t]) => !isBacked(t))
  .map(([table, files]) => ({ table, files: [...files].sort() }))
  .sort((a, b) => a.table.localeCompare(b.table));

// ── Baseline ─────────────────────────────────────────────────────────────────

if (WRITE_BASELINE) {
  const baseline = {
    $comment:
      'Tables referenced by server SQL that NOTHING in the repo creates — no migration, ' +
      'no drizzle pgTable, no runtime DDL. Pinned to the exact referencing file set, so an ' +
      'entry cannot silently acquire new call sites. Every entry is a feature that either ' +
      'returns 500 (unguarded query) or silently no-ops (query inside try/catch). Each is a ' +
      'defect awaiting a code-derived migration or a retirement, NOT an approved pattern. ' +
      'Shrink this file; never grow it. See ledger C-11/C-14 for the remediation pattern: ' +
      'derive the shape from the queries, add one canonical migration, prove it with a ' +
      'golden journey.',
    generatedAt: new Date().toISOString(),
    total: unbacked.length,
    entries: Object.fromEntries(unbacked.map((u) => [u.table, u.files])),
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`[ci:unbacked-tables] baseline written: ${unbacked.length} unbacked tables`);
  process.exit(0);
}

let baselineEntries = {};
if (!STRICT && fs.existsSync(BASELINE_PATH)) {
  try {
    baselineEntries = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).entries ?? {};
  } catch {
    console.error(`[ci:unbacked-tables] baseline unreadable at ${BASELINE_PATH}`);
    process.exit(1);
  }
}

const offending = STRICT
  ? unbacked
  : unbacked
      .map((u) => {
        const known = new Set(baselineEntries[u.table] ?? []);
        const newFiles = u.files.filter((f) => !known.has(f));
        return newFiles.length ? { ...u, newFiles } : null;
      })
      .filter(Boolean);

if (JSON_OUT) {
  fs.writeFileSync(
    path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(repoRoot, JSON_OUT),
    JSON.stringify({ created: created.size, referenced: refs.size, unbacked, offending }, null, 2) + '\n',
  );
}

console.log(
  `[ci:unbacked-tables] ${created.size} tables/views created across migrations, drizzle and runtime DDL; ` +
    `${refs.size} referenced in server SQL; ${unbacked.length} unbacked` +
    (STRICT ? ' (strict mode)' : `; ${Object.keys(baselineEntries).length} baselined`),
);

if (offending.length === 0) {
  console.log('[ci:unbacked-tables] ✅ no new references to tables nothing creates.');
  process.exit(0);
}

console.error('');
console.error('🚫 Server SQL references tables that NOTHING in this repo creates:');
console.error('');
for (const { table, files, newFiles } of offending) {
  console.error(`  ${table}`);
  for (const f of newFiles ?? files) console.error(`      ${f}`);
}
console.error('');
console.error('  An unguarded query against a missing table throws "relation does not exist",');
console.error('  which route handlers turn into a 500 — the endpoint never works. A guarded');
console.error('  one degrades to a silent no-op, which is worse: it looks durable and is not.');
console.error('');
console.error('  Fix: add a code-derived migration for the table (see ledger C-11/C-14), or');
console.error('  point the query at the table that actually holds the data.');
console.error('  If this is pre-existing debt being tracked:');
console.error('    npm run ci:unbacked-tables:write-baseline');
console.error('');
process.exit(1);
