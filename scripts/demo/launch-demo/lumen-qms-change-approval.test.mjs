/**
 * The Lumen seed's change-control approval (2026-11-10).
 *
 * Since c284f3cb4 a change's approval signs the content the approver read: the signed route requires
 * expectedContentDigest, the register's content_digest of that change. The seed sent none, so on a fresh database
 * the Lumen pack stopped at "approve LMN-CC-2026-021: HTTP 400 … missing or invalid: expectedContentDigest", and
 * everything the pack does after Quality (risk-based monitoring, the Vault, the CSR, the sequence, the reports) was
 * not seeded. Synthetic HTTP only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveChangeAsRead } from './packs/lumen-qms.mjs';

const DIGEST = 'a'.repeat(64);
function signer(register) {
  const calls = [];
  return { calls, password: 'synthetic-password', api: async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'GET' && url === '/api/mdx/qms/changes') return { status: 200, json: { data: register } };
    if (method === 'POST' && url === '/api/mdx/qms/changes/7/approve') {
      if (body.expectedContentDigest !== DIGEST) return { status: 400, json: { error: 'missing or invalid: expectedContentDigest' }, text: '' };
      return { status: 200, json: { data: { id: 7, status: 'approved' } } };
    }
    throw new Error(`Unexpected synthetic HTTP: ${method} ${url}`);
  } };
}

test('the approver signs the digest of the change as they read it in the register', async () => {
  const s = signer([{ id: 3, content_digest: 'b'.repeat(64) }, { id: 7, content_digest: DIGEST }]);
  const approved = await approveChangeAsRead(s, { id: 7 }, 'LMN-CC-2026-021');
  assert.equal(approved.status, 'approved');
  assert.deepEqual(s.calls.map((c) => `${c.method} ${c.url}`), ['GET /api/mdx/qms/changes', 'POST /api/mdx/qms/changes/7/approve']);
  assert.equal(s.calls[1].body.expectedContentDigest, DIGEST);
  assert.equal(s.calls[1].body.meaning, 'APPROVED');
});

for (const [name, register] of [
  ['the register does not list the change to its approver', [{ id: 3, content_digest: DIGEST }]],
  ['the register gives the change no digest', [{ id: 7 }]],
  ['the digest is not a SHA-256', [{ id: 7, content_digest: 'not-a-digest' }]],
]) {
  test(`nothing is signed when ${name}`, async () => {
    const s = signer(register);
    await assert.rejects(approveChangeAsRead(s, { id: 7 }, 'LMN-CC-2026-021'), /no content digest to sign\. Nothing was signed\./);
    assert.equal(s.calls.some((c) => c.method === 'POST'), false);
  });
}

/* The same walk: the LMN-201 CSR's study data. The pack now files a fuller source (v2), and a document that froze the
   earlier one must freeze the newer: "frozen already" is asked of this source's bytes, not of any frozen study data. */
import { studyDataFrom } from './packs/lumen-csr.mjs';
import { CSR_SOURCE_FILE, CSR_SOURCE_TITLE } from './packs/lumen-content.mjs';
import { readFileSync } from 'node:fs';

test('a document counts as frozen from the CSR source only when one of its study data carries that source\'s bytes', () => {
  const earlier = [{ studyDataId: 'a', sources: [{ sha256: 'old' }] }];
  assert.equal(studyDataFrom(earlier, 'new'), false);
  assert.equal(studyDataFrom([...earlier, { studyDataId: 'b', sources: [{ sha256: 'new' }] }], 'new'), true);
  assert.equal(studyDataFrom([], 'new'), false);
  assert.equal(studyDataFrom([{ studyDataId: 'c' }], 'new'), false);
});

test('the pack files the source that carries every safety domain, under its own title', () => {
  const source = JSON.parse(readFileSync(CSR_SOURCE_FILE, 'utf8'));
  for (const domain of ['exposure', 'labShifts', 'vitalSigns', 'concomitantMedications']) assert.ok(source.studyData[domain]?.length > 0, domain);
  assert.match(CSR_SOURCE_TITLE, /with safety domains — SYNTHETIC, NOT CLINICAL EVIDENCE$/);
});
