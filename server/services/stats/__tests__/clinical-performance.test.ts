/**
 * Clinical diagnostic-performance unit tests — hand-computed closed-form refs.
 */

import { describe, it, expect } from 'vitest';
import { computeDiagnosticAccuracy } from '../clinical-performance';

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
