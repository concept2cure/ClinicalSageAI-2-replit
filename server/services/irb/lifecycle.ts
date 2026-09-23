/**
 * IRB approval lifecycle — approval, expiration, continuing review,
 * modifications, reportable events and closure.
 *
 * `docs/design/IRB_SUBMISSION.md` step 5.
 *
 * ── Why this exists beside `continuingReviewStatus` ──────────────────────────
 *
 * `irb-logic.ts` already computes continuing-review timing, and its arithmetic
 * is right. Its SHAPE is not, and the flaw is the one this session keeps
 * finding: it returns two booleans, so it cannot say "I do not know".
 *
 *     if (reviewType !== 'full_board' || !approvalDate) {
 *       return { continuingReviewRequired: false, expirationDate: null, expired: false };
 *     }
 *
 * Those two conditions are not the same fact. An EXPEDITED determination
 * genuinely does not require annual continuing review. A full-board approval
 * with no approval date recorded is simply unknown — and it comes back
 * `expired: false`, so an approval that has actually lapsed reports as current
 * because nobody typed the date. A site enrolling under a lapsed approval is a
 * serious-noncompliance report to OHRP, and this is the kind of clean bill that
 * would help it happen.
 *
 * So the statuses here are three-valued, and `unknown` is never rendered as
 * `current`. Nothing else about the arithmetic changes: the same `addYears`
 * helper, the same one-year interval, the same injected `today`.
 *
 * ── What this module will not do ─────────────────────────────────────────────
 *
 * It does not decide whether research is approvable, and it does not state the
 * review category a board will apply (D4). It reports what the record says, and
 * where the record is silent it says so.
 *
 * Pure and total: no I/O, no clock, no randomness. `today` is injected.
 *
 * @module server/services/irb/lifecycle
 */

import { addYears } from '../iacuc/iacuc-logic';
import type { IrbReviewType } from '../../../shared/schema/irb';

/**
 * Three-valued, deliberately. `unknown` means the record does not say, and it
 * is never collapsed into the safe-looking answer.
 */
export type ApprovalState = 'not_approved' | 'current' | 'expiring_soon' | 'expired' | 'unknown';

export type ContinuingReviewRequirement = 'required' | 'not_required' | 'unknown';

/** How close to expiry counts as "expiring soon". Boards commonly ask 30 days ahead. */
export const EXPIRING_SOON_DAYS = 30;

export interface LifecycleInput {
  /** The submission's recorded status. */
  status: string;
  reviewType: IrbReviewType | null;
  /** ISO date (YYYY-MM-DD) or null when not recorded. */
  approvalDate: string | null;
  /**
   * The expiration the BOARD set, when it recorded one. Preferred over the
   * computed date: a board may approve for less than a year, and its date is
   * the fact while ours is an inference.
   */
  expirationDate?: string | null;
  /** ISO date. Injected so this module has no clock. */
  today: string;
  /** Amendments recorded against this submission. */
  amendments?: Array<{ id: number; substantive: boolean; status: string; protocolAmendmentId?: number | null }>;
  /** Reportable events recorded against this submission. */
  reportableEvents?: Array<{ id: number; eventType: string; status: string; reportedDate?: string | null }>;
}

export interface LifecycleFinding {
  code: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  basis: string;
  message: string;
  remediation: string;
}

export interface LifecycleStatus {
  approval: ApprovalState;
  continuingReview: ContinuingReviewRequirement;
  /** The board's date where recorded, else the computed one, else null. */
  expirationDate: string | null;
  /** Where `expirationDate` came from, so a reader knows what it is trusting. */
  expirationSource: 'recorded' | 'computed' | 'none';
  /** Days until expiry; negative when past. Null when no expiration is known. */
  daysToExpiration: number | null;
  /** True when the record cannot support an approval verdict. */
  undetermined: boolean;
  findings: LifecycleFinding[];
}

// ─── Bases ───────────────────────────────────────────────────────────────────

const B_CONTINUING = '45 CFR 46.109(e) / 21 CFR 56.109(f) — continuing review at intervals not exceeding one year for research requiring it; 46.109(f) is the list of research for which it is NOT required, which `continuingReviewRequirement` implements';
const B_LAPSE = 'OHRP guidance on continuing review — IRB approval lapses on the expiration date; research activity must stop unless the IRB finds that stopping would harm subjects';
// The "may not be initiated" wording is 21 CFR 56.108(a)(4)'s; the 2018 Common
// Rule (46.108(a)(3)(iii)) says investigators follow the approved terms "until
// any proposed changes have been reviewed and approved by the IRB". Same rule,
// different words, so the basis paraphrases rather than quoting either
// (corrected 2026-09-22, docs/evidence/REGULATORY-SME/2026-09-22/).
const B_MOD = '45 CFR 46.108(a)(3)(iii); 21 CFR 56.108(a)(4); 21 CFR 312.66 — a change to approved research must be reviewed and approved by the IRB before it is implemented, except when necessary to eliminate apparent immediate hazards to subjects';
const B_UPIRSO = '45 CFR 46.108(a)(4) / 21 CFR 56.108(b) — prompt reporting of unanticipated problems involving risks to subjects or others';

// ─── Date helpers ────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE.test(v);
}

/** Whole days from `from` to `to`. Both must be ISO dates. */
function daysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

// ─── Continuing review ───────────────────────────────────────────────────────

/**
 * Whether continuing review applies. Unlike `continuingReviewStatus`, an
 * unrecorded review type is `unknown` rather than `not_required`: nobody has
 * said this is expedited, so nobody has said continuing review does not apply.
 */
export function continuingReviewRequirement(reviewType: IrbReviewType | null): ContinuingReviewRequirement {
  if (reviewType === 'full_board') return 'required';
  if (reviewType === 'expedited' || reviewType === 'exempt') return 'not_required';
  return 'unknown';
}

// ─── Expiration ──────────────────────────────────────────────────────────────

interface Expiration {
  date: string | null;
  source: LifecycleStatus['expirationSource'];
}

/**
 * The board's recorded date wins over ours. A board may approve for less than a
 * year, and computing twelve months from approval would then report an approval
 * as current past the date the board actually set.
 */
function resolveExpiration(input: LifecycleInput, requirement: ContinuingReviewRequirement): Expiration {
  if (isIsoDate(input.expirationDate)) return { date: input.expirationDate, source: 'recorded' };
  if (requirement === 'required' && isIsoDate(input.approvalDate)) {
    return { date: addYears(input.approvalDate, 1), source: 'computed' };
  }
  return { date: null, source: 'none' };
}

// ─── Approval state ──────────────────────────────────────────────────────────

/** Statuses that mean the board has not granted approval. */
const NOT_APPROVED = new Set(['draft', 'submitted', 'under_review', 'modifications_required', 'deferred', 'disapproved']);

function approvalState(input: LifecycleInput, expiration: Expiration): ApprovalState {
  if (input.status === 'closed') return 'not_approved';
  if (NOT_APPROVED.has(input.status)) return 'not_approved';
  if (input.status === 'expired') return 'expired';
  /* Everything that is not 'approved' — including 'suspended' — falls through
     here as `unknown`. An explicit `suspended` branch above this line was
     removed on 2026-09-22 after an injection proved it changed nothing: this
     guard already covered it. A redundant branch reads as load-bearing to the
     next person, and the suspension itself is still reported, by IRB-LC-005. */
  if (input.status !== 'approved') return 'unknown';

  // Approved, so the question is only whether it still stands.
  if (!isIsoDate(input.approvalDate)) return 'unknown';
  if (!expiration.date) return 'unknown';
  const days = daysBetween(input.today, expiration.date);
  if (days < 0) return 'expired';
  return days <= EXPIRING_SOON_DAYS ? 'expiring_soon' : 'current';
}

// ─── Findings ────────────────────────────────────────────────────────────────

function approvalFindings(input: LifecycleInput, state: ApprovalState, expiration: Expiration, requirement: ContinuingReviewRequirement): LifecycleFinding[] {
  const out: LifecycleFinding[] = [];
  if (input.status === 'approved' && !isIsoDate(input.approvalDate)) {
    out.push({
      code: 'IRB-LC-001', severity: 'critical', basis: B_CONTINUING,
      message: 'This submission is recorded as approved but carries no approval date, so whether the approval still stands COULD NOT BE DETERMINED. This is not a finding that it is current.',
      remediation: "Record the board's approval date.",
    });
  }
  if (input.status === 'approved' && requirement === 'unknown') {
    out.push({
      code: 'IRB-LC-002', severity: 'major', basis: B_CONTINUING,
      message: 'No review type is recorded, so whether this approval requires continuing review could not be determined. An unrecorded review type is not a record that continuing review does not apply.',
      remediation: 'Record the review type the board applied (exempt, expedited or full board).',
    });
  }
  if (state === 'expired') {
    out.push({
      code: 'IRB-LC-003', severity: 'critical', basis: B_LAPSE,
      message: expiration.date
        ? `IRB approval expired on ${expiration.date}. Approval does not extend past its expiration date, and research activity must stop unless the board finds that stopping would harm enrolled subjects.`
        : 'This submission is recorded as expired.',
      remediation: 'Stop enrolment and intervention pending re-approval, or obtain the board’s determination that continuation is in enrolled subjects’ interests.',
    });
  }
  if (state === 'expiring_soon' && expiration.date) {
    out.push({
      code: 'IRB-LC-004', severity: 'major', basis: B_CONTINUING,
      message: `IRB approval expires on ${expiration.date}, within ${EXPIRING_SOON_DAYS} days. Continuing review must be completed and approved BEFORE that date; there is no grace period.`,
      remediation: 'Submit the continuing review now.',
    });
  }
  if (input.status === 'suspended') {
    out.push({
      code: 'IRB-LC-005', severity: 'critical', basis: B_LAPSE,
      message: 'This submission is suspended. Its approval status is not a simple current-or-expired question and is reported as undetermined rather than guessed.',
      remediation: 'Record the board’s determination and the conditions of the suspension.',
    });
  }
  return out;
}

/**
 * Modifications. An amendment recorded as submitted but not approved means a
 * change has been proposed and not yet authorised; a SUBSTANTIVE one that is
 * being acted on without approval is the violation the basis names. This module
 * cannot see whether the site is acting on it, so it reports the state and says
 * what it could not check.
 */
function amendmentFindings(input: LifecycleInput): LifecycleFinding[] {
  const amendments = input.amendments;
  if (amendments === undefined) {
    return [{
      code: 'IRB-LC-010', severity: 'info', basis: B_MOD,
      message: 'No amendment record was supplied, so modifications were not assessed. This is not a finding that there are none.',
      remediation: 'Supply the submission’s amendments to assess them.',
    }];
  }
  const pending = amendments.filter((a) => a.status === 'submitted');
  const substantivePending = pending.filter((a) => a.substantive);
  const out: LifecycleFinding[] = [];
  if (substantivePending.length > 0) {
    out.push({
      code: 'IRB-LC-011', severity: 'major', basis: B_MOD,
      message: `${substantivePending.length} substantive modification${substantivePending.length === 1 ? '' : 's'} recorded as submitted and not yet approved. A change to approved research may not be INITIATED before the board approves it, except to eliminate an immediate hazard. Whether the change has been initiated is not recorded here and was not checked.`,
      remediation: 'Confirm the change has not been initiated, or record the immediate-hazard exception.',
    });
  }
  const unlinked = amendments.filter((a) => a.protocolAmendmentId == null);
  if (unlinked.length > 0) {
    out.push({
      code: 'IRB-LC-012', severity: 'minor', basis: B_MOD,
      message: `${unlinked.length} IRB amendment${unlinked.length === 1 ? ' is' : 's are'} not linked to a protocol amendment, so the change the board reviewed cannot be traced to the protocol change it came from.`,
      remediation: 'Link each IRB amendment to its protocol amendment.',
    });
  }
  return out;
}

/** Reportable events. Absent input is reported as unassessed, never as none. */
function eventFindings(input: LifecycleInput): LifecycleFinding[] {
  const events = input.reportableEvents;
  if (events === undefined) {
    return [{
      code: 'IRB-LC-020', severity: 'info', basis: B_UPIRSO,
      message: 'No reportable-event record was supplied, so events were not assessed. This is not a finding that there are none.',
      remediation: 'Supply the submission’s reportable events to assess them.',
    }];
  }
  const open = events.filter((e) => e.status !== 'closed');
  const undated = events.filter((e) => !isIsoDate(e.reportedDate ?? null));
  const out: LifecycleFinding[] = [];
  if (open.length > 0) {
    out.push({
      code: 'IRB-LC-021', severity: 'major', basis: B_UPIRSO,
      message: `${open.length} reportable event${open.length === 1 ? ' is' : 's are'} open. Promptness of the report is measured from the date it was reported, and this module does not judge promptness.`,
      remediation: 'Close each event with the board’s determination.',
    });
  }
  if (undated.length > 0) {
    out.push({
      code: 'IRB-LC-022', severity: 'major', basis: B_UPIRSO,
      message: `${undated.length} reportable event${undated.length === 1 ? ' carries' : 's carry'} no reported date, so whether the report was prompt CANNOT BE DETERMINED. An absent date is not evidence of a timely report.`,
      remediation: 'Record the date each event was reported to the board.',
    });
  }
  return out;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** The submission's lifecycle state. Pure; the same input twice is identical. */
export function lifecycleStatus(input: LifecycleInput): LifecycleStatus {
  const requirement = continuingReviewRequirement(input.reviewType);
  const expiration = resolveExpiration(input, requirement);
  const approval = approvalState(input, expiration);

  return {
    approval,
    continuingReview: requirement,
    expirationDate: expiration.date,
    expirationSource: expiration.source,
    daysToExpiration: expiration.date ? daysBetween(input.today, expiration.date) : null,
    undetermined: approval === 'unknown',
    findings: [
      ...approvalFindings(input, approval, expiration, requirement),
      ...amendmentFindings(input),
      ...eventFindings(input),
    ],
  };
}
