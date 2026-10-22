/**
 * Cross-document reconciliation for figures MINED FROM PROSE.
 *
 * The third entry to one engine. `reconcileDossierNumbers` groups already-extracted
 * figures by quantity across a dossier's documents and decides the verdict;
 * `device-document-reconciler` feeds it a device programme's documents. This feeds it text:
 * it mines each document with `extractNumericalFacts` — the platform's one labelled-figure
 * lexicon — normalises each value once with `numericValueOf`, and hands the result over.
 *
 * It adds no reconciliation logic of its own, which is the whole point. `ana/dossierReconciliation.ts`
 * (deleted 2026-10-19) held a second copy of the lexicon AND a second grouping
 * implementation, and that second implementation reported every label it saw once as
 * `consistentLabels` — so a figure stated in one document, compared against nothing, read
 * as consistent. The engine here has answered that since 2026-09-28: nothing compared is
 * `not_assessed` with a reason, never 'clean'.
 *
 * @module server/services/reconciliation/mined-figure-reconciler
 */

import {
  extractNumericalFacts,
  numericValueOf,
} from '../intelligence/cross-artifact-consistency.js';
import {
  noFiguresReport,
  reconcileDossierNumbers,
  type ExtractedFigure,
  type ReconcileTolerance,
  type ReconciliationReport,
} from './dossier-number-reconciler.js';

export interface MinedDocument {
  /** Stable identifier (artifact id, module code, file name). */
  id: string;
  /** CTD module, when the caller knows it ("2.5", "2.7.3"). */
  module?: string;
  /** Plain text to mine. */
  text: string;
}

/** What text this reconciler reads, for the reviewer copy. */
export const MINED_TEXT_READ = 'the plain text of each document supplied (labelled figures only)';

/**
 * Mine each document's labelled figures and reconcile them across the set.
 *
 * Throws a parameter-validation Error (phrased so the AnA layer relays it as
 * needs_parameters) when the documents are missing or malformed. A set that states no
 * labelled figure at all is `not_assessed` / `no_figures`, not a clean report.
 */
export function reconcileMinedFigures(
  documents: ReadonlyArray<MinedDocument>,
  tolerance?: ReconcileTolerance,
): ReconciliationReport {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error('documents[] is required and each document must have a string id and string text.');
  }
  for (const [i, doc] of documents.entries()) {
    if (!doc || typeof doc !== 'object') throw new Error(`documents[${i}] must be an object.`);
    if (typeof doc.id !== 'string' || doc.id.trim() === '') {
      throw new Error(`documents[${i}].id is required and must be a non-empty string.`);
    }
    if (typeof doc.text !== 'string') {
      throw new Error(`documents[${i}].text is required and must be a string.`);
    }
  }

  const figures: ExtractedFigure[] = [];
  for (const doc of documents) {
    for (const fact of extractNumericalFacts(doc.text)) {
      const value = numericValueOf(fact);
      /* Not a number — a predicate K-number, or a value carrying a unit the lexicon keeps
         as text. Left out rather than coerced: a 0 standing in for a figure nobody read
         would agree with the next 0. */
      if (value === null) continue;
      figures.push({
        quantityKey: fact.label,
        value,
        unit: fact.unit,
        source: { documentId: doc.id, module: doc.module, span: String(fact.offset) },
      });
    }
  }

  // The engine requires at least one figure; a set with none is not_assessed/'no_figures',
  // which is the report noFiguresReport builds rather than a hand-made 'clean' one.
  if (figures.length === 0) return noFiguresReport(documents.length);

  return reconcileDossierNumbers({ figures, tolerance });
}
