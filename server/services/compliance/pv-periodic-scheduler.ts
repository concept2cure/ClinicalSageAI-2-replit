/**
 * compliance/pv-periodic-scheduler — pure date logic for periodic safety
 * report scheduling (DSUR / PSUR / PBRER / PADER).
 *
 * INTEGRATION NOTES
 * -----------------
 * Pure, deterministic date math (no DB, no I/O; the only time input is the
 * explicit `now` parameter, default new Date()). It sits ALONGSIDE
 * pharmacovigilanceService.ts and reuses its exact PeriodicSafetyReport shape
 * and `reportType` union ('DSUR' | 'PSUR' | 'PBRER' | 'PADER') — re-exported
 * here as ReportType so callers don't duplicate it. It does NOT import or edit
 * pharmacovigilanceService.ts (keeping this file dependency-free and testable);
 * the persistence path (createPeriodicReport / getUpcomingReports) stays in the
 * service. This module computes the *next* Data Lock Point and the regulatory
 * submission due date so the service/UI can schedule and surface deadlines.
 *
 * This file requires a `frequency_months` field and a `data_lock_point` that
 * are NOT on the persisted PeriodicSafetyReport interface today. To stay purely
 * additive (no edits to the existing interface), it defines a local
 * SchedulableReport input (a structural superset) and a fromPeriodicSafetyReport
 * adapter. When the schema gains those columns, callers can pass the row
 * straight through.
 *
 * DUE-DATE OFFSETS (documented config — DAYS from the Data Lock Point):
 *   - DSUR : 60 days  (ICH E2F / FDA 21 CFR 312.33 — annual DSUR within 60 days of the DLP)
 *   - PSUR : 70 days  (EU GVP Module VII — 70 days for data-collection cycles up to 12 months)
 *   - PBRER: 70 days  (ICH E2C(R2) — aligned with the EU PSUR 70-day window)
 *   - PADER: 30 days  (FDA 21 CFR 314.80(c)(2) — quarterly/annual PADER within 30 days of close)
 * These offsets are a single documented map (REPORT_DUE_OFFSET_DAYS) so they can
 * be reviewed/changed in one place.
 *
 * DEFAULT FREQUENCY (months) when frequency_months is not supplied:
 *   - DSUR : 12  (annual)
 *   - PSUR : 12  (period up to 12 months in the routine cycle)
 *   - PBRER: 12
 *   - PADER: 3   (quarterly in the first years post-approval; FDA may step to annual)
 */

/** Periodic report family — identical union to pharmacovigilanceService.PeriodicSafetyReport.reportType. */
export type ReportType = 'DSUR' | 'PSUR' | 'PBRER' | 'PADER';

/**
 * Documented submission offsets in DAYS from the Data Lock Point (DLP). See the
 * INTEGRATION NOTES block for the per-type regulatory citation.
 */
export const REPORT_DUE_OFFSET_DAYS: Record<ReportType, number> = {
  DSUR: 60,
  PSUR: 70,
  PBRER: 70,
  PADER: 30,
};

/** Default reporting frequency in MONTHS when a report does not specify one. */
export const DEFAULT_FREQUENCY_MONTHS: Record<ReportType, number> = {
  DSUR: 12,
  PSUR: 12,
  PBRER: 12,
  PADER: 3,
};

/**
 * Structural input for scheduling. A superset of the persisted
 * PeriodicSafetyReport that adds the scheduling fields. `dataLockPoint` is the
 * DLP of the most recent reporting period; `frequencyMonths` is optional (falls
 * back to DEFAULT_FREQUENCY_MONTHS[reportType]).
 */
export interface SchedulableReport {
  id?: string;
  reportType: ReportType;
  /** Data Lock Point of the current/most-recent reporting period. */
  dataLockPoint: Date;
  /** Cycle length in months; defaults per report type when omitted. */
  frequencyMonths?: number;
}

/** Computed schedule for the next reporting cycle. */
export interface ReportSchedule {
  reportType: ReportType;
  /** The DLP this schedule was computed from. */
  dataLockPoint: Date;
  frequencyMonths: number;
  /** Next Data Lock Point = dataLockPoint + frequencyMonths. */
  nextDataLockPoint: Date;
  /** Due date for the report covering the CURRENT period = dataLockPoint + offsetDays. */
  dueDate: Date;
  /** Due date for the report covering the NEXT period = nextDataLockPoint + offsetDays. */
  nextDueDate: Date;
  /** The offset (days) applied per report type. */
  dueOffsetDays: number;
}

/**
 * Add a whole number of calendar months to a date, clamping the day-of-month so
 * e.g. Jan 31 + 1 month = Feb 28/29 rather than rolling into March. Returns a
 * new Date (does not mutate the input).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const targetYear = result.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const day = result.getDate();
  result.setFullYear(targetYear, normalizedMonth, 1);
  // Clamp to the last valid day of the target month.
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

/** Add a whole number of days to a date. Returns a new Date. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/** Resolve the effective cycle length (months) for a report. */
export function resolveFrequencyMonths(report: SchedulableReport): number {
  return report.frequencyMonths && report.frequencyMonths > 0
    ? report.frequencyMonths
    : DEFAULT_FREQUENCY_MONTHS[report.reportType];
}

/**
 * Compute the full schedule (next DLP, current-period due date, next-period due
 * date) for a periodic safety report. Pure.
 *
 *   nextDataLockPoint = dataLockPoint + frequencyMonths
 *   dueDate           = dataLockPoint + REPORT_DUE_OFFSET_DAYS[reportType]
 *   nextDueDate       = nextDataLockPoint + REPORT_DUE_OFFSET_DAYS[reportType]
 */
export function computeReportSchedule(report: SchedulableReport): ReportSchedule {
  const frequencyMonths = resolveFrequencyMonths(report);
  const dueOffsetDays = REPORT_DUE_OFFSET_DAYS[report.reportType];
  const nextDataLockPoint = addMonths(report.dataLockPoint, frequencyMonths);
  return {
    reportType: report.reportType,
    dataLockPoint: report.dataLockPoint,
    frequencyMonths,
    nextDataLockPoint,
    dueDate: addDays(report.dataLockPoint, dueOffsetDays),
    nextDueDate: addDays(nextDataLockPoint, dueOffsetDays),
    dueOffsetDays,
  };
}

/** Compute just the next Data Lock Point for a report. */
export function nextDataLockPoint(report: SchedulableReport): Date {
  return addMonths(report.dataLockPoint, resolveFrequencyMonths(report));
}

/** Compute the submission due date for the CURRENT period (DLP + offset). */
export function computeDueDate(report: SchedulableReport): Date {
  return addDays(report.dataLockPoint, REPORT_DUE_OFFSET_DAYS[report.reportType]);
}

/** One upcoming deadline surfaced by upcomingDeadlines(). */
export interface UpcomingDeadline {
  reportId?: string;
  reportType: ReportType;
  dueDate: Date;
  /** Whole days from `now` to dueDate (negative = overdue). */
  daysUntilDue: number;
  /** True when dueDate < now. */
  overdue: boolean;
}

/**
 * Given a set of reports, return the deadlines (current-period due dates) that
 * fall within `withinDays` of `now`, sorted soonest-first. Overdue deadlines
 * (dueDate already past) are INCLUDED — they are the most urgent — and flagged
 * with `overdue: true`; pass them through so the caller can escalate.
 *
 * Pure: `now` is an explicit parameter (default new Date()).
 *
 * @param reports    - Schedulable reports to evaluate.
 * @param withinDays - Forward horizon in days (e.g. 90).
 * @param now        - Reference "today" (default new Date()).
 */
export function upcomingDeadlines(
  reports: SchedulableReport[],
  withinDays: number,
  now: Date = new Date(),
): UpcomingDeadline[] {
  const msPerDay = 24 * 60 * 60 * 1000;
  const horizon = addDays(now, withinDays);
  const result: UpcomingDeadline[] = [];

  for (const report of reports) {
    const dueDate = computeDueDate(report);
    if (dueDate.getTime() > horizon.getTime()) continue; // beyond the window
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / msPerDay);
    result.push({
      reportId: report.id,
      reportType: report.reportType,
      dueDate,
      daysUntilDue,
      overdue: dueDate.getTime() < now.getTime(),
    });
  }

  result.sort((x, y) => x.dueDate.getTime() - y.dueDate.getTime());
  return result;
}

/**
 * Adapter: turn a persisted PeriodicSafetyReport (which carries periodEnd as the
 * de-facto Data Lock Point and may not have a frequency yet) into a
 * SchedulableReport. Accepts a structural subset so it does not need to import
 * the service's interface.
 */
export function fromPeriodicSafetyReport(
  report: { id?: string; reportType: ReportType; periodEnd: Date; frequencyMonths?: number },
): SchedulableReport {
  return {
    id: report.id,
    reportType: report.reportType,
    dataLockPoint: report.periodEnd,
    frequencyMonths: report.frequencyMonths,
  };
}

export default {
  REPORT_DUE_OFFSET_DAYS,
  DEFAULT_FREQUENCY_MONTHS,
  addMonths,
  addDays,
  resolveFrequencyMonths,
  computeReportSchedule,
  nextDataLockPoint,
  computeDueDate,
  upcomingDeadlines,
  fromPeriodicSafetyReport,
};
