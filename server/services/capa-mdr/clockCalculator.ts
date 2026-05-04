/**
 * Reportability clock calculator.
 *
 * Computes `report_due_at` for an MDR event based on jurisdiction-specific
 * regulatory clocks. Returns the deadline as an absolute Date.
 *
 * US FDA — 21 CFR 803.50, 803.53:
 *   - Initial 5-day report: a manufacturer becomes aware of an MDR-reportable
 *     event "that necessitates remedial action to prevent an unreasonable
 *     risk of substantial harm to public health" → due no later than 5 work
 *     days after becoming aware.
 *   - Initial 30-day report: any other MDR-reportable event (death, serious
 *     injury, malfunction that would be likely to cause or contribute to a
 *     reportable death/serious injury) → due no later than 30 calendar days
 *     after becoming aware.
 *   - Day 1 = the day after the day of awareness/decision (FDA practice).
 *
 * EU MDR — Regulation 2017/745 Article 87(3-5):
 *   - 2-day clock: serious public health threat (Article 87(4)) — due
 *     "immediately" but no later than 2 days after becoming aware.
 *   - 10-day clock: death or unanticipated serious deterioration (Article
 *     87(3)) — due "immediately" but no later than 10 days after becoming
 *     aware.
 *   - 15-day clock: any other serious incident (Article 87(3)) — due
 *     "immediately" but no later than 15 days after becoming aware.
 *   - All EU MDR clocks count CALENDAR days (Article 4(1) Reg 1182/71 EEC).
 *
 * NOTE on "working days": 21 CFR 803.3 defines "5-day report" as 5 working
 * days. We compute working days as Mon-Fri (no observed federal-holiday
 * calendar — service callers can override via `workingDayCalendar` if their
 * jurisdiction needs holiday adjustments).
 */

import type { EuMdrSeverity, FdaMdrReportType, MdrJurisdiction } from '@shared/schema/capa-mdr';

export interface ClockInput {
  jurisdiction: MdrJurisdiction;
  decisionDate: Date;
  /** US FDA report type. Required when jurisdiction includes us_fda. */
  usFdaReportType?: FdaMdrReportType | null;
  /** EU MDR severity class. Required when jurisdiction includes eu_mdr. */
  euMdrSeverity?: EuMdrSeverity | null;
  /** Optional override: function returning true if a date is a working day. */
  isWorkingDay?: (d: Date) => boolean;
}

export interface ClockOutput {
  reportDueAt: Date | null;
  /** When two clocks apply (jurisdiction = both), this is the EARLIEST due. */
  effectiveJurisdiction: 'us_fda' | 'eu_mdr' | null;
  /** Both raw deadlines when both apply, for display. */
  fdaDueAt: Date | null;
  euDueAt: Date | null;
  /**
   * Days from decisionDate to reportDueAt — calendar days for EU, working
   * days for FDA 5-day, calendar days for FDA 30-day. Service layer uses
   * this for the daysToDue denormalized field on mdr_events.
   */
  totalDaysFromDecision: number | null;
}

const isMonFri = (d: Date): boolean => {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
};

/**
 * Add a number of working days to a base date, skipping non-working days.
 * Uses UTC arithmetic so DST/timezone shifts don't slip the deadline.
 */
function addWorkingDays(
  base: Date,
  workingDays: number,
  isWorkingDay: (d: Date) => boolean = isMonFri,
): Date {
  let d = new Date(base.getTime());
  let added = 0;
  while (added < workingDays) {
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    if (isWorkingDay(d)) added += 1;
  }
  return d;
}

/** Add calendar days using UTC. */
function addCalendarDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/** US FDA 21 CFR 803 clock. */
function computeFdaDueAt(
  decisionDate: Date,
  reportType: FdaMdrReportType | null | undefined,
  isWorkingDay?: (d: Date) => boolean,
): Date | null {
  if (!reportType || reportType === 'not_reportable') return null;
  switch (reportType) {
    case 'initial_5day':
      return addWorkingDays(decisionDate, 5, isWorkingDay);
    case 'initial_30day':
      return addCalendarDays(decisionDate, 30);
    case 'supplemental':
    case 'followup':
      // 30 days from awareness of new information per 21 CFR 803.56
      return addCalendarDays(decisionDate, 30);
    case 'annual':
      return null;
    default:
      return null;
  }
}

/** EU MDR Article 87 clock. */
function computeEuDueAt(decisionDate: Date, severity: EuMdrSeverity | null | undefined): Date | null {
  if (!severity || severity === 'not_reportable') return null;
  switch (severity) {
    case 'life_threatening_2day':
      return addCalendarDays(decisionDate, 2);
    case 'death_or_serious_10day':
      return addCalendarDays(decisionDate, 10);
    case 'other_serious_15day':
      return addCalendarDays(decisionDate, 15);
    default:
      return null;
  }
}

/** Days between two dates (positive = b is after a). */
function diffCalendarDays(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Compute the reportability clock. Returns the earliest due date when
 * multiple jurisdictions apply, plus per-jurisdiction breakdown for the UI.
 */
export function computeReportDue(input: ClockInput): ClockOutput {
  const { jurisdiction, decisionDate, usFdaReportType, euMdrSeverity, isWorkingDay } = input;

  const fdaDueAt =
    jurisdiction === 'us_fda' || jurisdiction === 'both'
      ? computeFdaDueAt(decisionDate, usFdaReportType, isWorkingDay)
      : null;

  const euDueAt =
    jurisdiction === 'eu_mdr' || jurisdiction === 'both'
      ? computeEuDueAt(decisionDate, euMdrSeverity)
      : null;

  let reportDueAt: Date | null = null;
  let effectiveJurisdiction: 'us_fda' | 'eu_mdr' | null = null;

  if (fdaDueAt && euDueAt) {
    if (fdaDueAt.getTime() <= euDueAt.getTime()) {
      reportDueAt = fdaDueAt;
      effectiveJurisdiction = 'us_fda';
    } else {
      reportDueAt = euDueAt;
      effectiveJurisdiction = 'eu_mdr';
    }
  } else if (fdaDueAt) {
    reportDueAt = fdaDueAt;
    effectiveJurisdiction = 'us_fda';
  } else if (euDueAt) {
    reportDueAt = euDueAt;
    effectiveJurisdiction = 'eu_mdr';
  }

  const totalDaysFromDecision = reportDueAt ? diffCalendarDays(decisionDate, reportDueAt) : null;

  return { reportDueAt, effectiveJurisdiction, fdaDueAt, euDueAt, totalDaysFromDecision };
}

/**
 * How many days until (or past) the deadline as of `now`. Negative when
 * overdue. Used by the triage queue for aging badges.
 */
export function daysToDue(reportDueAt: Date | null, now: Date = new Date()): number | null {
  if (!reportDueAt) return null;
  const ms = reportDueAt.getTime() - now.getTime();
  // Round to nearest whole day. Negative = overdue.
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
