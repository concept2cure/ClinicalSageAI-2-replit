/**
 * Protocol Development service (Capability C2C-17)
 *
 * Tenant-scoped transaction functions for authoring a protocol: create a document
 * (auto-seeded with the kind's templated sections), edit sections, add structured
 * objectives / eligibility criteria / schedule-of-assessment visits / study team,
 * snapshot versions, and finalize behind a deterministic completeness gate.
 * Mutations run inside the caller's transaction with the governed-action ledger.
 *
 * @module server/services/protocol-development/protocol-development-service
 */

import { pool } from '../../db';
import {
  templateFor,
  evaluateCompleteness,
  nextVersion,
  type ProtocolKind,
  type CompletenessResult,
} from './protocol-development-logic';
import {
  enforceAuthorLineage,
  enforceSourceAndAuthorLineage,
  type SourceAndAuthorLineageResult,
} from '../clinical-regulatory-evidence/lineage-gate';
import type { RetrievedSource } from '../clinical-regulatory-evidence/source-attribution';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolDevError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolDevError';
  }
}

const KINDS = ['iacuc', 'irb', 'clinical', 'ibc'];

// ─── Documents ───────────────────────────────────────────────────────────────

export interface ProtocolDocInput {
  protocolKind: ProtocolKind;
  title: string;
  protocolNumber?: string | null;
  designType?: string | null;
  phase?: string | null;
  therapeuticArea?: string | null;
  linkedProtocolId?: number | null;
  synopsis?: string | null;
}

/** Create a protocol document and seed it with the kind's templated sections. */
export async function createProtocolDocumentTx(client: Queryable, orgId: number, userId: number, input: ProtocolDocInput): Promise<{ id: number; sectionsSeeded: number }> {
  if (!KINDS.includes(input.protocolKind)) throw new ProtocolDevError('BAD_INPUT', `Invalid protocol_kind "${input.protocolKind}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_documents (organization_id, protocol_kind, linked_protocol_id, protocol_number, title, design_type, phase, therapeutic_area, version, status, synopsis, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'0.1','draft',$9,$10) RETURNING id`,
    [orgId, input.protocolKind, input.linkedProtocolId ?? null, input.protocolNumber ?? null, input.title, input.designType ?? null, input.phase ?? null, input.therapeuticArea ?? null, input.synopsis ?? null, userId],
  );
  const id = Number(rows[0].id);
  const template = templateFor(input.protocolKind);
  let order = 0;
  for (const s of template) {
    await client.query(
      `INSERT INTO protocol_sections (organization_id, protocol_document_id, section_key, title, required, status, order_index, created_by)
       VALUES ($1,$2,$3,$4,$5,'not_started',$6,$7)`,
      [orgId, id, s.sectionKey, s.title, s.required, order++, userId],
    );
  }
  return { id, sectionsSeeded: template.length };
}

async function loadDoc(client: Queryable, orgId: number, docId: number): Promise<{ kind: ProtocolKind; status: string; version: string }> {
  const d = await client.query(`SELECT protocol_kind, status, version FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [docId, orgId]);
  if (d.rows.length === 0) throw new ProtocolDevError('NOT_FOUND', 'Protocol document not found for this organization.');
  return { kind: d.rows[0].protocol_kind, status: d.rows[0].status, version: d.rows[0].version };
}

function assertEditable(status: string): void {
  if (status === 'finalized' || status === 'superseded') throw new ProtocolDevError('INVALID_STATE', `Protocol is ${status}; create a new version to edit.`);
}

export async function updateSynopsisTx(client: Queryable, orgId: number, docId: number, synopsis: string, actorUserId: number): Promise<void> {
  const doc = await loadDoc(client, orgId, docId);
  assertEditable(doc.status);
  await client.query(`UPDATE protocol_documents SET synopsis = $3, status = CASE WHEN status = 'draft' THEN 'in_development' ELSE status END, updated_at = now() WHERE id = $1 AND organization_id = $2`, [docId, orgId, synopsis]);
  // Prose gate: the synopsis is authored protocol text — record its author
  // lineage and assert coverage in this transaction, so content and provenance
  // commit together (the caller opens the transaction; see routes/protocol-
  // development.ts governed() and AnaToolExecutor).
  await enforceAuthorLineage(client, orgId, { documentTable: 'protocol_documents', documentId: String(docId) }, synopsis, String(actorUserId));
}

// ─── Sections ────────────────────────────────────────────────────────────────

export async function updateSectionTx(client: Queryable, orgId: number, sectionId: number, input: { content?: string | null; status?: string; sources?: RetrievedSource[] }, actorUserId: number): Promise<SourceAndAuthorLineageResult | null> {
  if (input.status && !['not_started', 'draft', 'complete'].includes(input.status)) throw new ProtocolDevError('BAD_INPUT', `Invalid status "${input.status}".`);
  const sec = await client.query(
    `SELECT s.id, d.status AS doc_status, d.id AS doc_id FROM protocol_sections s JOIN protocol_documents d ON d.id = s.protocol_document_id
      WHERE s.id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL LIMIT 1`,
    [sectionId, orgId],
  );
  if (sec.rows.length === 0) throw new ProtocolDevError('NOT_FOUND', 'Section not found for this organization.');
  assertEditable(sec.rows[0].doc_status);
  await client.query(
    `UPDATE protocol_sections SET content = COALESCE($3, content), status = COALESCE($4, status), updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [sectionId, orgId, input.content ?? null, input.status ?? null],
  );
  // Prose gate: when this edit sets section content, record its author lineage
  // and assert coverage in this transaction. A status-only edit (content
  // undefined/null) no-ops the gate inside the helper, matching the COALESCE
  // that leaves content unchanged.
  // With `sources` (an AnA draft naming the Data Room passages it quoted —
  // ledger L154), the clauses that quote them verbatim are recorded against
  // those sources and the rest against the author; without, every clause is
  // the author's assertion. Same gate, same transaction, either way.
  let lineage: SourceAndAuthorLineageResult | null = null;
  if (input.sources && input.sources.length > 0 && typeof input.content === 'string') {
    lineage = await enforceSourceAndAuthorLineage(client, orgId, { documentTable: 'protocol_sections', documentId: String(sectionId) }, input.content, String(actorUserId), input.sources);
  } else {
    await enforceAuthorLineage(client, orgId, { documentTable: 'protocol_sections', documentId: String(sectionId) }, input.content ?? null, String(actorUserId));
  }
  await client.query(`UPDATE protocol_documents SET status = CASE WHEN status = 'draft' THEN 'in_development' ELSE status END, updated_at = now() WHERE id = $1 AND organization_id = $2`, [sec.rows[0].doc_id, orgId]);
  return lineage;
}

// ─── Structured components ───────────────────────────────────────────────────

export async function addObjectiveTx(client: Queryable, orgId: number, userId: number, docId: number, input: { objectiveType?: string; objective: string; endpoint?: string | null; timepoint?: string | null }): Promise<{ id: number }> {
  const doc = await loadDoc(client, orgId, docId);
  assertEditable(doc.status);
  if (input.objectiveType && !['primary', 'secondary', 'exploratory'].includes(input.objectiveType)) throw new ProtocolDevError('BAD_INPUT', `Invalid objective_type "${input.objectiveType}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_objectives (organization_id, protocol_document_id, objective_type, objective, endpoint, timepoint, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, docId, input.objectiveType ?? 'primary', input.objective, input.endpoint ?? null, input.timepoint ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function addEligibilityCriterionTx(client: Queryable, orgId: number, userId: number, docId: number, input: { kind: string; criterion: string }): Promise<{ id: number }> {
  const doc = await loadDoc(client, orgId, docId);
  assertEditable(doc.status);
  if (!['inclusion', 'exclusion'].includes(input.kind)) throw new ProtocolDevError('BAD_INPUT', `Invalid eligibility kind "${input.kind}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_eligibility_criteria (organization_id, protocol_document_id, kind, criterion, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [orgId, docId, input.kind, input.criterion, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function addVisitTx(client: Queryable, orgId: number, userId: number, docId: number, input: { visitName: string; timepoint?: string | null; procedures?: string[] | null }): Promise<{ id: number }> {
  const doc = await loadDoc(client, orgId, docId);
  assertEditable(doc.status);
  const { rows } = await client.query(
    `INSERT INTO protocol_schedule_visits (organization_id, protocol_document_id, visit_name, timepoint, procedures, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [orgId, docId, input.visitName, input.timepoint ?? null, input.procedures ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

export async function addTeamMemberTx(client: Queryable, orgId: number, userId: number, docId: number, input: { memberName: string; role?: string; personnelId?: number | null; userId?: number | null; responsibilities?: string | null }): Promise<{ id: number }> {
  const doc = await loadDoc(client, orgId, docId);
  assertEditable(doc.status);
  if (input.personnelId != null) {
    const p = await client.query(`SELECT id FROM research_personnel WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [input.personnelId, orgId]);
    if (p.rows.length === 0) throw new ProtocolDevError('NOT_FOUND', 'Research-personnel record not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO protocol_team_members (organization_id, protocol_document_id, personnel_id, user_id, member_name, role, responsibilities, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orgId, docId, input.personnelId ?? null, input.userId ?? null, input.memberName, input.role ?? 'co_investigator', input.responsibilities ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Completeness + finalize + versioning ────────────────────────────────────

async function completenessInputFor(orgId: number, docId: number, kind: ProtocolKind) {
  const sections = await pool.query(`SELECT section_key, title, required, status FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [docId, orgId]);
  const objectives = await pool.query(`SELECT count(*)::int n FROM protocol_objectives WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [docId, orgId]);
  const incl = await pool.query(`SELECT count(*)::int n FROM protocol_eligibility_criteria WHERE protocol_document_id = $1 AND organization_id = $2 AND kind = 'inclusion' AND deleted_at IS NULL`, [docId, orgId]);
  const excl = await pool.query(`SELECT count(*)::int n FROM protocol_eligibility_criteria WHERE protocol_document_id = $1 AND organization_id = $2 AND kind = 'exclusion' AND deleted_at IS NULL`, [docId, orgId]);
  const visits = await pool.query(`SELECT count(*)::int n FROM protocol_schedule_visits WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [docId, orgId]);
  return {
    sections: sections.rows.map((s) => ({ sectionKey: s.section_key, title: s.title, required: s.required, status: s.status })),
    objectiveCount: objectives.rows[0].n,
    inclusionCount: incl.rows[0].n,
    exclusionCount: excl.rows[0].n,
    scheduleVisitCount: visits.rows[0].n,
    kind,
  };
}

/** Read-only completeness assessment (uses the pure evaluateCompleteness). */
export async function getCompleteness(orgId: number, docId: number): Promise<CompletenessResult> {
  const doc = await loadDoc(pool, orgId, docId);
  return evaluateCompleteness(await completenessInputFor(orgId, docId, doc.kind));
}

/** Snapshot the current document + sections as a version row and bump the minor version. */
export async function snapshotVersionTx(client: Queryable, orgId: number, userId: number, docId: number, changeSummary?: string | null): Promise<{ version: string }> {
  const doc = await loadDoc(client, orgId, docId);
  assertEditable(doc.status);
  const sections = await client.query(`SELECT section_key, title, content, status, order_index FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index`, [docId, orgId]);
  const version = nextVersion(doc.version, false);
  const snapshot = JSON.stringify({ version, sections: sections.rows });
  await client.query(
    `INSERT INTO protocol_versions (organization_id, protocol_document_id, version, change_summary, snapshot, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [orgId, docId, version, changeSummary ?? null, snapshot, userId],
  );
  await client.query(`UPDATE protocol_documents SET version = $3, updated_at = now() WHERE id = $1 AND organization_id = $2`, [docId, orgId, version]);
  return { version };
}

/** Finalize — gated on the deterministic completeness check; bumps to the next major version. */
export async function finalizeProtocolTx(client: Queryable, orgId: number, userId: number, docId: number): Promise<{ finalized: true; version: string; completeness: CompletenessResult }> {
  const doc = await loadDoc(client, orgId, docId);
  if (doc.status === 'finalized') throw new ProtocolDevError('INVALID_STATE', 'Protocol is already finalized.');
  if (doc.status === 'superseded') throw new ProtocolDevError('INVALID_STATE', 'Protocol is superseded.');
  const completeness = evaluateCompleteness(await completenessInputFor(orgId, docId, doc.kind));
  if (!completeness.readyToFinalize) {
    throw new ProtocolDevError('INVALID_STATE', `Cannot finalize — ${completeness.findings.filter((f) => f.severity === 'critical').map((f) => f.message).join(' ')}`);
  }
  const version = nextVersion(doc.version, true);
  const sections = await client.query(`SELECT section_key, title, content, status, order_index FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index`, [docId, orgId]);
  await client.query(
    `INSERT INTO protocol_versions (organization_id, protocol_document_id, version, change_summary, snapshot, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [orgId, docId, version, 'Finalized', JSON.stringify({ version, sections: sections.rows }), userId],
  );
  await client.query(`UPDATE protocol_documents SET status = 'finalized', version = $3, finalized_by = $4, finalized_at = now(), updated_at = now() WHERE id = $1 AND organization_id = $2`, [docId, orgId, version, userId]);
  return { finalized: true, version, completeness };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listProtocolDocuments(orgId: number, kind?: string): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, protocol_kind, linked_protocol_id, protocol_number, title, design_type, phase, version, status, finalized_at
               FROM protocol_documents WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (kind) { params.push(kind); sql += ` AND protocol_kind = $2`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getProtocolDocument(orgId: number, docId: number): Promise<any | null> {
  const d = await pool.query(`SELECT * FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`, [docId, orgId]);
  if (d.rows.length === 0) return null;
  const [sections, objectives, eligibility, visits, team, versions] = await Promise.all([
    pool.query(`SELECT id, section_key, title, content, required, status, order_index FROM protocol_sections WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index`, [docId, orgId]),
    pool.query(`SELECT id, objective_type, objective, endpoint, timepoint FROM protocol_objectives WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [docId, orgId]),
    pool.query(`SELECT id, kind, criterion FROM protocol_eligibility_criteria WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY kind, order_index, id`, [docId, orgId]),
    pool.query(`SELECT id, visit_name, timepoint, procedures FROM protocol_schedule_visits WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY order_index, id`, [docId, orgId]),
    pool.query(`SELECT id, member_name, role, responsibilities, personnel_id FROM protocol_team_members WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL ORDER BY id`, [docId, orgId]),
    pool.query(`SELECT id, version, change_summary, created_at FROM protocol_versions WHERE protocol_document_id = $1 AND organization_id = $2 ORDER BY created_at DESC`, [docId, orgId]),
  ]);
  return { ...d.rows[0], sections: sections.rows, objectives: objectives.rows, eligibility: eligibility.rows, visits: visits.rows, team: team.rows, versions: versions.rows };
}
