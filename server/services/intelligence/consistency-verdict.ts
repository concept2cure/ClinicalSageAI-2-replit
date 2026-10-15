/**
 * The verdict and reviewer copy of the cross-document figure reconciler
 * (reconcile_extracted_figures, reconcile_device_documents). The vocabulary
 * (verdicts, reasons, severities) is shared/ana/dossier-consistency.ts.
 *
 * 2026-10-04: check_dossier_consistency and check_numerical_integrity no longer
 * use this module. Trunk's e7021b7bb fixed the same "nothing compared reads as
 * clean" defect in cross-artifact-consistency.ts (notCompared, truncated,
 * signed bounds, set comparison) while row 74's H2/H4 version was unpushed;
 * that one is the canonical implementation, so H2/H4's verdictFor,
 * integrityVerdictFor and their copy were removed at the merge (zero
 * duplication). What follows is the reconciler's, which trunk did not change.
 *
 * 2026-09-28 (row 74, track H): the check said 'clean' ("No consistency issues
 * detected against the existing dossier") on every path that compared
 * nothing: a missing project, a draft under 100 characters, a draft with no
 * labelled figures, a project with no other documents, figures that no other
 * document states under the same label, and a project whose only document is
 * the draft itself, saved. A clean verdict is a finding that the draft agrees
 * with the dossier; with nothing compared it is a false negative. Those paths
 * now report 'not_assessed' with the reason.
 *
 * 2026-09-28 (row 74, track NC; ADR-0015 §7): the same decision for the two
 * other deterministic figure checks, which said 'clean' over nothing compared.
 * checkInternalNumericalIntegrity ("No numerical inconsistencies detected.")
 * did so for a draft with no labelled figure, or with every quantity stated
 * once; the cross-document reconciler (reconcile_extracted_figures,
 * reconcile_device_documents) for a document set with no figure, or with no
 * quantity stated in two documents. integrityVerdictFor and
 * reconciliationVerdictFor decide those verdicts. The severity ladder the
 * reconciler kept its own copy of is findingVerdict, shared now by the dossier
 * check and the reconciler.
 *
 * 2026-09-28 (row 74, track NC review): the integrity check's ladder is
 * findingVerdict too, under its own names (review [8]): a critical candidate
 * is 'likely_inconsistency', any other 'review_candidates'. The copy no longer
 * claims more than was read or compared: content under the extractor's minimum
 * is 'content_too_short' (review [2]); the clean copy states the agreement rule
 * from the agreement spread, not a hard-coded 0.5% (reviews [5], [7]);
 * "compared" in the reconciliation copy is the engine's definition, two places,
 * where a module of one document is a place (reviews [4], [6]); and a caller
 * that read documents (the device reconciler) passes a DocumentScope, so the
 * copy says which text of how many current documents was read and how many
 * superseded or withdrawn versions were set aside (reviews [1], [2]). The
 * example list of labelled figures is one constant for both copies (review [9]).
 *
 * @module server/services/intelligence/consistency-verdict
 */

import {
  type DivergenceSeverity,
  type DossierConsistencyVerdict,
  type ReconciliationNotAssessedReason,
} from '../../../shared/ana/dossier-consistency.js';
import { plural } from '../../../shared/utils/plural.js';

type Findings = ReadonlyArray<{ readonly severity: DivergenceSeverity }>;

/**
 * The verdict for what a comparison found, or null when it found nothing.
 * A divergence found is always reported, whatever else was not compared.
 */
function findingVerdict(found: Findings): 'blocker' | 'needs_review' | 'minor_issues' | null {
  if (found.some(d => d.severity === 'critical')) return 'blocker';
  if (found.some(d => d.severity === 'high')) return 'needs_review';
  return found.length > 0 ? 'minor_issues' : null;
}

/**
 * The verdict of a cross-document figure reconciliation. A conflict found is
 * always reported, even one inside a single document. Without one, 'clean'
 * needs at least one quantity stated in two places: two documents, or two
 * modules of one document.
 */
export function reconciliationVerdictFor(compared: {
  readonly conflicts: Findings;
  /**
   * Current documents read, when the caller read documents (the device
   * reconciler). 0 means every document found was superseded or withdrawn.
   */
  readonly documentsRead?: number;
  readonly figures: number;
  /** Quantities stated in two places (two documents, or two modules of one document). */
  readonly quantitiesCompared: number;
}): { verdict: DossierConsistencyVerdict; notAssessedReason?: ReconciliationNotAssessedReason } {
  const found = findingVerdict(compared.conflicts);
  if (found) return { verdict: found };
  if (compared.documentsRead === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_current_documents' };
  if (compared.figures === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_figures' };
  if (compared.quantitiesCompared === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_shared_quantities' };
  return { verdict: 'clean' };
}

/** Every not_assessed copy ends with this: the reader must not take it for a pass. */
const NOT_A_CLEAN_RESULT = 'this is not a clean result.';

const quantities = (n: number): string => plural(n, 'quantity', 'quantities');



const RECONCILIATION_NOT_ASSESSED_COPY: Record<ReconciliationNotAssessedReason, (figures: number) => string> = {
  no_current_documents: () =>
    'Every document found is superseded or withdrawn, so there was no current document to reconcile.',
  no_figures: () => 'No labelled numeric figure was found in the text read, so nothing was reconciled.',
  no_shared_quantities: figures =>
    `${plural(figures, 'figure')} found, but no quantity is stated in two places (two documents, or two modules ` +
    'of one document), so no figure was compared across them.',
};

/** What a caller that read documents itself read, for the copy (the device reconciler). */
export interface DocumentScope {
  /** The text read from each document, e.g. "summary, risks-identified and benefit-risk narratives". */
  readonly textRead: string;
  /** Current documents read. */
  readonly documentsRead: number;
  /** Superseded or withdrawn versions set aside, not read. */
  readonly versionsSetAside: number;
}

/** "Read: the … of N current documents. M superseded or withdrawn versions set aside and not compared." */
function scopeCopy(scope: DocumentScope | undefined): string {
  if (!scope) return '';
  const read =
    scope.documentsRead > 0 ? ` Read: the ${scope.textRead} of ${plural(scope.documentsRead, 'current document')}.` : '';
  const setAside =
    scope.versionsSetAside > 0
      ? ` ${plural(scope.versionsSetAside, 'superseded or withdrawn version')} set aside and not compared.`
      : '';
  return `${read}${setAside}`;
}

/**
 * The instruction that goes with a reconciliation report. A conflict takes the
 * calling tool's own instruction (`whenConflicts`); 'clean' and 'not_assessed'
 * are stated here once, for every tool over the reconciler. A caller that read
 * documents passes its `scope`, so the copy says what was read and set aside.
 */
export function reconciliationInstructionFor(
  report: {
    readonly verdict: DossierConsistencyVerdict;
    readonly notAssessedReason?: ReconciliationNotAssessedReason;
    readonly figuresReconciled: number;
    readonly quantitiesCompared: number;
  },
  whenConflicts: string,
  scope?: DocumentScope,
): string {
  const read = scopeCopy(scope);
  if (report.verdict === 'not_assessed') {
    const why = report.notAssessedReason
      ? RECONCILIATION_NOT_ASSESSED_COPY[report.notAssessedReason](report.figuresReconciled)
      : 'Nothing was compared.';
    return (
      `${why}${read} Cross-document reconciliation was not assessed; ${NOT_A_CLEAN_RESULT} ` +
      "Do not describe the documents' figures as consistent."
    );
  }
  if (report.verdict === 'clean') {
    return (
      `No cross-document conflicts: ${quantities(report.quantitiesCompared)} compared across documents ` +
      '(or modules of one document), every value within tolerance. Quantities stated in only one place were ' +
      `not compared.${read}`
    );
  }
  return `${whenConflicts}${read}`;
}
