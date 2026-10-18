/**
 * Downstream purge is credited only from per-step purge factors someone supplied.
 *
 * Until 2026-10-15 designPurgeStudy credited every downstream step with a 3×
 * purge that no input, measurement or citation supported ("Conservative
 * estimate: each additional downstream step provides at minimum a 3× purge").
 * Eight downstream steps with no purge data returned 6,561×; nine returned
 * 19,683× with the sentence "Purge factor is HIGH (≥10,000×) — this level of
 * purge may justify control at the step of introduction rather than final API
 * testing". The count of steps became a regulatory purge claim.
 */
import { describe, expect, it } from 'vitest';

import { designPurgeStudy, type PurgeStudyInput } from '../mutagenic-impurity-knowledge';

describe('designPurgeStudy — downstream purge credit only from supplied per-step factors', () => {
  it('takes no credit for downstream steps that have no purge factor, and says they are unquantified', () => {
    for (const steps of [1, 8, 9]) {
      const r = designPurgeStudy({ syntheticStep: 'early', numberOfDownstreamSteps: steps });
      expect(r.overallPurgeFactorEstimate, `${steps} downstream step(s) with no purge data`).toBe(1);
      expect(r.unquantifiedDownstreamSteps).toBe(steps);
      expect(r.overallPurgeFactorInterpretation).toMatch(/unquantified/);
      expect(r.overallPurgeFactorInterpretation).not.toMatch(/HIGH/);
      expect(r.regulatorySummary).toMatch(/unquantified/);
    }
  });

  it('multiplies in the per-step factors the user supplies', () => {
    const r = designPurgeStudy({ syntheticStep: 'early', numberOfDownstreamSteps: 2, downstreamStepPurgeFactors: [10, 30] });
    expect(r.overallPurgeFactorEstimate).toBe(300);
    expect(r.unquantifiedDownstreamSteps).toBe(0);
    expect(r.overallPurgeFactorInterpretation).not.toMatch(/unquantified/);
  });

  it('credits only the supplied steps when the others are unquantified', () => {
    const r = designPurgeStudy({ syntheticStep: 'early', numberOfDownstreamSteps: 3, downstreamStepPurgeFactors: [10] });
    expect(r.overallPurgeFactorEstimate).toBe(10);
    expect(r.unquantifiedDownstreamSteps).toBe(2);
  });

  it('takes the number of downstream steps from the supplied factors when it is not stated', () => {
    const r = designPurgeStudy({ syntheticStep: 'intermediate', downstreamStepPurgeFactors: [100, 100] });
    expect(r.overallPurgeFactorEstimate).toBe(10000);
    expect(r.unquantifiedDownstreamSteps).toBe(0);
  });

  it('keeps the single-step estimate from the stated impurity properties', () => {
    const r = designPurgeStudy({ syntheticStep: 'late', impurityReactivity: 'highly reactive', impurityBoilingPointC: 60 });
    expect(r.overallPurgeFactorEstimate).toBe(1000);
  });

  it('refuses inputs it cannot use', () => {
    expect(() => designPurgeStudy({} as PurgeStudyInput)).toThrow(/syntheticStep is required/);
    expect(() =>
      designPurgeStudy({ syntheticStep: 'early', numberOfDownstreamSteps: 1, downstreamStepPurgeFactors: [10, 10] }),
    ).toThrow(/at most numberOfDownstreamSteps/);
    expect(() => designPurgeStudy({ syntheticStep: 'early', downstreamStepPurgeFactors: [0] })).toThrow(/positive number/);
    expect(() => designPurgeStudy({ syntheticStep: 'final', numberOfDownstreamSteps: 2 })).toThrow(/syntheticStep is final/);
  });
});
