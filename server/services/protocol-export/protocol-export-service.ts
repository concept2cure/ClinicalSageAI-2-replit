/**
 * Protocol Export service (Capability C2C-20c)
 *
 * Read-only, tenant-scoped: load a protocol document with its sections, objectives,
 * eligibility criteria, and schedule, then assemble an export model + Markdown and a
 * ClinicalTrials.gov PRS registration draft via the pure logic.
 *
 * @module server/services/protocol-export/protocol-export-service
 */

import {
  assembleProtocolExport,
  renderProtocolMarkdown,
  buildCtGovRegistrationDraft,
  isFinalizedStatus,
  type AssembledProtocol,
  type CtGovDraft,
} from './protocol-export-logic';
import { finalizationTarget, readSignatureFacets, withProtocolReadSnapshot, type ProtocolReadSnapshot } from '../protocol-development/protocol-signature-manifestation';
import type { Queryable } from '../authoring/authoring-evidence';

export class ProtocolExportError extends Error {
  constructor(public code: 'NOT_FOUND' | 'SIGNATURE_UNREADABLE' | 'SIGNATURE_VERIFICATION_UNAVAILABLE' | 'SIGNATURE_CONTENT_CHANGED' | 'SIGNATURE_NOT_CURRENT', message: string) {
    super(message);
    this.name = 'ProtocolExportError';
  }
}

export interface ProtocolCompositionSnapshot {
  document: AssembledProtocol;
  sourceRows: {
    document: Record<string, unknown>;
    sections: Record<string, unknown>[]; objectives: Record<string, unknown>[];
    eligibility: Record<string, unknown>[]; visits: Record<string, unknown>[];
    assessments: Record<string, unknown>[]; cells: Record<string, unknown>[];
  };
}

/** Composition and retained row identities use the caller's one snapshot. */
export async function loadProtocolExportSnapshot(orgId: number, documentId: number, executor: Queryable | undefined = undefined, options: { contentOnly?: boolean } = {}): Promise<ProtocolCompositionSnapshot> {
  if (options.contentOnly && executor) return composeProtocolSnapshot(orgId, documentId, executor, options);
  return withProtocolReadSnapshot(orgId, executor, (client, snapshot) => composeProtocolSnapshot(orgId, documentId, client, options, snapshot));
}

async function composeProtocolSnapshot(orgId: number, documentId: number, executor: Queryable, options: { contentOnly?: boolean }, snapshot?: ProtocolReadSnapshot): Promise<ProtocolCompositionSnapshot> {
  const d = await executor.query(
    `SELECT id, title, protocol_number, protocol_kind, design_type, phase, version, synopsis, status, study_design_id
       FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [documentId, orgId],
  );
  if (d.rows.length === 0) throw new ProtocolExportError('NOT_FOUND', 'Protocol document not found for this organization.');
  // A single snapshot client reads sequentially; no concurrent queries are queued on it.
  const sections = await executor.query(`SELECT id, section_key, title, content, required, status, order_index FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [documentId, orgId]);
  const objectives = await executor.query(`SELECT id, objective_type, objective, endpoint, timepoint, order_index FROM protocol_objectives WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [documentId, orgId]);
  const eligibility = await executor.query(`SELECT id, kind, criterion, order_index FROM protocol_eligibility_criteria WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY kind, order_index, id`, [documentId, orgId]);
  const visits = await executor.query(`SELECT id, visit_name, timepoint, procedures, order_index FROM protocol_schedule_visits WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [documentId, orgId]);
  const assessments = await executor.query(`SELECT id, name, category, order_index FROM protocol_soa_assessments WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [documentId, orgId]);
  const cells = await executor.query(`SELECT id, assessment_id, visit_id, required, notes FROM protocol_soa_cells WHERE protocol_document_id = $1 AND organization_id = $2 ORDER BY assessment_id, visit_id, id`, [documentId, orgId]);
  const signatureOf = options.contentOnly
    ? () => ({ state: 'unavailable' as const })
    : await readSignatureFacets(orgId, [finalizationTarget(documentId)], executor, snapshot);
  const r = d.rows[0];
  const document = assembleProtocolExport(
    {
      title: r.title, protocolNumber: r.protocol_number, protocolKind: r.protocol_kind, designType: r.design_type, phase: r.phase, version: r.version, synopsis: r.synopsis,
      status: r.status, finalization: signatureOf(finalizationTarget(documentId)),
      soa: { assessments: assessments.rows.map((a: Record<string, any>) => ({ id: a.id, name: a.name, category: a.category, orderIndex: a.order_index })),
        cells: cells.rows.map((c: Record<string, any>) => ({ assessmentId: c.assessment_id, visitId: c.visit_id, required: c.required, notes: c.notes })) },
    },
    sections.rows.map((s: Record<string, any>) => ({ sectionKey: s.section_key, title: s.title, content: s.content, orderIndex: s.order_index })),
    objectives.rows.map((o: Record<string, any>) => ({ objectiveType: o.objective_type, objective: o.objective, endpoint: o.endpoint, timepoint: o.timepoint })),
    eligibility.rows.map((e: Record<string, any>) => ({ kind: e.kind, criterion: e.criterion })),
    visits.rows.map((v: Record<string, any>) => ({ id: v.id, visitName: v.visit_name, timepoint: v.timepoint, procedures: v.procedures, orderIndex: v.order_index })),
  );
  return { document, sourceRows: { document: r, sections: sections.rows, objectives: objectives.rows, eligibility: eligibility.rows, visits: visits.rows, assessments: assessments.rows, cells: cells.rows } };
}

export async function getProtocolExport(orgId: number, documentId: number, options: { executor?: Queryable; contentOnly?: boolean } = {}): Promise<{ document: AssembledProtocol; markdown: string }> {
  const { document } = await loadProtocolExportSnapshot(orgId, documentId, options.executor, options);
  // Controlled export requires the historical signature to bind this exact
  // current snapshot. A draft content import deliberately carries no signature.
  if (!options.contentOnly && isFinalizedStatus(document.status)) {
    const state = document.finalization.state;
    if (state === 'unavailable') throw new ProtocolExportError('SIGNATURE_UNREADABLE', 'The signature record could not be read, so the finalized protocol was not exported without its signature.');
    if (state === 'unverified') throw new ProtocolExportError('SIGNATURE_VERIFICATION_UNAVAILABLE', 'The signature binding to current protocol content could not be verified. Controlled export is held; the historical signature remains retained.');
    if (state === 'changed') throw new ProtocolExportError('SIGNATURE_CONTENT_CHANGED', 'Current protocol content differs from the content signed. Controlled export is held; the historical signature remains retained.');
    if (state !== 'signed') throw new ProtocolExportError('SIGNATURE_NOT_CURRENT', 'No current electronic signature attests to this protocol. Controlled export is held.');
  }
  return { document, markdown: renderProtocolMarkdown(document, options) };
}

export async function getCtGovDraft(orgId: number, documentId: number, executor?: Queryable): Promise<CtGovDraft> {
  return buildCtGovRegistrationDraft((await loadProtocolExportSnapshot(orgId, documentId, executor)).document);
}
