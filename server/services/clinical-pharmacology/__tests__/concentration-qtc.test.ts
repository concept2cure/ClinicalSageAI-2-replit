/**
 * Unit tests for the concentration-QTc / thorough-QT-waiver assessor.
 * Pure module — no mocks.
 */

import { describe, it, expect } from 'vitest';

import { assessConcentrationQtc } from '../concentration-qtc';

describe('assessConcentrationQtc', () => {
  it('is negative (no TQT) when the 90% upper bound is below 10 ms', () => {
    const r = assessConcentrationQtc({
      slope: 0.02,
      slopeSE: 0.005,
      intercept: 0.5,
      targetConcentration: 300, // ~2x therapeutic
      therapeuticCmax: 150,
    });
    // predicted = 0.5 + 0.02*300 = 6.5; SE = 300*0.005 = 1.5; upper = 6.5 + 1.645*1.5 ≈ 8.97
    expect(r.predictedDdQtc).toBeCloseTo(6.5, 3);
    expect(r.upperBound90).toBeLessThan(10);
    expect(r.tqtWarranted).toBe(false);
    expect(r.exposureCoverageAdequate).toBe(true);
    expect(r.confidence).toBe('adequate');
    expect(r.rationale).toMatch(/Negative C-QTc|not warranted/);
  });

  it('warrants a TQT study when the threshold cannot be excluded', () => {
    const r = assessConcentrationQtc({
      slope: 0.04,
      slopeSE: 0.005,
      intercept: 0.5,
      targetConcentration: 300,
      therapeuticCmax: 150,
    });
    // predicted = 12.5 → upper well above 10
    expect(r.tqtWarranted).toBe(true);
    expect(r.rationale).toMatch(/remains warranted/);
  });

  it('flags inadequate supratherapeutic coverage even when the bound is low', () => {
    const r = assessConcentrationQtc({
      slope: 0.02,
      slopeSE: 0.005,
      intercept: 0.5,
      targetConcentration: 160, // only ~1.07x therapeutic
      therapeuticCmax: 150,
    });
    expect(r.exposureCoverageAdequate).toBe(false);
    expect(r.confidence).toBe('low_exposure_coverage');
  });

  it('flags an uninformatively wide CI', () => {
    const r = assessConcentrationQtc({
      slope: 0.01,
      slopeSE: 0.05, // huge SE
      intercept: 0,
      targetConcentration: 300,
      therapeuticCmax: 150,
    });
    // half-width = 1.645 * (300*0.05) = 24.7 ms ≥ 10 → wide CI
    expect(r.confidence).toBe('wide_ci');
  });

  it('propagates intercept SE and covariance into the prediction SE', () => {
    const withIntercept = assessConcentrationQtc({
      slope: 0.02,
      slopeSE: 0.005,
      intercept: 0.5,
      interceptSE: 1,
      slopeInterceptCov: 0,
      targetConcentration: 300,
    });
    // SE = sqrt(1 + 300^2*0.005^2) = sqrt(1 + 2.25) = 1.803
    expect(withIntercept.predictionSE).toBeCloseTo(1.803, 2);
  });

  it('rejects a negative slope SE', () => {
    expect(() => assessConcentrationQtc({ slope: 0.02, slopeSE: -1, targetConcentration: 300 })).toThrow();
  });
});
