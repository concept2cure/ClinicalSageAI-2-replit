/**
 * 21 CFR 312.33: the annual report is due within 60 days of the anniversary of
 * the date the IND went into effect. The obligation that is OPEN at a given
 * moment is the one for the anniversary most recently passed.
 */
import { describe, it, expect } from 'vitest';
import { computeAnnualReportDue } from '../ind-annual-report-service';

const EFFECTIVE = new Date('2025-03-10T00:00:00.000Z');

describe('computeAnnualReportDue', () => {
  it('a draft opened just after the anniversary is due 60 days after THAT anniversary', () => {
    // This picked the NEXT anniversary, so a draft opened ten days after the
    // anniversary — the normal case — was due some 415 days out, and nothing
    // read as overdue while the real 60-day window ran out.
    const asOf = new Date('2026-03-20T00:00:00.000Z');
    const due = computeAnnualReportDue(EFFECTIVE, asOf);
    expect(due.toISOString().slice(0, 10)).toBe('2026-05-09');
  });

  it('past the 60-day window the same obligation reads overdue, not re-dated to next year', () => {
    const asOf = new Date('2026-06-01T00:00:00.000Z');
    const due = computeAnnualReportDue(EFFECTIVE, asOf);
    expect(due.toISOString().slice(0, 10)).toBe('2026-05-09');
    expect(due.getTime()).toBeLessThan(asOf.getTime());
  });

  it('before the first anniversary the first report is the target', () => {
    const asOf = new Date('2025-11-01T00:00:00.000Z');
    const due = computeAnnualReportDue(EFFECTIVE, asOf);
    expect(due.toISOString().slice(0, 10)).toBe('2026-05-09');
  });

  it('once the second anniversary passes the second report is the open obligation', () => {
    const asOf = new Date('2027-03-11T00:00:00.000Z');
    const due = computeAnnualReportDue(EFFECTIVE, asOf);
    expect(due.toISOString().slice(0, 10)).toBe('2027-05-09');
  });
});
