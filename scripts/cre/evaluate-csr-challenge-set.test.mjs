import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateChallengeSet } from './evaluate-csr-challenge-set.mjs';

const spec = { targetStudy: 'NCT05330182', cases: [
  { id: 'A', severity: 'critical', expected: ['Correct denominator'] }, { id: 'B', severity: 'major', expected: ['Accurate method'] },
] };
const response = text => ({ responseText: text, responseSha256: createHash('sha256').update(text).digest('hex') });
const reviewed = { cases: [
  { id: 'A', ...response('AnA draft A'), passed: true, reviewer: 'medical writer', evidenceReference: 'review/1', reviewNotes: 'Verified against source', criteria: [{ expected: 'Correct denominator', passed: true, evidenceReference: 'review/1#denominator', reviewNotes: 'Source verified' }] },
  { id: 'B', ...response('AnA draft B'), passed: true, reviewer: 'statistician', evidenceReference: 'review/2', reviewNotes: 'Verified denominator', criteria: [{ expected: 'Accurate method', passed: true, evidenceReference: 'review/2#method', reviewNotes: 'SAP verified' }] },
] };

test('complete reviewed pass is explicit', () => {
  assert.equal(evaluateChallengeSet(spec, reviewed).verdict, 'reviewed_pass');
});
test('critical failure cannot pass', () => {
  const input = structuredClone(reviewed); input.cases[0].passed = false; input.cases[0].criteria[0].passed = false;
  const output = evaluateChallengeSet(spec, input);
  assert.equal(output.verdict, 'reviewed_fail');
  assert.equal(output.criticalPassed, 0);
});
test('missing case cannot be silently omitted', () => {
  assert.throws(() => evaluateChallengeSet(spec, { cases: reviewed.cases.slice(0, 1) }), /Exactly one/);
});
test('missing review identity and evidence fail closed', () => {
  const input = structuredClone(reviewed); input.cases[0].reviewer = '';
  assert.throws(() => evaluateChallengeSet(spec, input), /traceable evidence/);
});
test('pass without review rationale is rejected', () => {
  const input = structuredClone(reviewed); input.cases[0].reviewNotes = '';
  assert.throws(() => evaluateChallengeSet(spec, input), /written review rationale/);
});
test('duplicate cases are rejected', () => {
  assert.throws(() => evaluateChallengeSet(spec, { cases: [reviewed.cases[0], reviewed.cases[0]] }), /Exactly one/);
});

test('rejects a passing headline when a required criterion fails', () => {
  const input = structuredClone(reviewed); input.cases[0].criteria[0].passed = false;
  assert.throws(() => evaluateChallengeSet(spec, input), /contradicts reviewed criteria/);
});
test('rejects missing criterion evidence', () => {
  const input = structuredClone(reviewed); input.cases[0].criteria[0].evidenceReference = '';
  assert.throws(() => evaluateChallengeSet(spec, input), /every expected criterion/);
});
test('rejects benchmark specifications without expected outcomes', () => {
  const input = structuredClone(spec); delete input.cases[0].expected;
  assert.throws(() => evaluateChallengeSet(input, reviewed), /explicit expected criteria/);
});

test('declared critical threshold must match actual critical case count', () => {
  const input = structuredClone(spec);
  input.scoring = { criticalCasesMustPass: 2 };
  assert.throws(() => evaluateChallengeSet(input, reviewed), /Critical-case threshold/);
});
test('correct critical threshold remains valid', () => {
  const input = structuredClone(spec);
  input.scoring = { criticalCasesMustPass: 1 };
  assert.equal(evaluateChallengeSet(input, reviewed).verdict, 'reviewed_pass');
});

test('tampered model response fails', () => { const input = structuredClone(reviewed); input.cases[0].responseText += ' altered'; assert.throws(() => evaluateChallengeSet(spec, input), /matching SHA-256/); });
