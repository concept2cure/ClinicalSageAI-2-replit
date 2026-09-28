/**
 * The result vocabulary of the dossier consistency check
 * (`check_dossier_consistency`), in one place for the server that produces it
 * and any client that reads it.
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
 * @module shared/ana/dossier-consistency
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

/** Why a report compared nothing (its `notAssessedReason`). */
export const DOSSIER_NOT_ASSESSED_REASONS = [
  /** The project id is not a positive integer, so no project documents were read. */
  'no_project',
  /** The draft is shorter than DOSSIER_CHECK_MIN_DRAFT_LENGTH. */
  'draft_too_short',
  /** The draft states no labelled figure (N =, a dose, a NOAEL, a p-value …). */
  'no_figures_in_draft',
  /** The project holds no documents other than the draft. */
  'no_related_artifacts',
  /** The only project documents found hold the draft's own text: the draft saved. */
  'only_draft_copies',
  /** No other document states any of the draft's figures under the same label. */
  'no_shared_figures',
] as const;

export type DossierNotAssessedReason = (typeof DOSSIER_NOT_ASSESSED_REASONS)[number];

/** The shortest draft the check compares; shorter is 'draft_too_short'. */
export const DOSSIER_CHECK_MIN_DRAFT_LENGTH = 100;
