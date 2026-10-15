/**
 * A drafted IND annual report is due 60 days after the IND anniversary that
 * closes ITS reporting period — not 60 days after whichever anniversary the
 * wall clock last passed.
 *
 * What the code used to do (until 2026-10-15): createAnnualReportDraft stored
 * `computeAnnualReportDue(effective)` with asOf = now. For an IND effective
 * 2025-03-15, a draft opened on 2027-01-10 for the period ending 2027-03-15 was
 * stored as due 2026-05-14 — already past, so listOverdueAnnualReports called a
 * not-yet-due report overdue — and a draft opened on 2027-04-01 for the period
 * ending 2026-03-15 was stored as due 2027-05-14, so a report about a year late
 * read as on time.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const inserted = vi.hoisted(() => ({ values: null as Record<string, unknown> | null }));
vi.mock('../../../db', () => ({
  db: {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted.values = v;
        return { returning: async () => [{ id: 'ar-1', ...v }] };
      },
    }),
  },
}));
vi.mock('../../auditService', () => ({ default: { logAction: vi.fn(async () => ({ persisted: true })) } }));

import { createAnnualReportDraft } from '../ind-annual-report-persistence';
import { computeAnnualReportDueForPeriod } from '../ind-annual-report-service';

const EFFECTIVE = '2025-03-15T00:00:00.000Z';
const report = (start: string, end: string) => ({
  projectId: 'proj-1',
  indNumber: '123456',
  productName: 'C2C-001',
  reportingPeriodStart: start,
  reportingPeriodEnd: end,
  studyStatuses: [],
});
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

describe('createAnnualReportDraft — the stored due date comes from the report\'s period', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    inserted.values = null;
  });
  afterEach(() => vi.useRealTimers());

  it('drafted early for the period ending 2027-03-15: due 2027-05-14, not a date already past', async () => {
    vi.setSystemTime(new Date('2027-01-10T12:00:00.000Z'));
    await createAnnualReportDraft(
      { submissionId: 7, report: report('2026-03-15T00:00:00.000Z', '2027-03-15T00:00:00.000Z'), indEffectiveDate: EFFECTIVE },
      { organizationId: 1, userId: 1 },
    );
    expect(day(inserted.values?.dueDate)).toBe('2027-05-14');
  });

  it('drafted late for the period ending 2026-03-15: due 2026-05-14, so it reads overdue', async () => {
    vi.setSystemTime(new Date('2027-04-01T12:00:00.000Z'));
    await createAnnualReportDraft(
      { submissionId: 7, report: report('2025-03-15T00:00:00.000Z', '2026-03-15T00:00:00.000Z'), indEffectiveDate: EFFECTIVE },
      { organizationId: 1, userId: 1 },
    );
    expect(day(inserted.values?.dueDate)).toBe('2026-05-14');
  });

  it('with no IND effective date there is still no due date (deadline unknown, as before)', async () => {
    vi.setSystemTime(new Date('2027-01-10T12:00:00.000Z'));
    await createAnnualReportDraft(
      { submissionId: 7, report: report('2026-03-15T00:00:00.000Z', '2027-03-15T00:00:00.000Z') },
      { organizationId: 1, userId: 1 },
    );
    expect(inserted.values?.dueDate).toBeNull();
  });
});

describe('computeAnnualReportDueForPeriod', () => {
  const eff = new Date(EFFECTIVE);
  it('is 60 days after the first anniversary on or after the period end', () => {
    expect(day(computeAnnualReportDueForPeriod(eff, new Date('2026-03-15T00:00:00.000Z')))).toBe('2026-05-14');
    // A period ending the day before the anniversary is closed by that anniversary.
    expect(day(computeAnnualReportDueForPeriod(eff, new Date('2026-03-14T00:00:00.000Z')))).toBe('2026-05-14');
    // A time of day on the anniversary does not push it a year out.
    expect(day(computeAnnualReportDueForPeriod(eff, new Date('2026-03-15T23:59:59.000Z')))).toBe('2026-05-14');
    expect(day(computeAnnualReportDueForPeriod(eff, new Date('2027-03-15T00:00:00.000Z')))).toBe('2027-05-14');
    // A period ending before the first anniversary is the first report.
    expect(day(computeAnnualReportDueForPeriod(eff, new Date('2025-12-31T00:00:00.000Z')))).toBe('2026-05-14');
  });
});
