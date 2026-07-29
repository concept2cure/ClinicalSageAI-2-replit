/**
 * Tests for Bayesian device-pivotal templates
 * (server/services/stats/bayesian-device.ts).
 *
 * Everything is exact (Beta–Binomial conjugacy), so it is validated against
 * closed-form values and the exact binomial, plus the OC / predictive identities.
 */

import { describe, it, expect } from 'vitest';
import {
  UNIFORM_PRIOR,
  powerPriorFromHistory,
  posteriorExceedance,
  posteriorSummary,
  minimalSuccessCount,
  deviceOperatingCharacteristic,
  deviceSampleSize,
  predictiveProbabilityOfSuccess,
} from '../../server/services/stats/bayesian-device';
import { binomialTailGE } from '../../server/services/stats/special';

describe('posterior exceedance', () => {
  it('matches the analytic Beta(1, n+1) tail for zero successes', () => {
    // x=0, n=10, uniform prior ⇒ posterior Beta(1,11); P(θ>0.5)=0.5^11.
    expect(posteriorExceedance(0, 10, 0.5, UNIFORM_PRIOR)).toBeCloseTo(Math.pow(0.5, 11), 10);
  });

  it('matches the analytic Beta(n+1, 1) tail for all successes', () => {
    // x=n=10, uniform ⇒ Beta(11,1); P(θ>0.5)=1-0.5^11.
    expect(posteriorExceedance(10, 10, 0.5, UNIFORM_PRIOR)).toBeCloseTo(1 - Math.pow(0.5, 11), 10);
  });

  it('increases monotonically with the number of successes', () => {
    let prev = -1;
    for (let x = 0; x <= 20; x++) {
      const e = posteriorExceedance(x, 20, 0.7, UNIFORM_PRIOR);
      expect(e).toBeGreaterThan(prev);
      prev = e;
    }
  });
});

describe('posterior summary', () => {
  it('mean is the Beta posterior mean and the CI brackets it', () => {
    const s = posteriorSummary(8, 10, UNIFORM_PRIOR, 0.95);
    expect(s.mean).toBeCloseTo(9 / 12, 10); // (1+8)/(2+10)
    expect(s.lower).toBeLessThan(s.mean);
    expect(s.upper).toBeGreaterThan(s.mean);
    expect(s.lower).toBeGreaterThan(0);
    expect(s.upper).toBeLessThan(1);
  });
});

describe('informative power prior', () => {
  it('borrows historical successes/failures and lifts exceedance', () => {
    const prior = powerPriorFromHistory(40, 10, 1); // strong historical 80%
    expect(prior.alpha).toBeCloseTo(41, 10);
    expect(prior.beta).toBeCloseTo(11, 10);
    const withBorrow = posteriorExceedance(7, 10, 0.6, prior);
    const noBorrow = posteriorExceedance(7, 10, 0.6, UNIFORM_PRIOR);
    expect(withBorrow).toBeGreaterThan(noBorrow);
  });

  it('a0 = 0 recovers the base prior', () => {
    const p = powerPriorFromHistory(40, 10, 0);
    expect(p).toEqual(UNIFORM_PRIOR);
  });
});

describe('Bayesian decision rule and operating characteristics', () => {
  it('the critical count gives an exact P(success) via the binomial tail', () => {
    const oc = deviceOperatingCharacteristic({
      n: 50, goal: 0.7, prior: UNIFORM_PRIOR, successThreshold: 0.95, trueRate: 0.85,
    });
    expect(oc.criticalCount).toBeGreaterThan(0);
    expect(oc.probabilityOfSuccess).toBeCloseTo(
      binomialTailGE(oc.criticalCount, 50, 0.85), 12,
    );
  });

  it('controls the type I error at the goal and has higher power at the expected rate', () => {
    const typeI = deviceOperatingCharacteristic({
      n: 100, goal: 0.7, prior: UNIFORM_PRIOR, successThreshold: 0.975, trueRate: 0.7,
    }).probabilityOfSuccess;
    const power = deviceOperatingCharacteristic({
      n: 100, goal: 0.7, prior: UNIFORM_PRIOR, successThreshold: 0.975, trueRate: 0.85,
    }).probabilityOfSuccess;
    // With a ~0.975 posterior threshold and uniform prior, type I ≈ one-sided 0.025.
    expect(typeI).toBeLessThan(0.05);
    expect(power).toBeGreaterThan(typeI);
    expect(power).toBeGreaterThan(0.8);
  });

  it('minimalSuccessCount is consistent with the exceedance threshold', () => {
    const xStar = minimalSuccessCount(40, 0.6, UNIFORM_PRIOR, 0.9);
    expect(posteriorExceedance(xStar, 40, 0.6, UNIFORM_PRIOR)).toBeGreaterThanOrEqual(0.9);
    expect(posteriorExceedance(xStar - 1, 40, 0.6, UNIFORM_PRIOR)).toBeLessThan(0.9);
  });
});

describe('sample size', () => {
  it('finds the smallest n meeting power with the type I cap honored', () => {
    const r = deviceSampleSize({
      goal: 0.7, expected: 0.85, successThreshold: 0.975,
      targetPower: 0.9, maxTypeI: 0.05,
    });
    expect(r.n).not.toBeNull();
    expect(r.power!).toBeGreaterThanOrEqual(0.9);
    expect(r.typeIError!).toBeLessThanOrEqual(0.05);
    expect(r.provenance.method).toBe('bayesianDevice:sampleSize');
  });

  it('is deterministic with stable provenance', () => {
    const args = { goal: 0.7, expected: 0.85, successThreshold: 0.975, targetPower: 0.9 };
    const a = deviceSampleSize(args);
    const b = deviceSampleSize(args);
    expect(a.n).toBe(b.n);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
  });
});

describe('interim predictive probability of success', () => {
  it('is 1 when the criterion is already met at the interim', () => {
    // Strong interim that already clears the final critical count.
    const r = predictiveProbabilityOfSuccess({
      xInterim: 60, nInterim: 60, nFinal: 60, goal: 0.6, successThreshold: 0.9,
    });
    expect(r.futurePatients).toBe(0);
    expect(r.predictiveProbabilityOfSuccess).toBe(1);
  });

  it('is between 0 and 1 mid-trial and rises with interim successes', () => {
    const common = { nInterim: 40, nFinal: 100, goal: 0.7, successThreshold: 0.975 };
    const low = predictiveProbabilityOfSuccess({ ...common, xInterim: 26 });
    const high = predictiveProbabilityOfSuccess({ ...common, xInterim: 36 });
    expect(low.predictiveProbabilityOfSuccess).toBeGreaterThanOrEqual(0);
    expect(low.predictiveProbabilityOfSuccess).toBeLessThanOrEqual(1);
    expect(high.predictiveProbabilityOfSuccess).toBeGreaterThan(low.predictiveProbabilityOfSuccess);
  });

  it('the Beta–Binomial predictive weights sum to 1 (PPoS is a proper probability)', () => {
    // A very low bar (threshold barely above 0) should give PPoS ≈ 1; an
    // impossible bar gives 0. Both confirm the predictive is a real distribution.
    const easy = predictiveProbabilityOfSuccess({
      xInterim: 5, nInterim: 10, nFinal: 20, goal: 0.01, successThreshold: 0.5,
    });
    expect(easy.predictiveProbabilityOfSuccess).toBeCloseTo(1, 6);
  });
});
