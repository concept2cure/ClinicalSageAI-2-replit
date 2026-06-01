/**
 * Tests for RIM claim metrics (server/services/ana/rim-claim-metrics.ts).
 */

import { describe, it, expect } from 'vitest';
import { computeRimClaimMetrics } from '../../server/services/ana/rim-claim-metrics';

describe('computeRimClaimMetrics', () => {
  it('preserves the prior structure-proxy behaviour when nothing was grounded', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 6, maxScore: 8 },
      evidence: { totalLabels: 3 },
      grounding: null,
    });
    expect(r.claimCount).toBe(3); // max(3 labels, 1 structure-positive)
    expect(r.supportedClaimRate).toBeCloseTo(0.75); // 6/8
  });

  it('defaults the rate to 0.5 when there is no structure signal', () => {
    const r = computeRimClaimMetrics({ structure: null, evidence: null, grounding: null });
    expect(r.claimCount).toBe(0);
    expect(r.supportedClaimRate).toBe(0.5);
  });

  it('treats an empty grounding check as no signal', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 4, maxScore: 8 },
      evidence: { totalLabels: 1 },
      grounding: { checked: 0, ratio: 1 },
    });
    expect(r.supportedClaimRate).toBeCloseTo(0.5); // 4/8, grounding ignored
    expect(r.claimCount).toBe(1);
  });

  it('blends grounding into the rate when claims were checked', () => {
    // structureRate 1.0, grounding 0.5 → average 0.75
    const r = computeRimClaimMetrics({
      structure: { score: 8, maxScore: 8 },
      evidence: { totalLabels: 0 },
      grounding: { checked: 4, ratio: 0.5 },
    });
    expect(r.supportedClaimRate).toBeCloseTo(0.75);
    expect(r.claimCount).toBe(4); // grounding-checked dominates
  });

  it('lets fabrication drag a structurally-clean answer down', () => {
    // perfect structure but every checked claim unsupported
    const r = computeRimClaimMetrics({
      structure: { score: 8, maxScore: 8 },
      evidence: { totalLabels: 0 },
      grounding: { checked: 2, ratio: 0 },
    });
    expect(r.supportedClaimRate).toBeCloseTo(0.5); // (1.0 + 0)/2
  });

  it('counts the larger of label-based and grounding-based claim counts', () => {
    const r = computeRimClaimMetrics({
      structure: { score: 2, maxScore: 8 },
      evidence: { totalLabels: 9 },
      grounding: { checked: 3, ratio: 1 },
    });
    expect(r.claimCount).toBe(9); // labels exceed grounding-checked
  });
});
