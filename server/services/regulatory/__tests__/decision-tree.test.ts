/**
 * EMV / go–no-go decision-tree tests.
 */

import { describe, it, expect } from 'vitest';
import {
  readinessToApprovalProbability,
  expectedMonetaryValue,
  compareInvestmentBranches,
} from '../decision-tree';

describe('readinessToApprovalProbability', () => {
  it('higher readiness + better verdict → higher probability', () => {
    const high = readinessToApprovalProbability(95, 'likely_acceptance');
    const low = readinessToApprovalProbability(20, 'not_substantially_complete');
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThanOrEqual(0.97);
    expect(low).toBeGreaterThanOrEqual(0.02);
  });
});

describe('expectedMonetaryValue', () => {
  it('go when expected NPV is positive', () => {
    const r = expectedMonetaryValue({ marketValueUsd: 10_000_000, probabilityOfSuccess: 0.7, costToCompleteUsd: 1_000_000, timeToMarketYears: 1, discountRate: 0.1 });
    expect(r.recommendation).toBe('go');
    expect(r.expectedNpvUsd).toBeGreaterThan(0);
    expect(r.breakevenProbability).toBeCloseTo(0.1, 3);
  });

  it('no_go when probability is below break-even', () => {
    const r = expectedMonetaryValue({ marketValueUsd: 1_000_000, probabilityOfSuccess: 0.1, costToCompleteUsd: 500_000 });
    expect(r.recommendation).toBe('no_go');
    expect(r.expectedNpvUsd).toBeLessThanOrEqual(0);
  });

  it('discounting reduces NPV vs undiscounted EMV', () => {
    const r = expectedMonetaryValue({ marketValueUsd: 10_000_000, probabilityOfSuccess: 0.5, costToCompleteUsd: 0, timeToMarketYears: 3, discountRate: 0.15 });
    expect(r.expectedNpvUsd).toBeLessThan(r.expectedValueUsd);
  });

  it('rejects negative financials', () => {
    expect(() => expectedMonetaryValue({ marketValueUsd: -1, probabilityOfSuccess: 0.5, costToCompleteUsd: 0 })).toThrow();
  });
});

describe('compareInvestmentBranches', () => {
  it('recommends completing evidence when the success uplift outweighs the cost', () => {
    const r = compareInvestmentBranches({
      marketValueUsd: 50_000_000,
      now: { readinessScore: 40, verdict: 'not_substantially_complete', timeToMarketYears: 1 },
      afterEvidence: { readinessScore: 95, verdict: 'likely_acceptance', costToCompleteUsd: 2_000_000, timeToMarketYears: 2 },
      discountRate: 0.12,
    });
    expect(r.completeEvidence.probabilityOfSuccess).toBeGreaterThan(r.submitNow.probabilityOfSuccess);
    expect(r.recommendedBranch).toBe('complete_evidence');
    expect(r.upliftNpvUsd).toBeGreaterThan(0);
  });

  it('recommends no_go when both branches are unprofitable', () => {
    const r = compareInvestmentBranches({
      marketValueUsd: 100_000,
      now: { readinessScore: 20, verdict: 'not_substantially_complete', costToCompleteUsd: 50_000 },
      afterEvidence: { readinessScore: 60, verdict: 'additional_information_likely', costToCompleteUsd: 5_000_000 },
    });
    expect(r.submitNow.expectedNpvUsd).toBeLessThanOrEqual(0);
    expect(r.completeEvidence.expectedNpvUsd).toBeLessThanOrEqual(0);
    expect(r.recommendedBranch).toBe('no_go');
  });
});
