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
  compareMethods,
  assessInterference,
  estimateReferenceInterval,
  studentTQuantile,
  estimateShelfLife,
  fitQualitativeDoseResponse,
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

describe('EP09 method comparison', () => {
  it('estimates slope/intercept and bias from paired data', () => {
    // test = 2·reference exactly → slope 2, intercept 0.
    const r = compareMethods({ reference: [1, 2, 3, 4], test: [2, 4, 6, 8] });
    expect(r.slope).toBeCloseTo(2, 10);
    expect(r.intercept).toBeCloseTo(0, 10);
    expect(r.r2).toBeCloseTo(1, 10);
    // mean(test − reference) = mean([1,2,3,4]) = 2.5
    expect(r.meanBias).toBeCloseTo(2.5, 10);
  });

  it('reports systematic bias at a decision level', () => {
    // At Xc=5, predicted test = 10 → bias = 10 − 5 = 5.
    const r = compareMethods({ reference: [1, 2, 3, 4], test: [2, 4, 6, 8], decisionLevel: 5 });
    expect(r.biasAtDecisionLevel).toBeCloseTo(5, 10);
  });

  it('null decision-level bias when not requested; rejects unpaired input', () => {
    expect(compareMethods({ reference: [1, 2], test: [1, 2] }).biasAtDecisionLevel).toBeNull();
    expect(() => compareMethods({ reference: [1, 2, 3], test: [1, 2] })).toThrow();
  });

  it('Bland–Altman limits of agreement = meanBias ± 1.96·sdBias', () => {
    // diffs = [1,2,3,4] → meanBias 2.5, sdBias = sqrt(5/3).
    const r = compareMethods({ reference: [1, 2, 3, 4], test: [2, 4, 6, 8] });
    const sd = Math.sqrt(5 / 3);
    expect(r.limitsOfAgreement.lower).toBeCloseTo(2.5 - 1.96 * sd, 8);
    expect(r.limitsOfAgreement.upper).toBeCloseTo(2.5 + 1.96 * sd, 8);
  });
});

describe('EP07 interference', () => {
  it('computes percent bias from baseline vs with-interferent', () => {
    // baseline mean 100, interferent mean 110 → +10% bias.
    const r = assessInterference({ baseline: [98, 102], withInterferent: [108, 112] });
    expect(r.baselineMean).toBeCloseTo(100, 10);
    expect(r.interferentMean).toBeCloseTo(110, 10);
    expect(r.percentBias).toBeCloseTo(10, 10);
    expect(r.absoluteBias).toBeCloseTo(10, 10);
    expect(r.interferes).toBeNull();
  });

  it('flags interference when bias exceeds the allowable limit', () => {
    const r = assessInterference({
      baseline: [100],
      withInterferent: [110],
      allowableBiasPct: 5,
    });
    expect(r.interferes).toBe(true);
    const ok = assessInterference({
      baseline: [100],
      withInterferent: [103],
      allowableBiasPct: 5,
    });
    expect(ok.interferes).toBe(false);
  });

  it('rejects empty input or zero baseline', () => {
    expect(() => assessInterference({ baseline: [], withInterferent: [1] })).toThrow();
    expect(() => assessInterference({ baseline: [0, 0], withInterferent: [1] })).toThrow();
  });
});

describe('EP28 reference interval', () => {
  it('type-7 percentile limits on 1..100', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    const r = estimateReferenceInterval({ values });
    // idx = q·(n−1): 0.025·99 = 2.475 → 1 + 2.475 = 3.475; 0.975·99 = 96.525 → 97.525.
    expect(r.lowerLimit).toBeCloseTo(3.475, 6);
    expect(r.upperLimit).toBeCloseTo(97.525, 6);
    expect(r.n).toBe(100);
  });

  it('limits are ordered and CIs bracket them', () => {
    const values = Array.from({ length: 200 }, (_, i) => i + 1);
    const r = estimateReferenceInterval({ values });
    expect(r.lowerLimit).toBeLessThan(r.upperLimit);
    expect(r.lowerLimitCi.lower).toBeLessThanOrEqual(r.lowerLimit);
    expect(r.lowerLimitCi.upper).toBeGreaterThanOrEqual(r.lowerLimit);
    expect(r.upperLimitCi.lower).toBeLessThanOrEqual(r.upperLimit);
  });

  it('rejects <3 values or bad quantiles', () => {
    expect(() => estimateReferenceInterval({ values: [1, 2] })).toThrow();
    expect(() =>
      estimateReferenceInterval({ values: [1, 2, 3], lowerQuantile: 0.9, upperQuantile: 0.1 })
    ).toThrow();
  });
});

describe('studentTQuantile', () => {
  it('matches standard t-table values', () => {
    expect(studentTQuantile(0.975, 10)).toBeCloseTo(2.228, 2);
    expect(studentTQuantile(0.975, 1)).toBeCloseTo(12.706, 2);
    expect(studentTQuantile(0.975, 1000)).toBeCloseTo(1.962, 2);
  });
  it('is symmetric about zero', () => {
    expect(studentTQuantile(0.025, 10)).toBeCloseTo(-studentTQuantile(0.975, 10), 8);
    expect(studentTQuantile(0.5, 5)).toBe(0);
  });
});

describe('EP25 stability / shelf-life', () => {
  it('on a noise-free degrading line, shelf-life equals the nominal crossing', () => {
    // value = 100 − 2·t; spec 85 → line meets spec at t = 7.5. residualSd = 0.
    const points = [0, 1, 2, 3, 4, 5].map(t => ({ time: t, value: 100 - 2 * t }));
    const r = estimateShelfLife({ points, specLimit: 85, direction: 'lower' });
    expect(r.slope).toBeCloseTo(-2, 8);
    expect(r.nominalCrossing).toBeCloseTo(7.5, 6);
    expect(r.shelfLife).toBeCloseTo(7.5, 1);
  });

  it('with scatter the confidence bound shortens shelf-life below the nominal crossing', () => {
    const points = [
      { time: 0, value: 100 },
      { time: 1, value: 97 },
      { time: 2, value: 99 },
      { time: 3, value: 94 },
      { time: 4, value: 93 },
      { time: 5, value: 90 },
    ];
    const r = estimateShelfLife({ points, specLimit: 85, direction: 'lower' });
    expect(r.shelfLife).not.toBeNull();
    expect(r.nominalCrossing).not.toBeNull();
    expect(r.shelfLife!).toBeLessThan(r.nominalCrossing!);
    expect(r.shelfLife!).toBeGreaterThan(0);
  });
});

describe('EP12 qualitative dose-response (C5–C95)', () => {
  it('recovers a known logistic and the C5/C50/C95 interval', () => {
    // proportions 0.25/0.5/0.75 at concentrations logit(0.25)/0/logit(0.75)
    // → perfect fit a=0, b=1.
    const L = Math.log(0.25 / 0.75); // -1.0986
    const r = fitQualitativeDoseResponse([
      { concentration: L, n: 4, positives: 1 },
      { concentration: 0, n: 4, positives: 2 },
      { concentration: -L, n: 4, positives: 3 },
    ]);
    expect(r.converged).toBe(true);
    expect(r.intercept).toBeCloseTo(0, 4);
    expect(r.slope).toBeCloseTo(1, 4);
    expect(r.c50).toBeCloseTo(0, 4);
    expect(r.c5).toBeCloseTo(Math.log(0.05 / 0.95), 3); // ≈ -2.944
    expect(r.c95).toBeCloseTo(Math.log(0.95 / 0.05), 3); // ≈ +2.944
    expect(r.c5).toBeLessThan(r.c50);
    expect(r.c50).toBeLessThan(r.c95);
  });

  it('rejects too few levels or invalid counts', () => {
    expect(() => fitQualitativeDoseResponse([{ concentration: 1, n: 4, positives: 1 }])).toThrow();
    expect(() =>
      fitQualitativeDoseResponse([
        { concentration: 1, n: 4, positives: 5 },
        { concentration: 2, n: 4, positives: 1 },
      ])
    ).toThrow();
  });
});
