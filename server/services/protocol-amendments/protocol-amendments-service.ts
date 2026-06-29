/**
 * Protocol Amendments service (Capability C2C-18a)
 *
 * Tenant-scoped transaction functions for authoring an amendment against an
 * authored protocol document: create an amendment (validating the protocol
 * document belongs to the org), append change line items, and walk the status
 * lifecycle (draft → submitted → under_review → approved/rejected → implemented)
 * with validated transitions. Mutations run inside the caller's transaction with
 * the governed-action ledger; reads use the shared pool.
 *
 * @module server/services/protocol-amendments/protocol-amendments-service
 */

import { pool } from '../../db';
import {
  evaluateAmendmentReadiness,
  type AmendmentStatus,
  type AmendmentReadinessResult,
} from './protocol-amendments-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolAmendmentError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolAmendmentError';
  }
}

const AMENDMENT_TYPES = ['major', 'minor', 'administrative'];

/** Allowed status transitions. */
const TRANSITIONS: Record<AmendmentStatus, AmendmentStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['implemented'],
  rejected: [],
  implemented: [],
};

// ─── Amendments ──────────────────────────────────────────────────────────────

export interface AmendmentInput {
  protocolDocumentId: number;
  title: string;
  amendmentNumber?: string | null;
  rationale?: string | null;
  amendmentType?: string | null;
  affectsConsent?: boolean;
  affectsRisk?: boolean;
}

/** Create an amendment after validating the target protocol document belongs to the org. */
export async function createAmendmentTx(client: Queryable, orgId: number, userId: number, input: AmendmentInput): Promise<{ id: number }> {
  if (input.amendmentType != null && !AMENDMENT_TYPES.includes(input.amendmentType)) {
    throw new ProtocolAmendmentError('BAD_INPUT', `Invalid amendment_type "${input.amendmentType}".`);
  }
  const doc = await client.query(
    `SELECT id FROM protocol_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [input.protocolDocumentId, orgId],
  );
  if (doc.rows.length === 0) throw new ProtocolAmendmentError('NOT_FOUND', 'Protocol document not found for this organization.');
  const { rows } = await client.query(
    `INSERT INTO protocol_amendments (organization_id, protocol_document_id, amendment_number, title, rationale, amendment_type, affects_consent, affects_risk, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9) RETURNING id`,
    [
      orgId,
      input.protocolDocumentId,
      input.amendmentNumber ?? null,
      input.title,
      input.rationale ?? null,
      input.amendmentType ?? null,
      input.affectsConsent ?? false,
      input.affectsRisk ?? false,
      userId,
    ],
  );
  return { id: Number(rows[0].id) };
}

async function loadAmendment(client: Queryable, orgId: number, amendmentId: number): Promise<{ status: AmendmentStatus }> {
  const a = await client.query(
    `SELECT status FROM protocol_amendments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) throw new ProtocolAmendmentError('NOT_FOUND', 'Amendment not found for this organization.');
  return { status: a.rows[0].status };
}

// ─── Change line items ───────────────────────────────────────────────────────

export interface ChangeInput {
  sectionRef?: string | null;
  changeDescription: string;
  previousText?: string | null;
  proposedText?: string | null;
}

/** Append a change line item to a draft amendment. */
export async function addChangeTx(client: Queryable, orgId: number, userId: number, amendmentId: number, input: ChangeInput): Promise<{ id: number }> {
  const amd = await loadAmendment(client, orgId, amendmentId);
  if (amd.status !== 'draft') throw new ProtocolAmendmentError('INVALID_STATE', `Amendment is "${amd.status}"; changes can only be added while draft.`);
  const { rows } = await client.query(
    `INSERT INTO protocol_amendment_changes (organization_id, amendment_id, section_ref, change_description, previous_text, proposed_text, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [orgId, amendmentId, input.sectionRef ?? null, input.changeDescription, input.previousText ?? null, input.proposedText ?? null, userId],
  );
  return { id: Number(rows[0].id) };
}

// ─── Status lifecycle ────────────────────────────────────────────────────────

/** Walk the amendment status lifecycle with validated transitions; gates draft→submitted on readiness. */
export async function setAmendmentStatusTx(client: Queryable, orgId: number, amendmentId: number, next: string): Promise<{ status: AmendmentStatus }> {
  const valid: AmendmentStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented'];
  if (!valid.includes(next as AmendmentStatus)) throw new ProtocolAmendmentError('BAD_INPUT', `Invalid status "${next}".`);
  const target = next as AmendmentStatus;
  const amd = await loadAmendment(client, orgId, amendmentId);
  const allowed = TRANSITIONS[amd.status] ?? [];
  if (!allowed.includes(target)) {
    throw new ProtocolAmendmentError('INVALID_STATE', `Cannot transition amendment from "${amd.status}" to "${target}".`);
  }
  if (target === 'submitted') {
    const cnt = await client.query(
      `SELECT count(*)::int n FROM protocol_amendment_changes WHERE amendment_id = $1 AND organization_id = $2`,
      [amendmentId, orgId],
    );
    const readiness = evaluateAmendmentReadiness({ status: amd.status, changeCount: cnt.rows[0].n });
    if (!readiness.readyToSubmit) {
      throw new ProtocolAmendmentError('INVALID_STATE', `Cannot submit — ${readiness.blockers.join(' ')}`);
    }
  }
  const submittedClause = target === 'submitted' ? ', submitted_date = CURRENT_DATE' : '';
  const decidedClause = target === 'approved' || target === 'rejected' ? ', decided_date = CURRENT_DATE' : '';
  await client.query(
    `UPDATE protocol_amendments SET status = $3${submittedClause}${decidedClause}, updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [amendmentId, orgId, target],
  );
  return { status: target };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listAmendments(orgId: number, protocolDocumentId?: number): Promise<any[]> {
  const params: unknown[] = [orgId];
  let sql = `SELECT id, protocol_document_id, amendment_number, title, amendment_type, affects_consent, affects_risk, status, submitted_date, decided_date, created_at, updated_at
               FROM protocol_amendments WHERE organization_id = $1 AND deleted_at IS NULL`;
  if (protocolDocumentId != null) { params.push(protocolDocumentId); sql += ` AND protocol_document_id = $2`; }
  sql += ` ORDER BY updated_at DESC, id DESC`;
  return (await pool.query(sql, params)).rows;
}

export async function getAmendment(orgId: number, amendmentId: number): Promise<any | null> {
  const a = await pool.query(
    `SELECT * FROM protocol_amendments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) return null;
  const changes = await pool.query(
    `SELECT id, section_ref, change_description, previous_text, proposed_text, created_at
       FROM protocol_amendment_changes WHERE amendment_id = $1 AND organization_id = $2 ORDER BY id`,
    [amendmentId, orgId],
  );
  return { ...a.rows[0], changes: changes.rows };
}

/** Read-only submission-readiness assessment (uses the pure evaluateAmendmentReadiness). */
export async function getAmendmentReadiness(orgId: number, amendmentId: number): Promise<AmendmentReadinessResult> {
  const a = await pool.query(
    `SELECT status FROM protocol_amendments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [amendmentId, orgId],
  );
  if (a.rows.length === 0) throw new ProtocolAmendmentError('NOT_FOUND', 'Amendment not found for this organization.');
  const cnt = await pool.query(
    `SELECT count(*)::int n FROM protocol_amendment_changes WHERE amendment_id = $1 AND organization_id = $2`,
    [amendmentId, orgId],
  );
  return evaluateAmendmentReadiness({ status: a.rows[0].status, changeCount: cnt.rows[0].n });
}
