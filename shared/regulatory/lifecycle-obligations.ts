/**
 * Lifecycle obligations engine — the operational layer above commitments.
 *
 * `agency-interaction` defines WHAT commitments exist (PMR, PMC, REMS, etc.)
 * and their valid state transitions. This module answers the operational
 * questions: what evidence fulfills each type, what are the deadlines and
 * reporting cadences, what happens if you miss one, and what does the
 * compliance calendar look like for a product across all its markets.
 *
 * Grounded in real FDA/EMA practice:
 *   - PMRs (FDAAA §505(o)): statutory, enforceable, annual status report
 *   - PMCs: agreed but non-statutory, annual status report
 *   - REMS: enforceable risk-mitigation program, periodic REMS assessments
 *   - EU specific obligations: legally binding conditions on a conditional MA
 *   - Annual reportables: routine changes reported in annual reports
 *   - Post-approval studies: committed clinical/nonclinical studies
 *
 * Pure, no DB. Persistence and scheduling hang off these types later.
 *
 * @module shared/regulatory/lifecycle-obligations
 */

import type {
  CommitmentType,
  CommitmentStatus,
  Commitment,
} from './agency-interaction.js';
import {
  isBindingCommitment,
  canAdvanceCommitment,
} from './agency-interaction.js';
import type { CanonicalRegion } from './region-identity.js';

// ─── Fulfillment requirements per commitment type ───────────────────────────

export type FulfillmentEvidenceType =
  | 'study_report'          // completed clinical or nonclinical study report
  | 'interim_report'        // interim progress report on ongoing study
  | 'rems_assessment'       // periodic REMS assessment report
  | 'annual_status_report'  // PMR/PMC annual status update to FDA
  | 'safety_update'         // periodic safety update report (PSUR/PBRER)
  | 'label_update'          // labeling change implementing a commitment
  | 'manufacturing_data'    // CMC/manufacturing data (process validation, etc.)
  | 'registry_submission'   // data submitted to a registry (e.g. ClinicalTrials.gov)
  | 'specific_data';        // bespoke data package (EU specific obligation)

export interface FulfillmentRequirement {
  type: CommitmentType;
  /** The evidence types that can fulfill (close out) this commitment. */
  acceptedEvidence: FulfillmentEvidenceType[];
  /** Whether interim progress reports are required while the commitment is open. */
  requiresInterimReporting: boolean;
  /** The standard reporting cadence (months between reports), or null if one-shot. */
  reportingCadenceMonths: number | null;
  /** Regulatory consequence of missing the deadline. */
  missedDeadlineConsequence: 'enforcement_action' | 'warning_letter' | 'status_flag' | 'none';
}

const FULFILLMENT_REQUIREMENTS: Record<CommitmentType, FulfillmentRequirement> = {
  pmr: {
    type: 'pmr',
    acceptedEvidence: ['study_report', 'label_update', 'manufacturing_data'],
    requiresInterimReporting: true,
    reportingCadenceMonths: 12,
    missedDeadlineConsequence: 'enforcement_action',
  },
  pmc: {
    type: 'pmc',
    acceptedEvidence: ['study_report', 'label_update', 'manufacturing_data'],
    requiresInterimReporting: true,
    reportingCadenceMonths: 12,
    missedDeadlineConsequence: 'warning_letter',
  },
  rems: {
    type: 'rems',
    acceptedEvidence: ['rems_assessment', 'label_update'],
    requiresInterimReporting: true,
    reportingCadenceMonths: 18,
    missedDeadlineConsequence: 'enforcement_action',
  },
  post_approval_study: {
    type: 'post_approval_study',
    acceptedEvidence: ['study_report', 'interim_report', 'registry_submission'],
    requiresInterimReporting: true,
    reportingCadenceMonths: 12,
    missedDeadlineConsequence: 'warning_letter',
  },
  specific_obligation: {
    type: 'specific_obligation',
    acceptedEvidence: ['study_report', 'specific_data', 'safety_update'],
    requiresInterimReporting: true,
    reportingCadenceMonths: 12,
    missedDeadlineConsequence: 'enforcement_action',
  },
  annual_reportable: {
    type: 'annual_reportable',
    acceptedEvidence: ['annual_status_report'],
    requiresInterimReporting: false,
    reportingCadenceMonths: 12,
    missedDeadlineConsequence: 'status_flag',
  },
};

export function getFulfillmentRequirement(type: CommitmentType): FulfillmentRequirement {
  return FULFILLMENT_REQUIREMENTS[type];
}

// ─── Deadline computation ───────────────────────────────────────────────────

export interface ObligationDeadline {
  commitmentId: string;
  type: CommitmentType;
  /** The next reporting or fulfillment deadline (ISO date string). */
  nextDueDate: string;
  /** Days until the deadline (negative = overdue). */
  daysRemaining: number;
  /** The urgency tier based on days remaining. */
  urgency: 'overdue' | 'critical' | 'approaching' | 'on_track';
  /** Whether this is the final fulfillment deadline vs an interim report. */
  isFinalDeadline: boolean;
}

/** A commitment, with the real date its reporting cadence counts from. */
export interface ScheduledCommitment extends Commitment {
  /**
   * ISO date the reporting cadence counts from — for a PMR/PMC annual status
   * report, the approval date whose anniversary it falls on; for a REMS, the
   * date its assessment timetable runs from. Required to date an interim
   * report, and never estimated.
   */
  reportingAnchorDate?: string;
}

/** An open obligation whose next deadline was not computed, and why. */
export interface UndeterminedDeadline {
  commitmentId: string;
  type: CommitmentType;
  /** The final due date, as supplied: known. The report due before it is not. */
  finalDueDate: string;
  /** What was not computed, naming the missing input. */
  undetermined: string;
}

/** `ms` plus `months` calendar months, on the same day of the month (clamped to the month's last day). */
function addMonthsUtc(ms: number, months: number): number {
  const d = new Date(ms);
  const month = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(d.getUTCFullYear(), month, Math.min(d.getUTCDate(), lastDay));
}

/** Urgency thresholds (in days before due). */
const CRITICAL_THRESHOLD = 30;
const APPROACHING_THRESHOLD = 90;

function urgencyForDays(days: number): ObligationDeadline['urgency'] {
  if (days < 0) return 'overdue';
  if (days <= CRITICAL_THRESHOLD) return 'critical';
  if (days <= APPROACHING_THRESHOLD) return 'approaching';
  return 'on_track';
}

/**
 * Compute the next deadline for a commitment. If the commitment has interim
 * reporting, the next report date is the earlier of the interim cadence —
 * counted from `reportingAnchorDate` — and the final due date. Without that
 * anchor, while the final date is still ahead, the next deadline is
 * undetermined and the result says so.
 */
export function computeDeadline(
  commitment: ScheduledCommitment,
  referenceDate: string,
): ObligationDeadline | UndeterminedDeadline | null {
  if (!commitment.dueDate) return null;
  if (commitment.status === 'fulfilled' || commitment.status === 'released') return null;

  const req = FULFILLMENT_REQUIREMENTS[commitment.type];
  const refMs = new Date(referenceDate).getTime();
  const finalMs = new Date(commitment.dueDate).getTime();

  let nextDueMs = finalMs;
  let isFinalDeadline = true;

  // An interim report can come due before the final deadline only while that is ahead.
  if (req.requiresInterimReporting && req.reportingCadenceMonths && refMs < finalMs) {
    // 2026-10-15: the cadence used to be walked from an invented anchor — the
    // due date minus three years ("commitments are typically 3–5 yr") — and
    // the date it produced was reported as the next deadline.
    const anchorMs = commitment.reportingAnchorDate ? new Date(commitment.reportingAnchorDate).getTime() : NaN;
    if (Number.isNaN(anchorMs)) {
      return {
        commitmentId: commitment.id,
        type: commitment.type,
        finalDueDate: commitment.dueDate,
        undetermined:
          `next report date not computed: this ${commitment.type} reports every ${req.reportingCadenceMonths} months ` +
          `and the date that cadence counts from (reportingAnchorDate) is ${commitment.reportingAnchorDate ? 'not a date' : 'not recorded'}`,
      };
    }
    let periods = 1;
    let cursor = addMonthsUtc(anchorMs, req.reportingCadenceMonths);
    while (cursor < refMs) cursor = addMonthsUtc(anchorMs, ++periods * req.reportingCadenceMonths);

    if (cursor < finalMs) {
      nextDueMs = cursor;
      isFinalDeadline = false;
    }
  }

  const daysRemaining = Math.floor((nextDueMs - refMs) / (24 * 60 * 60 * 1000));

  return {
    commitmentId: commitment.id,
    type: commitment.type,
    nextDueDate: new Date(nextDueMs).toISOString().slice(0, 10),
    daysRemaining,
    urgency: urgencyForDays(daysRemaining),
    isFinalDeadline,
  };
}

// ─── Compliance calendar ────────────────────────────────────────────────────

export interface ComplianceCalendarEntry {
  commitmentId: string;
  productId: string;
  market: CanonicalRegion;
  type: CommitmentType;
  binding: boolean;
  status: CommitmentStatus;
  deadline: ObligationDeadline;
}

/** An active obligation the calendar could not date (see computeDeadline). */
export interface UndeterminedCalendarEntry {
  commitmentId: string;
  productId: string;
  market: CanonicalRegion;
  type: CommitmentType;
  binding: boolean;
  status: CommitmentStatus;
  /** The final due date, as supplied. */
  finalDueDate: string;
  /** What was not computed, naming the missing input. */
  undetermined: string;
}

export interface ComplianceCalendar {
  /** Dated active obligations sorted by urgency (overdue first, then by days remaining). */
  entries: ComplianceCalendarEntry[];
  /** Active obligations whose next deadline was not computed — listed, never dropped. */
  undetermined: UndeterminedCalendarEntry[];
  /** Summary counts. `total` and `binding` count both lists; the urgency counts, dated entries only. */
  summary: {
    total: number;
    overdue: number;
    critical: number;
    approaching: number;
    onTrack: number;
    binding: number;
    undetermined: number;
  };
}

const URGENCY_ORDER: Record<ObligationDeadline['urgency'], number> = {
  overdue: 0,
  critical: 1,
  approaching: 2,
  on_track: 3,
};

/**
 * Build a compliance calendar from a set of commitments. The calendar is the
 * operational view: what's due, when, how urgent, and whether it's legally
 * binding. This is what AnA surfaces to tell a team "you have 2 overdue PMRs
 * and a REMS assessment due in 28 days."
 */
export function buildComplianceCalendar(
  commitments: ScheduledCommitment[],
  referenceDate: string,
): ComplianceCalendar {
  const entries: ComplianceCalendarEntry[] = [];
  const undetermined: UndeterminedCalendarEntry[] = [];

  for (const c of commitments) {
    const deadline = computeDeadline(c, referenceDate);
    if (!deadline) continue;

    const entry = {
      commitmentId: c.id,
      productId: c.productId,
      market: c.market,
      type: c.type,
      binding: isBindingCommitment(c.type),
      status: c.status,
    };
    if ('undetermined' in deadline) {
      undetermined.push({ ...entry, finalDueDate: deadline.finalDueDate, undetermined: deadline.undetermined });
    } else {
      entries.push({ ...entry, deadline });
    }
  }

  entries.sort((a, b) => {
    const urgDiff = URGENCY_ORDER[a.deadline.urgency] - URGENCY_ORDER[b.deadline.urgency];
    if (urgDiff !== 0) return urgDiff;
    return a.deadline.daysRemaining - b.deadline.daysRemaining;
  });

  return {
    entries,
    undetermined,
    summary: {
      total: entries.length + undetermined.length,
      overdue: entries.filter((e) => e.deadline.urgency === 'overdue').length,
      critical: entries.filter((e) => e.deadline.urgency === 'critical').length,
      approaching: entries.filter((e) => e.deadline.urgency === 'approaching').length,
      onTrack: entries.filter((e) => e.deadline.urgency === 'on_track').length,
      binding: [...entries, ...undetermined].filter((e) => e.binding).length,
      undetermined: undetermined.length,
    },
  };
}

// ─── Escalation rules ───────────────────────────────────────────────────────

export type EscalationLevel = 'none' | 'notify' | 'escalate' | 'urgent';

/**
 * The escalation level for a commitment at a given urgency. Binding
 * commitments escalate more aggressively — a missed PMR can trigger
 * FDA enforcement action (civil money penalties under FDAAA §505(o)(4)).
 */
export function escalationLevel(
  type: CommitmentType,
  urgency: ObligationDeadline['urgency'],
): EscalationLevel {
  const binding = isBindingCommitment(type);

  if (urgency === 'overdue') return 'urgent';
  if (urgency === 'critical') return binding ? 'escalate' : 'notify';
  if (urgency === 'approaching') return binding ? 'notify' : 'none';
  return 'none';
}

// ─── PMR/PMC annual status categories (FDA FDAAA §505(o)(3)(E)) ─────────

/**
 * FDA requires annual status reporting for each PMR/PMC using these
 * standardized categories. The status determines whether the commitment
 * appears as progressing or stalled in the FDA's PMR/PMC database.
 */
export type AnnualStatusCategory =
  | 'pending'           // study not yet initiated
  | 'ongoing'           // study underway, on schedule
  | 'delayed'           // study underway but behind schedule
  | 'submitted'         // final report submitted to FDA
  | 'fulfilled'         // FDA has determined the commitment is met
  | 'released'          // FDA has released the applicant from the requirement
  | 'terminated';       // study terminated before completion

/**
 * Map a commitment's current status + urgency to the FDA annual status
 * category for PMR/PMC reporting.
 */
export function annualStatusCategory(
  commitmentStatus: CommitmentStatus,
  urgency: ObligationDeadline['urgency'] | null,
): AnnualStatusCategory {
  if (commitmentStatus === 'fulfilled') return 'fulfilled';
  if (commitmentStatus === 'released') return 'released';
  if (commitmentStatus === 'open') return 'pending';
  if (commitmentStatus === 'in_progress') {
    return urgency === 'overdue' ? 'delayed' : 'ongoing';
  }
  if (commitmentStatus === 'overdue') return 'delayed';
  return 'pending';
}

export default {
  getFulfillmentRequirement,
  computeDeadline,
  buildComplianceCalendar,
  escalationLevel,
  annualStatusCategory,
};
