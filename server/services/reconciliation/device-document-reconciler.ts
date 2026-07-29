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
 * @module server/services/reconciliation/device-document-reconciler
 */

import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { postMarketDocuments } from '../../../shared/schema/gspr-postmarket';
import { extractNumericalFacts } from '../intelligence/cross-artifact-consistency';
import {
  reconcileDossierNumbers,
  type ExtractedFigure,
  type ReconciliationReport,
} from './dossier-number-reconciler';

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
  documentsScanned: number;
  report: ReconciliationReport;
}

export interface DeviceReconcileFailure {
  ok: false;
  code: 'not_found';
  message: string;
}

/**
 * Reconcile the numeric governed quantities across a device/IVD program's
 * post-market documents. Returns 'clean' (with an empty report) when fewer than
 * two documents carry comparable figures — there is nothing to disagree.
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

  const figures: ExtractedFigure[] = [];
  for (const doc of docs) {
    const prose = [doc.summary, doc.risksIdentified, doc.benefitRiskConclusion]
      .filter(Boolean)
      .join('\n\n');
    figures.push(...documentToFigures({ id: doc.id, documentType: doc.documentType, prose }));
  }

  // reconcileDossierNumbers throws on an empty figure set; short-circuit to a
  // clean report so "nothing to reconcile" is a success, not an error.
  if (figures.length === 0) {
    return {
      ok: true,
      programId: params.programId,
      documentsScanned: docs.length,
      report: {
        figuresReconciled: 0,
        quantityKeysExamined: 0,
        conflictCount: 0,
        conflicts: [],
        verdict: 'clean',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  const report = reconcileDossierNumbers({ figures, tolerance: params.tolerance });
  return { ok: true, programId: params.programId, documentsScanned: docs.length, report };
}
