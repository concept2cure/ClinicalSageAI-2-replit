/**
 * check-session-scoped-rls-bypass strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide a session-scoped SET below or beside it.
 *
 * The gate used to carry its own stripper: /\/\*[\s\S]*?\*\//g over raw text,
 * then dropping every line whose trimmed start was `//` or `*`. An Express glob
 * such as '/api/reports/*' opened a phantom comment that ran to the next real
 * comment closer, and every SET in between was deleted before matching.
 *
 * How: the real gate and the real lib are copied into a temp tree at the paths
 * they have in the repository (the gate resolves its root from its own path).
 * Only the in-file BASELINE Map is emptied, so the seven baselined innovation
 * services, absent from the fixture tree, are not reported as shrunk.
 *
 * Fixture text naming the flag is assembled at runtime: scripts/ is in the
 * gate's scan path, and this file must not trip the real gate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.SESSION_RLS_GATE_PATH
  ? path.resolve(process.env.SESSION_RLS_GATE_PATH)
  : path.join(CI, 'check-session-scoped-rls-bypass.mjs');
const LIB = path.join(CI, 'lib', 'strip-comments.mjs');
const BASELINE_DECL = /const BASELINE = new Map\(\[[\s\S]*?\]\);/;

const SET_BYPASS = ['SET', ['app', 'bypass_rls'].join('.'), "= 'true'"].join(' ');
const SET_ADMIN = ['SET', ['app', 'is_admin'].join('.'), "= 'true'"].join(' ');

function run(files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'session-rls-strings-')));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const src = fs.readFileSync(GATE, 'utf8');
    assert.match(src, BASELINE_DECL, 'the gate no longer declares its BASELINE Map where this test expects it');
    const gate = path.join(root, 'scripts', 'ci', 'check-session-scoped-rls-bypass.mjs');
    fs.mkdirSync(path.join(root, 'scripts', 'ci', 'lib'), { recursive: true });
    fs.writeFileSync(gate, src.replace(BASELINE_DECL, () => 'const BASELINE = new Map();'));
    fs.copyFileSync(LIB, path.join(root, 'scripts', 'ci', 'lib', 'strip-comments.mjs'));
    const r = spawnSync(process.execPath, [gate], { cwd: root, encoding: 'utf8', timeout: 20_000 });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("a SET below a '/api/reports/*' glob string, above a JSDoc, is counted", () => {
  const r = run({
    'server/routes/report-routes.ts':
      "router.use('/api/reports/*', requireAuth);\n" +
      'router.get(\'/api/reports/x\', async (_req, res) => {\n' +
      `  await client.query("${SET_BYPASS}");\n` +
      `  await client.query("${SET_ADMIN}");\n` +
      '});\n' +
      '/** Liveness for the reports surface. */\n' +
      "router.get('/api/reports/health', (_req, res) => res.json({ ok: true }));\n",
  });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /server\/routes\/report-routes\.ts: 2 session-scoped bypass set\(s\) — this file is not in the baseline/);
});

test("a SET after an 'https://…' string on its own line, and on the line below it, is counted", () => {
  const r = run({
    'server/services/export/sweep.ts':
      `const runbook = 'https://wiki.internal/rls'; await client.query("${SET_BYPASS}");\n` +
      "const docs = 'https://wiki.internal/rls/admin';\n" +
      `await client.query("${SET_ADMIN}");\n`,
  });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /server\/services\/export\/sweep\.ts: 2 session-scoped bypass set\(s\)/);
});

test('control: the same SETs only inside real comments, below the same glob string, are not counted', () => {
  const r = run({
    'server/routes/report-routes.ts':
      "router.use('/api/reports/*', requireAuth);\n" +
      `/* historically: await client.query("${SET_BYPASS}"); */\n` +
      `// never write: await client.query("${SET_ADMIN}");\n` +
      `/**\n * ${SET_BYPASS} survives client.release(); use SET LOCAL.\n */\n` +
      "const docs = 'https://wiki.internal/rls'; // " + SET_ADMIN + '\n',
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /OK — no new session-scoped RLS bypass\. 0 baselined occurrence\(s\)/);
});
