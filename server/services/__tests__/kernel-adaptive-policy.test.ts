import { describe, expect, test, vi} from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

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

