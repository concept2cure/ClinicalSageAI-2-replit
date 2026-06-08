/**
 * CLSI analytical-performance unit tests. Every expectation is a hand-computed
 * closed-form reference, the same verifiability bar diagnostic-design.ts holds.
 */

import { describe, it, expect } from 'vitest';
import {
  estimateImprecision,
  estimateDetectionCapability,
  linearRegression,
  polynomialFit,
  assessLinearity,
} from '../analytical-performance';

describe('EP05 imprecision (one-way ANOVA)', () => {
  // runs [10,12] and [14,16]: run means 11,15; grand mean 13.
  // SS_within = 1+1+1+1 = 4, df 2 → MS_within = 2.
  // SS_between = 2·((11-13)²+(15-13)²) = 16, df 1 → MS_between = 16.
  // repeatability var = 2 → SD = √2; between var = (16-2)/2 = 7;
  // within-lab var = 9 → SD = 3.
  const res = estimateImprecision({ runs: [[10, 12], [14, 16]] });

  it('grand mean and ANOVA intermediates', () => {
    expect(res.grandMean).toBeCloseTo(13, 10);
    expect(res.anova.msWithin).toBeCloseTo(2, 10);
    expect(res.anova.msBetween).toBeCloseTo(16, 10);
    expect(res.anova.dfWithin).toBe(2);
    expect(res.anova.dfBetween).toBe(1);
  });

  it('repeatability, between-run, and within-lab SD', () => {
    expect(res.repeatabilitySd).toBeCloseTo(Math.SQRT2, 10);
    expect(res.betweenRunSd).toBeCloseTo(Math.sqrt(7), 10);
    expect(res.withinLabSd).toBeCloseTo(3, 10);
    expect(res.withinLabCvPct).toBeCloseTo((3 / 13) * 100, 8);
  });

  it('clamps a negative between-run variance estimate to zero', () => {
    // Identical run means → MS_between < MS_within possible; never negative SD.
    const r = estimateImprecision({ runs: [[5, 7], [5, 7]] });
    expect(r.betweenRunSd).toBe(0);
    expect(r.repeatabilitySd).toBeCloseTo(Math.SQRT2, 10);
  });

  it('rejects unbalanced or too-small designs', () => {
    expect(() => estimateImprecision({ runs: [[1, 2]] })).toThrow();
    expect(() => estimateImprecision({ runs: [[1, 2], [3]] })).toThrow();
  });
});

describe('EP17 detection capability (LoB / LoD)', () => {
  it('LoB = 0 for a zero-SD blank; LoD = cβ·SD_low', () => {
    // blank all zeros → mean 0, SD 0 → LoB 0.
    // low sample [2,4] → SD = √2 (pooled). LoD = 1·cβ·√2.
    const r = estimateDetectionCapability({
      blankReplicates: [0, 0, 0, 0],
      lowSamples: [[2, 4]],
    });
    expect(r.blankSd).toBe(0);
    expect(r.lob).toBeCloseTo(0, 10);
    expect(r.pooledLowSd).toBeCloseTo(Math.SQRT2, 10);
    expect(r.cBeta).toBeCloseTo(1.6449, 3);
    expect(r.lod).toBeCloseTo(1.6449 * Math.SQRT2, 3);
  });

  it('LoB uses mean + cp·SD of the blank', () => {
    // blank [2,4,6] → mean 4, SD 2. LoB = 4 + cp·2.
    const r = estimateDetectionCapability({
      blankReplicates: [2, 4, 6],
      lowSamples: [[10, 10]], // SD 0 → LoD == LoB
    });
    expect(r.blankMean).toBeCloseTo(4, 10);
    expect(r.blankSd).toBeCloseTo(2, 10);
    expect(r.lob).toBeCloseTo(4 + 1.6449 * 2, 2);
    expect(r.lod).toBeCloseTo(r.lob, 10);
  });

  it('respects the EP17-A2 bias-correction factor K', () => {
    const base = estimateDetectionCapability({
      blankReplicates: [0, 0],
      lowSamples: [[2, 4]],
    });
    const corrected = estimateDetectionCapability({
      blankReplicates: [0, 0],
      lowSamples: [[2, 4]],
      biasCorrectionK: 1.1,
    });
    expect(corrected.lod).toBeCloseTo(base.lod * 1.1, 8);
  });
});

describe('EP06 linearity', () => {
  it('linearRegression recovers slope/intercept/R² exactly on linear data', () => {
    const fit = linearRegression([1, 2, 3, 4], [2, 4, 6, 8]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(0, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.residualSd).toBeCloseTo(0, 10);
  });

  it('polynomialFit recovers known quadratic coefficients', () => {
    // y = 1 + 2x + 3x²  at x = 0,1,2,3 → [1,6,17,34]
    const coeffs = polynomialFit([0, 1, 2, 3], [1, 6, 17, 34], 2);
    expect(coeffs[0]).toBeCloseTo(1, 6);
    expect(coeffs[1]).toBeCloseTo(2, 6);
    expect(coeffs[2]).toBeCloseTo(3, 6);
  });

  it('reports ~zero deviation-from-linearity on perfectly linear levels', () => {
    const res = assessLinearity([
      { concentration: 1, measurements: [3] },
      { concentration: 2, measurements: [5] },
      { concentration: 3, measurements: [7] },
      { concentration: 4, measurements: [9] },
    ]);
    expect(res.linear.slope).toBeCloseTo(2, 8);
    expect(res.maxDeviationPct).toBeLessThan(1e-6);
  });

  it('flags curvature with a large deviation-from-linearity', () => {
    const res = assessLinearity([
      { concentration: 1, measurements: [10] },
      { concentration: 2, measurements: [20] },
      { concentration: 3, measurements: [45] },
    ]);
    expect(res.bestNonlinearDegree).toBe(2);
    // Linear fit: slope 17.5, intercept -10 → level-1 estimate 7.5 vs measured 10.
    expect(res.maxDeviationPct).toBeGreaterThan(10);
  });

  it('requires at least 3 levels', () => {
    expect(() =>
      assessLinearity([
        { concentration: 1, measurements: [1] },
        { concentration: 2, measurements: [2] },
      ])
    ).toThrow();
  });
});
