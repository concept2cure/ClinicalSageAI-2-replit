/**
 * Submission economics — composed fee + review-timeline projection.
 */

import { describe, it, expect } from 'vitest';
import { projectSubmissionEconomics } from '../submission-economics';

describe('projectSubmissionEconomics', () => {
  it('combines fees + timeline for an FDA NDA (standard review)', () => {
    const e = projectSubmissionEconomics({ market: 'FDA', procedure: 'NDA_STANDARD', startDate: '2026-01-01' });
    expect(e.market).toBe('FDA');
    expect(e.summary.currency).toBe('USD');
    expect(e.summary.totalFee).toBeGreaterThan(0);
    expect(e.summary.targetDecisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(e.summary.reviewDays).toBeGreaterThan(0);
    expect(e.timeline.milestones.length).toBeGreaterThan(0);
  });

  it('reports fees waived (total 0) for an orphan product', () => {
    const e = projectSubmissionEconomics({ market: 'FDA', procedure: 'NDA_STANDARD', startDate: '2026-01-01', orphan: true });
    expect(e.summary.feesWaived).toBe(true);
    expect(e.summary.totalFee).toBe(0);
  });

  it('reflects the no-clinical-data fee tier', () => {
    const withData = projectSubmissionEconomics({ market: 'FDA', procedure: 'NDA_STANDARD', startDate: '2026-01-01', programYears: 0 });
    const noData = projectSubmissionEconomics({ market: 'FDA', procedure: 'NDA_STANDARD', startDate: '2026-01-01', requiresClinicalData: false, programYears: 0 });
    expect(noData.summary.totalFee).toBeLessThan(withData.summary.totalFee);
  });

  it('priority review yields a shorter reviewDays than standard', () => {
    const std = projectSubmissionEconomics({ market: 'FDA', procedure: 'NDA_STANDARD', startDate: '2026-01-01' });
    const prio = projectSubmissionEconomics({ market: 'FDA', procedure: 'NDA_PRIORITY', startDate: '2026-01-01' });
    expect(prio.summary.reviewDays).toBeLessThan(std.summary.reviewDays);
  });

  it('throws for an unknown procedure (propagated from the timeline projector)', () => {
    expect(() => projectSubmissionEconomics({ market: 'FDA', procedure: 'NOPE', startDate: '2026-01-01' })).toThrow();
  });

  it('is deterministic', () => {
    const a = projectSubmissionEconomics({ market: 'EMA', procedure: 'CENTRALISED', startDate: '2026-03-01' });
    const b = projectSubmissionEconomics({ market: 'EMA', procedure: 'CENTRALISED', startDate: '2026-03-01' });
    expect(a).toEqual(b);
  });
});
