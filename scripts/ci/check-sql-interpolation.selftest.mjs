#!/usr/bin/env node
/**
 * Selftest for check-sql-interpolation.mjs: the gate must FAIL on what it
 * exists to catch, and stay quiet on what it must not count.
 *
 * Each case builds a fixture tree (a copy of the gate and its comment
 * stripper, a baseline, and server files) in a temp dir and runs the gate
 * there. A case that expects exit 1 and gets 0 means the gate is blind to it.
 *
 * KNOWN GAPS: real injection shapes the gate does not see. Each is pinned as
 * its current blind output. When the gate learns to catch one, this selftest
 * fails and says to promote it to a RED case.
 *   1. SQL text assembled in a variable first: const q = `…${x}…`; pool.query(q).
 *   2. String concatenation: pool.query('SELECT … WHERE name = \'' + x + '\'').
 *
 * Fixture text is assembled from fragments so this file's own source carries
 * no `.query(` template with an interpolation (it is not under server/ anyway).
 *
 * Usage:
 *   node scripts/ci/check-sql-interpolation.selftest.mjs
 *   SELFTEST_GATE_PATH=/tmp/mutant.mjs node scripts/ci/check-sql-interpolation.selftest.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:sql-interpolation:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-sql-interpolation.mjs');
const LIB = path.join(repoRoot, 'scripts', 'ci', 'lib', 'strip-comments.mjs');
const PREDICATES = path.join(repoRoot, 'scripts', 'ci', 'lib', 'approved-sql-predicates.mjs');
const TYPESCRIPT = path.dirname(createRequire(import.meta.url).resolve('typescript/package.json'));

const Q = '.query(';
const BT = '`';
const I = (expr) => '$' + '{' + expr + '}';
/** A one-line query call whose SQL text interpolates each of `exprs`. */
const call = (...exprs) => `await pool${Q}${BT}SELECT * FROM t WHERE ${exprs.map((e, i) => `c${i} = ${I(e)}`).join(' AND ')}${BT});\n`;
const CSR_CALLER = 'server/services/csr/vault-source-input.ts';
const ELIGIBILITY_IMPORT = "import { vaultDataEligibleSql, vaultBinaryAvailableSql } from '../document-data-disposition/eligibility.js';\n";
const SUPERSEDED_IMPORT = "import { supersededSql } from '../vault/vault-version-family.js';\n";
const REPORT_CALLER = 'server/services/report-os/report-package-legal.ts';
const REPORT_BINARY_IMPORT = "import { vaultBinaryAvailableSql } from '../document-data-disposition/eligibility';\n";
const ESTAR_CALLER = 'server/services/pathway-engines/estar/estar-attachment-source-access.ts';
const ESTAR_BINARY_IMPORT = "import { vaultBinaryAvailableSql } from '../../document-data-disposition/eligibility';\n";

function run(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqli-gate-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts', 'ci', 'lib'), { recursive: true });
    fs.copyFileSync(GATE, path.join(root, 'scripts', 'ci', 'check-sql-interpolation.mjs'));
    fs.copyFileSync(LIB, path.join(root, 'scripts', 'ci', 'lib', 'strip-comments.mjs'));
    fs.copyFileSync(PREDICATES, path.join(root, 'scripts', 'ci', 'lib', 'approved-sql-predicates.mjs'));
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true });
    fs.symlinkSync(TYPESCRIPT, path.join(root, 'node_modules', 'typescript'), 'dir');
    fs.writeFileSync(path.join(root, 'scripts', 'ci', 'sql-interpolation-baseline.json'), JSON.stringify(baseline));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'ci', 'check-sql-interpolation.mjs')], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const cases = [
  {
    name: 'RED — a new route interpolates a request value into SQL text',
    files: { 'server/routes/search.ts': call('req.query.name') },
    baseline: {},
    expectExit: 1,
    expectIn: ['server/routes/search.ts: 1 value(s) interpolated into SQL text — not in the baseline'],
  },
  {
    name: 'RED — sql.raw in a new service',
    files: { 'server/services/sort.ts': "db.execute(sql`SELECT * FROM t ORDER BY ${sql.raw(input.sort)}`);\n" },
    baseline: {},
    expectExit: 1,
    expectIn: ['server/services/sort.ts: 1 value(s) interpolated'],
  },
  {
    name: 'RED — a baselined file gains one',
    files: { 'server/routes/report.ts': call('TABLE') + call('TABLE', 'req.body.filter') },
    baseline: { 'server/routes/report.ts': 2 },
    expectExit: 1,
    expectIn: ['server/routes/report.ts: 3 value(s) interpolated into SQL text, baseline allows 2'],
  },
  {
    name: 'RED — a typed .query<T>( call is counted',
    files: { 'server/routes/typed.ts': `await pool.query<Row>(${BT}SELECT * FROM t WHERE id = ${I('req.params.id')}${BT});\n` },
    baseline: {},
    expectExit: 1,
    expectIn: ['server/routes/typed.ts: 1 value(s)'],
  },
  {
    name: 'RED — a file fixed but its baseline not lowered',
    files: { 'server/routes/report.ts': call('TABLE') },
    baseline: { 'server/routes/report.ts': 2 },
    expectExit: 1,
    expectIn: ['server/routes/report.ts: now 1 (baseline 2)', 'lower the baseline'],
  },
  {
    name: 'quiet — bind parameters, drizzle sql`` (which parameterizes), and the same text in a comment',
    files: {
      'server/routes/ok.ts':
        "await pool.query('SELECT * FROM t WHERE id = $1', [req.params.id]);\n" +
        "await db.execute(sql`SELECT * FROM t WHERE id = ${req.params.id}`);\n" +
        '// ' + call('req.query.name'),
    },
    baseline: {},
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: 'quiet — test files and __tests__ are not scanned; code outside server/ is not scanned',
    files: {
      'server/routes/__tests__/search.test.ts': call('req.query.name'),
      'server/routes/search.spec.ts': call('req.query.name'),
      'scripts/db/report.mjs': call('process.argv[2]'),
    },
    baseline: {},
    expectExit: 0,
    expectIn: ['OK'],
  },
  {
    name: "quiet — today's shape: a baselined file at its exact count",
    files: { 'server/routes/report.ts': call('TABLE', 'placeholders') },
    baseline: { 'server/routes/report.ts': 2 },
    expectExit: 0,
    expectIn: ['OK — no new value interpolated into SQL text. 2 baselined interpolation(s) in 1 file(s)'],
  },
  {
    name: 'quiet — all three exact canonical predicates in the reviewed source caller',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + SUPERSEDED_IMPORT + call("vaultDataEligibleSql('d')", "vaultBinaryAvailableSql('d')", "supersededSql('d')") },
    baseline: {}, expectExit: 0,
    expectIn: ['3 fixed canonical predicate(s) proved separately', '0 baselined interpolation(s) in 0 file(s)', "vaultDataEligibleSql('d') <- ../document-data-disposition/eligibility.js"],
  },
  {
    name: 'quiet — the second reviewed caller uses the same canonical binding',
    files: { 'server/services/csr/source-receipt-eligibility.ts': ELIGIBILITY_IMPORT + call('vaultDataEligibleSql("d")') },
    baseline: {}, expectExit: 0, expectIn: ['1 fixed canonical predicate(s)', '0 baselined interpolation(s)'],
  },
  {
    name: 'quiet — report legal originals use the exact canonical binary predicate and fixed alias',
    files: { [REPORT_CALLER]: REPORT_BINARY_IMPORT + call("vaultBinaryAvailableSql('d')") },
    baseline: {}, expectExit: 0,
    expectIn: ['1 fixed canonical predicate(s)', "vaultBinaryAvailableSql('d') <- ../document-data-disposition/eligibility", '0 baselined interpolation(s)'],
  },
  {
    name: 'RED — report helper from a wrong module receives no proof',
    files: { [REPORT_CALLER]: REPORT_BINARY_IMPORT.replace('../document-data-disposition/eligibility', '../unreviewed/eligibility') + call("vaultBinaryAvailableSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${REPORT_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — report helper with a variable alias receives no proof',
    files: { [REPORT_CALLER]: REPORT_BINARY_IMPORT + "const alias = 'd';\n" + call('vaultBinaryAvailableSql(alias)') },
    baseline: {}, expectExit: 1, expectIn: [`${REPORT_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — report parameter shadowing the canonical helper receives no proof',
    files: { [REPORT_CALLER]: REPORT_BINARY_IMPORT + `async function bad(vaultBinaryAvailableSql) { ${call("vaultBinaryAvailableSql('d')")} }` },
    baseline: {}, expectExit: 1, expectIn: [`${REPORT_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — report request values beside the proved predicate remain counted',
    files: { [REPORT_CALLER]: REPORT_BINARY_IMPORT + call("vaultBinaryAvailableSql('d')", 'req.query.filter') },
    baseline: {}, expectExit: 1, expectIn: ['1 fixed canonical predicate(s)', `${REPORT_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — report caller does not gain other canonical builder allowances',
    files: { [REPORT_CALLER]: "import { vaultDataEligibleSql } from '../document-data-disposition/eligibility';\n" + call("vaultDataEligibleSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${REPORT_CALLER}: 1 value(s)`],
  },
  {
    name: 'quiet — eSTAR attachments use only the exact canonical binary predicate and literal alias',
    files: { [ESTAR_CALLER]: ESTAR_BINARY_IMPORT + call("vaultBinaryAvailableSql('d')") },
    baseline: {}, expectExit: 0,
    expectIn: ['1 fixed canonical predicate(s)', "vaultBinaryAvailableSql('d') <- ../../document-data-disposition/eligibility", '0 baselined interpolation(s)'],
  },
  {
    name: 'RED — eSTAR wrong helper import receives no proof',
    files: { [ESTAR_CALLER]: ESTAR_BINARY_IMPORT.replace('../../document-data-disposition/eligibility', '../document-data-disposition/eligibility') + call("vaultBinaryAvailableSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${ESTAR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — eSTAR dynamic alias receives no proof',
    files: { [ESTAR_CALLER]: ESTAR_BINARY_IMPORT + "const alias = 'd';\n" + call('vaultBinaryAvailableSql(alias)') },
    baseline: {}, expectExit: 1, expectIn: [`${ESTAR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — eSTAR shadowed helper receives no proof',
    files: { [ESTAR_CALLER]: ESTAR_BINARY_IMPORT + `async function bad(vaultBinaryAvailableSql) { ${call("vaultBinaryAvailableSql('d')")} }` },
    baseline: {}, expectExit: 1, expectIn: [`${ESTAR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — eSTAR extra request interpolation remains counted',
    files: { [ESTAR_CALLER]: ESTAR_BINARY_IMPORT + call("vaultBinaryAvailableSql('d')", 'req.query.filter') },
    baseline: {}, expectExit: 1, expectIn: ['1 fixed canonical predicate(s)', `${ESTAR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — eSTAR cannot approve another eligibility builder',
    files: { [ESTAR_CALLER]: ESTAR_BINARY_IMPORT.replaceAll('vaultBinaryAvailableSql', 'vaultDataEligibleSql') + call("vaultDataEligibleSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${ESTAR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a same-named helper imported from another module receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT.replace('../document-data-disposition/eligibility.js', '../unreviewed/eligibility.js') + call("vaultDataEligibleSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a request value beside the approved helper remains counted',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + call("vaultDataEligibleSql('d')", 'req.query.name') },
    baseline: {}, expectExit: 1, expectIn: ['1 fixed canonical predicate(s)', `${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a request-controlled helper argument receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + call('vaultDataEligibleSql(req.query.alias)') },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a SQL-bearing literal alias receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + call("vaultDataEligibleSql('d; DROP TABLE users')") },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a parameter shadowing the canonical import receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + `async function bad(vaultDataEligibleSql) { ${call("vaultDataEligibleSql('d')")} }` },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a block-local replacement of the imported name receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + `{ const vaultDataEligibleSql = req.query.helper; ${call("vaultDataEligibleSql('d')")} }` },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a destructured parameter replacing the helper receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + `async function bad({ vaultDataEligibleSql }) { ${call("vaultDataEligibleSql('d')")} }` },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — a property call is not the canonical imported binding',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + call("untrusted.vaultDataEligibleSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — wrapping the helper result in another call receives no proof',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + call("transform(vaultDataEligibleSql('d'))") },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — another caller does not inherit the reviewed caller allowance',
    files: { 'server/services/csr/unreviewed.ts': ELIGIBILITY_IMPORT + call("vaultDataEligibleSql('d')") },
    baseline: {}, expectExit: 1, expectIn: ['server/services/csr/unreviewed.ts: 1 value(s)'],
  },
  {
    name: 'RED — a type-only import cannot prove a runtime builder',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT.replace('import {', 'import type {') + call("vaultDataEligibleSql('d')") },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — sql.raw still counts even when passed a canonical predicate',
    files: { [CSR_CALLER]: ELIGIBILITY_IMPORT + "db.execute(sql.raw(vaultDataEligibleSql('d')));" },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
  {
    name: 'RED — conditional SQL strings are not approved canonical calls',
    files: { [CSR_CALLER]: call("options.lock ? 'FOR SHARE' : ''") },
    baseline: {}, expectExit: 1, expectIn: [`${CSR_CALLER}: 1 value(s)`],
  },
];

const knownGaps = [
  {
    name: 'KNOWN GAP 1 — SQL text assembled in a variable, then passed to .query(text)',
    files: { 'server/routes/gap1.ts': `const text = ${BT}SELECT * FROM t WHERE name = '${I('req.query.name')}'${BT};\nawait pool${Q}text);\n` },
    baseline: {},
  },
  {
    name: 'KNOWN GAP 2 — string concatenation',
    files: { 'server/routes/gap2.ts': `await pool${Q}"SELECT * FROM t WHERE name = '" + req.query.name + "'");\n` },
    baseline: {},
  },
];

let failed = 0;
for (const c of cases) {
  const r = run(c.files, c.baseline);
  const problems = [];
  if (r.code !== c.expectExit) problems.push(`exit ${r.code}, expected ${c.expectExit}`);
  for (const s of c.expectIn ?? []) if (!r.out.includes(s)) problems.push(`output lacked: "${s}"`);
  if (problems.length) {
    failed++;
    console.log(`  ✗ ${c.name}\n      ${problems.join('\n      ')}\n${r.out.split('\n').map((l) => `      | ${l}`).join('\n')}`);
  } else {
    console.log(`  ✓ ${c.name}`);
  }
}
for (const g of knownGaps) {
  const r = run(g.files, g.baseline);
  if (r.code === 0) {
    console.log(`  ! ${g.name}\n      not a pass — the gate still prints OK on this real injection shape (see KNOWN GAPS in the header).`);
  } else {
    failed++;
    console.log(`  ✗ ${g.name}\n      the gate now catches this: promote it to a RED case and delete it from knownGaps.`);
  }
}

console.log(`\n${TAG} ${knownGaps.length} known gap(s), NOT counted below.`);
if (failed) {
  console.log(`${TAG} FAIL — ${failed} case(s) did not hold against ${path.relative(repoRoot, GATE) || GATE}.`);
  process.exit(1);
}
console.log(`${TAG} ${cases.length} passed — the gate fails on what it exists to catch.`);
