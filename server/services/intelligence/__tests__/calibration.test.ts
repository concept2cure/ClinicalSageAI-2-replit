/**
 * Tests for the Platt-scaling confidence calibrator.
 */

import { describe, it, expect } from 'vitest';
import { fitPlatt, applyPlatt, brierScore, logLoss } from '../calibration';

describe('fitPlatt', () => {
  it('returns the no-op prior on empty input', () => {
    const { a, b } = fitPlatt([]);
    expect(a).toBe(0);
    expect(b).toBe(1);
  });

  it('ignores raw signal when all labels are the same (no variance)', () => {
    const pairs = Array.from({ length: 20 }, () => ({ raw: 0.5, label: true }));
    const { b } = fitPlatt(pairs);
    expect(b).toBe(0);
  });

  it('learns an inverted slope when the model is anti-correlated with truth', () => {
    // High raw confidence → label=false. A well-fit Platt should invert.
    const pairs = [
      ...Array.from({ length: 40 }, () => ({ raw: 0.9, label: false })),
      ...Array.from({ length: 40 }, () => ({ raw: 0.1, label: true })),
    ];
    const { b } = fitPlatt(pairs, { maxEpochs: 400, learningRate: 0.5 });
    expect(b).toBeLessThan(0);
  });

  it('learns a positive slope when raw is correlated with truth', () => {
    const pairs = [
      ...Array.from({ length: 40 }, () => ({ raw: 0.9, label: true })),
      ...Array.from({ length: 40 }, () => ({ raw: 0.1, label: false })),
    ];
    const { b } = fitPlatt(pairs, { maxEpochs: 400, learningRate: 0.5 });
    expect(b).toBeGreaterThan(0);
  });

  it('approximates the base rate when raw has no predictive power', () => {
    // Raw is 0.5 for all samples; 30% of labels are true.
    const pairs = [
      ...Array.from({ length: 30 }, () => ({ raw: 0.5, label: true })),
      ...Array.from({ length: 70 }, () => ({ raw: 0.5, label: false })),
    ];
    const { a, b } = fitPlatt(pairs, { maxEpochs: 400, learningRate: 0.5 });
    const predicted = applyPlatt(0.5, a, b);
    expect(predicted).toBeGreaterThan(0.2);
    expect(predicted).toBeLessThan(0.4);
  });
});

describe('applyPlatt', () => {
  it('produces values in (0, 1)', () => {
    const v = applyPlatt(0.5, 0, 1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });

  it('clamps raw outside [0, 1] safely', () => {
    expect(applyPlatt(2, 0, 1)).toBeCloseTo(applyPlatt(1, 0, 1), 5);
    expect(applyPlatt(-1, 0, 1)).toBeCloseTo(applyPlatt(0, 0, 1), 5);
  });

  it('returns NaN for non-finite input', () => {
    expect(Number.isNaN(applyPlatt(Number.NaN, 0, 1))).toBe(true);
  });
});

describe('brierScore and logLoss', () => {
  it('zero for a perfect calibrator', () => {
    const pairs = [
      { raw: 0.9, label: true },
      { raw: 0.1, label: false },
    ];
    // Make Platt return (a=20, b=0): always sigmoid(20) ≈ 1. Then label
    // matches. We use realistic values: pick a model that returns near
    // perfect probabilities.
    const a = 50;
    const b = -100;
    // Platt: sigmoid(50 + -100 * raw). raw=0.9 → sigmoid(-40)≈0 (label false: matches if label were false)
    // raw=0.1 → sigmoid(40)≈1 (label true: matches if label were true)
    // Our labels are inverted, so let me match: raw=0.9 → label=true. Try other coefs.
    // sigmoid(-50 + 100 * raw): raw=0.9 → sigmoid(40)≈1 ✓, raw=0.1 → sigmoid(-40)≈0 ✓
    const brier = brierScore(pairs, -50, 100);
    expect(brier).toBeLessThan(0.001);
    const ll = logLoss(pairs, -50, 100);
    expect(ll).toBeLessThan(0.01);
  });

  it('returns 0 on empty input', () => {
    expect(brierScore([], 0, 1)).toBe(0);
    expect(logLoss([], 0, 1)).toBe(0);
  });
});
