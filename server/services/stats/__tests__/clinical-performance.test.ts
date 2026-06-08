/**
 * Clinical diagnostic-performance unit tests — hand-computed closed-form refs.
 */

import { describe, it, expect } from 'vitest';
import { computeDiagnosticAccuracy, computeRoc, computeWeightedKappa } from '../clinical-performance';

describe('computeDiagnosticAccuracy', () => {
  // tp=90, fn=10, tn=80, fp=20 → 100 positives, 100 negatives, N=200.
  const cm = { tp: 90, fp: 20, fn: 10, tn: 80 };

  it('sensitivity, specificity, accuracy, Youden J', () => {
    const r = computeDiagnosticAccuracy(cm);
    expect(r.sensitivity).toBeCloseTo(0.9, 10);
    expect(r.specificity).toBeCloseTo(0.8, 10);
    expect(r.accuracy).toBeCloseTo(0.85, 10);
    expect(r.youdenJ).toBeCloseTo(0.7, 10);
    expect(r.n).toBe(200);
  });

  it('likelihood ratios and sample predictive values', () => {
    const r = computeDiagnosticAccuracy(cm);
    expect(r.lrPositive).toBeCloseTo(4.5, 10); // 0.9 / 0.2
    expect(r.lrNegative).toBeCloseTo(0.125, 10); // 0.1 / 0.8
    expect(r.ppvSample).toBeCloseTo(90 / 110, 10);
    expect(r.npvSample).toBeCloseTo(80 / 90, 10);
  });

  it("Cohen's kappa", () => {
    // po=0.85, pe=0.5 → κ=0.7
    const r = computeDiagnosticAccuracy(cm);
    expect(r.cohensKappa).toBeCloseTo(0.7, 10);
  });

  it('prevalence-adjusted predictive values', () => {
    const r = computeDiagnosticAccuracy(cm, { prevalence: 0.1 });
    // PPV = (0.9·0.1)/(0.9·0.1 + 0.2·0.9) = 0.09/0.27 = 1/3
    expect(r.ppvAdjusted).toBeCloseTo(1 / 3, 10);
    // NPV = (0.8·0.9)/((0.1·0.1) + (0.8·0.9)) = 0.72/0.73
    expect(r.npvAdjusted).toBeCloseTo(0.72 / 0.73, 10);
  });

  it('returns null adjusted PVs when no prevalence supplied', () => {
    const r = computeDiagnosticAccuracy(cm);
    expect(r.ppvAdjusted).toBeNull();
    expect(r.npvAdjusted).toBeNull();
  });

  it('Clopper–Pearson CIs bracket the point estimates', () => {
    const r = computeDiagnosticAccuracy(cm);
    expect(r.sensitivityCi.lower).toBeLessThan(r.sensitivity);
    expect(r.sensitivityCi.upper).toBeGreaterThan(r.sensitivity);
    expect(r.specificityCi.lower).toBeLessThan(r.specificity);
    expect(r.specificityCi.upper).toBeGreaterThan(r.specificity);
  });

  it('LR+ is infinite at perfect specificity', () => {
    const r = computeDiagnosticAccuracy({ tp: 50, fp: 0, fn: 5, tn: 50 });
    expect(r.lrPositive).toBe(Infinity);
  });

  it('rejects degenerate or invalid tables', () => {
    expect(() => computeDiagnosticAccuracy({ tp: 0, fp: 0, fn: 0, tn: 10 })).toThrow();
    expect(() => computeDiagnosticAccuracy({ tp: 1.5, fp: 0, fn: 1, tn: 1 })).toThrow();
    expect(() => computeDiagnosticAccuracy({ tp: 5, fp: 5, fn: 5, tn: 5 }, { prevalence: 2 })).toThrow();
  });
});

describe('computeRoc', () => {
  it('AUC = 1 for perfectly separable scores', () => {
    const r = computeRoc([
      { score: 0.9, positive: true },
      { score: 0.8, positive: true },
      { score: 0.3, positive: false },
      { score: 0.1, positive: false },
    ]);
    expect(r.auc).toBeCloseTo(1, 10);
    expect(r.optimalTpr).toBeCloseTo(1, 10);
    expect(r.optimalFpr).toBeCloseTo(0, 10);
  });

  it('AUC matches the Mann–Whitney hand calculation (0.75)', () => {
    // pos=[0.6,0.4], neg=[0.5,0.2]; ranks 0.2,0.4,0.5,0.6 → sumRankPos=6 → (6−3)/4=0.75.
    const r = computeRoc([
      { score: 0.6, positive: true },
      { score: 0.4, positive: true },
      { score: 0.5, positive: false },
      { score: 0.2, positive: false },
    ]);
    expect(r.auc).toBeCloseTo(0.75, 10);
    expect(r.positives).toBe(2);
    expect(r.negatives).toBe(2);
    expect(r.curve.length).toBeGreaterThan(0);
  });

  it('handles ties with average ranks (AUC = 0.5 for identical scores)', () => {
    const r = computeRoc([
      { score: 1, positive: true },
      { score: 1, positive: false },
    ]);
    expect(r.auc).toBeCloseTo(0.5, 10);
  });

  it('requires both classes present', () => {
    expect(() => computeRoc([{ score: 1, positive: true }, { score: 2, positive: true }])).toThrow();
  });

  it('DeLong SE is zero for perfect separation and positive with overlap', () => {
    const perfect = computeRoc([
      { score: 0.9, positive: true },
      { score: 0.8, positive: true },
      { score: 0.3, positive: false },
      { score: 0.1, positive: false },
    ]);
    expect(perfect.aucSe).toBeCloseTo(0, 10);
    expect(perfect.aucCi).toMatchObject({ lower: 1, upper: 1 });

    // The 0.75 example: V10=[1,0.5], V01=[0.5,1] → var=0.125/2+0.125/2=0.125.
    const overlap = computeRoc([
      { score: 0.6, positive: true },
      { score: 0.4, positive: true },
      { score: 0.5, positive: false },
      { score: 0.2, positive: false },
    ]);
    expect(overlap.aucSe).toBeCloseTo(Math.sqrt(0.125), 8);
    expect(overlap.aucCi.lower).toBeLessThan(0.75);
    expect(overlap.aucCi.upper).toBeLessThanOrEqual(1);
  });
});

describe('computeWeightedKappa', () => {
  it('perfect agreement → κ = 1', () => {
    const r = computeWeightedKappa([[5, 0, 0], [0, 5, 0], [0, 0, 5]], 'quadratic');
    expect(r.kappa).toBeCloseTo(1, 10);
  });

  it('2×2 linear-weighted κ equals unweighted Cohen κ (0.7)', () => {
    // Same table as the 2×2 accuracy test (κ = 0.7).
    const r = computeWeightedKappa([[90, 20], [10, 80]], 'linear');
    expect(r.kappa).toBeCloseTo(0.7, 10);
  });

  it('quadratic-weighted κ matches a hand calculation (0.6667)', () => {
    // obs Σw·O = 5, exp Σw·E = 15 → κ = 1 − 5/15 = 2/3.
    const r = computeWeightedKappa([[10, 5, 0], [5, 10, 5], [0, 5, 10]], 'quadratic');
    expect(r.kappa).toBeCloseTo(2 / 3, 8);
  });

  it('rejects non-square or empty matrices', () => {
    expect(() => computeWeightedKappa([[1, 2, 3], [4, 5, 6]])).toThrow();
    expect(() => computeWeightedKappa([[0, 0], [0, 0]])).toThrow();
  });
});
