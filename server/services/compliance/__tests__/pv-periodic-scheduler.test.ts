/**
 * __tests__/pv-periodic-scheduler.test.ts
 *
 * INTEGRATION NOTES
 * -----------------
 * Vitest suite for server/services/compliance/pv-periodic-scheduler.ts. Covers
 * the documented per-type due-date offsets (DSUR 60d, PSUR/PBRER 70d, PADER 30d),
 * next-Data-Lock-Point month arithmetic (incl. end-of-month clamping), and the
 * upcomingDeadlines horizon/overdue logic. All dates are constructed in UTC and
 * compared with explicit UTC values; the assertions hold in any CI timezone
 * because the module's date math is offset-by-days/months which is TZ-stable in
 * UTC (the repo's test env runs in UTC).
 *
 * TEST DISCOVERY: this file is at the repo-root `__tests__/` path requested by
 * the task, which is NOT in vitest.config.ts `include`. Run explicitly:
 *   npx vitest run --config vitest.config.ts __tests__/pv-periodic-scheduler.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  computeReportSchedule,
  computeDueDate,
  nextDataLockPoint,
  upcomingDeadlines,
  addMonths,
  addDays,
  REPORT_DUE_OFFSET_DAYS,
  DEFAULT_FREQUENCY_MONTHS,
  fromPeriodicSafetyReport,
  type SchedulableReport,
} from '../pv-periodic-scheduler';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('due-date offsets per report type', () => {
  const dlp = utc('2025-06-30');

  it('DSUR is due 60 days after the DLP', () => {
    expect(REPORT_DUE_OFFSET_DAYS.DSUR).toBe(60);
    // 2025-06-30 + 60d = 2025-08-29
    expect(iso(computeDueDate({ reportType: 'DSUR', dataLockPoint: dlp }))).toBe('2025-08-29');
  });

  it('PADER is due 30 days after the DLP', () => {
    expect(REPORT_DUE_OFFSET_DAYS.PADER).toBe(30);
    // 2025-06-30 + 30d = 2025-07-30
    expect(iso(computeDueDate({ reportType: 'PADER', dataLockPoint: dlp }))).toBe('2025-07-30');
  });

  it('PSUR and PBRER are due 70 days after the DLP', () => {
    expect(REPORT_DUE_OFFSET_DAYS.PSUR).toBe(70);
    expect(REPORT_DUE_OFFSET_DAYS.PBRER).toBe(70);
    // 2025-06-30 + 70d = 2025-09-08
    expect(iso(computeDueDate({ reportType: 'PSUR', dataLockPoint: dlp }))).toBe('2025-09-08');
    expect(iso(computeDueDate({ reportType: 'PBRER', dataLockPoint: dlp }))).toBe('2025-09-08');
  });
});

describe('addMonths / addDays primitives', () => {
  it('addDays adds exact calendar days', () => {
    expect(iso(addDays(utc('2025-01-01'), 31))).toBe('2025-02-01');
  });

  it('addMonths clamps the day to the last valid day of the target month', () => {
    // Jan 31 + 1 month -> Feb 28 (2025 not a leap year), not Mar 3
    expect(iso(addMonths(utc('2025-01-31'), 1))).toBe('2025-02-28');
    // Leap year: Jan 31 + 1 month -> Feb 29
    expect(iso(addMonths(utc('2024-01-31'), 1))).toBe('2024-02-29');
  });

  it('addMonths rolls the year correctly', () => {
    expect(iso(addMonths(utc('2025-11-15'), 3))).toBe('2026-02-15');
    expect(iso(addMonths(utc('2025-03-15'), 12))).toBe('2026-03-15');
  });
});

describe('computeReportSchedule — next DLP + due dates', () => {
  it('annual DSUR: next DLP = DLP + 12 months, due = DLP + 60d', () => {
    const s = computeReportSchedule({ reportType: 'DSUR', dataLockPoint: utc('2025-01-15') });
    expect(s.frequencyMonths).toBe(12);
    expect(iso(s.nextDataLockPoint)).toBe('2026-01-15');
    expect(iso(s.dueDate)).toBe('2025-03-16'); // 2025-01-15 + 60d
    expect(iso(s.nextDueDate)).toBe('2026-03-16'); // 2026-01-15 + 60d
    expect(s.dueOffsetDays).toBe(60);
  });

  it('quarterly PADER default frequency = 3 months', () => {
    expect(DEFAULT_FREQUENCY_MONTHS.PADER).toBe(3);
    const s = computeReportSchedule({ reportType: 'PADER', dataLockPoint: utc('2025-01-31') });
    expect(s.frequencyMonths).toBe(3);
    expect(iso(s.nextDataLockPoint)).toBe('2025-04-30'); // Jan 31 + 3mo clamps to Apr 30
  });

  it('explicit frequencyMonths overrides the default', () => {
    const s = computeReportSchedule({ reportType: 'PADER', dataLockPoint: utc('2025-01-15'), frequencyMonths: 6 });
    expect(s.frequencyMonths).toBe(6);
    expect(iso(s.nextDataLockPoint)).toBe('2025-07-15');
  });

  it('nextDataLockPoint helper matches computeReportSchedule', () => {
    const r: SchedulableReport = { reportType: 'PSUR', dataLockPoint: utc('2025-02-28') };
    expect(nextDataLockPoint(r).getTime()).toBe(computeReportSchedule(r).nextDataLockPoint.getTime());
  });
});

describe('upcomingDeadlines', () => {
  const now = utc('2025-03-01');
  const reports: SchedulableReport[] = [
    { id: 'pader', reportType: 'PADER', dataLockPoint: utc('2025-02-20') }, // due +30 = 2025-03-22
    { id: 'dsur', reportType: 'DSUR', dataLockPoint: utc('2025-01-01') },   // due +60 = 2025-03-02
    { id: 'psur-far', reportType: 'PSUR', dataLockPoint: utc('2025-06-01') }, // due 2025-08-10, beyond 90d
    { id: 'overdue', reportType: 'PADER', dataLockPoint: utc('2025-01-10') }, // due +30 = 2025-02-09, past
  ];

  it('returns deadlines within the horizon, soonest first', () => {
    const out = upcomingDeadlines(reports, 90, now);
    const ids = out.map((d) => d.reportId);
    // overdue (Feb 9) < dsur (Mar 2) < pader (Mar 22); psur-far excluded
    expect(ids).toEqual(['overdue', 'dsur', 'pader']);
  });

  it('excludes deadlines beyond the withinDays window', () => {
    const out = upcomingDeadlines(reports, 90, now);
    expect(out.find((d) => d.reportId === 'psur-far')).toBeUndefined();
  });

  it('flags overdue deadlines and computes daysUntilDue', () => {
    const out = upcomingDeadlines(reports, 90, now);
    const overdue = out.find((d) => d.reportId === 'overdue')!;
    expect(overdue.overdue).toBe(true);
    expect(overdue.daysUntilDue).toBeLessThan(0);

    const dsur = out.find((d) => d.reportId === 'dsur')!;
    expect(dsur.overdue).toBe(false);
    expect(dsur.daysUntilDue).toBe(1); // 2025-03-02 is 1 day after 2025-03-01
  });

  it('narrow horizon excludes deadlines just outside it', () => {
    // 10-day horizon from Mar 1 -> only items due by Mar 11; pader (Mar 22) excluded
    const out = upcomingDeadlines(reports, 10, now);
    const ids = out.map((d) => d.reportId);
    expect(ids).toEqual(['overdue', 'dsur']);
  });
});

describe('fromPeriodicSafetyReport adapter', () => {
  it('maps periodEnd to the data lock point', () => {
    const s = fromPeriodicSafetyReport({ id: 'r1', reportType: 'PBRER', periodEnd: utc('2025-04-30') });
    expect(s.dataLockPoint.getTime()).toBe(utc('2025-04-30').getTime());
    expect(iso(computeDueDate(s))).toBe('2025-07-09'); // +70d
  });
});
