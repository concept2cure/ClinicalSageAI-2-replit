/**
 * Monte-Carlo probabilistic layer tests.
 */

import { describe, it, expect } from 'vitest';
import {
  percentile,
  diagnosticAccuracyMonteCarlo,
  reviewOutcomeMonteCarlo,
  timeToMarketMonteCarlo,
} from '../monte-carlo';

describe('percentile', () => {
  it('interpolates within a sorted array', () => {
    expect(percentile([0, 10], 50)).toBeCloseTo(5, 6);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
  });
});

describe('diagnosticAccuracyMonteCarlo', () => {
  it('produces credible intervals bracketing the point estimates', () => {
    // tp=90, fn=10 → sens ~0.9 ; tn=95, fp=5 → spec ~0.95
    const r = diagnosticAccuracyMonteCarlo({ tp: 90, fp: 5, fn: 10, tn: 95, seed: 42 });
    expect(r.sensitivity.median).toBeGreaterThan(0.82);
    expect(r.sensitivity.median).toBeLessThan(0.96);
    expect(r.sensitivity.p2_5).toBeLessThan(r.sensitivity.median);
    expect(r.sensitivity.p97_5).toBeGreaterThan(r.sensitivity.median);
    expect(r.specificity.median).toBeGreaterThan(0.88);
  });

  it('is reproducible for a fixed seed', () => {
    const a = diagnosticAccuracyMonteCarlo({ tp: 50, fp: 10, fn: 5, tn: 100, seed: 7, iterations: 3000 });
    const b = diagnosticAccuracyMonteCarlo({ tp: 50, fp: 10, fn: 5, tn: 100, seed: 7, iterations: 3000 });
    expect(a.sensitivity.median).toBe(b.sensitivity.median);
    expect(a.specificity.p2_5).toBe(b.specificity.p2_5);
  });

  it('wider intervals for smaller samples', () => {
    const small = diagnosticAccuracyMonteCarlo({ tp: 9, fp: 1, fn: 1, tn: 9, seed: 1 });
    const large = diagnosticAccuracyMonteCarlo({ tp: 900, fp: 100, fn: 100, tn: 900, seed: 1 });
    const smallWidth = small.sensitivity.p97_5 - small.sensitivity.p2_5;
    const largeWidth = large.sensitivity.p97_5 - large.sensitivity.p2_5;
    expect(smallWidth).toBeGreaterThan(largeWidth);
  });

  it('rejects non-integer cells', () => {
    expect(() => diagnosticAccuracyMonteCarlo({ tp: 1.5, fp: 1, fn: 1, tn: 1 })).toThrow();
  });
});

describe('reviewOutcomeMonteCarlo', () => {
  it('high completion probabilities yield high acceptance probability', () => {
    const r = reviewOutcomeMonteCarlo({
      profile: { pathway: '510k', assayType: 'quantitative', intendedUse: 'diagnosis' },
      evidenceProbabilities: {
        analyticalPrecision: 0.98, detectionCapability: 0.98, linearity: 0.98, interference: 0.98,
        methodComparison: 0.98, stability: 0.98, traceability: 0.98, clinicalPerformance: 0.98,
        scientificValidity: 0.98, intendedUseMatchesPredicate: 0.98,
      },
      iterations: 2000, seed: 11,
    });
    expect(r.verdictProbabilities.likely_acceptance).toBeGreaterThan(0.5);
    expect(r.readinessScore.mean).toBeGreaterThan(80);
  });

  it('low completion probabilities yield mostly incomplete outcomes', () => {
    const r = reviewOutcomeMonteCarlo({
      profile: { pathway: 'pma', assayType: 'ngs', intendedUse: 'cdx' },
      evidenceProbabilities: { analyticalPrecision: 0.1, clinicalPerformance: 0.1 },
      iterations: 2000, seed: 11,
    });
    expect(r.verdictProbabilities.not_substantially_complete).toBeGreaterThan(0.5);
    expect(r.probabilitySubstantiallyComplete).toBeLessThan(0.5);
  });

  it('is reproducible for a fixed seed', () => {
    const args = {
      profile: { pathway: '510k' as const, assayType: 'qualitative' as const, intendedUse: 'screening' as const },
      evidenceProbabilities: { detectionCapability: 0.5, cutoffValidation: 0.5, clinicalPerformance: 0.5 },
      iterations: 1500, seed: 99,
    };
    expect(reviewOutcomeMonteCarlo(args).readinessScore.mean).toBe(reviewOutcomeMonteCarlo(args).readinessScore.mean);
  });
});

describe('timeToMarketMonteCarlo', () => {
  const phases = [
    { name: 'Analytical', studyWeeks: [4, 3, 2, 12] },
    { name: 'Clinical', studyWeeks: [18] },
  ];

  it('total ≈ sum of phase parallel durations, with slippage skew', () => {
    const r = timeToMarketMonteCarlo({ phases, seed: 5, iterations: 3000 });
    // Phase 1 parallel ≈ max(12), Phase 2 ≈ 18 → mode total ≈ 30, with upside.
    expect(r.totalWeeks.median).toBeGreaterThan(25);
    expect(r.p90Weeks).toBeGreaterThan(r.p50Weeks);
    expect(r.perPhase).toHaveLength(2);
    expect(r.perPhase[0].name).toBe('Analytical');
  });

  it('is reproducible for a fixed seed', () => {
    const a = timeToMarketMonteCarlo({ phases, seed: 3, iterations: 2000 });
    const b = timeToMarketMonteCarlo({ phases, seed: 3, iterations: 2000 });
    expect(a.totalWeeks.mean).toBe(b.totalWeeks.mean);
  });

  it('rejects empty phases', () => {
    expect(() => timeToMarketMonteCarlo({ phases: [] })).toThrow();
  });
});
