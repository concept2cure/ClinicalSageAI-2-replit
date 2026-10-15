/**
 * check-success-before-ok strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide a success toast painted over an unchecked
 * apiRequest.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text and then cut each
 * line at its first `//`. A route glob such as '/api/vault/*' opened a phantom
 * comment that ran to the next real comment closer, and an 'https://…' literal
 * cut off the rest of its own line. A handler that says "filed" on a 401,
 * sitting in either place, read as clean.
 *
 * The last case pins the one adaptation the gate made to the new stripper: a
 * line comment is still cut off its line, not left as blanks, so a long `//`
 * note between the call and the toast does not spend the 900-character window.
 *
 * How: the gate lists files with `git ls-files` and resolves its root from its
 * own path, so each case builds a throwaway git repository in the OS temp dir,
 * copies the real gate and the real lib into it at their repository paths, and
 * runs it there. Every GIT_* variable is dropped from the child environment: a
 * pre-push hook exports GIT_DIR, and an inherited one would point `git init`
 * and `git add` at the real repository.
 *
 * SUCCESS_BEFORE_OK_GATE_PATH runs the same cases against another copy of the
 * gate, which is how they were shown to fail on the old stripper.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGateInScratchRepo, lineOf } from './helpers/scratch-repo-gate.mjs';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.SUCCESS_BEFORE_OK_GATE_PATH
  ? path.resolve(process.env.SUCCESS_BEFORE_OK_GATE_PATH)
  : path.join(CI, 'check-success-before-ok.mjs');

/** Inside the gate's `git ls-files` scope. */
const SURFACE = 'client/src/concept2cure/v2/surfaces/FilingBar.tsx';

const run = (files) => runGateInScratchRepo({ gate: 'check-success-before-ok.mjs', source: GATE, files });

test("an unchecked 'filed' toast below a '/api/vault/*' glob, above a JSDoc, is reported at its source line", () => {
  const src =
    "const VAULT_GLOB = '/api/vault/*';\n" +
    'export function FilingBar({ docId }) {\n' +
    '  async function file() {\n' +
    "    await apiRequest('POST', `/api/vault/documents/${docId}/file`);\n" +
    "    fireToast('Document filed');\n" +
    '  }\n' +
    '  return null;\n' +
    '}\n' +
    "/** The filing bar's props. */\n" +
    'export interface FilingBarProps { docId: string }\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, 'await apiRequest')}  fireToast('Document filed'`), r.out);
});

test("an unchecked 'filed' toast after an 'https://…' string on its line is reported at its source line", () => {
  const src =
    '/* a block comment first, so a line shift would show */\n' +
    '// and a line comment\n' +
    'export function FilingBar({ docId }) {\n' +
    '  async function file() {\n' +
    "    await apiRequest('POST', `/api/vault/documents/${docId}/file`);\n" +
    "    const receipt = `https://vault.example/receipts/${docId}`; fireToast('Document filed, receipt ' + receipt);\n" +
    '  }\n' +
    '  return null;\n' +
    '}\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, 'await apiRequest')}  fireToast('Document filed, receipt '`), r.out);
});

test('control: the defect only inside real comments, beside the same glob and URL, is quiet', () => {
  const src =
    "const VAULT_GLOB = '/api/vault/*';\n" +
    "// await apiRequest('POST', '/api/vault/file'); fireToast('Document filed');\n" +
    "/* await apiRequest('POST', '/api/vault/file');\n" +
    "   fireToast('Document filed'); */\n" +
    'export function FilingBar({ docId }) {\n' +
    '  async function file() {\n' +
    "    const res = await apiRequest('POST', '/api/vault/file', { docId });\n" +
    '    if (!res.ok) return;\n' +
    "    const help = 'https://docs.example/filing'; // not: await apiRequest(); fireToast('Document filed')\n" +
    "    fireToast('Document filed');\n" +
    '  }\n' +
    '  return null;\n' +
    '}\n' +
    "/** The filing bar's props. */\n" +
    'export interface FilingBarProps { docId: string }\n';
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no occurrences across 1 file\(s\)/);
});

test('a long `//` note between the call and the toast does not push the toast out of the window', () => {
  // ~480 characters of comment, then ~430 of code: the toast is inside 900
  // characters of code, and outside 900 if the comment counted as blanks.
  const note = `    // ${'The receipt is reconciled against the vault ledger before it is shown. '.repeat(6).trim()}\n`;
  const steps = Array.from({ length: 9 }, (_, i) => `    track('filing-step', { docId, step: ${i} });\n`).join('');
  const src =
    'export function FilingBar({ docId }) {\n' +
    '  async function file() {\n' +
    "    await apiRequest('POST', `/api/vault/documents/${docId}/file`);\n" +
    note +
    steps +
    "    fireToast('Document filed');\n" +
    '  }\n' +
    '  return null;\n' +
    '}\n';
  const call = src.indexOf('await apiRequest');
  const toast = src.indexOf("fireToast('Document filed')");
  assert.ok(toast - call > 900 && toast - call - note.length < 900, `fixture geometry: ${toast - call}`);
  const r = run({ [SURFACE]: src });
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(`${SURFACE}:${lineOf(src, 'await apiRequest')}  fireToast('Document filed'`), r.out);
});
