/**
 * Unit tests for the deterministic Central Statistical Monitoring engine
 * (CluePoints SMART-style robust cross-site outlier detection).
 */

import { describe, it, expect } from 'vitest';
import {
  scoreCohort, severityFromScore, detectSiteOutliers, MIN_COHORT,
  scorePatientCohort, patientStatusFromScore,
  type SiteMetric, type PatientMetric,
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

describe('patientStatusFromScore', () => {
  it('maps |score| to a patient status', () => {
    expect(patientStatusFromScore(5)).toBe('flagged');
    expect(patientStatusFromScore(4)).toBe('review');
    expect(patientStatusFromScore(1)).toBe('normal');
  });
});

describe('scorePatientCohort', () => {
  const cohort: PatientMetric[] = [
    { subjectId: 'P1', siteId: 'S1', metrics: { queries: 2, deviations: 0 } },
    { subjectId: 'P2', siteId: 'S1', metrics: { queries: 3, deviations: 1 } },
    { subjectId: 'P3', siteId: 'S2', metrics: { queries: 2, deviations: 0 } },
    { subjectId: 'P4', siteId: 'S2', metrics: { queries: 3, deviations: 0 } },
    { subjectId: 'P5', siteId: 'S3', metrics: { queries: 40, deviations: 0 } }, // atypical
  ];
  it('flags the atypical patient and returns one entry per subject', () => {
    const out = scorePatientCohort(cohort);
    expect(out.length).toBe(cohort.length);
    const p5 = out.find(o => o.subjectId === 'P5')!;
    expect(p5.status).toBe('flagged');
    expect(p5.topDimension).toBe('queries');
    expect(p5.anomalyScore).toBeGreaterThan(4.5);
    const p1 = out.find(o => o.subjectId === 'P1')!;
    expect(p1.status).toBe('normal');
  });
  it('ignores dimensions present in fewer than the minimum cohort', () => {
    const sparse: PatientMetric[] = cohort.map((p, i) =>
      i === 0 ? { ...p, metrics: { ...p.metrics, rare: 999 } } : p);
    const out = scorePatientCohort(sparse);
    // `rare` appears once (< MIN_COHORT) so it must not drive a flag.
    expect(out.find(o => o.subjectId === 'P1')!.topDimension).not.toBe('rare');
  });

  it('returns the per-dimension breakdown that explains each score', () => {
    // A score alone is not actionable: "4.8, top dimension queries" cannot tell a
    // monitor one bad dimension from a patient atypical across the board.
    const out = scorePatientCohort(cohort);
    const p5 = out.find(o => o.subjectId === 'P5')!;
    expect(p5.dimensions.map(d => d.dimension).sort()).toEqual(['deviations', 'queries']);
    // Most extreme first, so the reason reads off the top of the list, and the
    // top entry agrees with topDimension / anomalyScore.
    expect(p5.dimensions[0].dimension).toBe('queries');
    expect(Math.abs(p5.dimensions[0].z)).toBe(p5.anomalyScore);
    expect(Math.abs(p5.dimensions[0].z)).toBeGreaterThanOrEqual(Math.abs(p5.dimensions[1].z));
  });

  it('keeps the sign, because the direction is the finding', () => {
    // Under-reporting looks like a NEGATIVE z. Reporting |z| would make a subject
    // with no adverse events at all indistinguishable from a very sick one.
    const under: PatientMetric[] = [
      { subjectId: 'A', siteId: 'S1', metrics: { aes: 30 } },
      { subjectId: 'B', siteId: 'S1', metrics: { aes: 31 } },
      { subjectId: 'C', siteId: 'S2', metrics: { aes: 30 } },
      { subjectId: 'D', siteId: 'S2', metrics: { aes: 32 } },
      { subjectId: 'E', siteId: 'S3', metrics: { aes: 0 } },
    ];
    const e = scorePatientCohort(under).find(o => o.subjectId === 'E')!;
    expect(e.dimensions[0].dimension).toBe('aes');
    expect(e.dimensions[0].z).toBeLessThan(0);
    // The aggregate score stays absolute — it ranks severity, not direction.
    expect(e.anomalyScore).toBeGreaterThan(0);
  });

  it('omits a dimension the cohort was too small to score, rather than zeroing it', () => {
    // An absent dimension means NOT COMPARABLE. A zero would read as "typical",
    // which is a claim the engine has no basis for.
    const sparse: PatientMetric[] = cohort.map((p, i) =>
      i === 0 ? { ...p, metrics: { ...p.metrics, rare: 999 } } : p);
    const p1 = scorePatientCohort(sparse).find(o => o.subjectId === 'P1')!;
    expect(p1.dimensions.some(d => d.dimension === 'rare')).toBe(false);
  });

  it('gives a subject with no comparable dimension an empty breakdown', () => {
    const alone: PatientMetric[] = [{ subjectId: 'X', siteId: null, metrics: { queries: 5 } }];
    const out = scorePatientCohort(alone);
    expect(out[0].dimensions).toEqual([]);
    expect(out[0].topDimension).toBeNull();
    expect(out[0].status).toBe('normal');
  });
});
