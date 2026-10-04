/**
 * The client reads what was checked about an answer the same way live and on
 * reload (anaAnswerCheck.ts), and drops nothing that changes the meaning:
 * `attempted` is carried, so a label check that ran and failed is not "not
 * assessed"; a malformed check is no check, never a partial one.
 */
import { describe, expect, it } from 'vitest';
import { readAnswerCheck, readGroundingStrip, readStoredVerification } from '../anaAnswerCheck';

const check = {
  engine: 'answer-check/1',
  basis: 'sources',
  claims: 2,
  checked: 2,
  found: 1,
  notFound: [{ kind: 'figure', text: '31%' }],
  unchecked: [],
  sources: ['tool:get_trial_details'],
  unreadable: [],
  verdicts: [{ text: 'is ready to file', reason: 'States a readiness verdict.' }],
};
const labels = {
  attempted: true,
  validated: false,
  source_count: 1,
  grounded_claim_count: 1,
  weak_or_ungrounded_claim_count: 2,
  missing_support_count: 1,
  reviewer_risk_summary: '2 overclaim(s).',
  flagged_claims: [{ kind: 'overclaim', text: 'guaranteed' }, { kind: 'bogus', text: 'x' }],
};

describe('readGroundingStrip', () => {
  it('carries attempted, the label counts and the engine\'s check', () => {
    const ev = readGroundingStrip({ type: 'grounding_strip', evidence: labels, check });
    expect(ev).toEqual({
      attempted: true,
      validated: false,
      sourceCount: 1,
      groundedClaims: 1,
      weakClaims: 2,
      missingSupport: 1,
      riskSummary: '2 overclaim(s).',
      flaggedClaims: [{ kind: 'overclaim', text: 'guaranteed' }],
      check,
    });
  });

  it('an event with no labels reads as not assessed, never as passed', () => {
    const ev = readGroundingStrip({ type: 'grounding_strip' });
    expect(ev.attempted).toBe(false);
    expect(ev.validated).toBe(false);
    expect(ev.check).toBeUndefined();
  });
});

describe('readAnswerCheck', () => {
  it('a check with a field of the wrong type is no check', () => {
    expect(readAnswerCheck(check)).toEqual(check);
    expect(readAnswerCheck({ ...check, basis: 'some' })).toBeUndefined();
    expect(readAnswerCheck({ ...check, found: -1 })).toBeUndefined();
    expect(readAnswerCheck({ ...check, notFound: [{ kind: 'figure' }] })).toBeUndefined();
    expect(readAnswerCheck({ ...check, verdicts: undefined })).toBeUndefined();
    expect(readAnswerCheck(null)).toBeUndefined();
  });
});

describe('readStoredVerification', () => {
  it('reads a stored message the way the live event was read', () => {
    expect(readStoredVerification({ verification: { check, labels } })).toEqual(
      readGroundingStrip({ evidence: labels, check }),
    );
  });

  it('a message stored before checks were kept shows none', () => {
    expect(readStoredVerification({ reasoning: 'x' })).toBeUndefined();
    expect(readStoredVerification(null)).toBeUndefined();
  });
});
