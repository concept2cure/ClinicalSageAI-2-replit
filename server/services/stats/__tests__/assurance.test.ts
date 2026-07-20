/**
 * Pins powerTwoSampleMeans against textbook power anchors. This is the normal-
 * approximation two-sample power the ReportEngine protocol-analysis insights
 * render (server/routes/analytics-routes.ts), so a regression here would put a
 * wrong power figure in front of a user — the exact failure mode we just closed
 * (that surface previously used a fabricated `Math.min(0.99, 0.4 + n*d/100)`).
 */
import { describe, expect, it } from 'vitest';

import { powerTwoSampleMeans } from '../assurance';

describe('powerTwoSampleMeans', () => {
  // Canonical anchor: a two-sample test needs ~64/arm for ~80% power to detect a
  // medium effect (Cohen's d = 0.5) at two-sided α=0.05.
  it('matches the canonical ~80% power at d=0.5, n=64/arm (α=0.05 two-sided)', () => {
    expect(powerTwoSampleMeans(0.5, 64, 0.05, false)).toBeCloseTo(0.807, 2);
  });

  it('is underpowered for a small effect at that size (d=0.2, n=64/arm)', () => {
    expect(powerTwoSampleMeans(0.2, 64, 0.05, false)).toBeCloseTo(0.204, 2);
  });

  it('is near-certain for a large effect at that size (d=0.8, n=64/arm)', () => {
    expect(powerTwoSampleMeans(0.8, 64, 0.05, false)).toBeGreaterThan(0.99);
  });

  it('collapses to the nominal one-tail level at zero effect', () => {
    // With no true effect the rejection probability is the critical-value tail
    // area — a basic sanity anchor (≈ α/2 = 0.025 for two-sided α=0.05).
    expect(powerTwoSampleMeans(0, 64, 0.05, false)).toBeCloseTo(0.025, 3);
  });

  it('increases monotonically with sample size and with effect size', () => {
    expect(powerTwoSampleMeans(0.5, 100, 0.05, false)).toBeGreaterThan(
      powerTwoSampleMeans(0.5, 40, 0.05, false),
    );
    expect(powerTwoSampleMeans(0.8, 64, 0.05, false)).toBeGreaterThan(
      powerTwoSampleMeans(0.3, 64, 0.05, false),
    );
  });

  it('one-sided α=0.025 equals two-sided α=0.05 (same critical value)', () => {
    expect(powerTwoSampleMeans(0.5, 64, 0.025, true)).toBeCloseTo(
      powerTwoSampleMeans(0.5, 64, 0.05, false),
      6,
    );
  });

  it('returns 0 for a non-positive per-arm sample size', () => {
    expect(powerTwoSampleMeans(0.5, 0, 0.05, false)).toBe(0);
    expect(powerTwoSampleMeans(0.5, -10, 0.05, false)).toBe(0);
  });
});
