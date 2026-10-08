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
import { requireProtocolForWriteTx } from '../protocol-development/protocol-development-service';
import { resolveSignerIdentity, SignerNotAttributableError } from '../part11/resolve-signer-identity';
// The disposition's signing ceremony holds the signer to these two
// (governed-signature-ceremony assertSigningAuthority); the assignment holds
// the reviewer to the same pair, so an assignment cannot end at its 403.
import { resolveSignerOrgRole } from '../part11/resolve-signer-role';
import { isSigningAuthorized } from '../part11/signing-authority';
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
  constructor(public code: 'NOT_FOUND' | 'INVALID_STATE' | 'BAD_INPUT' | 'FORBIDDEN' | 'REVIEWER_CANNOT_SIGN', message: string) {
    super(message);
    this.name = 'ProtocolReviewError';
  }
}

const ROLES = ['scientific', 'statistical', 'ethics', 'safety', 'regulatory', 'general'];
const SEVERITIES = ['blocking', 'major', 'minor', 'info'];
const DISPOSITIONS = ['approve', 'approve_with_changes', 'reject', 'abstain'];

// ─── Assignments ─────────────────────────────────────────────────────────────

export interface AssignReviewerInput {
  /** Required without an account. With one, blank means the account's own name. */
  reviewerName?: string | null;
  reviewerUserId?: number | null;
  role?: string;
  dueDate?: string | null;
}

/** Capitals and runs of whitespace do not make two names different. */
const nameKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The name an account-bound review is listed under: the account's own, as a
 * signature from it would print it (resolveSignerIdentity).
 *
 * Periodic review 2026-09-28, editor family, SEC-C-7: the typed name was stored
 * as given beside the account, so a review bound to B could be listed, and B's
 * signed disposition shown, as "Dr A". The HTTP route and the AnA tool
 * assign_protocol_reviewer both reach this through assignReviewerTx.
 */
async function accountReviewerName(client: Queryable, orgId: number, reviewerUserId: number, typed: string): Promise<string> {
  let name: string;
  try {
    name = (await resolveSignerIdentity(client, reviewerUserId, orgId, 'review assignment')).name;
  } catch (err) {
    if (!(err instanceof SignerNotAttributableError)) throw err;
    throw new ProtocolReviewError('BAD_INPUT', 'That reviewer\'s account has no name or email on record, so a review cannot be listed under it. Nothing was recorded.');
  }
  if (typed && nameKey(typed) !== nameKey(name)) {
    throw new ProtocolReviewError(
      'BAD_INPUT',
      `That account is ${name}, and a review assigned to it is listed under that name, not "${typed}". Leave the name blank, or name a reviewer who has no account. Nothing was recorded.`,
    );
  }
  return name;
}

/**
 * An account-bound review's reviewer, held to the disposition's signing floor;
 * returns the name the review is listed under.
 *
 * Only the assigned user can sign the disposition, and nothing reassigns a
 * review, so an assignment to someone who cannot sign is a review that can
 * never complete. It admitted every writing role (GOVERNED_WRITE_ROLES), so a
 * member or a manager was assigned and then refused at signing with 403
 * ESIGNATURE_NO_AUTHORITY (follow-up decision "Protocol reviewers",
 * docs/LAUNCH_DEFINITION_OF_DONE.md). The role is now read and judged exactly
 * as the ceremony reads and judges it: the membership row through
 * resolveSignerOrgRole, then isSigningAuthorized. Refused with 409 before
 * anything is written.
 */
async function assertReviewerCanSign(client: Queryable, orgId: number, reviewerUserId: number, typed: string): Promise<string> {
  const role = await resolveSignerOrgRole(reviewerUserId, orgId);
  if (role === null) {
    throw new ProtocolReviewError('BAD_INPUT', 'That reviewer is not a member of this organization. Assign a member, or name the reviewer without an account. Nothing was recorded.');
  }
  if (!isSigningAuthorized(role)) {
    throw new ProtocolReviewError(
      'REVIEWER_CANNOT_SIGN',
      `That reviewer's role (${role}) does not permit signing, so they could not sign this review's disposition. ` +
        'Assign someone who can sign, or name a reviewer who has no account here. Nothing was recorded.',
    );
  }
  return accountReviewerName(client, orgId, reviewerUserId, typed);
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
  const typed = (input.reviewerName ?? '').trim();
  if (input.reviewerUserId == null && !typed) throw new ProtocolReviewError('BAD_INPUT', 'reviewer_name is required.');
  const role = input.role ?? 'general';
  if (!ROLES.includes(role)) throw new ProtocolReviewError('BAD_INPUT', `Invalid review role "${role}".`);
  await requireProtocolForWriteTx(client, orgId, protocolDocumentId, { signedContent: false });
  let reviewerName = typed;
  if (input.reviewerUserId != null) {
    reviewerName = await assertReviewerCanSign(client, orgId, input.reviewerUserId, typed);
  }
  const { rows } = await client.query(
    `INSERT INTO protocol_review_assignments (organization_id, protocol_document_id, reviewer_name, reviewer_user_id, role, status, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,'assigned',$6,$7) RETURNING id`,
    [orgId, protocolDocumentId, reviewerName, input.reviewerUserId ?? null, role, input.dueDate ?? null, userId],
  );
  return { id: Number(rows[0].id), role };
}

/** The signed act: the decision, who signs it, and the meaning they declare. */
export interface DispositionAct {
  disposition: string;
  signerId: number;
  meaning: string;
}

/**
 * Who may sign a disposition, and with which meaning, depends on who the
 * assignment names:
 *   - a user account: only that user, signing as `review` or `approval`;
 *   - a name with no account: anyone may record that person's decision, but only
 *     by taking `responsibility` for the record. A `review` signature from them
 *     would claim a review they did not do.
 * Pure: throws the refusal, returns nothing when the signer may sign.
 */
function assertMaySignDisposition(
  assignment: { assignedTo: number | null; reviewerName: string },
  act: Pick<DispositionAct, 'signerId' | 'meaning'>,
): void {
  const { assignedTo } = assignment;
  if (assignedTo !== null && assignedTo !== act.signerId) {
    throw new ProtocolReviewError('FORBIDDEN', 'This review is assigned to another user. Only they can sign its disposition. Nothing was recorded.');
  }
  if (assignedTo === act.signerId && act.meaning !== 'review' && act.meaning !== 'approval') {
    throw new ProtocolReviewError('BAD_INPUT', 'Sign your own review as "review" or "approval". Nothing was recorded.');
  }
  if (assignedTo === null && act.meaning !== 'responsibility') {
    throw new ProtocolReviewError(
      'BAD_INPUT',
      `${assignment.reviewerName} has no account here, so their decision can only be recorded by someone taking responsibility for the record. Sign as "responsibility". Nothing was recorded.`,
    );
  }
}

/**
 * Record a reviewer's disposition; marks the assignment completed. It is signed
 * (routes/protocol-reviews.ts), so assertMaySignDisposition decides who may sign
 * it, and with which meaning.
 */
export async function setDispositionTx(
  client: Queryable,
  orgId: number,
  assignmentId: number,
  act: DispositionAct,
): Promise<{
  id: number;
  disposition: string;
  protocolDocumentId: number;
  protocolVersion: string | null;
  reviewerName: string;
  onBehalfOf: string | null;
}> {
  const { disposition } = act;
  if (!DISPOSITIONS.includes(disposition)) throw new ProtocolReviewError('BAD_INPUT', `Invalid disposition "${disposition}".`);
  const a = await client.query(
    `SELECT id, protocol_document_id, reviewer_name, reviewer_user_id, status, disposition
       FROM protocol_review_assignments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1
       FOR UPDATE`,
    [assignmentId, orgId],
  );
  if (a.rows.length === 0) throw new ProtocolReviewError('NOT_FOUND', 'Review assignment not found for this organization.');
  const row = a.rows[0];
  // A signed disposition is final. Signing again would overwrite the decision
  // while the first signature stayed live, with nothing saying which decision it
  // signed; a changed mind needs the first signature withdrawn, which this path
  // does not offer.
  if (row.status === 'completed' || row.disposition != null) {
    throw new ProtocolReviewError('INVALID_STATE', 'A disposition is already signed for this review. Nothing was recorded.');
  }
  const assignedTo = row.reviewer_user_id == null ? null : Number(row.reviewer_user_id);
  assertMaySignDisposition({ assignedTo, reviewerName: row.reviewer_name }, act);
  await client.query(
    `UPDATE protocol_review_assignments SET disposition = $3, status = 'completed', updated_at = now() WHERE id = $1 AND organization_id = $2`,
    [assignmentId, orgId, disposition],
  );
  // The version reviewed, for the signature row: the binding covers content
  // only, so the version is recorded beside it rather than inside it.
  const doc = await client.query(
    `SELECT version FROM protocol_documents WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [row.protocol_document_id, orgId],
  );
  return {
    id: assignmentId,
    disposition,
    protocolDocumentId: Number(row.protocol_document_id),
    protocolVersion: doc.rows[0]?.version == null ? null : String(doc.rows[0].version),
    reviewerName: String(row.reviewer_name),
    onBehalfOf: assignedTo === null ? String(row.reviewer_name) : null,
  };
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
  await requireProtocolForWriteTx(client, orgId, protocolDocumentId, { signedContent: false });
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
