/**
 * IND regulatory timeline / milestone derivation.
 *
 * Projects the key regulatory dates for an IND from its anchor dates: the
 * 30-calendar-day safe-to-proceed date (21 CFR 312.40; from FDA's recorded
 * receipt only — `receiptRecorded`) and the annual-report
 * anniversaries with their 60-day due dates (21 CFR 312.33 — the annual report
 * is due within 60 days of the anniversary on which the IND went into effect).
 *
 * Pure / deterministic. Stateless — the caller supplies the anchor dates.
 */

import { indAnniversary, annualReportDueAfter } from './ind-annual-report-service';

export type MilestoneStatus = 'past' | 'due_soon' | 'upcoming';

export interface TimelineMilestone {
  key: string;
  label: string;
  /** ISO date the milestone falls due. */
  date: string;
  cfrRef: string;
  status: MilestoneStatus;
  /** Calendar days from `asOf` to the milestone (negative once past). */
  daysFromNow: number;
}

export interface IndTimelineInput {
  /** ISO date the 30-day clock runs from: FDA's receipt of the original IND, or a planned date. */
  receiptDate: string;
  /**
   * True only when receiptDate is FDA's RECORDED receipt of the IND. Anything
   * else (absent, false, a truthy non-boolean): no safe-to-proceed milestone.
   */
  receiptRecorded?: boolean;
  /** ISO date the IND went into effect (drives annual-report anniversaries). */
  effectiveDate?: string;
  /** Evaluate as of this ISO date (defaults to now). */
  asOf?: string;
  /** How far ahead to project annual reports, in days (default ~3 years). */
  horizonDays?: number;
  /** A milestone within this many days of `asOf` is flagged "due_soon" (default 30). */
  dueSoonDays?: number;
}

export interface IndTimeline {
  milestones: TimelineMilestone[];
  /** The next not-yet-past milestone, or null when none remain in the horizon. */
  next: TimelineMilestone | null;
  /**
   * What the 30-day safe-to-proceed milestone rests on. 'receipt_not_recorded':
   * the date supplied is not FDA's recorded receipt, so no such milestone is
   * placed and nothing here (`next` included) speaks to the 30-day period.
   */
  safeToProceedBasis: 'fda_receipt' | 'receipt_not_recorded';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** A supplied date, or a VALIDATION refusal naming the field (the routes answer 400). */
function dateOf(value: string, field: string): Date {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) throw new Error(`VALIDATION: ${field} must be a valid date.`);
  return d;
}

/**
 * A stated day count, or the default when none is stated. 2026-10-15: the
 * value went through as given, so a non-numeric horizonDays (the raw POST
 * /timeline body) made the horizon NaN and the timeline silently held no
 * annual-report milestones. Anything but a positive integer is refused.
 */
function dayCount(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`VALIDATION: ${field} must be a positive integer number of days.`);
  }
  return value;
}

function statusFor(date: Date, asOf: Date, dueSoonDays: number): { status: MilestoneStatus; daysFromNow: number } {
  const daysFromNow = Math.round((date.getTime() - asOf.getTime()) / DAY_MS);
  if (daysFromNow < 0) return { status: 'past', daysFromNow };
  if (daysFromNow <= dueSoonDays) return { status: 'due_soon', daysFromNow };
  return { status: 'upcoming', daysFromNow };
}

/**
 * Build the IND regulatory timeline. Milestones are returned in chronological
 * order; `next` is the earliest milestone that is not yet past.
 */
export function buildIndTimeline(input: IndTimelineInput): IndTimeline {
  const asOf = input.asOf ? dateOf(input.asOf, 'asOf') : new Date();
  const dueSoonDays = dayCount(input.dueSoonDays, 'dueSoonDays', 30);
  const horizonDays = dayCount(input.horizonDays, 'horizonDays', 730);
  const horizonEnd = addDays(asOf, horizonDays);
  const receiptRecorded = input.receiptRecorded === true;

  const milestones: TimelineMilestone[] = [];

  // 30-day safe-to-proceed (312.40(b)), from FDA's RECORDED receipt only.
  // 2026-10-15: it was placed from any receiptDate, so a planned target date
  // gave a "safe-to-proceed date" that read past (cleared) or due — a date the
  // clock engine already refused as a projection.
  if (receiptRecorded) {
    const date = addDays(dateOf(input.receiptDate, 'receiptDate'), 30);
    const { status, daysFromNow } = statusFor(date, asOf, dueSoonDays);
    milestones.push({
      key: 'safe_to_proceed',
      label: '30-day safe-to-proceed date',
      date: date.toISOString(),
      cfrRef: '21 CFR 312.40(b)',
      status,
      daysFromNow,
    });
  }

  // Annual report anniversaries + 60-day due dates (312.33): every one from the
  // first up to the horizon. Calendar years via the annual-report service's
  // helper (2026-10-15: this was effective + 365×n days, a day early per leap
  // day passed; and it stopped ceil(horizon / 365) + 1 years after the effective
  // date, so an IND older than that had no upcoming report and `next` null).
  if (input.effectiveDate) {
    const effective = dateOf(input.effectiveDate, 'effectiveDate');
    const lastYear = horizonEnd.getUTCFullYear() - effective.getUTCFullYear() + 1;
    for (let year = 1; year <= lastYear; year += 1) {
      const anniversary = indAnniversary(effective, year);
      const due = annualReportDueAfter(anniversary);
      // Stop once both the anniversary and its due date are beyond the horizon.
      if (anniversary.getTime() > horizonEnd.getTime() && due.getTime() > horizonEnd.getTime()) break;
      const { status, daysFromNow } = statusFor(due, asOf, dueSoonDays);
      milestones.push({
        key: `annual_report_${year}`,
        label: `Annual report ${year} due (60 days after anniversary ${anniversary.toISOString().slice(0, 10)})`,
        date: due.toISOString(),
        cfrRef: '21 CFR 312.33',
        status,
        daysFromNow,
      });
    }
  }

  milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const next = milestones.find((m) => m.status !== 'past') ?? null;

  return { milestones, next, safeToProceedBasis: receiptRecorded ? 'fda_receipt' : 'receipt_not_recorded' };
}
