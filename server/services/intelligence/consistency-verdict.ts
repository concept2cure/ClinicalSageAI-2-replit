/**
 * The verdict of the dossier consistency check, and the reviewer copy that
 * goes with it. Split out of cross-artifact-consistency.ts so the comparison
 * and the judgement of what it found can each be read on their own. The
 * vocabulary (verdicts, reasons, severities) is shared/ana/dossier-consistency.ts.
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
 * from FIGURE_AGREEMENT_SPREAD, not a hard-coded 0.5% (reviews [5], [7]);
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
  DOSSIER_CHECK_MIN_DRAFT_LENGTH,
  FIGURE_AGREEMENT_SPREAD,
  FIGURE_EXTRACTION_MIN_LENGTH,
  type DivergenceSeverity,
  type DossierConsistencyVerdict,
  type DossierNotAssessedReason,
  type NumericalIntegrityNotAssessedReason,
  type NumericalIntegrityVerdict,
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
 * The verdict over what was compared. A divergence found is always reported,
 * whatever else was not compared. Without one, 'clean' needs at least one
 * labelled figure compared with the same label in another project document;
 * a saved copy of the draft is not another document.
 */
export function verdictFor(compared: {
  readonly divergences: Findings;
  /** Other project documents compared: saved copies of the draft excluded. */
  readonly relatedArtifacts: number;
  /** Saved copies of the draft that were set aside. */
  readonly draftCopies: number;
  readonly draftFacts: number;
  readonly figuresCompared: number;
}): { verdict: DossierConsistencyVerdict; notAssessedReason?: DossierNotAssessedReason } {
  const found = findingVerdict(compared.divergences);
  if (found) return { verdict: found };
  if (compared.relatedArtifacts === 0) {
    return {
      verdict: 'not_assessed',
      notAssessedReason: compared.draftCopies > 0 ? 'only_draft_copies' : 'no_related_artifacts',
    };
  }
  if (compared.draftFacts === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_figures_in_draft' };
  if (compared.figuresCompared === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_shared_figures' };
  return { verdict: 'clean' };
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

/**
 * The verdict of the within-document numerical integrity check: the shared
 * ladder under the check's own names. A candidate found is always reported. A
 * critical quantity (dose, NOAEL, MRSD, sample size) stated with two values
 * rarely has a legitimate reading within one drafted section, so it is
 * 'likely_inconsistency'; any other candidate is 'review_candidates'. Without a
 * candidate, 'clean' needs at least one quantity stated more than once.
 */
export function integrityVerdictFor(compared: {
  readonly candidates: Findings;
  /** Characters of content; under FIGURE_EXTRACTION_MIN_LENGTH it is not read for figures. */
  readonly contentLength: number;
  readonly facts: number;
  /** Quantities stated more than once in the document. */
  readonly quantitiesCompared: number;
}): { verdict: NumericalIntegrityVerdict; notAssessedReason?: NumericalIntegrityNotAssessedReason } {
  const found = findingVerdict(compared.candidates);
  if (found) return { verdict: found === 'blocker' ? 'likely_inconsistency' : 'review_candidates' };
  if (compared.contentLength < FIGURE_EXTRACTION_MIN_LENGTH) {
    return { verdict: 'not_assessed', notAssessedReason: 'content_too_short' };
  }
  if (compared.facts === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_figures' };
  if (compared.quantitiesCompared === 0) return { verdict: 'not_assessed', notAssessedReason: 'no_repeated_figures' };
  return { verdict: 'clean' };
}

/** Every not_assessed copy ends with this: the reader must not take it for a pass. */
const NOT_A_CLEAN_RESULT = 'this is not a clean result.';

const quantities = (n: number): string => plural(n, 'quantity', 'quantities');

/** What a "labelled figure" is, in the reviewer's words: one list for every copy. */
const FIGURE_EXAMPLES = '(such as N =, a dose, a NOAEL or a p-value)';

/**
 * When two statements of one figure agree, as both checks that compare prose
 * figures apply it (figuresAgree in cross-artifact-consistency.ts), with the
 * spread read from the shared constant.
 */
const AGREEMENT_RULE =
  'counts and other whole numbers exactly, both bounds of a range, ' +
  `other values within ${Number((FIGURE_AGREEMENT_SPREAD * 100).toPrecision(6))}%`;

const NOT_ASSESSED_COPY: Record<DossierNotAssessedReason, string> = {
  no_project: 'No valid project was given, so no project documents were read.',
  draft_too_short: `The draft is under ${DOSSIER_CHECK_MIN_DRAFT_LENGTH} characters, so it was not compared with the project documents.`,
  no_figures_in_draft: `The draft states no labelled figures ${FIGURE_EXAMPLES}, so no figures were compared with the project documents.`,
  no_related_artifacts: 'The project holds no other documents, so there was nothing to compare the draft with.',
  only_draft_copies:
    "The only project documents found hold the draft's own text (the draft as saved), so there was nothing else to compare it with.",
  no_shared_figures:
    "No other project document states any of the draft's labelled figures under the same label, so no figures were compared.",
};

/** The one-line reviewer copy for a report's verdict. Factual; never a pass when nothing was compared. */
export function recommendationFor(report: {
  readonly verdict: DossierConsistencyVerdict;
  readonly notAssessedReason?: DossierNotAssessedReason;
  readonly figuresCompared: number;
  readonly artifactsCompared: number;
  readonly crossReferencesChecked: number;
  readonly draftCopiesSetAside: number;
}): string {
  const references =
    report.crossReferencesChecked > 0
      ? ` ${plural(report.crossReferencesChecked, 'cross-reference')} resolved against the other project documents.`
      : '';
  const copies =
    report.draftCopiesSetAside > 0
      ? ` ${plural(report.draftCopiesSetAside, 'project document')} with the draft's own text ` +
        `${report.draftCopiesSetAside === 1 ? 'was' : 'were'} set aside and not compared.`
      : '';
  const noFigures = report.figuresCompared === 0 ? ' No labelled figures were compared.' : '';
  switch (report.verdict) {
    case 'not_assessed': {
      const why = report.notAssessedReason ? NOT_ASSESSED_COPY[report.notAssessedReason] : 'Nothing was compared.';
      // A reference that resolved was checked: only the figures went unassessed.
      const scope = report.crossReferencesChecked > 0 ? 'Figure consistency' : 'Consistency';
      return `${why}${references}${copies} ${scope} was not assessed; ${NOT_A_CLEAN_RESULT}`;
    }
    case 'clean':
      return (
        `No consistency issues detected: ${plural(report.artifactsCompared, 'other project document')} read, ` +
        `${plural(report.figuresCompared, 'labelled-figure comparison')}, no difference (${AGREEMENT_RULE}).` +
        `${references}${copies} ` +
        'Draft figures with no matching label in another document were not compared.'
      );
    case 'minor_issues':
      return `Minor consistency issues detected — review before finalizing.${noFigures}`;
    case 'needs_review':
      return `Material consistency issues detected — resolve or justify before recommending for dossier.${noFigures}`;
    case 'blocker':
      return `BLOCKER — critical consistency divergences detected. Revise before proceeding.${noFigures}`;
  }
}

const INTEGRITY_NOT_ASSESSED_COPY: Record<NumericalIntegrityNotAssessedReason, (facts: number) => string> = {
  content_too_short: () =>
    `The content is under ${FIGURE_EXTRACTION_MIN_LENGTH} characters, so it was not read for figures.`,
  no_figures: () => `No labelled figure ${FIGURE_EXAMPLES} was found in the content, so nothing was compared.`,
  no_repeated_figures: facts =>
    `${plural(facts, 'labelled figure')} found, but each quantity is stated only once, so no figure was compared with another.`,
};

/** The one-line reviewer copy for a numerical integrity report. Never a pass when nothing was compared. */
export function integrityRecommendationFor(report: {
  readonly verdict: NumericalIntegrityVerdict;
  readonly notAssessedReason?: NumericalIntegrityNotAssessedReason;
  readonly factsExtracted: number;
  readonly quantitiesCompared: number;
}): string {
  switch (report.verdict) {
    case 'not_assessed': {
      const why = report.notAssessedReason
        ? INTEGRITY_NOT_ASSESSED_COPY[report.notAssessedReason](report.factsExtracted)
        : 'Nothing was compared.';
      return `${why} Numerical integrity was not assessed; ${NOT_A_CLEAN_RESULT}`;
    }
    case 'clean':
      return (
        `No numerical inconsistencies detected: ${quantities(report.quantitiesCompared)} stated more than once, ` +
        `and each agrees wherever it is stated (${AGREEMENT_RULE}). Quantities stated only once were not compared.`
      );
    case 'review_candidates':
      return 'Candidate inconsistencies detected — verify whether each is a real mismatch or documented multi-arm / multi-timepoint variance. Fix genuine mismatches; add disambiguating text for legitimate cases (e.g. "N=648 at Week 26; N=612 at Week 52").';
    case 'likely_inconsistency':
      return 'LIKELY INCONSISTENCY — critical-severity labels (dose, NOAEL, MRSD, sample size) show multiple distinct values. Fix before finalizing — this is RTF territory.';
  }
}

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
