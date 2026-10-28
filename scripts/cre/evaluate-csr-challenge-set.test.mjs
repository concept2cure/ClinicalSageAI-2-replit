import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChallengeSet } from './evaluate-csr-challenge-set.mjs';

const spec = { targetStudy: 'NCT05330182', cases: [
  { id: 'A', severity: 'critical' }, { id: 'B', severity: 'major' },
] };
const reviewed = { cases: [
  { id: 'A', passed: true, reviewer: 'medical writer', evidenceReference: 'review/1', reviewNotes: 'Verified against source' },
  { id: 'B', passed: true, reviewer: 'statistician', evidenceReference: 'review/2', reviewNotes: 'Verified denominator' },
] };

test('complete reviewed pass is explicit', () => {
  assert.equal(evaluateChallengeSet(spec, reviewed).verdict, 'reviewed_pass');
});
test('critical failure cannot pass', () => {
  const input = structuredClone(reviewed); input.cases[0].passed = false;
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
