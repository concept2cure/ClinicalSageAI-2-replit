/**
 * Protocol Schedule-of-Assessments service (Capability C2C-21)
 *
 * Tenant-scoped: add assessments (rows), toggle assessment×visit cells against the
 * existing protocol_schedule_visits (columns), and read the built + validated SoA
 * matrix. Mutations run inside the caller's transaction with the governed-action
 * ledger.
 *
 * @module server/services/protocol-soa/protocol-soa-service
 */

import { pool } from '../../db';
import { buildSoaMatrix, validateSoa, type SoaMatrix, type SoaValidation } from './protocol-soa-logic';
import { requireProtocolForWriteTx } from '../protocol-development/protocol-development-service';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolSoaError extends Error {
  constructor(public code: 'NOT_FOUND' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolSoaError';
  }
}

const CATEGORIES = ['lab', 'imaging', 'exam', 'vital_signs', 'pk', 'questionnaire', 'procedure', 'eligibility', 'other'];

/** Read immutable parent identity without a child lock, then reserve parent
 * and recheck the live assessment after any wait. All protected writers take
 * locks in this parent-before-child order. */
async function reserveAssessmentForWriteTx(client: Queryable, orgId: number, assessmentId: number): Promise<number> {
  const parent = await client.query(`SELECT protocol_document_id FROM protocol_soa_assessments
    WHERE id=$1 AND organization_id=$2 AND deleted_at IS NULL LIMIT 1`, [assessmentId, orgId]);
  if (parent.rows.length === 0) throw new ProtocolSoaError('NOT_FOUND', 'Assessment not found for this organization.');
  const docId = Number(parent.rows[0].protocol_document_id);
  await requireProtocolForWriteTx(client, orgId, docId, { signedContent: true });
  const current = await client.query(`SELECT id FROM protocol_soa_assessments
    WHERE id=$1 AND organization_id=$2 AND protocol_document_id=$3 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`, [assessmentId, orgId, docId]);
  if (current.rows.length === 0) throw new ProtocolSoaError('NOT_FOUND', 'Assessment not found for this organization.');
  return docId;
}

export async function addAssessmentTx(client: Queryable, orgId: number, userId: number, protocolDocumentId: number, input: { name: string; category?: string; orderIndex?: number }): Promise<{ id: number }> {
  if (input.category && !CATEGORIES.includes(input.category)) throw new ProtocolSoaError('BAD_INPUT', `Invalid category "${input.category}".`);
  await requireProtocolForWriteTx(client, orgId, protocolDocumentId, { signedContent: true });
  const { rows } = await client.query(
    `INSERT INTO protocol_soa_assessments (organization_id, protocol_document_id, name, category, order_index, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [orgId, protocolDocumentId, input.name, input.category ?? 'other', input.orderIndex ?? 0, userId],
  );
  return { id: Number(rows[0].id) };
}

/** Mark an assessment performed at a visit (upsert). Validates both belong to the same document/org. */
export async function setCellTx(client: Queryable, orgId: number, userId: number, input: { assessmentId: number; visitId: number; required?: boolean; notes?: string | null }): Promise<{ id: number }> {
  const docId = await reserveAssessmentForWriteTx(client, orgId, input.assessmentId);
  const v = await client.query(`SELECT id FROM protocol_schedule_visits WHERE id = $1 AND protocol_document_id = $2 AND organization_id = $3 AND deleted_at IS NULL LIMIT 1 FOR UPDATE`, [input.visitId, docId, orgId]);
  if (v.rows.length === 0) throw new ProtocolSoaError('NOT_FOUND', 'Visit not found for this protocol document.');
  const { rows } = await client.query(
    `INSERT INTO protocol_soa_cells (organization_id, protocol_document_id, assessment_id, visit_id, required, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (assessment_id, visit_id) DO UPDATE SET required = EXCLUDED.required, notes = EXCLUDED.notes, updated_at = now()
     RETURNING id`,
    [orgId, docId, input.assessmentId, input.visitId, input.required ?? true, input.notes ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

/** Clear an assessment×visit cell. */
export async function clearCellTx(client: Queryable, orgId: number, assessmentId: number, visitId: number): Promise<void> {
  const docId = await reserveAssessmentForWriteTx(client, orgId, assessmentId);
  const r = await client.query(`DELETE FROM protocol_soa_cells
    WHERE assessment_id=$1 AND visit_id=$2 AND organization_id=$3 AND protocol_document_id=$4 RETURNING id`, [assessmentId, visitId, orgId, docId]);
  if (r.rows.length === 0) throw new ProtocolSoaError('NOT_FOUND', 'Cell not found.');
}

export async function getSoaMatrix(orgId: number, protocolDocumentId: number): Promise<{ matrix: SoaMatrix; validation: SoaValidation }> {
  const [assessments, visits, cells] = await Promise.all([
    pool.query(`SELECT id, name, category, order_index FROM protocol_soa_assessments WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [protocolDocumentId, orgId]),
    pool.query(`SELECT id, visit_name, timepoint, order_index FROM protocol_schedule_visits WHERE protocol_document_id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [protocolDocumentId, orgId]),
    pool.query(`SELECT assessment_id, visit_id, required FROM protocol_soa_cells WHERE protocol_document_id = $1 AND organization_id = $2`, [protocolDocumentId, orgId]),
  ]);
  const aRows = assessments.rows.map((r) => ({ id: r.id, name: r.name, category: r.category, orderIndex: r.order_index }));
  const matrix = buildSoaMatrix(
    aRows,
    visits.rows.map((r) => ({ id: r.id, visitName: r.visit_name, timepoint: r.timepoint, orderIndex: r.order_index })),
    cells.rows.map((r) => ({ assessmentId: r.assessment_id, visitId: r.visit_id, required: r.required })),
  );
  return { matrix, validation: validateSoa(matrix, aRows) };
}
