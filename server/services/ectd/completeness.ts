/**
 * eCTD submission-completeness gate (pure, DB-free).
 *
 * The eCTD exporter synthesizes a "Content Status: PENDING" placeholder leaf
 * whenever a granule has no authored content. A *draft* export may contain such
 * placeholders, but a *submission-grade* export must never assemble a
 * substantively-empty dossier — an eCTD with placeholder leaves (or no content
 * at all) is a Refuse-to-File / technical-rejection risk under the FDA eCTD
 * Technical Conformance Guide and ICH M8. This module computes the completeness
 * report and enforces the gate. It is intentionally free of DB/IO imports so it
 * can be unit-tested directly.
 *
 * @compliance FDA eCTD Technical Conformance Guide; ICH M8 v4.0
 */

export interface IncompleteLeaf {
  granuleId: string;
  granuleName: string;
  status: string;
}

/**
 * Submission-completeness report for a generated eCTD package. A leaf is
 * "complete" when it carries finalized authored content; it is a "placeholder"
 * when the exporter had to synthesize a PENDING stand-in. A submission-grade
 * package must have zero placeholders and at least one content leaf.
 */
export interface CompletenessReport {
  totalLeaves: number;
  completeLeaves: number;
  placeholderLeaves: number;
  completenessPct: number;
  complete: boolean;
  incompleteSections: IncompleteLeaf[];
}

/**
 * Thrown when a submission-grade export would ship placeholder leaves or no
 * content. Carries the completeness report so callers can show exactly which
 * sections are unfinished.
 */
export class EctdCompletenessError extends Error {
  readonly code = 'ECTD_INCOMPLETE';
  readonly completeness: CompletenessReport;
  constructor(completeness: CompletenessReport) {
    super(
      completeness.totalLeaves === 0
        ? 'eCTD package contains no content leaves — there is nothing to file. A submission-grade export requires authored content in the dossier.'
        : `eCTD package is not submission-complete: ${completeness.placeholderLeaves} of ${completeness.totalLeaves} leaf document(s) are unfinished placeholders (${completeness.completenessPct}% complete). A submission-grade export requires every leaf to carry finalized authored content.`,
    );
    this.name = 'EctdCompletenessError';
    this.completeness = completeness;
  }
}

/** Build the submission-completeness report from the leaf tallies. Pure. */
export function computeEctdCompleteness(
  totalLeaves: number,
  placeholderLeaves: number,
  incompleteSections: IncompleteLeaf[] = [],
): CompletenessReport {
  const total = Math.max(0, Math.floor(totalLeaves));
  const placeholders = Math.max(0, Math.min(Math.floor(placeholderLeaves), total));
  const completeLeaves = total - placeholders;
  return {
    totalLeaves: total,
    completeLeaves,
    placeholderLeaves: placeholders,
    completenessPct: total > 0 ? Math.round((completeLeaves / total) * 100) : 0,
    complete: total > 0 && placeholders === 0,
    incompleteSections,
  };
}

/**
 * Enforce the submission-grade completeness gate. Throws EctdCompletenessError
 * when the package is not submission-complete (has placeholders or is empty).
 */
export function assertEctdSubmissionComplete(report: CompletenessReport): void {
  if (!report.complete) throw new EctdCompletenessError(report);
}
