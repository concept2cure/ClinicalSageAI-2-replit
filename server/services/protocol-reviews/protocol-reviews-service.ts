/**
 * Protocol Review & Comment service (Capability C2C-18c)
 *
 * Tenant-scoped transaction functions for the protocol review workflow: assign a
 * reviewer (by review role), add a section-anchored severity-graded comment,
 * resolve a comment, record a reviewer disposition (which marks the assignment
 * completed), and read back the assignment list plus a derived consensus/readiness
 * summary. Mutations run inside the caller's transaction with the governed-action
 * ledger; reads use the pool. Consensus/readiness are computed by the pure logic.
 *
 * @module server/services/protocol-reviews/protocol-reviews-service
 */

import { pool } from '../../db';
import {
  summarizeReviewConsensus,
  evaluateReviewReadiness,
  type ConsensusResult,
  type ReadinessResult,
} from './protocol-reviews-logic';

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

export class ProtocolReviewError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT', message: string) {
    super(message);
    this.name = 'ProtocolReviewError';
  }
}

const ROLES = ['scientific', 'statistical', 'ethics', 'safety', 'regulatory', 'general'];
const SEVERITIES = ['blocking', 'major', 'minor', 'info'];
const DISPOSITIONS = ['approve', 'approve_with_changes', 'reject', 'abstain'];

// ─── Assignments ─────────────────────────────────────────────────────────────

export interface AssignReviewerInput {
  reviewerName: string;
  reviewerUserId?: number | null;
  role?: string;
  dueDate?: string | null;
}

/** Assign a reviewer to a protocol document for a given review role. */
export async function assignReviewerTx(
  client: Queryable,
  orgId: number,
  userId: number,
  protocolDocumentId: number,
  input: AssignReviewerInput,
): Promise<{ id: number; role: string }> {
  if (!Number.isInteger(protocolDocumentId) || protocolDocumentId <= 0) throw new ProtocolReviewError('BAD_INPUT', 'A valid protocol_document_id is required.');
  if (!input.reviewerName || !input.reviewerName.trim()) throw new ProtocolReviewError('BAD_INPUT', 'reviewer_name is required.');
  const role = input.role ?? 'general';
  if (!ROLES.includes(role)) throw new ProtocolReviewError('BAD_INPUT', `Invalid review role "${role}".`);
  const { rows } = await client.query(
    `INSERT INTO protocol_review_assignments (organization_id, protocol_document_id, reviewer_name, reviewer_user_id, role, status, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,'assigned',$6,$7) RETURNING id`,
    [orgId, protocolDocumentId, input.reviewerName.trim(), input.reviewerUserId ?? null, role, input.dueDate ?? null, userId],
  );
  return { id: Number(rows[0].id), role };
}

/** Record a reviewer's disposition; marks the assignment completed. */
export async function setDispositionTx(
  client: Queryable,
  orgId: number,
  assignmentId: number,
  disposition: string,
): Promise<{ id: number; disposition: string }> {
  if (!DISPOSITIONS.includes(disposition)) throw new ProtocolReviewError('BAD_INPUT', `Invalid disposition "${disposition}".`);
  const a = await client.query(
    `SELECT id FROM protocol_review_assignments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [assignmentId, orgId],
  );
  if (a.rows.length === 0) throw new ProtocolReviewError('NOT_FOUND', 'Review assignment not found for this organization.');
  await client.query(
    `UPDATE protocol_review_assignments SET disposition = $3, status = 'completed', updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [assignmentId, orgId, disposition],
  );
  return { id: assignmentId, disposition };
}

// ─── Comments ────────────────────────────────────────────────────────────────

export interface AddCommentInput {
  comment: string;
  assignmentId?: number | null;
  sectionRef?: string | null;
  severity?: string | null;
}

/** Add a section-anchored, severity-graded review comment to a protocol document. */
export async function addCommentTx(
  client: Queryable,
  orgId: number,
  userId: number,
  protocolDocumentId: number,
  input: AddCommentInput,
): Promise<{ id: number; severity: string | null }> {
  if (!Number.isInteger(protocolDocumentId) || protocolDocumentId <= 0) throw new ProtocolReviewError('BAD_INPUT', 'A valid protocol_document_id is required.');
  if (!input.comment || !input.comment.trim()) throw new ProtocolReviewError('BAD_INPUT', 'comment is required.');
  if (input.severity != null && !SEVERITIES.includes(input.severity)) throw new ProtocolReviewError('BAD_INPUT', `Invalid severity "${input.severity}".`);
  if (input.assignmentId != null) {
    const a = await client.query(
      `SELECT id FROM protocol_review_assignments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [input.assignmentId, orgId],
    );
    if (a.rows.length === 0) throw new ProtocolReviewError('NOT_FOUND', 'Review assignment not found for this organization.');
  }
  const { rows } = await client.query(
    `INSERT INTO protocol_review_comments (organization_id, protocol_document_id, assignment_id, section_ref, comment, severity, resolved, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,false,$7) RETURNING id`,
    [orgId, protocolDocumentId, input.assignmentId ?? null, input.sectionRef ?? null, input.comment.trim(), input.severity ?? null, userId],
  );
  return { id: Number(rows[0].id), severity: input.severity ?? null };
}

/** Mark a review comment resolved. */
export async function resolveCommentTx(client: Queryable, orgId: number, commentId: number): Promise<{ id: number }> {
  const c = await client.query(
    `SELECT id, resolved FROM protocol_review_comments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [commentId, orgId],
  );
  if (c.rows.length === 0) throw new ProtocolReviewError('NOT_FOUND', 'Review comment not found for this organization.');
  if (c.rows[0].resolved === true) throw new ProtocolReviewError('INVALID_STATE', 'Comment is already resolved.');
  await client.query(
    `UPDATE protocol_review_comments SET resolved = true, updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [commentId, orgId],
  );
  return { id: commentId };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** List the reviewer assignments + their comments for a protocol document. */
export async function listAssignments(orgId: number, protocolDocumentId: number): Promise<any[]> {
  const a = await pool.query(
    `SELECT id, protocol_document_id, reviewer_name, reviewer_user_id, role, status, disposition, due_date, created_at, updated_at
       FROM protocol_review_assignments
      WHERE organization_id = $1 AND protocol_document_id = $2 AND deleted_at IS NULL
      ORDER BY id`,
    [orgId, protocolDocumentId],
  );
  return a.rows;
}

/** Derived consensus + readiness summary for a protocol document's review. */
export async function getReviewSummary(
  orgId: number,
  protocolDocumentId: number,
): Promise<{ protocolDocumentId: number; consensus: ConsensusResult; readiness: ReadinessResult; openBlockingComments: number }> {
  const assignments = await pool.query(
    `SELECT status, disposition FROM protocol_review_assignments
      WHERE organization_id = $1 AND protocol_document_id = $2 AND deleted_at IS NULL`,
    [orgId, protocolDocumentId],
  );
  const blocking = await pool.query(
    `SELECT count(*)::int n FROM protocol_review_comments
      WHERE organization_id = $1 AND protocol_document_id = $2 AND severity = 'blocking' AND resolved = false AND deleted_at IS NULL`,
    [orgId, protocolDocumentId],
  );
  const views = assignments.rows.map((r) => ({ status: r.status, disposition: r.disposition }));
  const openBlockingComments = Number(blocking.rows[0].n);
  return {
    protocolDocumentId,
    consensus: summarizeReviewConsensus(views),
    readiness: evaluateReviewReadiness({ assignments: views, openBlockingComments }),
    openBlockingComments,
  };
}
