/**
 * The result vocabulary of the deterministic labelled-figure checks, in one
 * place for the server that produces it and any reader (the client, a harness)
 * that interprets it:
 *   - the dossier consistency check (`check_dossier_consistency`): a draft's
 *     figures against the project's other documents;
 *   - cross-document figure reconciliation (`reconcile_extracted_figures`,
 *     `reconcile_device_documents`);
 *   - the within-document numerical integrity check
 *     (`check_numerical_integrity`).
 * The module keeps the name it was created under for the first of them
 * (track H), because readers already import it by that path.
 *
 * 2026-09-28 (row 74, track H): the verdicts gained 'not_assessed', for a check
 * that compared nothing, and the reasons why. The server's copy of the verdict
 * union lived in server/, where the client cannot import it, and the client kept
 * a second, hand-maintained union that had already drifted: it lacked
 * 'not_assessed' and turned any verdict it did not know into 'clean'. A reader
 * that imports these lists cannot drift from what the server sends.
 *
 * 'not_assessed' is the codebase's existing term for "nothing was checked"
 * (etmf-logic.ts, market-formatting-validator.ts). 'not_applicable' is not used:
 * in this codebase it means "the requirement does not apply", and at least one
 * reader (submission-readiness-twin-service.ts) counts it as compliant.
 *
 * 2026-09-28 (row 74, track NC; ADR-0015 §7): the same rule for the two other
 * deterministic figure checks, which answered 'clean' when they had compared
 * nothing. Cross-document figure reconciliation (reconcile_extracted_figures,
 * reconcile_device_documents) uses DOSSIER_CONSISTENCY_VERDICTS, the same
 * five verdicts, with its own reasons. The within-document numerical integrity
 * check (check_numerical_integrity) keeps its own verdict names, because it
 * reports candidates for a person to adjudicate rather than divergences, and
 * gains 'not_assessed' with its reasons.
 *
 * 2026-09-28 (row 74, track NC review): one agreement rule and one reading
 * threshold for every check here. FIGURE_AGREEMENT_SPREAD was a bare 0.005 in
 * two places in the engine and a hard-coded "0.5%" in the copy (review [7]);
 * FIGURE_EXTRACTION_MIN_LENGTH was a bare 20 in the extractor, and the
 * integrity check said "states no labelled figure" of content it had not read
 * (review [2]). The reasons 'content_too_short' (integrity) and
 * 'no_current_documents' (reconciliation) are new.
 *
 * Three reason lists, not one union: each check returns only reasons it can
 * produce, so a reader that switches on one list is exhaustive for that check.
 * "No labelled figure" is 'no_figures' in the two single-sided checks. The
 * dossier check keeps 'no_figures_in_draft' (track H, already read by its
 * consumers): it reads two sides, and the name says the draft is the side
 * that had none.
 *
 * @module shared/ana/dossier-consistency
 *
 * 2026-10-04: the dossier check's and the numerical integrity check's own
 * reasons, verdicts and length constants were removed at the merge with trunk's
 * e7021b7bb, which is now the canonical implementation of both checks
 * (cross-artifact-consistency.ts). What remains serves the figure reconciler.
 */

/** Severity of one divergence the check found. */
export type DivergenceSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Every verdict the check returns. 'not_assessed' means nothing was compared,
 * so there is no finding either way: it is not a clean result, and a reader
 * must never count it as one.
 */
export const DOSSIER_CONSISTENCY_VERDICTS = [
  'clean',
  'minor_issues',
  'needs_review',
  'blocker',
  'not_assessed',
] as const;

export type DossierConsistencyVerdict = (typeof DOSSIER_CONSISTENCY_VERDICTS)[number];

/**
 * Why a cross-document figure reconciliation compared nothing (its
 * `notAssessedReason`). Its verdicts are DOSSIER_CONSISTENCY_VERDICTS.
 */
export const RECONCILIATION_NOT_ASSESSED_REASONS = [
  /**
   * Every document found is superseded or withdrawn, so no current document
   * was read (the device reconciler).
   */
  'no_current_documents',
  /** No labelled numeric figure was found in the text read, so nothing was reconciled. */
  'no_figures',
  /**
   * No quantity is stated in two places: two documents, or two modules of one
   * document. A figure with no module is its document, not a place of its own.
   */
  'no_shared_quantities',
] as const;

export type ReconciliationNotAssessedReason = (typeof RECONCILIATION_NOT_ASSESSED_REASONS)[number];
