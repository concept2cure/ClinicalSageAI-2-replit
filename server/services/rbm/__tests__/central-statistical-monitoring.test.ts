/**
 * Unit tests for the deterministic Central Statistical Monitoring engine
 * (CluePoints SMART-style robust cross-site outlier detection).
 */

import { describe, it, expect } from 'vitest';
import {
  scoreCohort, severityFromScore, detectSiteOutliers, MIN_COHORT, type SiteMetric,
} from '../central-statistical-monitoring';

describe('scoreCohort', () => {
  it('gives a large robust z to a clear high outlier', () => {
    const scores = scoreCohort([10, 11, 9, 10, 100]);
    expect(scores[4].method).toBe('modified_z');
    expect(scores[4].score).toBeGreaterThan(3.5);
    expect(Math.abs(scores[0].score)).toBeLessThan(3.5);
  });
  it('falls back to z-score when MAD is degenerate', () => {
    const scores = scoreCohort([5, 5, 5, 5, 9]);
    expect(scores[4].method).toBe('z');
    expect(scores[4].score).toBeGreaterThan(0);
  });
  it('returns zero scores for a flat cohort', () => {
    expect(scoreCohort([7, 7, 7]).every(s => s.score === 0)).toBe(true);
  });
});

describe('severityFromScore', () => {
  it('maps |z| to severity, null below 3.5', () => {
    expect(severityFromScore(5.1)).toBe('critical');
    expect(severityFromScore(4.6)).toBe('high');
    expect(severityFromScore(3.6)).toBe('medium');
    expect(severityFromScore(2)).toBeNull();
  });
});

describe('detectSiteOutliers', () => {
  const cohort: SiteMetric[] = [
    { siteId: '1', siteNumber: 'S1', metrics: { composite: 20 } },
    { siteId: '2', siteNumber: 'S2', metrics: { composite: 22 } },
    { siteId: '3', siteNumber: 'S3', metrics: { composite: 19 } },
    { siteId: '4', siteNumber: 'S4', metrics: { composite: 21 } },
    { siteId: '5', siteNumber: 'S5', metrics: { composite: 95 } }, // outlier
  ];
  it('flags the high-side outlier site only', () => {
    const f = detectSiteOutliers(cohort, ['composite']);
    expect(f.length).toBe(1);
    expect(f[0].siteNumber).toBe('S5');
    expect(f[0].dimension).toBe('composite');
    expect(['medium', 'high', 'critical']).toContain(f[0].severity);
  });
  it('returns nothing below the minimum cohort size', () => {
    const tiny = cohort.slice(0, MIN_COHORT - 1);
    expect(detectSiteOutliers(tiny, ['composite'])).toEqual([]);
  });
  it('does not flag low-side (better-than-peers) values', () => {
    const c: SiteMetric[] = [
      { siteId: '1', siteNumber: 'S1', metrics: { composite: 80 } },
      { siteId: '2', siteNumber: 'S2', metrics: { composite: 82 } },
      { siteId: '3', siteNumber: 'S3', metrics: { composite: 79 } },
      { siteId: '4', siteNumber: 'S4', metrics: { composite: 81 } },
      { siteId: '5', siteNumber: 'S5', metrics: { composite: 5 } }, // low outlier = good
    ];
    expect(detectSiteOutliers(c, ['composite'])).toEqual([]);
  });
});
