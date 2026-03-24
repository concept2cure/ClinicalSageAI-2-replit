import { describe, expect, test } from 'vitest';
import { computeKernelOutcomeScore } from '../kernel-adaptive-policy';

describe('kernel-adaptive-policy', () => {
  test('keeps high quality score near 1 when latency/cost are low', () => {
    const score = computeKernelOutcomeScore({
      qualityScore: 0.95,
      latencyMs: 900,
      estimatedCostUsd: 0.02,
    });
    expect(score).toBeGreaterThan(0.85);
  });

  test('penalizes high latency and high cost', () => {
    const score = computeKernelOutcomeScore({
      qualityScore: 0.8,
      latencyMs: 20000,
      estimatedCostUsd: 3,
    });
    expect(score).toBeLessThan(0.6);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

