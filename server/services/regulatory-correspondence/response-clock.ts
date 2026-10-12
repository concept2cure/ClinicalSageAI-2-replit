/**
 * The response clock on an inbound agency letter — what is owed, by when, and
 * on whose authority.
 *
 * ── The question this answers, and why "14 days" was never it ───────────────
 * `mdx-proactive-signals.ts` declared a `correspondence.no_response` alert and
 * produced it from `received_at < NOW() - INTERVAL '14 days'` against a table
 * named `correspondences`, which exists nowhere in this repository — so the
 * alert had never once fired (2026-10-12,
 * docs/evidence/ABSENT-AS-CLEAN/2026-10-12-readiness-refresh/). The real store
 * is `c2c_correspondence` and carries every column that query selected.
 *
 * Restoring it on the 14-day rule would have been the worse repair. Regulatory
 * affairs does not run on a platform-wide interval: a refuse-to-file letter is
 * answered within 30 days (21 CFR 314.101(a)(3)), a complete response letter
 * within a year (21 CFR 314.110(c)), a device Additional Information hold
 * within 180 days or the application is withdrawn (21 CFR 814.37(c)(1)), and a
 * drug information request on the date FDA wrote in it and no other. Fourteen
 * days is not a deadline in any of those regimes, so an alert built on it would
 * have been wrong in both directions at once: shouting about a CRL with eleven
 * months to run, and silent on a 510(k) three days from withdrawal.
 *
 * ── The rule, in priority order ─────────────────────────────────────────────
 *   1. A letter we sent, or one that needs no response, or one already
 *      answered or closed, is not tracked at all.
 *   2. A class that asks for nothing (an acknowledgement, an approval, minutes)
 *      is not tracked.
 *   3. THE DATE THE AGENCY STATED GOVERNS. Whatever any table says, if the
 *      letter carries a due date, that is the deadline.
 *   4. Otherwise the window comes from the letter class and the application
 *      family (shared/regulatory/agency-interaction.ts responseWindowFor),
 *      each entry carrying its citation, and the due date is derived from
 *      receipt.
 *   5. Where a response is required and neither a stated date nor a codified
 *      window exists, that is reported AS THAT — a letter awaiting a response
 *      with no date on record — never as an invented overdue.
 *
 * Bucketing is `deadlineBucketFor`, the same rule the Regulatory Deadline Radar
 * runs on, so "overdue" cannot mean two things on one screen.
 *
 * RULE 2: every date, day count, bucket and severity here is computed from the
 * record. Pure — no DB, no clock of its own, no model.
 *
 * @module server/services/regulatory-correspondence/response-clock
 */

import {
  deadlineBucketFor,
  isAgencyLetterClass,
  responseWindowFor,
  type DeadlineBucket,
  type ResponseWindow,
} from '../../../shared/regulatory/agency-interaction';
import { getSubmissionTypeContext } from '../../../shared/regulatory/submission-type-bridge';

/** `c2c_correspondence.status` values that mean the letter has been answered. */
const ANSWERED_STATUSES = new Set(['responded', 'closed']);

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** One correspondence row, as `c2c_correspondence` holds it, plus its submission's type. */
export interface CorrespondenceClockInput {
  direction: string | null;
  communicationType: string | null;
  responseRequired: boolean | null;
  status: string | null;
  receivedAt: Date | string | null;
  dueDate: Date | string | null;
  /** `c2c_submissions.submission_type`, resolved through submission-type-bridge. */
  submissionType: string | null;
}

export type UntrackedReason =
  /** Not a letter from an agency: we sent it, or it is internal. */
  | 'not_inbound'
  /** The letter itself records that no response is required. */
  | 'no_response_required'
  /** Already answered or closed. */
  | 'already_answered'
  /** A class that asks for nothing, or one outside the agency-letter vocabulary. */
  | 'class_asks_nothing'
  /** A response is owed but the letter carries no receipt date, so no clock can start. */
  | 'no_receipt_date';

export type CorrespondenceClock =
  | { state: 'untracked'; reason: UntrackedReason }
  | {
      state: 'dated';
      dueDate: string;
      /** Which authority set the date — the agency's own, or this platform's table. */
      dueDateSource: 'agency_stated' | 'derived_from_window';
      daysUntilDue: number;
      bucket: DeadlineBucket;
      window: ResponseWindow;
      severity: 'critical' | 'warn' | 'info';
    }
  | {
      state: 'undated';
      /** Days since the agency's letter arrived. Reported, never compared to a threshold. */
      daysSinceReceived: number;
      window: ResponseWindow;
      severity: 'warn' | 'info';
    };

function asDate(v: Date | string | null): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The clock on one letter. `now` and `windowDays` are supplied by the caller so
 * this is a pure function of its inputs; `windowDays` is the due-soon lead time
 * the radar uses.
 */
export function correspondenceResponseClock(
  row: CorrespondenceClockInput,
  now: Date,
  windowDays = 30,
): CorrespondenceClock {
  // 1 · Only a letter FROM an agency can put us on a clock.
  if ((row.direction ?? '').toLowerCase() !== 'inbound') {
    return { state: 'untracked', reason: 'not_inbound' };
  }
  if (row.responseRequired === false) {
    return { state: 'untracked', reason: 'no_response_required' };
  }
  if (ANSWERED_STATUSES.has((row.status ?? '').toLowerCase())) {
    return { state: 'untracked', reason: 'already_answered' };
  }

  // 2 · A class outside the agency-letter vocabulary, or one that asks nothing.
  const letterClass = row.communicationType ?? '';
  if (!isAgencyLetterClass(letterClass)) {
    return { state: 'untracked', reason: 'class_asks_nothing' };
  }
  const family = row.submissionType ? getSubmissionTypeContext(row.submissionType)?.applicationFamily ?? null : null;
  const window = responseWindowFor(letterClass, family);
  if (window.basis === 'none') {
    return { state: 'untracked', reason: 'class_asks_nothing' };
  }

  // 3 · The date the agency stated beats every table.
  const stated = asDate(row.dueDate);
  if (stated) {
    const { daysUntilDue, bucket } = deadlineBucketFor(stated, now, windowDays);
    return {
      state: 'dated',
      dueDate: stated.toISOString(),
      dueDateSource: 'agency_stated',
      daysUntilDue,
      bucket,
      window,
      severity: severityFor(bucket),
    };
  }

  const received = asDate(row.receivedAt);
  if (!received) return { state: 'untracked', reason: 'no_receipt_date' };

  // 4 · Otherwise the codified window, derived from receipt.
  if (window.days != null) {
    const derived = new Date(received.getTime() + window.days * MS_PER_DAY);
    const { daysUntilDue, bucket } = deadlineBucketFor(derived, now, windowDays);
    return {
      state: 'dated',
      dueDate: derived.toISOString(),
      dueDateSource: 'derived_from_window',
      daysUntilDue,
      bucket,
      window,
      severity: severityFor(bucket),
    };
  }

  // 5 · A response is owed and no date exists. Say so; do not invent one.
  return {
    state: 'undated',
    daysSinceReceived: Math.floor((now.getTime() - received.getTime()) / MS_PER_DAY),
    window,
    // An undated letter that has stopped the trial or the review is a warning;
    // one the review continues around is information.
    severity: window.blocking ? 'warn' : 'info',
  };
}

/** A date we know of that has passed is critical; one approaching is a warning. */
function severityFor(bucket: DeadlineBucket): 'critical' | 'warn' | 'info' {
  if (bucket === 'overdue') return 'critical';
  return bucket === 'due_soon' ? 'warn' : 'info';
}
