/**
 * check-no-mock-in-prod-routes blanks comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs) and reads string literals off
 * its output, so the two agree on where every literal is.
 *
 * The gate used to carry two scanners of its own, each with its own comment
 * handling. They were quote-aware — a '/api/x/*' glob or an 'https://' URL did
 * not fool them, and the first two cases below hold that — but a single- or
 * double-quoted literal ran ACROSS lines until the next matching quote, and a
 * template ended at the first backtick even inside `${ … }`. So the quote in a
 * SQL-escape regex such as /'/g, or an apostrophe in a nested template, opened
 * a "string" that swallowed the code below it: on 2026-10-05 that was about
 * 2,900 lines across 36 files in server/routes/ (1,158 in submissions.ts). A
 * mock array, a hardcoded DOI or a demo route sitting there was never read,
 * and a DOI quoted in a comment there was read as a literal.
 *
 * How: the real gate and the real lib are copied into a temp tree at their
 * repository paths and run with that tree as the working directory (the gate
 * scans `server/routes` under process.cwd()), with no baseline.
 *
 * The mock identifier, DOI and demo path are assembled at runtime, so no gate
 * reading scripts/ finds one written here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.NO_MOCK_IN_PROD_ROUTES_GATE_PATH
  ? path.resolve(process.env.NO_MOCK_IN_PROD_ROUTES_GATE_PATH)
  : path.join(CI, 'check-no-mock-in-prod-routes.mjs');
const LIB = path.join(CI, 'lib', 'strip-comments.mjs');

const MOCK = ['MOCK', '_PROGRAMS'].join('');
const DOI = ['10.1007', '/s43441-024-00521-1'].join('');
const DEMO = ['/demo', '-analysis'].join('');
/** A SQL-escape regex: its quote is not a string opener. */
const ESCAPE = `export const esc = (s) => s.replace(/'/g, "''");\n`;

const MOCK_FINDING = 'contains mock/simulated/placeholder markers in route handler scope';

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'no-mock-strings-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const ci = path.join(root, 'scripts', 'ci');
    fs.mkdirSync(path.join(ci, 'lib'), { recursive: true });
    fs.copyFileSync(GATE, path.join(ci, 'check-no-mock-in-prod-routes.mjs'));
    fs.copyFileSync(LIB, path.join(ci, 'lib', 'strip-comments.mjs'));
    const r = spawnSync(process.execPath, [path.join(ci, 'check-no-mock-in-prod-routes.mjs')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("mock data below a '/api/programs/*' glob, above a JSDoc, is reported", () => {
  const r = run({
    'server/routes/programs.ts':
      "router.use('/api/programs/*', requireAuth);\n" +
      `const ${MOCK} = [{ id: 1 }];\n` +
      '/** List programs. */\n' +
      `router.get('/programs', (req, res) => res.json(${MOCK}));\n`,
  });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/programs.ts: ${MOCK_FINDING}`), r.out);
});

test("mock data after an 'https://' URL on the same line is reported", () => {
  const r = run({
    'server/routes/registry.ts': `const base = 'https://registry.example.test/v1'; const ${MOCK} = [{ id: 1 }];\n`,
  });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/registry.ts: ${MOCK_FINDING}`), r.out);
});

test('mock data on the line after a regex holding a quote is reported', () => {
  const r = run({
    'server/routes/programs.ts':
      ESCAPE + `const ${MOCK} = [{ id: 1 }];\n` + `router.get('/programs', (req, res) => res.json(${MOCK}));\n`,
  });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/programs.ts: ${MOCK_FINDING}`), r.out);
});

test('mock data after a nested template holding an apostrophe is reported', () => {
  const r = run({
    'server/routes/labels.ts':
      "export const list = (xs) => `${xs.map((x) => `it's ${x}`).join(', ')}`;\n" +
      `const ${MOCK} = [{ id: 1 }];\n` +
      'export default list;\n',
  });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/labels.ts: ${MOCK_FINDING}`), r.out);
});

test('a hardcoded DOI on the line after a regex holding a quote is reported at its source line', () => {
  const r = run({ 'server/routes/refs.ts': ESCAPE + `export const ref = { doi: '${DOI}' };\n` });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/refs.ts: emits a hardcoded DOI (${DOI}) at line 2`), r.out);
});

test('an ungated demo route on the line after a regex holding a quote is reported at its source line', () => {
  const r = run({ 'server/routes/analytics.ts': ESCAPE + `router.post('${DEMO}', handler);\n` });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/analytics.ts: mounts demo route ${DEMO} at line 2`), r.out);
});

test("control: mock data only in a block comment after a '/*' glob is not reported", () => {
  const r = run({
    'server/routes/programs.ts':
      "router.use('/api/programs/*', requireAuth);\n" +
      `/* const ${MOCK} = [{ id: 1 }]; */\n` +
      'export const ok = 1;\n',
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /current=0/);
});

test("control: mock data only in a line comment after an 'https://' URL is not reported", () => {
  const r = run({
    'server/routes/registry.ts': `const base = 'https://registry.example.test/v1'; // ${MOCK} lives in fixtures\n`,
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /current=0/);
});

test('control: a DOI quoted in a comment below a regex holding a quote is not reported', () => {
  const r = run({ 'server/routes/refs.ts': ESCAPE + `// the removed citation was ${DOI}\nexport const ok = 1;\n` });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /current=0/);
});
