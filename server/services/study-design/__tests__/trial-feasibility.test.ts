/**
 * Operational trial-feasibility model — unit tests. Every figure must be a
 * count-based statistic; too-few-resolved must yield insufficient_evidence (no
 * invented rate); Wilson intervals must bracket the point estimate.
 */
import { describe, it, expect } from 'vitest';
import { assessFeasibility, wilsonInterval, type TrialComparator } from '../trial-feasibility';

function trial(status: string, enrollment: number | null = null, extra: Partial<TrialComparator> = {}): TrialComparator {
  return { status, enrollment, ...extra };
}

describe('wilsonInterval', () => {
  it('brackets the point estimate and stays in [0,1]', () => {
    const [lo, hi] = wilsonInterval(8, 10);
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeLessThan(0.8);
    expect(hi).toBeGreaterThan(0.8);
  });
  it('is degenerate for n = 0', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 0]);
  });
});

describe('assessFeasibility — insufficient evidence guard', () => {
  it('returns insufficient_evidence and null rates when too few trials resolved', () => {
    const r = assessFeasibility([trial('completed', 100), trial('recruiting'), trial('recruiting')]);
    expect(r.verdict).toBe('insufficient_evidence');
    expect(r.completionRate).toBeNull();
    expect(r.discontinuationRate).toBeNull();
    expect(r.resolved).toBe(1);
    // Still reports the competitive field even without a rate.
    expect(r.activeCompetitors).toBe(2);
  });
});

describe('assessFeasibility — empirical rates', () => {
  const comparators: TrialComparator[] = [
    ...Array.from({ length: 8 }, (_, i) => trial('completed', 100 + i * 10, { startDate: '2020-01-01', completionDate: '2022-01-01', sponsor: `S${i % 3}` })),
    trial('terminated', null, { sponsor: 'S9' }),
    trial('withdrawn', null, { sponsor: 'S9' }),
    trial('recruiting', null, { sponsor: 'S10' }),
    trial('active_not_recruiting', null, { sponsor: 'S10' }),
  ];

  it('computes completion rate over resolved trials with a Wilson CI', () => {
    const r = assessFeasibility(comparators);
    expect(r.resolved).toBe(10); // 8 completed + 1 terminated + 1 withdrawn
    expect(r.completionRate?.of).toEqual({ count: 8, total: 10 });
    expect(r.completionRate?.rate).toBe(0.8);
    expect(r.completionRate!.ci95[0]).toBeLessThan(0.8);
    expect(r.completionRate!.ci95[1]).toBeGreaterThan(0.8);
    expect(r.verdict).toBe('favorable'); // 0.8 → favorable
  });

  it('summarizes completed-trial enrollment distribution', () => {
    const r = assessFeasibility(comparators);
    expect(r.enrollment?.n).toBe(8);
    expect(r.enrollment?.median).toBeGreaterThan(0);
    expect(r.enrollment?.min).toBe(100);
    expect(r.enrollment?.max).toBe(170);
  });

  it('counts active competitors, distinct sponsors, and median duration', () => {
    const r = assessFeasibility(comparators);
    expect(r.activeCompetitors).toBe(2);
    expect(r.distinctSponsors).toBeGreaterThanOrEqual(4); // S0,S1,S2,S9,S10
    expect(r.medianDurationMonths).toBeGreaterThan(20); // ~24 months
  });

  it('grades a low completion rate as challenging and flags high discontinuation', () => {
    const lowCompletion: TrialComparator[] = [
      ...Array.from({ length: 4 }, () => trial('completed', 50)),
      ...Array.from({ length: 6 }, () => trial('terminated')),
    ];
    const r = assessFeasibility(lowCompletion);
    expect(r.completionRate?.rate).toBe(0.4);
    expect(r.verdict).toBe('challenging');
    expect(r.findings.some(f => /discontinuation/i.test(f))).toBe(true);
  });
});
