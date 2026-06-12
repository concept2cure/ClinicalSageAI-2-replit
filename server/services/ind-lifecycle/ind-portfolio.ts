/**
 * IND portfolio view.
 *
 * A program-manager / CRO roll-up: every IND submission for an organization at a
 * glance, each with its eCTD sequence summary, plus portfolio totals. Pure /
 * deterministic — the route lists the submissions + their sequences; this folds
 * them together.
 */

import { summarizeSequences, type SequenceLike, type SequenceSummary } from './ind-submission-overview';
import type { DriftDigest } from './ind-cockpit';

/** The submission fields the portfolio reads (a structural subset of the row). */
export interface PortfolioSubmission {
  id: number;
  title: string;
  productName?: string | null;
  lifecycleStage?: string | null;
  status?: string | null;
  applicationType?: string | null;
}

export interface IndPortfolioEntry {
  submissionId: number;
  title: string;
  productName: string | null;
  lifecycleStage: string;
  status: string;
  sequenceSummary: SequenceSummary;
}

export interface IndPortfolio {
  entries: IndPortfolioEntry[];
  totals: {
    submissions: number;
    totalSequences: number;
    dispatched: number;
    validationFailures: number;
  };
}

/** Build one portfolio entry from a submission + its sequences. */
export function buildIndPortfolioEntry(
  submission: PortfolioSubmission,
  sequences: SequenceLike[],
): IndPortfolioEntry {
  return {
    submissionId: submission.id,
    title: submission.title,
    productName: submission.productName ?? null,
    lifecycleStage: submission.lifecycleStage ?? 'planning',
    status: submission.status ?? 'planning',
    sequenceSummary: summarizeSequences(sequences),
  };
}

/** Fold the entries into the portfolio with org-level totals. */
export function buildIndPortfolio(entries: IndPortfolioEntry[]): IndPortfolio {
  return {
    entries,
    totals: {
      submissions: entries.length,
      totalSequences: entries.reduce((n, e) => n + e.sequenceSummary.total, 0),
      dispatched: entries.reduce((n, e) => n + e.sequenceSummary.dispatched, 0),
      validationFailures: entries.reduce((n, e) => n + e.sequenceSummary.validationFailures, 0),
    },
  };
}

/** Whether a submission is an IND (drives the portfolio filter). */
export function isIndSubmission(s: PortfolioSubmission): boolean {
  return (s.applicationType ?? '').toLowerCase() === 'ind';
}

// ── Org-wide drift sweep ─────────────────────────────────────────────────────

export interface PortfolioDriftEntry {
  submissionId: number;
  title: string;
  productName: string | null;
  drift: DriftDigest;
}

export interface PortfolioDrift {
  /** Only submissions that have at least one drifted/never-verified sequence. */
  submissions: PortfolioDriftEntry[];
  totals: {
    submissionsWithIssues: number;
    sequencesDrifted: number;
    sequencesNeverVerified: number;
  };
}

/**
 * Aggregate per-submission drift digests into an org-wide compliance feed.
 * Only submissions with at least one issue are listed; totals sum across all.
 */
export function buildPortfolioDrift(
  inputs: Array<{ submission: PortfolioSubmission; drift: DriftDigest }>,
): PortfolioDrift {
  const submissions: PortfolioDriftEntry[] = [];
  let sequencesDrifted = 0;
  let sequencesNeverVerified = 0;

  for (const { submission, drift } of inputs) {
    sequencesDrifted += drift.summary.drifted;
    sequencesNeverVerified += drift.summary.neverVerified;
    if (drift.summary.total > 0) {
      submissions.push({
        submissionId: submission.id,
        title: submission.title,
        productName: submission.productName ?? null,
        drift,
      });
    }
  }

  return {
    submissions,
    totals: {
      submissionsWithIssues: submissions.length,
      sequencesDrifted,
      sequencesNeverVerified,
    },
  };
}
