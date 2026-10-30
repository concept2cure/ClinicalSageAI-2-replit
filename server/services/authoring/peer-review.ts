/** The existing human review index, bound to the complete saved Authoring record. */
import {
  AUTHORING_REVIEW_BINDING_BASIS, authoringSavedSnapshotSchema, authoringReviewInputSchema,
  authoringReviewReadSchema, authoringReviewRowSchema, authoringReviewResponseSchema,
  type AuthoringReviewStanding, type AuthoringReviewInput, type AuthoringSavedSnapshot,
} from '../../../shared/authoring/peer-review';
import type { RequestConnectable, RequestSqlClient } from '../../db/requestDb';
import { authoringSnapshotHash, fullVisibleAuthoringSnapshot } from './authoring-content-digests';
import { authorizeAuthoringProgram, AuthoringProgramAccessError } from './authoring-program-access';
import { decideAuthoringPermission, type AuthoringPrincipal, type AuthoringObjectScope } from './authoring-permissions';
import { writeAuthoringAuditTrail, type AuthoringAuditContext } from './authoring-evidence';
import { resolveTargetAuthors, SeparationOfDutiesAuthorUnresolvedError } from '../governance/separation-of-duties';
import { derivePosture } from '../tenant/tenant-lifecycle';
import { isActiveAccountStatus } from '../account-standing';
import { GOVERNED_WRITE_ROLES } from '../../middleware/orgMembership';
import type { TaskEventNotice } from '../tasking/task-side-effects';
import { optionalGovernedReason, requireGovernedReason } from '../../routes/governed-reason';

interface PeerReviewInput { tenantId: number; actorId: string; documentId: string }
interface ReviewActor { id: string; email: string | null; name: string; role: string; principal: AuthoringPrincipal; writable: boolean }
interface AdmittedReview { actor: ReviewActor; document: Record<string, unknown>; scope: AuthoringObjectScope; snapshot: AuthoringSavedSnapshot; snapshotHash: string }
type AuditFacts = Pick<AuthoringAuditContext, 'ipAddress' | 'userAgent' | 'sessionId'>;
export interface PeerReviewTaskInput {
  tenantId: number; docId: string; reviewerId: string; verdict: string; reviewId: string; reason: string | null;
}
export interface PeerReviewTaskClosure {
  completed: string[]; leftOpen: Array<{ taskId: string; why: string }>;
  notices: TaskEventNotice[]; record: () => Promise<void>;
  /** RR5: the review route a negative verdict returned, when it returned one. */
  returnedRouteId?: string | null;
}
export class AuthoringPeerReviewRefused extends Error {
  constructor(readonly status: 400 | 401 | 403 | 404 | 409 | 503, readonly code: string, message: string) { super(message); }
}
export class AuthoringPeerReviewCommitUnconfirmed extends Error {
  constructor() { super('The review write could not be confirmed. Reload the document and review request before trying again.'); }
}

async function transaction<T>(connection: RequestConnectable, work: (client: RequestSqlClient) => Promise<T>, read = false): Promise<T> {
  const client = await connection.connect();
  let committing = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    committing = true;
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (committing && !read) throw new AuthoringPeerReviewCommitUnconfirmed();
    throw error;
  } finally { client.release(); }
}

async function currentActor(client: RequestSqlClient, input: PeerReviewInput): Promise<ReviewActor> {
  if (!/^[1-9]\d*$/.test(input.actorId) || !Number.isSafeInteger(Number(input.actorId)) || Number(input.actorId) > 2_147_483_647) {
    throw new AuthoringPeerReviewRefused(401, 'REVIEW_ACTOR_REQUIRED', 'A current authenticated organization member is required.');
  }
  const result = await client.query(`SELECT u.id::text, u.email, u.name, u.status AS account_status,
      o.status AS organization_status, o.payment_status, ou.role
    FROM users u JOIN organization_users ou ON ou.user_id=u.id
    JOIN organizations o ON o.id=ou.organization_id
    WHERE u.id::text=$1 AND ou.organization_id=$2 FOR SHARE OF u, ou, o`, [input.actorId, input.tenantId]);
  const row = result.rows[0];
  if (result.rows.length !== 1 || !isActiveAccountStatus(row.account_status) || typeof row.role !== 'string') {
    throw new AuthoringPeerReviewRefused(403, 'REVIEW_MEMBERSHIP_REQUIRED', 'An active account and current organization membership are required.');
  }
  const posture = derivePosture(input.tenantId, row.organization_status as string, row.payment_status as string);
  if (posture.decision === 'deny') throw new AuthoringPeerReviewRefused(403, 'REVIEW_TENANT_UNAVAILABLE', posture.reason);
  const role = row.role.trim().toLowerCase();
  const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : null;
  return { id: input.actorId, email, name: typeof row.name === 'string' ? row.name : email ?? input.actorId, role,
    principal: { id: input.actorId, email, roles: [role.toUpperCase()] },
    writable: posture.decision === 'allow' && GOVERNED_WRITE_ROLES.has(role) };
}

async function savedDocument(client: RequestSqlClient, input: PeerReviewInput, write: boolean) {
  const result = await client.query(write
    ? `SELECT d.*, to_jsonb(d)->>'client_program_id' AS client_program_id FROM authoring_documents d
       WHERE d.id=$1 AND d.tenant_id=$2 FOR UPDATE`
    : `SELECT d.*, to_jsonb(d)->>'client_program_id' AS client_program_id FROM authoring_documents d
       WHERE d.id=$1 AND d.tenant_id=$2 FOR SHARE`, [input.documentId, input.tenantId]);
  if (result.rows.length !== 1) throw new AuthoringPeerReviewRefused(404, 'REVIEW_DOCUMENT_NOT_FOUND', 'Document not found.');
  return result.rows[0];
}

async function savedSnapshot(client: RequestSqlClient, input: PeerReviewInput, document: Record<string, unknown>) {
  const rows = await client.query(`SELECT id::text, code, title, content FROM authoring_sections
    WHERE doc_id=$1 AND tenant_id=$2 ORDER BY order_index, created_at, id`, [input.documentId, input.tenantId]);
  const sections = rows.rows.map(row => {
    if (typeof row.id !== 'string' || typeof row.code !== 'string' || !(row.content === null || typeof row.content === 'string')) {
      throw new AuthoringPeerReviewRefused(503, 'REVIEW_SNAPSHOT_UNAVAILABLE', 'The complete saved document could not be verified.');
    }
    return { id: row.id, code: row.code, title: row.title, content: row.content };
  });
  try { return fullVisibleAuthoringSnapshot({ doc: { ...document, id: String(document.id) }, sections }); }
  catch { throw new AuthoringPeerReviewRefused(503, 'REVIEW_SNAPSHOT_UNAVAILABLE', 'The complete saved document could not be verified.'); }
}

async function admit(client: RequestSqlClient, input: PeerReviewInput, action: 'view' | 'edit', write: boolean): Promise<AdmittedReview> {
  const actor = await currentActor(client, input);
  if (write && !actor.writable) throw new AuthoringPeerReviewRefused(403, 'REVIEW_WRITE_DENIED', 'Your current organization access is read-only.');
  const document = await savedDocument(client, input, write);
  if (typeof document.client_program_id === 'string') {
    try {
      actor.principal = (await authorizeAuthoringProgram(client, {
        tenantId: input.tenantId, actor: { id: actor.id, email: actor.email },
        principal: actor.principal, programId: document.client_program_id, forWrite: false,
      })).principal;
    } catch (error) {
      if (error instanceof AuthoringProgramAccessError) throw new AuthoringPeerReviewRefused(error.status, error.code, error.message);
      throw error;
    }
  }
  const scope = { tenantId: input.tenantId, docId: input.documentId, sectionId: null,
    documentStatus: String(document.status ?? ''), createdBy: String(document.created_by ?? '') };
  if (!(await decideAuthoringPermission({ pool: client, principal: actor.principal, scope, action })).allowed) {
    throw new AuthoringPeerReviewRefused(403, 'REVIEW_DOCUMENT_FORBIDDEN', 'Current full-document permission is required.');
  }
  const snapshot = await savedSnapshot(client, input, document);
  return { actor, document, scope, snapshot, snapshotHash: authoringSnapshotHash(snapshot) };
}

async function independence(client: RequestSqlClient, input: PeerReviewInput, actorId: string) {
  let authors;
  try { authors = await resolveTargetAuthors(`authoring-document:${input.documentId}`, input.tenantId, client); }
  catch (error) {
    if (error instanceof SeparationOfDutiesAuthorUnresolvedError) return { status: 409 as const, code: 'REVIEW_AUTHORSHIP_UNVERIFIED', reason: 'Recorded authorship must be verified before independent review.' };
    throw new AuthoringPeerReviewRefused(503, 'REVIEW_AUTHORSHIP_UNAVAILABLE', 'Independent review authority could not be verified.');
  }
  if (!authors.modelled || !authors.authors.length) return { status: 409 as const, code: 'REVIEW_AUTHORSHIP_UNVERIFIED', reason: 'Recorded authorship must be verified before independent review.' };
  return authors.authors.includes(Number(actorId))
    ? { status: 403 as const, code: 'REVIEWER_IS_AUTHOR', reason: 'The original author and recorded contributors cannot review their own document.' }
    : null;
}

function serializedReview(row: Record<string, unknown>, snapshotHash: string) {
  const plain = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  const snapshot = authoringSavedSnapshotSchema.safeParse(row.reviewed_snapshot);
  return authoringReviewRowSchema.parse({ ...plain,
    reviewer_id: String(row.reviewer_id ?? ''), review_comments: row.review_comments ?? null,
    requested_by: row.requested_by ?? null, requested_at: timestamp(row.requested_at), reviewed_at: timestamp(row.reviewed_at),
    reviewed_snapshot: snapshot.success ? snapshot.data : null,
    reviewed_snapshot_hash: typeof row.reviewed_snapshot_hash === 'string' && /^[a-f0-9]{64}$/.test(row.reviewed_snapshot_hash) ? row.reviewed_snapshot_hash : null,
    review_binding_basis: typeof row.review_binding_basis === 'string' ? row.review_binding_basis : null,
    standing: authoringReviewStanding(row, snapshotHash) });
}

async function contextFor(client: RequestSqlClient, input: PeerReviewInput, current: AdmittedReview, rows: Record<string, unknown>[]) {
  const own = rows.find(row => row.reviewer_id === current.actor.id);
  const requestAt = own && timestamp(own.requested_at);
  const independent = await independence(client, input, current.actor.id);
  const permission = await decideAuthoringPermission({ pool: client, principal: current.actor.principal, scope: current.scope, action: 'review' });
  const reason = !current.actor.writable ? 'Your current organization access is read-only.'
    : !permission.allowed ? 'A current full-document Reviewer role is required.'
    : independent?.reason ?? (!own || !requestAt || !canonicalActorId(own.requested_by) ? 'A current attributed review request is required. Ask the author to request review again.' : null);
  return { documentId: input.documentId, actorId: current.actor.id, organizationId: input.tenantId,
    snapshot: current.snapshot, snapshotHash: current.snapshotHash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS,
    myReview: own && requestAt ? { reviewId: own.id, requestedAt: requestAt, reviewStatus: own.review_status } : null,
    canReview: reason === null, unavailableReason: reason,
    csrScientificReviewRequired: await csrReviewRequired(client, input, current) };
}

/** The server's own rule, so the screen opens the CSR step for a CSR its label
 * does not name (2026-10-30: one made from a CSR template, or renamed). When
 * what the document is cannot be read, the step is shown: the approval itself
 * refuses either way. */
async function csrReviewRequired(client: RequestSqlClient, input: PeerReviewInput, current: AdmittedReview): Promise<boolean> {
  const { requiresCsrScientificReview } = await import('./csr-scientific-review.js');
  try {
    return await requiresCsrScientificReview(client, { tenantId: input.tenantId, document: current.document, snapshot: current.snapshot });
  } catch {
    return true;
  }
}

export async function readAuthoringPeerReviews(connection: RequestConnectable, input: PeerReviewInput) {
  return transaction(connection, async client => {
    const current = await admit(client, input, 'view', false);
    const result = await client.query('SELECT * FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2 ORDER BY requested_at DESC', [input.documentId, input.tenantId]);
    const reviews = result.rows.map(row => serializedReview(row, current.snapshotHash));
    const count = (status: string) => reviews.filter(row => row.standing === 'current' && row.review_status === status).length;
    const confirmed = await recheckAdmission(client, input, current, 'view', false);
    const reviewContext = await contextFor(client, input, confirmed, result.rows);
    return authoringReviewReadSchema.parse({ success: true, reviews,
      reviewContext,
      stats: { total: reviews.length, pending: reviews.filter(row => row.standing === 'pending').length,
        approved: count('approved'), rejected: count('rejected'), changes_requested: count('changes_requested'),
        stale: reviews.filter(row => row.standing === 'stale').length, unbound: reviews.filter(row => row.standing === 'unbound').length },
      canApprove: reviews.length > 0 && reviews.every(row => row.standing === 'current' && row.review_status === 'approved') });
  }, true);
}

function auditContext(connection: RequestConnectable, input: PeerReviewInput, actor: ReviewActor, audit: AuditFacts): AuthoringAuditContext {
  return { ...audit, tenantId: input.tenantId, actorId: actor.id,
    actorEmail: actor.email ?? actor.id, actorRole: actor.role, pool: connection };
}

async function assignedVerdict(client: RequestSqlClient, input: PeerReviewInput, body: AuthoringReviewInput) {
  const current = await admit(client, input, 'view', true);
  const result = await client.query('SELECT * FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2 AND reviewer_id=$3 FOR UPDATE',
    [input.documentId, input.tenantId, current.actor.id]);
  const before = result.rows[0];
  if (!before || typeof before.requested_by !== 'string' || !before.requested_by.trim()) throw new AuthoringPeerReviewRefused(403, 'REVIEW_ASSIGNMENT_REQUIRED', 'You must be assigned to this document’s review.');
  if (!canonicalActorId(before.requested_by)) throw new AuthoringPeerReviewRefused(409, 'REVIEW_REQUEST_UNVERIFIED',
    'This review request has no verified requester attribution. Ask the author to request review again.');
  const permission = await decideAuthoringPermission({ pool: client, principal: current.actor.principal, scope: current.scope, action: 'review' });
  if (!permission.allowed) throw new AuthoringPeerReviewRefused(403, 'REVIEW_DOCUMENT_FORBIDDEN', 'Current full-document Reviewer authority is required.');
  const independent = await independence(client, input, current.actor.id);
  if (independent) throw new AuthoringPeerReviewRefused(independent.status, independent.code, independent.reason);
  if (String(before.id) !== body.expected.reviewId || timestamp(before.requested_at) !== body.expected.requestedAt || current.snapshotHash !== body.expected.snapshotHash) {
    throw new AuthoringPeerReviewRefused(409, 'REVIEW_CHANGED', 'The saved document or review request changed. Reload and read it before recording your verdict.');
  }
  return { ...current, before };
}


/** Existing assigned human review remains the qualification ceremony. The model
 * cannot assert qualified facts; this adapter binds exact source cells and the
 * complete current saved document to the authenticated review decision. */
async function scientificReviewForApproval(client: RequestSqlClient, input: PeerReviewInput,
  current: AdmittedReview, body: AuthoringReviewInput) {
  if (body.review_status !== 'approved') return null;
  try {
    const { prepareCsrScientificApproval } = await import('./csr-scientific-review.js');
    return await prepareCsrScientificApproval(client, {
      tenantId: input.tenantId, actorId: current.actor.id, document: current.document,
      snapshot: current.snapshot, snapshotHash: current.snapshotHash,
      reviewId: body.expected.reviewId, submission: body.csr_evidence,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error &&
        typeof error.code === 'string' && error.code.startsWith('CSR_')) {
      const status = Number((error as { status?: unknown }).status);
      throw new AuthoringPeerReviewRefused(status === 403 ? 403 : status === 404 ? 404 : status === 503 ? 503 : 409,
        error.code, 'The CSR scientific evidence is incomplete, stale or unavailable. Review the current saved source tables before approving.');
    }
    throw error;
  }
}

/** Authorized aggregate-table preview in the existing review workflow. */
export async function previewAuthoringCsrReview(connection: RequestConnectable,
  input: PeerReviewInput & { runIds: unknown }) {
  return transaction(connection, async client => {
    const current = await admit(client, input, 'view', false);
    const { previewCsrScientificEvidence, requiresCsrScientificReview } = await import('./csr-scientific-review.js');
    const context = { tenantId: input.tenantId, actorId: current.actor.id, document: current.document,
      snapshot: current.snapshot, snapshotHash: current.snapshotHash };
    try {
      if (!await requiresCsrScientificReview(client, context)) {
        throw new AuthoringPeerReviewRefused(409, 'CSR_EVIDENCE_SCOPE_INVALID', 'Select the saved CSR, not another document class.');
      }
      const preview = await previewCsrScientificEvidence(client, context, input.runIds);
      await recheckAdmission(client, input, current, 'view', false);
      return { ...preview, snapshot: current.snapshot, humanReviewRequired: true };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error &&
          typeof error.code === 'string' && error.code.startsWith('CSR_')) {
        const status = Number((error as { status?: unknown }).status);
        throw new AuthoringPeerReviewRefused(status === 403 ? 403 : status === 404 ? 404 : status === 503 ? 503 : 409,
          error.code, 'Current project access, approved source versions and retained clinical tables must be available.');
      }
      throw error;
    }
  }, true);
}

export async function submitAuthoringPeerReview(connection: RequestConnectable, input: PeerReviewInput & { body: AuthoringReviewInput }, deps: {
  audit: AuditFacts;
  closeTasks: (client: RequestSqlClient, input: PeerReviewTaskInput) => Promise<PeerReviewTaskClosure>;
}) {
  const parsed = authoringReviewInputSchema.parse(input.body);
  const stated = parsed.review_status === 'approved' ? optionalGovernedReason(parsed.review_comments) : requireGovernedReason(parsed.review_comments);
  if (!stated.ok) throw new AuthoringPeerReviewRefused(400, 'REVIEW_REASON_REQUIRED', stated.error);
  const body = { ...parsed, review_comments: stated.reason ?? undefined };
  return transaction(connection, async client => {
    const current = await assignedVerdict(client, input, body);
    const csrScientificEvidence = await scientificReviewForApproval(client, input, current, body);
    const result = await client.query(`UPDATE authoring_reviews SET review_status=$1, review_comments=$2,
      reviewed_at=clock_timestamp(), updated_at=clock_timestamp(), reviewer_name=$3, reviewer_email=$4,
      reviewed_snapshot=$5::jsonb, reviewed_snapshot_hash=$6, review_binding_basis=$7
      WHERE id=$8 AND doc_id=$9 AND reviewer_id=$10 AND tenant_id=$11 RETURNING *`,
    [body.review_status, body.review_comments ?? null, current.actor.name, current.actor.email,
      JSON.stringify(current.snapshot), current.snapshotHash, AUTHORING_REVIEW_BINDING_BASIS,
      body.expected.reviewId, input.documentId, current.actor.id, input.tenantId]);
    if (result.rows.length !== 1) throw new AuthoringPeerReviewRefused(409, 'REVIEW_CHANGED', 'The review request changed. Nothing was recorded.');
    const review = serializedReview(result.rows[0], current.snapshotHash);
    const tasks = await deps.closeTasks(client, { tenantId: input.tenantId, docId: input.documentId,
      reviewerId: current.actor.id, verdict: body.review_status, reviewId: review.id, reason: body.review_comments ?? null });
    await writeAuthoringAuditTrail(auditContext(connection, input, current.actor, deps.audit), {
      docId: input.documentId, sectionId: null, operationType: 'document_reviewed', beforeContent: null, afterContent: null,
      changeReason: body.review_comments ?? null, executor: client,
      metadata: { review_status: body.review_status, review_comments: body.review_comments ?? null,
        request: body.expected, beforeReview: current.before, afterReview: result.rows[0],
        reviewedSnapshot: current.snapshot, snapshotHash: current.snapshotHash, bindingBasis: AUTHORING_REVIEW_BINDING_BASIS,
        ...(csrScientificEvidence ? { csrScientificEvidence } : {}) },
    });
    await tasks.record();
    const confirmed = await assignedVerdict(client, input, body);
    unchangedAdmission(current, confirmed);
    authoringReviewResponseSchema.parse({ success: true, review, tasks, auditTrail: { persisted: true, chained: true } });
    return { review, tasks, auditTrail: { persisted: true as const, chained: true as const } };
  });
}

/** One reviewer's pending request: a new row, or their earlier verdict reopened (the verdict stays in its own audit row). */
async function openReviewRequest(client: RequestSqlClient, input: PeerReviewInput, member: Record<string, unknown>, current: AdmittedReview) {
  const result = await client.query(`INSERT INTO authoring_reviews
    (id, doc_id, reviewer_id, reviewer_name, reviewer_email, review_status, requested_by, tenant_id, created_at)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', $5, $6, NOW())
    ON CONFLICT (doc_id, reviewer_id, tenant_id) DO UPDATE SET id=EXCLUDED.id, requested_at=clock_timestamp(),
      requested_by=$5, reviewer_name=$3, reviewer_email=$4, review_status='pending', reviewed_at=NULL,
      review_comments=NULL, reviewed_snapshot=NULL, reviewed_snapshot_hash=NULL, review_binding_basis=NULL,
      updated_at=NOW() RETURNING *`,
  [input.documentId, member.id, member.name, member.email, current.actor.id, input.tenantId]);
  return serializedReview(result.rows[0], current.snapshotHash);
}

function reviewerIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw new AuthoringPeerReviewRefused(400, 'REVIEWERS_REQUIRED', 'Choose between one and 100 current reviewers.');
  const ids = value.map(row => row && typeof row === 'object' && 'id' in row ? String(row.id).trim() : '');
  if (ids.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) > 2_147_483_647) || new Set(ids).size !== ids.length) {
    throw new AuthoringPeerReviewRefused(400, 'REVIEWERS_INVALID', 'Choose distinct current organization members as reviewers.');
  }
  return ids;
}

async function requestedMembers(client: RequestSqlClient, input: PeerReviewInput, ids: string[]) {
  const result = await client.query(`SELECT u.id::text, u.email, u.name FROM users u
    JOIN organization_users ou ON ou.user_id=u.id WHERE ou.organization_id=$1
      AND u.id::text=ANY($2::text[]) AND u.status=$3 FOR SHARE OF u, ou`, [input.tenantId, ids, 'active']);
  if (result.rows.length !== ids.length) throw new AuthoringPeerReviewRefused(400, 'REVIEWER_MEMBERSHIP_REQUIRED', 'Every reviewer must be an active current member of this organization.');
  const members = ids.map(id => result.rows.find(row => row.id === id)!);
  for (const member of members) {
    const independent = await independence(client, input, String(member.id));
    if (independent) throw new AuthoringPeerReviewRefused(409, independent.code, independent.reason);
  }
  return members;
}

/**
 * The review route a request writes on its own transaction (RR5,
 * docs/design/REVIEW_ROUTING_2026-10-23.md; authoring-review-route.ts):
 * `prepare` reads nothing and refuses a route the request cannot name before
 * anything is written; `write` runs after the request's rows and before the
 * grants, so the document's row lock, the route's rows and the audit chain are
 * taken in that order. Its refusal rolls the whole request back.
 */
export interface ReviewRequestRoute<P, R> {
  prepare: (reviewerIds: string[]) => P;
  write: (client: RequestSqlClient, current: { actor: ReviewActor; prepared: P }) => Promise<R>;
}

export async function requestAuthoringPeerReviews<P, R>(connection: RequestConnectable, input: PeerReviewInput & { reviewers: unknown; reason: string | null }, deps: {
  audit: AuditFacts;
  grant: (client: RequestSqlClient, current: {
    actor: ReviewActor; scope: AuthoringObjectScope; reviews: ReturnType<typeof serializedReview>[]; reason: string | null;
  }) => Promise<unknown[]>;
  route: ReviewRequestRoute<P, R>;
}) {
  const ids = reviewerIds(input.reviewers);
  const stated = optionalGovernedReason(input.reason);
  if (!stated.ok) throw new AuthoringPeerReviewRefused(400, 'REVIEW_REASON_INVALID', stated.error);
  const prepared = deps.route.prepare(ids);
  return transaction(connection, async client => {
    const current = await admit(client, input, 'edit', true);
    const members = await requestedMembers(client, input, ids);
    const before = await client.query('SELECT * FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2 AND reviewer_id=ANY($3::text[]) FOR UPDATE',
      [input.documentId, input.tenantId, ids]);
    const reviews = [];
    for (const member of members) reviews.push(await openReviewRequest(client, input, member, current));
    const route = await deps.route.write(client, { actor: current.actor, prepared });
    const grants = await deps.grant(client, { actor: current.actor, scope: current.scope, reviews, reason: input.reason });
    await writeAuthoringAuditTrail(auditContext(connection, input, current.actor, deps.audit), {
      docId: input.documentId, sectionId: null, operationType: 'review_requested', beforeContent: null, afterContent: null,
      changeReason: input.reason, executor: client,
      metadata: { reviewerIds: ids, reviewIds: reviews.map(row => row.id), grants, route,
        beforeReviews: before.rows, afterReviews: reviews,
        reopenedVerdicts: before.rows.filter(row => row.review_status !== 'pending').map(row => ({
          reviewId: row.id, reviewerId: row.reviewer_id, verdict: row.review_status, reviewedAt: timestamp(row.reviewed_at),
          reviewedSnapshot: row.reviewed_snapshot ?? null, snapshotHash: row.reviewed_snapshot_hash ?? null,
          bindingBasis: row.review_binding_basis ?? null,
        })) },
    });
    await recheckAdmission(client, input, current, 'edit', true);
    await requestedMembers(client, input, ids);
    return { reviews, grants, route, auditTrail: { persisted: true as const, chained: true as const } };
  });
}

/** What the route's reassignment did (RR5): whose assignment moved to whom. */
export interface RouteReassignment { routeId: string; taskId: string; fromUserId: number; toUserId: number }

/**
 * RR5 (docs/design/REVIEW_ROUTING_2026-10-23.md §2.10): a reviewer's
 * assignment on the document's review route moves to another person, and
 * their review request moves with it, on one transaction. `deps.route` does the
 * route's part (reassignMember: the one validator, the task kept, the
 * reminders reset, review-route.reassign) and says who it moved from and to.
 * Then the new reviewer's request is opened (an earlier verdict of theirs is
 * reopened, as a request does), the old reviewer's pending request is removed
 * (it stays, whole, in the audit row), the new reviewer is granted what
 * reviewing needs, and one review_requested audit row names both.
 */
export async function reassignAuthoringReviewRequest<R extends RouteReassignment>(connection: RequestConnectable, input: PeerReviewInput & { reason: string }, deps: {
  audit: AuditFacts;
  route: (client: RequestSqlClient, current: { actor: ReviewActor }) => Promise<R>;
  grant: (client: RequestSqlClient, current: {
    actor: ReviewActor; scope: AuthoringObjectScope; reviews: ReturnType<typeof serializedReview>[]; reason: string | null;
  }) => Promise<unknown[]>;
}) {
  return transaction(connection, async client => {
    const current = await admit(client, input, 'view', true);
    const moved = await deps.route(client, { actor: current.actor });
    const [member] = await requestedMembers(client, input, [String(moved.toUserId)]);
    const removed = await client.query(`DELETE FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2 AND reviewer_id=$3 AND review_status='pending' RETURNING *`,
      [input.documentId, input.tenantId, String(moved.fromUserId)]);
    const before = await client.query('SELECT * FROM authoring_reviews WHERE doc_id=$1 AND tenant_id=$2 AND reviewer_id=$3 FOR UPDATE',
      [input.documentId, input.tenantId, String(moved.toUserId)]);
    const review = await openReviewRequest(client, input, member, current);
    const grants = await deps.grant(client, { actor: current.actor, scope: current.scope, reviews: [review], reason: input.reason });
    await writeAuthoringAuditTrail(auditContext(connection, input, current.actor, deps.audit), {
      docId: input.documentId, sectionId: null, operationType: 'review_requested', beforeContent: null, afterContent: null,
      changeReason: input.reason, executor: client,
      metadata: { reassigned: moved, reviewerIds: [String(moved.toUserId)], reviewIds: [review.id], grants,
        removedRequests: removed.rows, beforeReviews: [...removed.rows, ...before.rows], afterReviews: [review],
        reopenedVerdicts: before.rows.filter(row => row.review_status !== 'pending').map(row => ({ reviewId: row.id, reviewerId: row.reviewer_id, verdict: row.review_status })) },
    });
    await recheckAdmission(client, input, current, 'view', true);
    return { review, grants, route: moved, auditTrail: { persisted: true as const, chained: true as const } };
  });
}

function timestamp(value: unknown): string | null {
  if (!(typeof value === 'string' || value instanceof Date)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function canonicalActorId(value: unknown): boolean {
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 2_147_483_647;
}

function boundRoundFacts(row: Record<string, unknown>): boolean {
  const requestedAt = timestamp(row.requested_at);
  const reviewedAt = timestamp(row.reviewed_at);
  return canonicalActorId(row.requested_by) && canonicalActorId(row.reviewer_id) &&
    Boolean(requestedAt && reviewedAt && reviewedAt >= requestedAt);
}

/** Historical facts stay historical; only a verified retained binding is current. */
export function authoringReviewStanding(row: Record<string, unknown>, currentSnapshotHash: string): AuthoringReviewStanding {
  if (row.review_status === 'pending') return 'pending';
  if (!['approved', 'rejected', 'changes_requested'].includes(String(row.review_status))) return 'unbound';
  const snapshot = authoringSavedSnapshotSchema.safeParse(row.reviewed_snapshot);
  if (!snapshot.success || snapshot.data.id !== String(row.doc_id) ||
    row.review_binding_basis !== AUTHORING_REVIEW_BINDING_BASIS ||
    typeof row.reviewed_snapshot_hash !== 'string' || !/^[a-f0-9]{64}$/.test(row.reviewed_snapshot_hash) ||
    !boundRoundFacts(row) || authoringSnapshotHash(snapshot.data) !== row.reviewed_snapshot_hash) return 'unbound';
  return row.reviewed_snapshot_hash === currentSnapshotHash ? 'current' : 'stale';
}

function unchangedAdmission(before: AdmittedReview, after: AdmittedReview): void {
  const facts = (current: AdmittedReview) => JSON.stringify({ hash: current.snapshotHash, id: current.actor.id,
    email: current.actor.email, name: current.actor.name, role: current.actor.role, writable: current.actor.writable });
  if (facts(before) !== facts(after)) throw new AuthoringPeerReviewRefused(409, 'REVIEW_CHANGED',
    'The saved document or current access changed. Reload before continuing.');
}

async function recheckAdmission(client: RequestSqlClient, input: PeerReviewInput, before: AdmittedReview,
  action: 'view' | 'edit', write: boolean): Promise<AdmittedReview> {
  const confirmed = await admit(client, input, action, write);
  unchangedAdmission(before, confirmed);
  return confirmed;
}
