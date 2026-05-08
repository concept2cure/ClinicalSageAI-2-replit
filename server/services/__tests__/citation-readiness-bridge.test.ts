/**
 * Tests for the citation → readiness bridge math. The pure derivation
 * function takes a list of artifact statuses and produces a readiness-
 * shaped impact; we lock down its arithmetic without touching the DB.
 */

import { describe, it, expect } from 'vitest';
import { deriveCitationReadinessImpact } from '../ana/citation-readiness-bridge';
import type { ProjectArtifactCitationStatus } from '../ana/citation-engine';

function art(over: Partial<ProjectArtifactCitationStatus> = {}): ProjectArtifactCitationStatus {
  return {
    artifactId: 'a',
    artifactPk: 1,
    ctdSection: '5.3.5',
    title: 'CSR',
    citationRunId: 'run',
    citationsAt: new Date().toISOString(),
    isStale: false,
    totalSentences: 0,
    supportedCount: 0,
    contradictedCount: 0,
    gapCount: 0,
    totalReadinessDelta: 0,
    filingBlocked: false,
    hasCitations: true,
    ...over,
  };
}

describe('citation-readiness-bridge · deriveCitationReadinessImpact', () => {
  const NOW = new Date('2026-05-08T00:00:00Z');

  it('returns a zeroed impact for an empty project', () => {
    const out = deriveCitationReadinessImpact(1, 1, [], { now: NOW });
    expect(out.citationCoverage).toBe(0);
    expect(out.citationGapPenalty).toBe(0);
    expect(out.rawReadinessDelta).toBe(0);
    expect(out.filingBlocked).toBe(false);
    expect(out.totalArtifactCount).toBe(0);
    expect(out.citedArtifactCount).toBe(0);
    expect(out.staleArtifactCount).toBe(0);
    expect(out.completenessDelta).toBe(100); // 0 coverage → 100 delta
    expect(out.complianceDelta).toBe(0);
    expect(out.artifactImpacts).toEqual([]);
  });

  it('computes coverage from supported / total sentences', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ totalSentences: 10, supportedCount: 8, gapCount: 2 }),
        art({ artifactId: 'b', totalSentences: 10, supportedCount: 6, gapCount: 4 }),
      ],
      { now: NOW }
    );
    // Total: 14/20 supported = 70%
    expect(out.citationCoverage).toBe(70);
    expect(out.completenessDelta).toBe(30);
  });

  it('sums readinessDelta across artifacts and clamps gap penalty', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ totalSentences: 5, supportedCount: 3, totalReadinessDelta: -18 }),
        art({ artifactId: 'b', totalSentences: 5, supportedCount: 4, totalReadinessDelta: -8 }),
        art({ artifactId: 'c', totalSentences: 5, supportedCount: 4, totalReadinessDelta: -2 }),
      ],
      { now: NOW }
    );
    expect(out.rawReadinessDelta).toBe(-28);
    // |sum| clamped to 100 — here 28
    expect(out.citationGapPenalty).toBe(28);
    expect(out.complianceDelta).toBe(28);
  });

  it('clamps gap penalty when raw delta exceeds 100', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ totalSentences: 1, supportedCount: 0, totalReadinessDelta: -150 }),
      ],
      { now: NOW }
    );
    expect(out.rawReadinessDelta).toBe(-150);
    expect(out.citationGapPenalty).toBe(100);
    expect(out.complianceDelta).toBe(100);
  });

  it('flags filingBlocked when any artifact blocks', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ filingBlocked: false, totalReadinessDelta: -2 }),
        art({ artifactId: 'b', filingBlocked: true, totalReadinessDelta: -18 }),
      ],
      { now: NOW }
    );
    expect(out.filingBlocked).toBe(true);
  });

  it('counts cited and stale artifacts separately', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ hasCitations: true, isStale: false }),
        art({ artifactId: 'b', hasCitations: true, isStale: true }),
        art({ artifactId: 'c', hasCitations: false, isStale: null }),
      ],
      { now: NOW }
    );
    expect(out.totalArtifactCount).toBe(3);
    expect(out.citedArtifactCount).toBe(2);
    expect(out.staleArtifactCount).toBe(1);
  });

  it('sorts artifactImpacts by filingBlocked, then most negative readinessDelta', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ artifactId: 'a', filingBlocked: false, totalReadinessDelta: -2 }),
        art({ artifactId: 'b', filingBlocked: true, totalReadinessDelta: -18 }),
        art({ artifactId: 'c', filingBlocked: false, totalReadinessDelta: -8 }),
      ],
      { now: NOW }
    );
    expect(out.artifactImpacts.map(i => i.artifactId)).toEqual(['b', 'c', 'a']);
  });

  it('does not include uncited artifacts in artifactImpacts list', () => {
    const out = deriveCitationReadinessImpact(
      1,
      1,
      [
        art({ artifactId: 'a', hasCitations: true }),
        art({ artifactId: 'b', hasCitations: false, totalSentences: null, gapCount: null }),
      ],
      { now: NOW }
    );
    expect(out.artifactImpacts).toHaveLength(1);
    expect(out.artifactImpacts[0].artifactId).toBe('a');
  });

  it('emits asOf timestamp from injected now', () => {
    const out = deriveCitationReadinessImpact(1, 1, [], { now: NOW });
    expect(out.asOf).toBe(NOW.toISOString());
  });
});
