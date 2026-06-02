/**
 * Tests for rim-claim-metrics — how a turn's structure, evidence-discipline and
 * grounding verdicts collapse into the two numbers RIM consumes (claimCount +
 * supportedClaimRate). The contract that matters for anti-hallucination: when
 * the grounding round actually checked claims and found fabrication, the
 * supported rate must drop below the structure-only floor.
 */
import { describe, it, expect } from 'vitest';
import { computeRimClaimMetrics } from '../rim-claim-metrics.js';

describe('computeRimClaimMetrics — baseline (no checkable claims)', () => {
  it('falls back to the 0.5 floor with no signals at all', () => {
    const r = computeRimClaimMetrics({ structure: null, evidence: null, grounding: null });
    expect(r).toEqual({ claimCount: 0, supportedClaimRate: 0.5 });
  });

  it('uses the structure ratio and label count when no grounding ran', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 3, maxScore: 6 },
      evidence: { totalLabels: 4 },
      grounding: null,
    });
    expect(r.claimCount).toBe(4); // max(totalLabels, structureScorePositive)
    expect(r.supportedClaimRate).toBeCloseTo(0.5);
  });

  it('treats grounding with zero checks identically to no grounding', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 2, maxScore: 4 },
      evidence: null,
      grounding: { checked: 0, ratio: 1 },
    });
    expect(r.claimCount).toBe(1); // structureScorePositive floor
    expect(r.supportedClaimRate).toBeCloseTo(0.5);
  });
});

describe('computeRimClaimMetrics — grounding measurement folds in', () => {
  it('blends a perfect grounding ratio above the structure floor', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 2, maxScore: 4 }, // structureRate 0.5
      evidence: { totalLabels: 2 },
      grounding: { checked: 3, ratio: 1 },
    });
    expect(r.claimCount).toBe(3); // max(baseClaimCount=2, checked=3)
    expect(r.supportedClaimRate).toBeCloseTo(0.75); // (0.5 + 1) / 2
  });

  it('drags the rate down when grounding caught fabrication', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 4, maxScore: 4 }, // structureRate 1.0 — looks great structurally
      evidence: null,
      grounding: { checked: 2, ratio: 0 }, // but every checkable claim was unsupported
    });
    expect(r.claimCount).toBe(2);
    expect(r.supportedClaimRate).toBeCloseTo(0.5); // (1 + 0) / 2 — fabrication pulls it down
  });
});
