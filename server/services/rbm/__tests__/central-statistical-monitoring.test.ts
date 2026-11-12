/**
 * Unit tests for the deterministic Central Statistical Monitoring engine
 * (CluePoints SMART-style robust cross-site outlier detection).
 */

import { describe, it, expect } from 'vitest';
import {
  scoreCohort, severityFromScore, detectSiteOutliers, MIN_COHORT,
  scorePatientCohort, patientStatusFromScore,
  type SiteMetric, type PatientMetric,
  detectSiteIndicatorOutliers, type SiteIndicatorCohortRow,
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


/**
 * A snapshot scored from the study's own site-level indicators is scanned indicator by indicator (GA-S8-02
 * follow-on, 2026-11-11). Scanning its composite found nothing on LMN-201: five of eight sites tie at 0, so the MAD
 * is 0, and the classic z it falls back to cannot reach 3.5 in a cohort under 15 (its maximum is (n-1)/sqrt(n)).
 * The readings themselves are what a cross-site comparison is for.
 */
describe('detectSiteIndicatorOutliers — each site-level indicator across the study\'s sites', () => {
  const reading = (kriName: string, value: number, over: Record<string, unknown> = {}) => ({ kriName, value, unit: 'days', direction: 'higher_worse' as const, ...over });
  const site = (siteNumber: string, indicators: ReturnType<typeof reading>[]): SiteIndicatorCohortRow => ({ siteId: siteNumber, siteNumber, indicators });
  const LMN = [
    site('101', [reading('Open query aging', 12), reading('AE reporting lag', 3)]),
    site('102', [reading('Open query aging', 10), reading('AE reporting lag', 2)]),
    site('103', [reading('Open query aging', 14), reading('AE reporting lag', 4)]),
    site('104', [reading('Open query aging', 58), reading('AE reporting lag', 21)]),
    site('105', [reading('Open query aging', 11), reading('AE reporting lag', 3)]),
    site('106', [reading('Open query aging', 16), reading('AE reporting lag', 5)]),
    site('107', [reading('Open query aging', 6), reading('AE reporting lag', 3)]),
    site('108', [reading('Open query aging', 2), reading('AE reporting lag', 2)]),
  ];

  it('flags the site whose reading stands apart, on each indicator, with the value, the study median and the cohort size', () => {
    const findings = detectSiteIndicatorOutliers(LMN);
    expect(findings.map((f) => [f.siteNumber, f.dimension])).toEqual([['104', 'AE reporting lag'], ['104', 'Open query aging']]);
    const aging = findings.find((f) => f.dimension === 'Open query aging')!;
    expect(aging).toMatchObject({ value: 58, unit: 'days', cohortMedian: 11.5, cohortSize: 8, direction: 'higher_worse', severity: 'critical' });
    expect(aging.score).toBeGreaterThan(5);
  });

  it('the composite of the same sites cannot flag anything, which is why the readings are scanned', () => {
    const composite = [100, 50, 25, 0, 0, 0, 0, 0].map((v, i) => ({ siteId: String(i), siteNumber: String(i), metrics: { composite: v } }));
    expect(detectSiteOutliers(composite, ['composite'])).toEqual([]);
  });

  it('a lower-is-worse indicator is flagged on its low side, and reports the reading as recorded', () => {
    const sites = [97, 98, 99, 96, 98, 97, 99, 41].map((v, i) => site(`20${i}`, [reading('Consent completeness', v, { unit: '%', direction: 'lower_worse' })]));
    const findings = detectSiteIndicatorOutliers(sites);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ siteNumber: '207', dimension: 'Consent completeness', value: 41, unit: '%', direction: 'lower_worse', cohortMedian: 97.5 });
    // A site far better than its peers is not a finding, in either direction.
    const better = [12, 11, 13, 12, 14, 11, 13, 0].map((v, i) => site(`30${i}`, [reading('Open query aging', v)]));
    expect(detectSiteIndicatorOutliers(better)).toEqual([]);
  });

  it('an indicator read at fewer than five sites is not scanned, and one with no limit still is', () => {
    const few = LMN.slice(0, 4);
    expect(detectSiteIndicatorOutliers(few)).toEqual([]);
    const unbanded = LMN.map((s) => ({ ...s, indicators: [reading('Screen failures', s.siteNumber === '104' ? 40 : 3, { unit: null })] }));
    expect(detectSiteIndicatorOutliers(unbanded).map((f) => [f.siteNumber, f.dimension, f.unit])).toEqual([['104', 'Screen failures', null]]);
  });

  it('where most sites tie, the score takes the mean-absolute-deviation form, which can still tell one site apart', () => {
    const tied = [3, 3, 3, 40, 3, 3, 3, 3];
    // The default fallback, classic z, tops out at (n-1)/sqrt(n) = 2.47 for eight sites: under the 3.5 threshold.
    expect(Math.max(...scoreCohort(tied).map((s) => s.score))).toBeLessThan(3.5);
    const robust = scoreCohort(tied, { whenTied: 'mean_absolute_deviation' });
    expect(robust[3]).toMatchObject({ method: 'modified_z_meanad', score: 6.383 });
    expect(robust.filter((s) => s.score !== 0)).toHaveLength(1);
    // With a spread the two agree: the option changes nothing unless the MAD is 0.
    const spread = [12, 10, 14, 58, 11, 16, 6, 2];
    expect(scoreCohort(spread, { whenTied: 'mean_absolute_deviation' })).toEqual(scoreCohort(spread));
  });
});
