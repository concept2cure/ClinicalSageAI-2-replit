/**
 * check-fabricated-identity strips comments with the shared, string-aware
 * stripper (scripts/ci/lib/strip-comments.mjs), so a string literal that holds
 * `/*` or `//` cannot hide a signer identity minted from an id.
 *
 * The gate used to blank /\/\*[\s\S]*?\*\//g over raw text and then cut each
 * line at its first `//`. A route glob such as '/api/signatures/*' opened a
 * phantom comment that ran to the next real comment closer, and an 'https://…'
 * literal cut off the rest of its own line. A `user-${id}` signer name, or an
 * address built from a display name, sitting in either place read as clean.
 *
 * How: the gate lists files with `git ls-files` and resolves its root (and its
 * baseline) from its own path, so each case builds a throwaway git repository
 * in the OS temp dir, copies the real gate and the real lib into it at their
 * repository paths, and runs it there with no baseline. Every GIT_* variable is
 * dropped from the child environment: a pre-push hook exports GIT_DIR, and an
 * inherited one would point `git init` and `git add` at the real repository.
 *
 * The minted identities are assembled at runtime, so no gate reading scripts/
 * finds one written here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGateInScratchRepo, lineOf } from './helpers/scratch-repo-gate.mjs';

const CI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GATE = process.env.FABRICATED_IDENTITY_GATE_PATH
  ? path.resolve(process.env.FABRICATED_IDENTITY_GATE_PATH)
  : path.join(CI, 'check-fabricated-identity.mjs');

/** `user-${userId}` — a signer name synthesised from a user id. */
const FROM_ID = ['`user-', '${userId}`'].join('');
/** `${userName}@example.test` — an address manufactured from a display name. */
const FROM_NAME = ['`${userName}', '@example.test`'].join('');

const run = (files) => runGateInScratchRepo({ gate: 'check-fabricated-identity.mjs', source: GATE, files });

test("a signer name minted below a '/api/signatures/*' glob, above a JSDoc, is reported at its source line", () => {
  const src =
    "router.use('/api/signatures/*', requireAuth);\n" +
    'export async function sign(userId) {\n' +
    `  const signerName = ${FROM_ID};\n` +
    '  return { signerName };\n' +
    '}\n' +
    '/** Verify a signature. */\n' +
    'export function verify() {}\n';
  const r = run({ 'server/routes/signatures.ts': src });
  assert.equal(r.code, 1, r.out);
  assert.ok(
    r.out.includes(`server/routes/signatures.ts:${lineOf(src, 'signerName =')}  [identity synthesised from a user id]`),
    r.out,
  );
});

test("an address minted after an 'https://' URL on the same line is reported", () => {
  const src = `const idp = 'https://idp.example.test/saml'; const signerEmail = ${FROM_NAME};\n`;
  const r = run({ 'server/services/sso-sign.ts': src });
  assert.equal(r.code, 1, r.out);
  assert.ok(
    r.out.includes('server/services/sso-sign.ts:1  [email address manufactured from an interpolated value]'),
    r.out,
  );
});

test("control: the same identity inside a block comment after a '/*' glob is not reported", () => {
  const r = run({
    'server/routes/signatures.ts':
      "router.use('/api/signatures/*', requireAuth);\n" +
      `/* never: const signerName = ${FROM_ID}; */\n` +
      'export const ok = 1;\n',
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0 new/);
});

test("control: the same address in a line comment after an 'https://' URL is not reported", () => {
  const r = run({
    'server/services/sso-sign.ts': `const idp = 'https://idp.example.test/saml'; // not ${FROM_NAME}\n`,
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0 new/);
});
