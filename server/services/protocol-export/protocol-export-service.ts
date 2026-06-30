/**
 * Protocol Export service (Capability C2C-20c)
 *
 * Read-only, tenant-scoped: load a protocol document with its sections, objectives,
 * eligibility criteria, and schedule, then assemble an export model + Markdown and a
 * ClinicalTrials.gov PRS registration draft via the pure logic.
 *
 * @module server/services/protocol-export/protocol-export-service
 */

import { pool } from '../../db';
import {
  assembleProtocolExport,
  renderProtocolMarkdown,
  buildCtGovRegistrationDraft,
  type AssembledProtocol,
  type CtGovDraft,
} from './protocol-export-logic';

export class ProtocolExportError extends Error {
  constructor(public code: 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'ProtocolExportError';
  }
}

async function loadAssembled(orgId: number, documentId: number): Promise<AssembledProtocol> {
  const d = await pool.query(
    `SELECT title, protocol_number, protocol_kind, design_type, phase, version, synopsis
       FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [documentId, orgId],
  );
  if (d.rows.length === 0) throw new ProtocolExportError('NOT_FOUND', 'Protocol document not found for this organization.');
  const [sections, objectives, eligibility, visits] = await Promise.all([
    pool.query(`SELECT section_key, title, content, order_index FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index`, [documentId, orgId]),
    pool.query(`SELECT objective_type, objective, endpoint, timepoint FROM protocol_objectives WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [documentId, orgId]),
    pool.query(`SELECT kind, criterion FROM protocol_eligibility_criteria WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY kind, order_index, id`, [documentId, orgId]),
    pool.query(`SELECT visit_name, timepoint, procedures FROM protocol_schedule_visits WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [documentId, orgId]),
  ]);
  const r = d.rows[0];
  return assembleProtocolExport(
    { title: r.title, protocolNumber: r.protocol_number, protocolKind: r.protocol_kind, designType: r.design_type, phase: r.phase, version: r.version, synopsis: r.synopsis },
    sections.rows.map((s) => ({ sectionKey: s.section_key, title: s.title, content: s.content, orderIndex: s.order_index })),
    objectives.rows.map((o) => ({ objectiveType: o.objective_type, objective: o.objective, endpoint: o.endpoint, timepoint: o.timepoint })),
    eligibility.rows.map((e) => ({ kind: e.kind, criterion: e.criterion })),
    visits.rows.map((v) => ({ visitName: v.visit_name, timepoint: v.timepoint, procedures: v.procedures })),
  );
}

export async function getProtocolExport(orgId: number, documentId: number): Promise<{ document: AssembledProtocol; markdown: string }> {
  const document = await loadAssembled(orgId, documentId);
  return { document, markdown: renderProtocolMarkdown(document) };
}

export async function getCtGovDraft(orgId: number, documentId: number): Promise<CtGovDraft> {
  return buildCtGovRegistrationDraft(await loadAssembled(orgId, documentId));
}
