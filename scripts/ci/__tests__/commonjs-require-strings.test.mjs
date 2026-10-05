/**
 * check-commonjs-require strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide a `require(` call — which throws ReferenceError at
 * click time in this ESM package.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text and then cut each
 * line at its first `//`. A literal such as '/api/x/*' opened a phantom
 * comment that ran to the next real comment closer, and an 'https://…'
 * literal cut off the rest of its own line, the require() included.
 *
 * How: the gate lists files with `git ls-files`, so each case builds a
 * throwaway git repository in the OS temp dir (as pushed-typecheck.test.mjs
 * does), copies the real gate and the real lib into it at their repository
 * paths (the gate resolves its root from its own path), and runs it there with
 * no baseline. Every GIT_* variable is dropped from the child environment: a
 * pre-push hook exports GIT_DIR, and an inherited one would point `git init`
 * and `git add` at the real repository instead of the scratch one.
 *
 * The call is assembled at runtime so no gate scanning scripts/ reads one here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGateInScratchRepo, lineOf } from './helpers/scratch-repo-gate.mjs';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.COMMONJS_REQUIRE_GATE_PATH
  ? path.resolve(process.env.COMMONJS_REQUIRE_GATE_PATH)
  : path.join(CI, 'check-commonjs-require.mjs');

const REQ = ['requ', 'ire('].join('');

const run = (files) => runGateInScratchRepo({ gate: 'check-commonjs-require.mjs', source: GATE, files });

test("a require() below a '/api/exports/*' string, above a JSDoc, is reported at its source line", () => {
  const src =
    "router.use('/api/exports/*', requireAuth);\n" +
    "router.post('/api/exports/:id/word', async (req, res) => {\n" +
    `  const { Document, Packer } = ${REQ}'docx');\n` +
    '  res.send(await Packer.toBuffer(new Document({ sections: [] })));\n' +
    '});\n' +
    '/** PDF export. */\n' +
    "router.post('/api/exports/:id/pdf', async (req, res) => res.send(await renderPdf(req.params.id)));\n";
  const r = run({ 'server/routes/exports.ts': src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/routes/exports.ts:${lineOf(src, REQ)}`), r.out);
});

test("a require() after an 'https://…' string on the same line is reported at its source line", () => {
  const src =
    '/* a block comment first, so a line shift would show */\n' +
    '// and a line comment\n' +
    `export function client() { const docs = 'https://docs.example.invalid/sdk'; return ${REQ}'legacy-sdk'); }\n`;
  const r = run({ 'server/services/legacy-client.ts': src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`server/services/legacy-client.ts:${lineOf(src, 'https://')}`), r.out);
});

test('control: require() only inside real comments, below the same glob and beside a URL string, is quiet', () => {
  const src =
    "router.use('/api/exports/*', requireAuth);\n" +
    `// was: const { Document } = ${REQ}'docx');\n` +
    `/* never ${REQ}'docx') — throws ReferenceError in ESM */\n` +
    `const docs = 'https://docs.example.invalid/esm'; // not ${REQ}'docx')\n` +
    '/** PDF export. */\n' +
    "export const { Document } = await import('docx');\n";
  const r = run({ 'server/routes/exports.ts': src });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no new occurrences\. 0 baselined across 0 file\(s\)/);
});
