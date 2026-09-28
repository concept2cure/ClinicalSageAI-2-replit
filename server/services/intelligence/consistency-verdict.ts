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
 * @module server/services/intelligence/consistency-verdict
 */

import {
  DOSSIER_CHECK_MIN_DRAFT_LENGTH,
  type DivergenceSeverity,
  type DossierConsistencyVerdict,
  type DossierNotAssessedReason,
} from '../../../shared/ana/dossier-consistency.js';
import { plural } from '../../../shared/utils/plural.js';

/**
 * The verdict over what was compared. A divergence found is always reported,
 * whatever else was not compared. Without one, 'clean' needs at least one
 * labelled figure compared with the same label in another project document;
 * a saved copy of the draft is not another document.
 */
export function verdictFor(compared: {
  readonly divergences: ReadonlyArray<{ readonly severity: DivergenceSeverity }>;
  /** Other project documents compared: saved copies of the draft excluded. */
  readonly relatedArtifacts: number;
  /** Saved copies of the draft that were set aside. */
  readonly draftCopies: number;
  readonly draftFacts: number;
  readonly figuresCompared: number;
}): { verdict: DossierConsistencyVerdict; notAssessedReason?: DossierNotAssessedReason } {
  const { divergences } = compared;
  if (divergences.some(d => d.severity === 'critical')) return { verdict: 'blocker' };
  if (divergences.some(d => d.severity === 'high')) return { verdict: 'needs_review' };
  if (divergences.length > 0) return { verdict: 'minor_issues' };
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

const NOT_ASSESSED_COPY: Record<DossierNotAssessedReason, string> = {
  no_project: 'No valid project was given, so no project documents were read.',
  draft_too_short: `The draft is under ${DOSSIER_CHECK_MIN_DRAFT_LENGTH} characters, so it was not compared with the project documents.`,
  no_figures_in_draft:
    'The draft states no labelled figures (such as N =, a dose, a NOAEL or a p-value), so no figures were compared with the project documents.',
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
      return `${why}${references}${copies} ${scope} was not assessed; this is not a clean result.`;
    }
    case 'clean':
      return (
        `No consistency issues detected: ${plural(report.artifactsCompared, 'other project document')} read, ` +
        `${plural(report.figuresCompared, 'labelled-figure comparison')}, no difference.${references}${copies} ` +
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
