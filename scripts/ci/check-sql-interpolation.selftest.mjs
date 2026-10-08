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

const SELF = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(SELF), '..', '..');
const TAG = '[ci:sql-interpolation:selftest]';
const GATE = process.env.SELFTEST_GATE_PATH
  ? path.resolve(process.env.SELFTEST_GATE_PATH)
  : path.join(repoRoot, 'scripts', 'ci', 'check-sql-interpolation.mjs');
const LIB = path.join(repoRoot, 'scripts', 'ci', 'lib', 'strip-comments.mjs');

const Q = '.query(';
const BT = '`';
const I = (expr) => '$' + '{' + expr + '}';
/** A one-line query call whose SQL text interpolates each of `exprs`. */
const call = (...exprs) => `await pool${Q}${BT}SELECT * FROM t WHERE ${exprs.map((e, i) => `c${i} = ${I(e)}`).join(' AND ')}${BT});\n`;

function run(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqli-gate-'));
  try {
    fs.mkdirSync(path.join(root, 'scripts', 'ci', 'lib'), { recursive: true });
    fs.copyFileSync(GATE, path.join(root, 'scripts', 'ci', 'check-sql-interpolation.mjs'));
    fs.copyFileSync(LIB, path.join(root, 'scripts', 'ci', 'lib', 'strip-comments.mjs'));
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
