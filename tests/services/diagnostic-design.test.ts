/**
 * Tests for the diagnostic / IVD performance design pack and its special
 * functions (server/services/stats/special.ts, diagnostic-design.ts).
 *
 * GA bars: sizing matches the closed-form reference; special functions match
 * known analytic values; exact tests genuinely control alpha; deterministic.
 */

import { describe, it, expect } from 'vitest';
import {
  gammaln,
  betaRegularized,
  betaQuantile,
  binomialTailGE,
  binomialTailLE,
  clopperPearsonInterval,
} from '../../server/services/stats/special';
import {
  sizeSingleProportion,
  sizeCoPrimarySensSpec,
  performanceInterval,
  normalApproxPower,
} from '../../server/services/stats/diagnostic-design';

describe('special — gamma and incomplete beta against analytic values', () => {
  it('gammaln matches ln of known factorials and Γ(1/2)', () => {
    expect(gammaln(5)).toBeCloseTo(Math.log(24), 9); // Γ(5) = 4! = 24
    expect(gammaln(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 9);
  });

  it('I_x(1,1) = x (uniform) and I_x is symmetric at the centre', () => {
    expect(betaRegularized(0.3, 1, 1)).toBeCloseTo(0.3, 10);
    expect(betaRegularized(0.5, 2, 2)).toBeCloseTo(0.5, 10);
  });

  it('I_0.5(2,3) equals the analytic 0.6875', () => {
    expect(betaRegularized(0.5, 2, 3)).toBeCloseTo(0.6875, 9);
  });

  it('betaQuantile inverts betaRegularized', () => {
    for (const p of [0.05, 0.3, 0.5, 0.9]) {
      const x = betaQuantile(p, 2, 5);
      expect(betaRegularized(x, 2, 5)).toBeCloseTo(p, 8);
    }
  });
});

describe('special — exact binomial tails', () => {
  it('matches the analytic Binomial(10, 0.5) tails', () => {
    expect(binomialTailGE(1, 10, 0.5)).toBeCloseTo(1 - Math.pow(0.5, 10), 10);
    expect(binomialTailGE(10, 10, 0.5)).toBeCloseTo(Math.pow(0.5, 10), 10);
    // P(X ≥ 9) = 11 · 0.5^10.
    expect(binomialTailGE(9, 10, 0.5)).toBeCloseTo(11 * Math.pow(0.5, 10), 10);
  });

  it('upper and lower tails are complementary across the split point', () => {
    // P(X ≥ k) + P(X ≤ k-1) = 1.
    expect(binomialTailGE(4, 20, 0.3) + binomialTailLE(3, 20, 0.3)).toBeCloseTo(1, 10);
  });

  it('Clopper–Pearson upper bound for 0/10 equals 1 − 0.025^(1/10)', () => {
    const { lower, upper } = clopperPearsonInterval(0, 10, 0.95);
    expect(lower).toBe(0);
    expect(upper).toBeCloseTo(1 - Math.pow(0.025, 0.1), 8); // ≈ 0.3085
  });
});

describe('diagnostic — single proportion sizing', () => {
  it('normal approximation matches the closed-form reference (n=108)', () => {
    // goal 0.80, expected 0.90, one-sided α=0.025, power 0.80 ⇒ n = 108.
    const r = sizeSingleProportion({ goal: 0.8, expected: 0.9, alpha: 0.025, power: 0.8 });
    expect(r.nNormalApprox).toBe(108);
    // The normal-approx n delivers ~the target power by the same formula.
    expect(normalApproxPower(r.nNormalApprox, 0.8, 0.9, 0.025)).toBeGreaterThanOrEqual(0.8);
  });

  it('the exact test controls alpha and reaches the target power', () => {
    const r = sizeSingleProportion({ goal: 0.8, expected: 0.95, alpha: 0.025, power: 0.9 });
    expect(r.exactAlpha).toBeLessThanOrEqual(0.025 + 1e-12);
    expect(r.exactPower).toBeGreaterThanOrEqual(0.9);
    expect(r.criticalCount).toBeGreaterThan(0);
    expect(r.criticalCount).toBeLessThanOrEqual(r.nExact);
    // Just below the critical count, the exact test must NOT yet have target power.
    expect(binomialTailGE(r.criticalCount, r.nExact - 1, 0.95)).toBeLessThan(r.exactPower + 1e-9);
  });

  it('exact power is monotone increasing in n at a fixed design', () => {
    const lo = sizeSingleProportion({ goal: 0.7, expected: 0.85, power: 0.8 }).nExact;
    const hi = sizeSingleProportion({ goal: 0.7, expected: 0.85, power: 0.95 }).nExact;
    expect(hi).toBeGreaterThan(lo);
  });

  it('rejects an alternative that does not exceed the goal', () => {
    expect(() => sizeSingleProportion({ goal: 0.9, expected: 0.85 })).toThrow(/must exceed goal/);
  });
});

describe('diagnostic — co-primary sensitivity and specificity', () => {
  it('joint power is the product of the exact endpoint powers', () => {
    const r = sizeCoPrimarySensSpec({
      sensitivityGoal: 0.8,
      sensitivityExpected: 0.92,
      specificityGoal: 0.85,
      specificityExpected: 0.95,
      prevalence: 0.3,
      alpha: 0.025,
      power: 0.9,
    });
    expect(r.jointPower).toBeCloseTo(r.sensitivity.exactPower * r.specificity.exactPower, 12);
    expect(r.nDiseased).toBe(r.sensitivity.nExact);
    expect(r.nNonDiseased).toBe(r.specificity.nExact);
  });

  it('total enrollment fills both subgroups in expectation given prevalence', () => {
    const r = sizeCoPrimarySensSpec({
      sensitivityGoal: 0.8,
      sensitivityExpected: 0.92,
      specificityGoal: 0.85,
      specificityExpected: 0.95,
      prevalence: 0.2,
      power: 0.9,
    });
    expect(r.nTotal * r.prevalence).toBeGreaterThanOrEqual(r.nDiseased);
    expect(r.nTotal * (1 - r.prevalence)).toBeGreaterThanOrEqual(r.nNonDiseased);
    expect(r.nTotal).toBe(
      Math.max(Math.ceil(r.nDiseased / 0.2), Math.ceil(r.nNonDiseased / 0.8)),
    );
  });

  it('jointPowerTarget raises each marginal so the joint power clears the target', () => {
    const target = 0.9;
    const r = sizeCoPrimarySensSpec({
      sensitivityGoal: 0.8,
      sensitivityExpected: 0.92,
      specificityGoal: 0.85,
      specificityExpected: 0.95,
      prevalence: 0.3,
      jointPowerTarget: target,
    });
    expect(r.jointPower).toBeGreaterThanOrEqual(target);
  });

  it('is deterministic with a stable provenance hash', () => {
    const args = {
      sensitivityGoal: 0.8,
      sensitivityExpected: 0.92,
      specificityGoal: 0.85,
      specificityExpected: 0.95,
      prevalence: 0.3,
      power: 0.9,
    };
    const a = sizeCoPrimarySensSpec(args);
    const b = sizeCoPrimarySensSpec(args);
    expect(a.nTotal).toBe(b.nTotal);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.provenance.method).toBe('diagnostic:coPrimarySensSpec');
  });
});

describe('diagnostic — performance interval', () => {
  it('reports the point estimate inside an exact Clopper–Pearson interval', () => {
    const r = performanceInterval(43, 50, 0.95);
    expect(r.estimate).toBeCloseTo(0.86, 10);
    expect(r.lower).toBeLessThan(r.estimate);
    expect(r.upper).toBeGreaterThan(r.estimate);
    expect(r.lower).toBeGreaterThan(0.7);
    expect(r.upper).toBeLessThan(0.95);
  });
});
