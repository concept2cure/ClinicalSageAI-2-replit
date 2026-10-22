/**
 * The IND timeline's annual-report anniversaries are calendar years, the same
 * ones the annual-report due date uses.
 *
 * What the code used to do (until 2026-10-15): buildIndTimeline placed the nth
 * anniversary at effective + 365 × n days, so it drifted a day early for every
 * leap day passed. For an IND effective 2025-01-15, milestone annual_report_4
 * read "60 days after anniversary 2029-01-14" (the anniversary is 2029-01-15)
 * and its due date was a day early — while computeAnnualReportDue, the other
 * implementation, used calendar years and disagreed with it.
 */
import { describe, it, expect } from 'vitest';
import { buildIndTimeline } from '../ind-timeline-service';
import { computeAnnualReportDueForPeriod } from '../ind-annual-report-service';

const EFFECTIVE = '2025-01-15T00:00:00.000Z';

describe('buildIndTimeline — anniversaries are calendar years', () => {
  const t = buildIndTimeline({
    receiptDate: '2024-12-16T00:00:00.000Z',
    effectiveDate: EFFECTIVE,
    asOf: '2025-01-16T00:00:00.000Z',
    horizonDays: 5 * 365,
  });

  it('the fourth anniversary is 2029-01-15, and its report is due 60 days later', () => {
    const ar4 = t.milestones.find((m) => m.key === 'annual_report_4')!;
    expect(ar4.label).toContain('anniversary 2029-01-15');
    expect(ar4.date).toBe('2029-03-16T00:00:00.000Z');
  });

  it('agrees with the annual-report due date for every projected year', () => {
    for (const m of t.milestones.filter((x) => x.key.startsWith('annual_report_'))) {
      const anniversary = m.label.match(/anniversary (\d{4}-\d{2}-\d{2})/)![1];
      const due = computeAnnualReportDueForPeriod(new Date(EFFECTIVE), new Date(`${anniversary}T00:00:00.000Z`));
      expect(m.date, m.key).toBe(due.toISOString());
    }
  });
});
