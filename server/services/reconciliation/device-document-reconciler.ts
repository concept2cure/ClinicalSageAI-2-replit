/**
 * Device / IVD cross-document reconciler.
 *
 * The device analogue of the pharma dossier reconciliation: the same governed
 * quantity (clinical sensitivity, specificity, LoD, precision CV, RPN …) is
 * often restated across a program's device documents — the technical
 * documentation, the SE discussion, the CER, the IFU, and the post-market
 * reports — and those restatements drift apart. This reconciler pulls the
 * program's device documents, extracts the labelled numbers with the
 * (now device-aware) extractor, and runs them through the existing, pure
 * reconcileDossierNumbers engine so a cross-document divergence surfaces with
 * its distinct values, sources, consensus, and severity.
 *
 * No new reconciliation logic and no new tables: this is a thin loader + mapper
 * over reconcileDossierNumbers. Text identifiers (predicate K-numbers) are not
 * numeric, so they are out of scope here — numeric performance/risk quantities
 * are where reviewer-relevant drift lives.
 *
 * 2026-09-28 (row 74, track NC; ADR-0015 §7): nothing compared is no longer
 * 'clean'. Documents that state no labelled figure used to short-circuit to a
 * hand-built 'clean' report with figuresReconciled 0, and a programme whose
 * figures all sit in one document was 'clean' from the engine. They now report
 * verdict 'not_assessed' with `notAssessedReason` ('no_figures',
 * 'no_shared_quantities'), decided by the engine's one verdict function.
 *
 * 2026-09-28 (row 74, track NC review [1]): only current documents are
 * reconciled. supersedeDocument (post-market.service.ts) inserts the new
 * version with the old one's narratives copied verbatim and marks the old row
 * 'superseded'; both rows were read, so a programme whose only PSUR had been
 * superseded once compared that PSUR with its own copy and came back 'clean'
 * ("1 quantity compared"), and a value corrected in the new version read as a
 * conflict with the old. A superseded or withdrawn document, or one another
 * document names as its previous version, is now set aside and counted
 * (`versionsSetAside`), never compared; `documentsScanned` counts the current
 * documents read. With none current, the reason is 'no_current_documents'.
 *
 * @module server/services/reconciliation/device-document-reconciler
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { postMarketDocuments } from '../../../shared/schema/gspr-postmarket';
import { extractNumericalFacts } from '../intelligence/cross-artifact-consistency';
import {
  noFiguresReport,
  reconcileDossierNumbers,
  type ExtractedFigure,
  type ReconciliationReport,
} from './dossier-number-reconciler';

/**
 * The text read from each document, for the copy. The structured `content`
 * JSON is not read: a figure only it states is not reconciled.
 */
export const DEVICE_TEXT_READ = 'summary, risks-identified and benefit-risk narratives (not the structured content)';

/** Lifecycle statuses whose document is no longer the programme's claim. */
const RETIRED_STATUSES: ReadonlySet<string> = new Set(['superseded', 'withdrawn']);

/**
 * The programme's current documents, and the versions set aside. A document is
 * set aside when it is superseded or withdrawn, or when another document names
 * it as its previous version (the successor exists even if the old row's status
 * was never updated). Comparing a version with its successor compares a
 * document with its own copy.
 */
export function currentDocuments<T extends { id: string; status?: string | null; previousDocumentId?: string | null }>(
  docs: readonly T[],
): { current: T[]; setAside: T[] } {
  const succeeded = new Set(docs.map(d => d.previousDocumentId).filter((id): id is string => !!id));
  const current: T[] = [];
  const setAside: T[] = [];
  for (const doc of docs) {
    (RETIRED_STATUSES.has(doc.status ?? '') || succeeded.has(doc.id) ? setAside : current).push(doc);
  }
  return { current, setAside };
}

/** Turn one device document's prose into reconciler figures (numeric labels only). */
export function documentToFigures(doc: {
  id: string;
  documentType: string;
  prose: string;
}): ExtractedFigure[] {
  const figures: ExtractedFigure[] = [];
  for (const fact of extractNumericalFacts(doc.prose)) {
    const value = parseFloat(fact.value.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue; // skip text identifiers (K-numbers etc.)
    figures.push({
      quantityKey: fact.label,
      value,
      unit: fact.unit,
      source: { documentId: doc.id, section: doc.documentType, span: `offset:${fact.offset}` },
    });
  }
  return figures;
}

export interface DeviceReconcileResult {
  ok: true;
  programId: string;
  /** Current documents read. Superseded or withdrawn versions are not: see versionsSetAside. */
  documentsScanned: number;
  /** Superseded or withdrawn versions, and versions another document succeeds, set aside and not compared. */
  versionsSetAside: number;
  report: ReconciliationReport;
}

export interface DeviceReconcileFailure {
  ok: false;
  code: 'not_found';
  message: string;
}

/**
 * Reconcile the numeric governed quantities across a device/IVD program's
 * current post-market documents. When no quantity is stated in two current
 * documents, nothing was compared: the report's verdict is 'not_assessed' with
 * the reason, never 'clean'. A programme with no documents is not_found.
 */
export async function reconcileDeviceDocuments(params: {
  programId: string;
  organizationId: number;
  tolerance?: { absolute?: number; relative?: number };
}): Promise<DeviceReconcileResult | DeviceReconcileFailure> {
  const docs = await db
    .select({
      id: postMarketDocuments.id,
      documentType: postMarketDocuments.documentType,
      summary: postMarketDocuments.summary,
      risksIdentified: postMarketDocuments.risksIdentified,
      benefitRiskConclusion: postMarketDocuments.benefitRiskConclusion,
      status: postMarketDocuments.status,
      previousDocumentId: postMarketDocuments.previousDocumentId,
    })
    .from(postMarketDocuments)
    .where(
      and(
        eq(postMarketDocuments.organizationId, params.organizationId),
        eq(postMarketDocuments.programId, params.programId)
      )
    );

  if (docs.length === 0) {
    return { ok: false, code: 'not_found', message: 'No post-market documents for this program' };
  }

  const { current, setAside } = currentDocuments(docs);
  const figures: ExtractedFigure[] = [];
  for (const doc of current) {
    const prose = [doc.summary, doc.risksIdentified, doc.benefitRiskConclusion]
      .filter(Boolean)
      .join('\n\n');
    figures.push(...documentToFigures({ id: doc.id, documentType: doc.documentType, prose }));
  }

  // reconcileDossierNumbers refuses an empty figure set as a parameter error.
  // Documents that state no figure are a result, not an error: not_assessed.
  const report =
    figures.length === 0
      ? noFiguresReport(current.length)
      : reconcileDossierNumbers({ figures, tolerance: params.tolerance });
  return {
    ok: true,
    programId: params.programId,
    documentsScanned: current.length,
    versionsSetAside: setAside.length,
    report,
  };
}
