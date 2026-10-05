/**
 * check-server-error-leaks strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide a 5xx body that ships the caught error's text.
 *
 * The gate used to carry /\/\*[\s\S]*?\*\//g plus /\/\/[^\n]*\/g over raw
 * text. A route glob such as router.use('/files/*', …) opened a phantom
 * comment that ran to the next real comment closer, and a URL inside a body's
 * own sentence ('… https://api.fda.gov …') deleted the rest of that line,
 * err.message included. Either way the gate read green over a leak.
 *
 * How: the real gate and the real lib are copied into a temp tree at the paths
 * they have in the repository (the gate resolves its root, and its baseline,
 * from its own path), beside an empty baseline and the case's server/ files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.SERVER_ERROR_LEAKS_GATE_PATH
  ? path.resolve(process.env.SERVER_ERROR_LEAKS_GATE_PATH)
  : path.join(CI, 'check-server-error-leaks.mjs');
const LIB = path.join(CI, 'lib', 'strip-comments.mjs');

function run(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-error-leaks-strings-'));
  try {
    for (const [rel, body] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), body);
    }
    const ci = path.join(root, 'scripts', 'ci');
    fs.mkdirSync(path.join(ci, 'lib'), { recursive: true });
    fs.copyFileSync(GATE, path.join(ci, 'check-server-error-leaks.mjs'));
    fs.copyFileSync(LIB, path.join(ci, 'lib', 'strip-comments.mjs'));
    fs.writeFileSync(path.join(ci, 'server-error-leaks-baseline.json'), JSON.stringify({ counts: {} }));
    const r = spawnSync(process.execPath, [path.join(ci, 'check-server-error-leaks.mjs')], {
      cwd: root,
      encoding: 'utf8',
      timeout: 20_000,
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** 1-based line of the first `needle` in `src`. */
const lineOf = (src, needle) => src.slice(0, src.indexOf(needle)).split('\n').length;

test("a leak below a '/files/*' route glob, above a JSDoc, is reported at its source line", () => {
  const src =
    "router.use('/files/*', requireAuth);\n" +
    "router.get('/files/:id', async (req, res) => {\n" +
    '  try {\n' +
    '    res.json(await readStoredFile(req.params.id));\n' +
    '  } catch (err) {\n' +
    "    res.status(500).json({ error: 'FILE_READ_FAILED', detail: err.message });\n" +
    '  }\n' +
    '});\n' +
    '/** Store an uploaded file in the vault. */\n' +
    "router.post('/files', async (req, res) => res.status(201).json(await storeFile(req.body)));\n";
  const r = run({ 'server/routes/files.ts': src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/files.ts:${lineOf(src, '.status(500)')}  [500]`), r.out);
});

test("a leak after an 'https://…' string on the same line is reported at its source line", () => {
  const src =
    '/* a block comment first, so a line shift would show */\n' +
    '// and a line comment\n' +
    "router.get('/agency/fda/status', async (req, res) => {\n" +
    '  try {\n' +
    '    res.json(await pollFdaGateway());\n' +
    '  } catch (err) {\n' +
    "    res.status(502).json({ error: 'The FDA gateway at https://api.fda.gov did not answer.', detail: err.message });\n" +
    '  }\n' +
    '});\n';
  const r = run({ 'server/routes/fda-gateway.ts': src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/fda-gateway.ts:${lineOf(src, '.status(502)')}  [502]`), r.out);
});

test('control: leaks only inside real comments, below the same glob and beside a URL string, are quiet', () => {
  const src =
    "router.use('/files/*', requireAuth);\n" +
    "// Never: res.status(500).json({ error: 'FILE_READ_FAILED', detail: err.message });\n" +
    '/* nor res.status(502).send(String(upstreamErr)); */\n' +
    "router.get('/files/:id', async (req, res) => {\n" +
    '  try {\n' +
    '    res.json(await readStoredFile(req.params.id));\n' +
    '  } catch (err) {\n' +
    "    const runbook = 'https://wiki.internal/errors'; // not res.status(500).json({ detail: err.message })\n" +
    "    return serverError(res, log, 'reading the file', err);\n" +
    '  }\n' +
    '});\n' +
    '/** Store an uploaded file in the vault. */\n';
  const r = run({ 'server/routes/files.ts': src });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /OK — 0 baselined site\(s\) across 0 file\(s\)/);
});
