/**
 * IND portfolio view.
 *
 * A program-manager / CRO roll-up: every IND submission for an organization at a
 * glance, each with its eCTD sequence summary, plus portfolio totals. Pure /
 * deterministic — the route lists the submissions + their sequences; this folds
 * them together.
 */

import { summarizeSequences, type SequenceLike, type SequenceSummary } from './ind-submission-overview';

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
