/**
 * Tests for the external-control rigor pack
 * (server/services/stats/external-control.ts).
 *
 * GA bar: sensitivity analyses reproducible. Also checks the analytic limits of
 * borrowing, the standardized-mean-difference definition, and the honesty of the
 * memo renderer.
 */

import { describe, it, expect } from 'vitest';
import {
  covariateBalance,
  powerPriorBorrow,
  commensurateBorrow,
  treatmentEffect,
  tippingPointBias,
  tippingPointBorrow,
  renderExternalControlMemo,
} from '../../server/services/stats/external-control';

describe('covariateBalance', () => {
  it('computes the standardized mean difference by Austin’s definition', () => {
    // treatment ~ mean 1, control ~ mean 0, equal spread ⇒ SMD ≈ 1 / pooledSd.
    const r = covariateBalance([
      { name: 'age', type: 'continuous', treatment: [1, 2, 3], control: [0, 1, 2] },
    ]);
    const e = r.covariates[0];
    expect(e.treatmentMean).toBeCloseTo(2, 10);
    expect(e.controlMean).toBeCloseTo(1, 10);
    // both variances = 1 ⇒ pooledSd = 1 ⇒ SMD = 1.
    expect(e.standardizedMeanDifference).toBeCloseTo(1, 10);
    expect(e.varianceRatio).toBeCloseTo(1, 10);
    expect(e.balanced).toBe(false);
  });

  it('flags identical groups as perfectly balanced', () => {
    const r = covariateBalance([
      { name: 'x', type: 'continuous', treatment: [1, 2, 3, 4], control: [1, 2, 3, 4] },
    ]);
    expect(r.covariates[0].standardizedMeanDifference).toBeCloseTo(0, 12);
    expect(r.allBalanced).toBe(true);
    expect(r.maxAbsStandardizedMeanDifference).toBeCloseTo(0, 12);
  });

  it('handles binary covariates with a p(1-p) denominator', () => {
    const r = covariateBalance([
      { name: 'male', type: 'binary', treatment: [1, 1, 0, 0], control: [1, 0, 0, 0] },
    ]);
    const e = r.covariates[0];
    expect(e.treatmentMean).toBeCloseTo(0.5, 10);
    expect(e.controlMean).toBeCloseTo(0.25, 10);
    const pooled = Math.sqrt((0.5 * 0.5 + 0.25 * 0.75) / 2);
    expect(e.standardizedMeanDifference).toBeCloseTo(0.25 / pooled, 10);
  });

  it('applies control weights and reports an effective sample size', () => {
    const r = covariateBalance([
      {
        name: 'bmi',
        type: 'continuous',
        treatment: [2, 2, 2, 2],
        control: [0, 4, 0, 4],
        controlWeights: [3, 1, 3, 1],
      },
    ]);
    // weighted control mean = (3·0+1·4+3·0+1·4)/8 = 1.
    expect(r.covariates[0].controlMean).toBeCloseTo(1, 10);
    // ESS = (Σw)²/Σw² = 64/20 = 3.2.
    expect(r.controlEffectiveSampleSize).toBeCloseTo(3.2, 10);
  });
});

describe('powerPriorBorrow — analytic limits', () => {
  const base = { meanC: 10, seC: 1, nC: 100, meanH: 8, seH: 1, nH: 100 };

  it('a0 = 0 recovers the concurrent control exactly (no borrowing)', () => {
    const r = powerPriorBorrow({ ...base, a0: 0 });
    expect(r.posteriorMean).toBeCloseTo(base.meanC, 12);
    expect(r.posteriorSe).toBeCloseTo(base.seC, 12);
    expect(r.effectiveHistoricalN).toBe(0);
    expect(r.borrowedPrecisionFraction).toBeCloseTo(0, 12);
  });

  it('a0 = 1 with equal precision pools to the midpoint', () => {
    const r = powerPriorBorrow({ ...base, a0: 1 });
    expect(r.posteriorMean).toBeCloseTo(9, 12); // (10+8)/2
    expect(r.posteriorSe).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(r.effectiveHistoricalN).toBe(100);
    expect(r.borrowedPrecisionFraction).toBeCloseTo(0.5, 12);
  });

  it('borrowing shrinks the posterior se monotonically in a0', () => {
    const lo = powerPriorBorrow({ ...base, a0: 0.25 }).posteriorSe;
    const hi = powerPriorBorrow({ ...base, a0: 0.75 }).posteriorSe;
    expect(hi).toBeLessThan(lo);
  });
});

describe('commensurateBorrow — conflict attenuates borrowing', () => {
  const base = { meanC: 10, seC: 1, nC: 100, meanH: 8, seH: 1, nH: 100 };

  it('tau2 = 0 borrows fully (equivalent to a0 = 1 here)', () => {
    const r = commensurateBorrow({ ...base, tau2: 0 });
    expect(r.posteriorMean).toBeCloseTo(9, 12);
    expect(r.effectiveHistoricalN).toBeCloseTo(100, 12);
  });

  it('large tau2 borrows almost nothing', () => {
    const r = commensurateBorrow({ ...base, tau2: 1e6 });
    expect(r.posteriorMean).toBeCloseTo(base.meanC, 4);
    expect(r.effectiveHistoricalN).toBeLessThan(0.001);
  });

  it('effective borrowed n decreases as tau2 grows', () => {
    const small = commensurateBorrow({ ...base, tau2: 0.5 }).effectiveHistoricalN;
    const large = commensurateBorrow({ ...base, tau2: 4 }).effectiveHistoricalN;
    expect(large).toBeLessThan(small);
  });
});

describe('treatmentEffect', () => {
  it('produces a two-sided p-value and a matching CI', () => {
    const control = powerPriorBorrow({ meanC: 0, seC: 1, nC: 100, meanH: 0, seH: 1, nH: 100, a0: 0 });
    const eff = treatmentEffect(1.96, 0, control, 0.05);
    // effect 1.96, se 1 ⇒ z = 1.96 ⇒ p ≈ 0.05; CI just excludes 0.
    expect(eff.pValue).toBeCloseTo(0.05, 2);
    expect(eff.ciLower).toBeGreaterThan(0);
  });
});

describe('tipping points — reproducible sensitivity (GA bar)', () => {
  const design = {
    meanT: 11, seT: 1, meanC: 10, seC: 1, nC: 100, meanH: 9.5, seH: 1, nH: 100,
  };

  it('bias tipping point is deterministic and reproducible', () => {
    const a = tippingPointBias({ ...design, a0: 1, alpha: 0.05 });
    const b = tippingPointBias({ ...design, a0: 1, alpha: 0.05 });
    expect(a.tippingValue).toBe(b.tippingValue);
    expect(a.provenance.inputsSha256).toBe(b.provenance.inputsSha256);
    expect(a.grid.length).toBe(101);
    expect(a.provenance.method).toBe('externalControl:tippingPointBias');
  });

  it('a borrowing tipping point exists when borrowing drives significance', () => {
    // Concurrent-only effect is 1 with se √2 (z≈0.71, n.s.); borrowing a low
    // historical control pulls the control mean down and can make it significant.
    const t = tippingPointBorrow({
      meanT: 11, seT: 1, meanC: 10, seC: 1, nC: 100, meanH: 7, seH: 1, nH: 100, alpha: 0.05,
    });
    // At a0=1 (start of grid) more borrowing ⇒ more likely significant; at a0=0 not.
    expect(t.grid[0].a0).toBeCloseTo(1, 10);
    expect(t.grid[t.grid.length - 1].a0).toBeCloseTo(0, 10);
    expect(t.flips).toBe(true);
    expect(t.tippingValue).not.toBeNull();
  });

  it('reports no flip when the conclusion is robust across the range', () => {
    // Overwhelming effect: significant regardless of borrowing.
    const t = tippingPointBorrow({
      meanT: 20, seT: 0.5, meanC: 10, seC: 0.5, nC: 500, meanH: 10, seH: 0.5, nH: 500, alpha: 0.05,
    });
    expect(t.flips).toBe(false);
    expect(t.tippingValue).toBeNull();
  });
});

describe('renderExternalControlMemo — honest, deterministic text', () => {
  it('summarizes borrowing, effect, balance and the tipping point without fabrication', () => {
    const control = powerPriorBorrow({ meanC: 10, seC: 1, nC: 100, meanH: 8, seH: 1, nH: 100, a0: 0.5 });
    const effect = treatmentEffect(12, 1, control, 0.05);
    const balance = covariateBalance([
      { name: 'age', type: 'continuous', treatment: [50, 52, 54], control: [49, 51, 53] },
    ]);
    const tipping = tippingPointBias({
      meanT: 12, seT: 1, meanC: 10, seC: 1, nC: 100, meanH: 8, seH: 1, nH: 100, a0: 0.5, alpha: 0.05,
    });
    const memo = renderExternalControlMemo({
      endpoint: 'change in HbA1c',
      borrowingMethod: 'power-prior',
      borrowingParam: 0.5,
      control,
      effect,
      balance,
      tipping,
    });
    expect(memo).toContain('power prior, a0 = 0.500');
    expect(memo).toContain('change in HbA1c');
    expect(memo).toContain('equivalent subjects');
    expect(memo).toContain('standardized mean difference');
    // No exclamation marks / cheerleading.
    expect(memo).not.toContain('!');
  });

  it('omits sections whose inputs are absent (no fabrication)', () => {
    const control = commensurateBorrow({ meanC: 5, seC: 1, nC: 50, meanH: 5, seH: 1, nH: 50, tau2: 1 });
    const effect = treatmentEffect(6, 1, control, 0.05);
    const memo = renderExternalControlMemo({
      endpoint: 'response rate',
      borrowingMethod: 'commensurate',
      borrowingParam: 1,
      control,
      effect,
    });
    expect(memo).toContain('commensurate prior, tau^2 = 1.000');
    expect(memo).not.toContain('Covariate balance');
    expect(memo).not.toContain('Sensitivity');
  });
});
