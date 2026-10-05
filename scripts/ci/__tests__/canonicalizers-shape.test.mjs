/**
 * ci:canonicalizers recognises a deterministic JSON serializer by shape: an
 * object's keys sorted, then fed into the output. These cases pin both sides:
 * every real copy the baseline holds is still found, and a sorted list of
 * names next to an unrelated JSON.stringify is not a canonicalizer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCanonicalizers } from '../check-canonicalizers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const KEYS = ['Object', 'keys'].join('.'); // assembled: this file must not read as a copy

test('every canonicalizer the baseline records is still found in its own file', () => {
  const { modules } = JSON.parse(read('scripts/ci/canonicalizers-baseline.json'));
  assert.ok(modules.length > 0);
  for (const rel of modules) assert.ok(findCanonicalizers(read(rel)).length > 0, rel);
});

test('gateway-accounts.ts lists credential names; it does not canonicalize', () => {
  assert.deepEqual(findCanonicalizers(read('server/services/submission-gateways/gateway-accounts.ts')), []);
});

const shapes = {
  chained: `const s = '{' + ${KEYS}(o).sort().map((k) => JSON.stringify(k) + ':' + f(o[k])).join(',') + '}';`,
  forOf: `for (const k of ${KEYS}(v).sort()) {\n  out[k] = normalize(v[k]);\n}\nreturn JSON.stringify(out);`,
  keyList: `return JSON.stringify(manifest, ${KEYS}(manifest).sort());`,
  boundThenMapAcrossAComment: `const keys = ${KEYS}(obj).sort();\nconst body = keys\n  // drop undefined, as JSON.stringify does\n  .filter((k) => obj[k] !== undefined)\n  .map((k) => k + ':' + enc(obj[k]));\nreturn '{' + body.join(',') + '}';`,
  boundToADollarName: `const $keys = ${KEYS}(obj).sort();\nconst body = $keys.map((k) => k + ':' + enc(obj[k]));\nreturn '{' + body.join(',') + '}';`,
  boundThenIndexed: `const keys = ${KEYS}(obj).sort();\nlet s = '{';\nfor (let i = 0; i < keys.length; i++) s += JSON.stringify(keys[i]);`,
};
for (const [name, src] of Object.entries(shapes)) {
  test(`found: ${name}`, () => assert.equal(findCanonicalizers(src).length, 1, src));
}

test('not found: sorted names returned beside a JSON.stringify of the unsorted object', () => {
  const src = `held = ${KEYS}(merged).sort();\nciphertext = held.length ? encrypt(JSON.stringify(merged)) : null;\nreturn { held };`;
  assert.deepEqual(findCanonicalizers(src), []);
});

test('not found: the shape quoted in a doc comment', () => {
  const src = `/**\n * JSON.stringify(manifest, ${KEYS}(manifest).sort()) is not a sorted stringify.\n */\nexport const a = 1;`;
  assert.deepEqual(findCanonicalizers(src), []);
});

test('an unfamiliar form keeps the conservative verdict: counted', () => {
  const src = `return serialize(${KEYS}(o).sort(), JSON.stringify);`;
  assert.equal(findCanonicalizers(src).length, 1);
});
