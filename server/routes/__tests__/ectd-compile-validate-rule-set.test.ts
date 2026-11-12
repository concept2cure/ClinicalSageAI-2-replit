/**
 * GA-D7-10 (2026-11-10, the labelling half): one sequence showed 37 errors on
 * Compile's Validate and 8 on Submission readiness, and neither screen said it
 * ran its own rule set or that the other exists. A presenter could not explain
 * the two numbers.
 *
 * Compile's Validate now names the rule set it ran and says Submission
 * readiness runs another, on the response and as a finding a person reads.
 * Reconciling the two counts into one is GA-D7-10B, held by RIM
 * (assess-dispatch-readiness.ts); this test does not touch it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockResponse } from '../../../tests/setup';

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../db', () => ({ pool: { query: poolQuery } }));
vi.mock('../../db/requestDb', () => ({ requestDb: () => ({ query: poolQuery }) }));

import ectdCompileRoutes from '../ectd-compile';
import { handlerOf, mockSpineOn, makeReq } from '../../../tests/routes/ectd-compile-spine.harness';

const validate = handlerOf(ectdCompileRoutes, '/:projectIdent/validate', 'post');
const mockSpine = mockSpineOn(poolQuery);

beforeEach(() => {
  vi.clearAllMocks();
});

async function runValidate() {
  const res = createMockResponse() as any;
  await validate(makeReq({ region: 'FDA' }), res);
  expect(res.status).not.toHaveBeenCalledWith(500);
  return res.json.mock.calls[0][0];
}

describe('POST /:projectIdent/validate names its rule set and says the other exists', () => {
  it('the response names the rule set it ran and the one Submission readiness runs', async () => {
    mockSpine();
    const payload = await runValidate();
    expect(payload.ruleSet).toBeDefined();
    expect(payload.ruleSet.name).toMatch(/Compile's placement and package checks/);
    expect(payload.ruleSet.otherRuleSet).toMatch(/Submission readiness/);
  });

  it('a person reads it as a finding: which rules ran, that another set exists, and which one gates dispatch', async () => {
    mockSpine();
    const payload = await runValidate();
    const note = payload.results.find((r: any) => r.rule === 'VALIDATION_RULE_SET');
    expect(note).toBeDefined();
    expect(note.severity).toBe('info');
    expect(note.message).toMatch(/Compile's placement and package checks/);
    expect(note.message).toMatch(/Submission readiness/);
    expect(note.message).toMatch(/separate rule set/);
    expect(note.message).toMatch(/count of errors can differ/);
    expect(note.message).toMatch(/dispatch/);
    // The note is information, never a count: it does not change the verdict.
    const errors = payload.results.filter((r: any) => r.severity === 'error').length;
    expect(payload.summary.errors).toBe(errors);
    // Exactly one such row, and it is not counted as a passed check.
    expect(payload.results.filter((r: any) => r.rule === 'VALIDATION_RULE_SET')).toHaveLength(1);
    const passed = payload.results.filter((r: any) => r.severity === 'info' && r.rule !== 'VALIDATION_RULE_SET').length;
    expect(payload.summary.pass).toBe(passed);
    // Plain words: no rule key, file path or code reaches the person.
    expect(note.message).not.toMatch(/[A-Z]+_[A-Z_]+|\.ts\b|assess-dispatch/);
  });

  it('the identity gaps still lead, so Validate never reads cleaner than Compile', async () => {
    mockSpine({ program: { application_number: null } });
    const payload = await runValidate();
    expect(payload.results[0].severity).toBe('error');
    expect(payload.results.at(-1).rule).toBe('VALIDATION_RULE_SET');
  });
});
