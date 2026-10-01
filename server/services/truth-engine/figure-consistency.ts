/**
 * The consistency check's verdicts, from the deterministic reconciliation
 * engine instead of a model.
 *
 * runConsistencyCheck asked a model to label each claim/source pair `match` or
 * `conflict` and persisted its JSON as findings (CLAUDE.md Rule 2: a verdict
 * comes from an engine; the model narrates). This compares the labelled
 * figures reconcileDossierNumbers extracts — enrolled N, sample size, sites,
 * events, alpha, power, hazard ratio, primary p-value — between the claim and
 * each source. A figure both texts state is a match when they agree and a
 * conflict when they do not. A pair with no figure in common yields no
 * finding and is reported as not compared, never as consistent.
 *
 * @module server/services/truth-engine/figure-consistency
 */

import { reconcileDossierNumbers, type ExtractedFact } from '../ana/dossierReconciliation';

export interface FigureFinding {
  leftRef: string;
  rightRef: string;
  status: 'match' | 'conflict';
  label: string;
  detail: string;
}

export interface FigureComparison {
  findings: FigureFinding[];
  /** Sources that shared no labelled figure with the claim. */
  notCompared: string[];
}

function valuesOf(facts: ExtractedFact[], docId: string, label: string): number[] {
  return [...new Set(facts.filter((f) => f.docId === docId && f.label === label).map((f) => f.value))].sort(
    (a, b) => a - b,
  );
}

export function compareLabelledFigures(
  left: { ref: string; text: string },
  right: ReadonlyArray<{ ref: string; text: string }>,
): FigureComparison {
  const findings: FigureFinding[] = [];
  const notCompared: string[] = [];

  for (const source of right) {
    const result = reconcileDossierNumbers([
      { id: 'left', title: left.ref, text: left.text },
      { id: 'right', title: source.ref, text: source.text },
    ]);
    const conflicting = new Set(result.discrepancies.map((d) => d.label));
    const shared = [...new Set(result.facts.map((f) => f.label))]
      .filter((label) => result.facts.some((f) => f.label === label && f.docId === 'left'))
      .filter((label) => result.facts.some((f) => f.label === label && f.docId === 'right'))
      .sort();

    if (shared.length === 0) {
      notCompared.push(source.ref);
      continue;
    }
    for (const label of shared) {
      const l = valuesOf(result.facts, 'left', label);
      const r = valuesOf(result.facts, 'right', label);
      const status = conflicting.has(label) ? 'conflict' : 'match';
      findings.push({
        leftRef: left.ref,
        rightRef: source.ref,
        status,
        label,
        detail:
          status === 'conflict'
            ? `${label}: ${left.ref} gives ${l.join(', ')}; ${source.ref} gives ${r.join(', ')}.`
            : `${label}: both give ${l.join(', ')}.`,
      });
    }
  }
  return { findings, notCompared };
}
