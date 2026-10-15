/**
 * check-unbacked-tables reads runtime DDL in server TypeScript from CODE, past
 * string literals that look like comment openers, and not from comments.
 *
 * Its runtime-DDL pass (CREATE TABLE inside a .ts file) used to strip comments
 * with its SQL stripper alone. Two consequences, in opposite directions:
 *   - /\/\*[\s\S]*?\*\// opened at a `/*` inside a string ('/api/advisory/*')
 *     and blanked code up to the next comment close, so a CREATE TABLE in
 *     between was not seen and its table was reported as unbacked;
 *   - `//` comments were never stripped, so a note such as
 *     "// was: CREATE TABLE IF NOT EXISTS ghost_notes" counted as creating
 *     ghost_notes, and server SQL against a table nothing creates passed.
 * The pass now strips TypeScript comments with the shared
 * scripts/ci/lib/strip-comments.mjs, then SQL comments.
 *
 * The gate resolves the repository root from its own path, so this copies the
 * gate and scripts/ci/lib into a fixture tree and runs it there with --strict
 * (no baseline) and --json, and reads the unbacked tables from the report.
 *
 * UNBACKED_TABLES_GATE_UNDER_TEST points this at another copy of the gate (for
 * instance one with the old stripper restored) to show these cases fail on it.
 *
 * The fixture SQL and comment delimiters are assembled at runtime so that no
 * gate scanning scripts/ reads this file as DDL, a table reference or a comment.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.UNBACKED_TABLES_GATE_UNDER_TEST
  ? path.resolve(process.env.UNBACKED_TABLES_GATE_UNDER_TEST)
  : path.join(CI_DIR, 'check-unbacked-tables.mjs');

const OPEN = '/' + '*';
const CLOSE = '*' + '/';
const LINE = '/' + '/';
const CREATE = (t) => `${'CRE' + 'ATE'} TABLE IF NOT EXISTS ${t} (id integer PRIMARY KEY)`;
const SELECT = (t) => `${'SEL' + 'ECT'} id ${'FR' + 'OM'} ${t} WHERE id = $1`;
const ddl = (t) => `await db.execute(sql\`${CREATE(t)}\`);`;
const query = (t) => `export const read_${t} = '${SELECT(t)}';`;
const statement = (name, body) => `export const ${name} = \`${body}\`;`;

const FILES = {
  // A reference to a table nothing creates, AFTER a string holding /* and
  // before a real block comment: reported.
  'server/services/advisory-reader.ts': [
    `const ADVISORY_ROUTES = '/api/advisory${OPEN}';`,
    query('advisory_missing'),
    `${OPEN} Advisory reads end here. ${CLOSE}`,
    '',
  ].join('\n'),

  // Runtime DDL AFTER a string holding /*: the table is created, so its
  // reference is backed.
  'server/services/advisory-cache.ts': [
    `const ADVISORY_ROUTES = '/api/advisory${OPEN}';`,
    'export async function ensureAdvisoryCache(db, sql) {',
    `  ${ddl('advisory_cache')}`,
    '}',
    `${OPEN} The cache is rebuilt on boot. ${CLOSE}`,
    query('advisory_cache'),
    '',
  ].join('\n'),

  // Runtime DDL on the same line as, and after, an https:// string.
  'server/services/linked-cache.ts': [
    'export async function ensureLinkedCache(db, sql) {',
    `  const DOCS = 'https:${LINE}docs.example.com/cache'; ${ddl('linked_cache')}`,
    '}',
    query('linked_cache'),
    '',
  ].join('\n'),

  // Control: DDL only inside real comments creates nothing, so the
  // references are reported.
  'server/services/ghost-notes.ts': [
    `${LINE} was: ${CREATE('ghost_notes')} — retired with the old router.`,
    `${OPEN} was: ${CREATE('ghost_blocks')} ${CLOSE}`,
    query('ghost_notes'),
    query('ghost_blocks'),
    '',
  ].join('\n'),

  // Control: DDL inside an SQL comment within an embedded SQL string
  // creates nothing either.
  'server/services/sql-commented.ts': [
    'export async function ensureNothing(db, sql) {',
    `  await db.execute(sql\`-- ${CREATE('sql_commented_notes')}\nSELECT 1\`);`,
    '}',
    query('sql_commented_notes'),
    '',
  ].join('\n'),

  // Column names belong to the CTE declaration, not to a persisted table.
  // A quoted column and adjacent ')AS' also retain SQL token boundaries.
  'server/services/first-column-cte.ts': statement('first_columns',
    'WITH RECURSIVE first_columns(id, "Step Count")AS (SELECT 1,0 UNION ALL SELECT id+1,0 FROM first_columns WHERE id<2) SELECT id FROM first_columns'),

  // Statement admission must read storage inside a leading column-list CTE.
  'server/services/first-column-missing-store.ts': statement('first_missing',
    'WITH RECURSIVE first_missing_cte(id) AS (SELECT id FROM first_cte_missing_store) SELECT id FROM first_missing_cte'),

  // This is the existing recorded-lineage query shape: seed, then a walk
  // with declared output columns and a recursive reference to itself.
  'server/services/later-column-cte.ts': statement('later_columns',
    'WITH RECURSIVE seeded AS (SELECT 1 AS id), later_walk(id) AS (SELECT id FROM seeded UNION ALL SELECT id+1 FROM later_walk WHERE id<2) SELECT id FROM later_walk'),

  'server/services/later-column-missing-store.ts': statement('later_missing',
    'WITH seed AS (SELECT 1 AS id), later_missing_cte(id) AS (SELECT id FROM later_cte_missing_store) SELECT id FROM later_missing_cte'),

  // A declaration qualifies only its own literal; another query using the
  // same name still requires an actual backing table.
  'server/services/statement-local-cte.ts': [
    statement('defined_here', 'WITH statement_local_name(id) AS (SELECT 1) SELECT id FROM statement_local_name'),
    query('statement_local_name'),
  ].join('\n'),
};

let cached;
function runGate() {
  if (cached) return cached;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unbacked-tables-'));
  try {
    const ci = path.join(root, 'scripts', 'ci');
    fs.mkdirSync(ci, { recursive: true });
    fs.copyFileSync(GATE, path.join(ci, 'check-unbacked-tables.mjs'));
    fs.cpSync(path.join(CI_DIR, 'lib'), path.join(ci, 'lib'), { recursive: true });
    for (const [rel, body] of Object.entries(FILES)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const report = path.join(root, 'report.json');
    const r = spawnSync(
      process.execPath,
      [path.join(ci, 'check-unbacked-tables.mjs'), '--strict', '--json', report],
      { cwd: root, encoding: 'utf8' },
    );
    const out = `${r.stdout}${r.stderr}`;
    assert.ok(fs.existsSync(report), `the gate wrote no report:\n${out}`);
    const json = JSON.parse(fs.readFileSync(report, 'utf8'));
    cached = { code: r.status, out, unbacked: new Set(json.unbacked.map((u) => u.table)) };
    return cached;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a reference to an uncreated table after a string holding /* is reported', () => {
  const r = runGate();
  assert.equal(r.code, 1, r.out);
  assert.ok(r.unbacked.has('advisory_missing'), r.out);
});

test('runtime DDL after a string holding /* backs its table', () => {
  const r = runGate();
  assert.ok(!r.unbacked.has('advisory_cache'), r.out);
});

test('runtime DDL after an https:// string on the same line backs its table', () => {
  const r = runGate();
  assert.ok(!r.unbacked.has('linked_cache'), r.out);
});

test('DDL only inside real comments backs nothing', () => {
  const r = runGate();
  assert.ok(r.unbacked.has('ghost_notes'), r.out);
  assert.ok(r.unbacked.has('ghost_blocks'), r.out);
});

test('DDL inside an SQL comment within an embedded string backs nothing', () => {
  const r = runGate();
  assert.ok(r.unbacked.has('sql_commented_notes'), r.out);
});

test('a leading recursive CTE with declared and quoted columns is query-local storage', () => {
  const r = runGate();
  assert.ok(!r.unbacked.has('first_columns'), r.out);
});

test('a leading column-list CTE still reports the missing storage it reads', () => {
  const r = runGate();
  assert.ok(r.unbacked.has('first_cte_missing_store'), r.out);
  assert.ok(!r.unbacked.has('first_missing_cte'), r.out);
});

test('a later recursive CTE with declared columns is query-local storage', () => {
  const r = runGate();
  assert.ok(!r.unbacked.has('later_walk'), r.out);
  assert.ok(!r.unbacked.has('seeded'), r.out);
});

test('a later column-list CTE still reports the missing storage it reads', () => {
  const r = runGate();
  assert.ok(r.unbacked.has('later_cte_missing_store'), r.out);
  assert.ok(!r.unbacked.has('later_missing_cte'), r.out);
});

test('a CTE declaration does not qualify the same table name in another statement', () => {
  const r = runGate();
  assert.equal(r.code, 1, r.out);
  assert.ok(r.unbacked.has('statement_local_name'), r.out);
});
