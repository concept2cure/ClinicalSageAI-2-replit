import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareCsrReviewPacket } from './prepare-csr-review-packet.mjs';
import { evaluateChallengeSet } from './evaluate-csr-challenge-set.mjs';

const spec = { targetStudy: 'NCT05330182', scoring: { criticalCasesMustPass: 1 },
  cases: [{ id: 'CSR-1', severity: 'critical', expected: ['Preserve the correct denominator', 'Identify unknown statistical method'] }] };
const responses = { cases: [{ id: 'CSR-1', runId: 'ana-run-001', responseText: 'Draft output with unresolved analysis method.' }] };

test('retains exact response text and hashes it without inventing review results', () => {
  const packet = prepareCsrReviewPacket(spec, responses);
  assert.equal(packet.status, 'awaiting_expert_review');
  assert.equal(packet.cases[0].runId, 'ana-run-001');
  assert.equal(packet.cases[0].responseSha256, createHash('sha256').update(responses.cases[0].responseText).digest('hex'));
  assert.equal(packet.cases[0].passed, null);
  assert.deepEqual(packet.cases[0].criteria.map(c => c.passed), [null, null]);
  assert.throws(() => evaluateChallengeSet(spec, packet), /traceable evidence/);
});
test('refuses absent model output', () => {
  assert.throws(() => prepareCsrReviewPacket(spec, { cases: [] }), /Missing AnA responses/);
});
test('refuses duplicate or unknown cases', () => {
  assert.throws(() => prepareCsrReviewPacket(spec, { cases: [responses.cases[0], responses.cases[0]] }), /one nonempty/);
  assert.throws(() => prepareCsrReviewPacket(spec, { cases: [{ ...responses.cases[0], id: 'UNKNOWN' }] }), /one nonempty/);
});
test('refuses responses without a run identity', () => {
  assert.throws(() => prepareCsrReviewPacket(spec, { cases: [{ ...responses.cases[0], runId: '' }] }), /run ID/);
});
test('completed review passes only with criterion evidence', () => {
  const packet = prepareCsrReviewPacket(spec, responses);
  const item = packet.cases[0];
  item.passed = true; item.reviewer = 'qualified reviewer'; item.evidenceReference = 'review/CSR-1';
  item.reviewNotes = 'Both criteria checked against the actual response and source data';
  item.criteria = item.criteria.map((criterion, i) => ({ ...criterion, passed: true,
    evidenceReference: 'source/CSR-1/' + i, reviewNotes: 'Verified independently' }));
  assert.equal(evaluateChallengeSet(spec, packet).verdict, 'reviewed_pass');
});
