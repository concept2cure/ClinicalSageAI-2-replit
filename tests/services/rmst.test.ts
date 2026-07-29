/**
 * Tests for restricted mean survival time (server/services/stats/rmst.ts).
 *
 * Validated against hand-computed Kaplan–Meier steps, the exact RMST = mean of
 * min(T, τ) identity for uncensored data, the hand-computed Greenwood RMST
 * variance, and the two-arm difference test.
 */

import { describe, it, expect } from 'vitest';
import {
  kaplanMeier,
  restrictedMeanSurvival,
  rmstDifference,
} from '../../server/services/stats/rmst';

describe('Kaplan–Meier', () => {
  it('matches a hand-computed curve with censoring', () => {
    // times 2(event), 3(censor), 4(event), 5(event); n=4.
    // t=2: n=4,d=1 ⇒ S=0.75. t=3 censor (no step). t=4: n=2,d=1 ⇒ S=0.375.
    // t=5: n=1,d=1 ⇒ S=0.
    const km = kaplanMeier([2, 3, 4, 5], [1, 0, 1, 1]);
    expect(km).toHaveLength(3);
    expect(km[0]).toMatchObject({ time: 2, atRisk: 4, events: 1 });
    expect(km[0].survival).toBeCloseTo(0.75, 10);
    expect(km[1]).toMatchObject({ time: 4, atRisk: 2, events: 1 });
    expect(km[1].survival).toBeCloseTo(0.375, 10);
    expect(km[2].survival).toBeCloseTo(0, 10);
  });
});

describe('RMST point estimate', () => {
  it('equals the mean of min(T, τ) for uncensored data', () => {
    const times = [1, 2, 3, 4];
    const events = [1, 1, 1, 1];
    // τ=5: mean(min(T,5)) = (1+2+3+4)/4 = 2.5.
    expect(restrictedMeanSurvival(times, events, 5).rmst).toBeCloseTo(2.5, 10);
    // τ=2.5: mean(min(T,2.5)) = (1+2+2.5+2.5)/4 = 2.0.
    expect(restrictedMeanSurvival(times, events, 2.5).rmst).toBeCloseTo(2.0, 10);
  });

  it('matches the hand-computed Greenwood variance', () => {
    // times 1,2,3,4 all events, τ=5 ⇒ Var = 0.3125 (worked in the module header math).
    const r = restrictedMeanSurvival([1, 2, 3, 4], [1, 1, 1, 1], 5);
    expect(r.rmst).toBeCloseTo(2.5, 10);
    expect(r.variance).toBeCloseTo(0.3125, 10);
    expect(r.se).toBeCloseTo(Math.sqrt(0.3125), 10);
  });

  it('caps survival at τ and flags extrapolation beyond the data', () => {
    const r = restrictedMeanSurvival([1, 2, 3, 4], [1, 1, 1, 1], 10);
    // All events by t=4 ⇒ S=0 after, so RMST is unchanged beyond t=4 ⇒ still 2.5.
    expect(r.rmst).toBeCloseTo(2.5, 10);
    expect(r.tauBeyondData).toBe(true);
  });

  it('with no events before τ, RMST = τ and variance = 0', () => {
    // All censored ⇒ S stays 1 ⇒ area = τ; no event terms ⇒ variance 0.
    const r = restrictedMeanSurvival([3, 4, 5], [0, 0, 0], 2);
    expect(r.rmst).toBeCloseTo(2, 10);
    expect(r.variance).toBe(0);
  });
});

describe('RMST difference', () => {
  it('computes the difference, SE and a two-sided test', () => {
    // Treatment survives longer than control ⇒ positive difference.
    const treatment = { times: [3, 4, 5, 6], events: [1, 1, 1, 1] };
    const control = { times: [1, 2, 3, 4], events: [1, 1, 1, 1] };
    const r = rmstDifference(treatment, control, 6);
    expect(r.rmstTreatment).toBeGreaterThan(r.rmstControl);
    expect(r.difference).toBeCloseTo(r.rmstTreatment - r.rmstControl, 12);
    expect(r.se).toBeCloseTo(Math.sqrt(r.treatment.variance + r.control.variance), 12);
    expect(r.ciLower).toBeLessThan(r.difference);
    expect(r.ciUpper).toBeGreaterThan(r.difference);
    expect(r.pValue).toBeGreaterThan(0);
    expect(r.pValue).toBeLessThanOrEqual(1);
  });

  it('is antisymmetric under swapping arms and reproducible', () => {
    const a = { times: [3, 4, 5, 6], events: [1, 1, 1, 1] };
    const b = { times: [1, 2, 3, 4], events: [1, 1, 1, 1] };
    const ab = rmstDifference(a, b, 6);
    const ba = rmstDifference(b, a, 6);
    expect(ba.difference).toBeCloseTo(-ab.difference, 12);
    expect(ba.pValue).toBeCloseTo(ab.pValue, 12);
    const again = rmstDifference(a, b, 6);
    expect(again.provenance.inputsSha256).toBe(ab.provenance.inputsSha256);
    expect(ab.provenance.method).toBe('rmst:difference');
  });

  it('shrinks the p-value as the same separation is seen in more patients', () => {
    const rep = (arr: number[], k: number) => Array(k).fill(arr).flat();
    const small = rmstDifference(
      { times: [3, 4, 5, 6], events: [1, 1, 1, 1] },
      { times: [1, 2, 3, 4], events: [1, 1, 1, 1] }, 6);
    const large = rmstDifference(
      { times: rep([3, 4, 5, 6], 8), events: rep([1, 1, 1, 1], 8) },
      { times: rep([1, 2, 3, 4], 8), events: rep([1, 1, 1, 1], 8) }, 6);
    expect(large.difference).toBeCloseTo(small.difference, 6); // same effect
    expect(large.pValue).toBeLessThan(small.pValue); // more data ⇒ more significant
  });
});
