/**
 * Tests for the predictive CRL/RTF risk model.
 *
 * Scope: pure math only — sigmoid, dot product, trainLogistic. Anything that
 * touches the database is exercised through integration tests separately.
 */

import { describe, it, expect } from 'vitest';
import {
  sigmoid,
  dot,
  trainLogistic,
  scoreWithWeights,
  type RiskModelWeights,
} from '../risk-model';

describe('sigmoid', () => {
  it('returns 0.5 at zero', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10);
  });
  it('is bounded in (0, 1)', () => {
    expect(sigmoid(50)).toBeGreaterThan(0.999);
    expect(sigmoid(-50)).toBeLessThan(0.001);
  });
  it('is numerically stable for large negative inputs', () => {
    expect(sigmoid(-1000)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sigmoid(-1000))).toBe(true);
  });
});

describe('dot', () => {
  it('includes the intercept', () => {
    const z = dot({}, { intercept: 1.5 } as any, []);
    expect(z).toBeCloseTo(1.5);
  });
  it('skips missing features without throwing', () => {
    const z = dot({ a: 2 }, { intercept: 0, a: 3, b: 5 } as any, ['a', 'b']);
    expect(z).toBeCloseTo(6); // 0 + 3*2 + 5*0 — b missing falls to 0
  });
  it('ignores non-finite feature values', () => {
    const z = dot({ a: Number.NaN }, { intercept: 0, a: 1 } as any, ['a']);
    expect(z).toBeCloseTo(0);
  });
});

describe('trainLogistic', () => {
  it('separates two linearly-separable groups', () => {
    // Group A (label=true): completeness low, deficiencies high.
    // Group B (label=false): the opposite. Trivially separable.
    const samples = [
      ...Array.from({ length: 30 }, () => ({
        features: { completeness: 0.2, deficiencies: 0.9 },
        label: true,
      })),
      ...Array.from({ length: 30 }, () => ({
        features: { completeness: 0.9, deficiencies: 0.1 },
        label: false,
      })),
    ];
    const result = trainLogistic(samples, ['completeness', 'deficiencies'], {
      l2: 0.01,
      learningRate: 0.5,
      maxEpochs: 600,
    });

    expect(result.sampleSize).toBe(60);
    // Coefficient signs should reflect the relationship.
    expect(result.weights.completeness).toBeLessThan(0);   // higher completeness → lower risk
    expect(result.weights.deficiencies).toBeGreaterThan(0); // more deficiencies → higher risk
    // AUC near 1.0 on this trivially separable case.
    expect(result.auc).not.toBeNull();
    expect(result.auc!).toBeGreaterThan(0.9);
    expect(result.brier).not.toBeNull();
    expect(result.brier!).toBeLessThan(0.2);
  });

  it('produces a calibrated intercept on degenerate samples', () => {
    // All positives → intercept should be strongly positive (high prior).
    const samples = Array.from({ length: 20 }, () => ({
      features: { x: 0 },
      label: true,
    }));
    const result = trainLogistic(samples, ['x'], { maxEpochs: 50 });
    expect(result.weights.intercept).toBeGreaterThan(0);
    expect(result.positiveRate).toBeGreaterThan(0.5);
  });

  it('returns empty result for empty input', () => {
    const result = trainLogistic([], ['x']);
    expect(result.sampleSize).toBe(0);
    expect(result.logLoss).toBeNull();
    expect(result.auc).toBeNull();
  });

  it('respects holdout-fraction split for AUC', () => {
    const samples = [
      ...Array.from({ length: 50 }, () => ({ features: { x: 1 }, label: true })),
      ...Array.from({ length: 50 }, () => ({ features: { x: 0 }, label: false })),
    ];
    const result = trainLogistic(samples, ['x'], { holdoutFraction: 0.3, maxEpochs: 300 });
    // 30 holdout samples — AUC should be computable.
    expect(result.auc).not.toBeNull();
    expect(result.auc!).toBeGreaterThan(0.9);
  });
});

describe('scoreWithWeights', () => {
  it('produces a probability in [0, 1]', () => {
    const model: RiskModelWeights = {
      target: 'rtf',
      featureNames: ['a', 'b'],
      weights: { intercept: -0.5, a: 2, b: -1 } as any,
      versionId: 'test',
      sampleSize: 100,
      positiveRate: 0.3,
      logLoss: null,
      auc: null,
      brier: null,
      trainedAt: '2026-05-20T00:00:00Z',
    };
    const p1 = scoreWithWeights({ a: 1, b: 0 }, model);
    expect(p1).toBeGreaterThan(0);
    expect(p1).toBeLessThan(1);
    // sigmoid(-0.5 + 2*1 - 1*0) = sigmoid(1.5) ≈ 0.818
    expect(p1).toBeCloseTo(0.818, 2);
  });
});
