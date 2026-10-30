/**
 * The review route on a QMS controlled document (slice RR4 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.7–§2.10, §2.13; NEW-4 and D-Q).
 *
 * The route itself is RR1a's, written only by server/services/review/review-route.ts
 * (the header in review_routes, the members as unified_tasks rows) and read by
 * review-route-standing.ts. This module is what a QMS document asks of it:
 *
 *   - the subject: `qms_document:<id>`, its project (metadata.programId), and
 *     the digest the route is about, computed by the approval's own recipe
 *     (qmsSignedContent), so a review and the approval bind the same content;
 *   - the send, on the transaction that moves the draft into review
 *     (controlled-document-service.ts updateControlledQmsDocument);
 *   - the review signature (POST /qms/documents/:id/review, signGovernedAct
 *     with `precheck` before the credential and `afterSign` on the signing
 *     transaction: the member's task closes citing `esig:<id>`, and the review
 *     that completes opens the approver);
 *   - the approval's part (approveQmsDocumentSigned's `route` hooks): only the
 *     named approver whose step is open, still a QMS approver, over the
 *     route's own digest; the task closes and the route completes on the
 *     approval's transaction;
 *   - every exit from review closes the route on its own transaction: Return
 *     for revision (in_review → draft, new), retirement (withdrawn, "Retired"),
 *     and the edits that would change the content under a route are refused
 *     while it is open (training-controlled-text.ts, document-lock.ts, revise);
 *   - withdraw, re-send, reassign and hand back, as RR3 gave the Vault.
 *   - RR2: reviewers one after another (each review signature opens whatever
 *     step is now due) and more than one QMS approver. Every named approver
 *     signs. Each approval is the one signed approval, and only the last one
 *     makes the document effective (the others leave it in review, with no
 *     approval stamp). A reviewer added to an open route re-blocks the
 *     approvers.
 *
 * Grandfathering (§2.13): a document already in review with no route is
 * `legacy` and keeps today's rule (any signing-authority approver who is not
 * an author) until someone names reviewers on it. A withdrawn route is never
 * legacy: nobody signs until a new route is sent.
 *
 * Lock order on every path: the qms_documents row, then the route's rows
 * (routeStanding forUpdate), then the audit chain.
 *
 * @module server/services/qms/qms-review-route
 */
import { recordGovernedAction } from '../../routes/c2c/actions';
import { qmsSignedContent, type QmsDocumentRow } from './document-approval-signature';
import { isQmsDesignatedApprover } from './qms-approver-designation';
import {
  closeReviewRoute, closeRouteTaskOnSignature, isOrgAdmin, openReadySteps, ReviewRouteRefusal, sendReviewRoute,
  routeTxOf, type RouteActSubject, type RouteRequest, type RouteSubject,
} from '../review/review-route';
import { routeStanding, type RouteMember, type RouteRole, type RouteStanding } from '../review/review-route-standing';
import { isInterimShare, shareOfNextApproval } from '../review/approval-share';
import type { TaskEventNotice } from '../tasking/task-side-effects';
import { decideAuthoringPermission, grantAuthoringPermission, resolveAuthoringDocumentScope } from '../authoring/authoring-permissions';
import { resolveSignerOrgRole } from '../part11/resolve-signer-role';

export interface QmsRouteClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
}

/** The route writers take a Drizzle transaction; a QMS act holds a pg client inside its BEGIN (review-route.ts, shared with Authoring since RR5). */
export { routeTxOf };

/** The reviewers a QMS route may name are optional; one approver is required (NEW-4). */
export const QMS_ROUTE_RULES = { reviewersOptional: true } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A QMS document's project: the program its controlled text is authored under, when it names one. */
function programOf(row: QmsDocumentRow): string | null {
  const id = (row.metadata as Record<string, unknown> | null)?.programId;
  return typeof id === 'string' && UUID.test(id) ? id : null;
}

export function qmsActSubject(row: QmsDocumentRow): RouteActSubject {
  return { type: 'qms_document', id: String(row.id), title: `${row.doc_number} ${row.title} v${row.version}`, programId: programOf(row) };
}

/** The subject a route is sent on, with the digest the approval would sign now. */
export async function qmsRouteSubject(client: QmsRouteClient, row: QmsDocumentRow): Promise<RouteSubject> {
  const { contentDigest } = await qmsSignedContent(client as never, row, false);
  return { ...qmsActSubject(row), contentDigest };
}

/** The document's route standing; `forUpdate` after the document's own row lock. Throws on a read failure. */
export function qmsStanding(client: QmsRouteClient, row: QmsDocumentRow, forUpdate = false): Promise<RouteStanding> {
  return routeStanding(client, {
    organizationId: Number(row.organization_id), subjectType: 'qms_document', subjectId: String(row.id),
    inReview: row.status === 'in_review', forUpdate,
  });
}

export async function lockQmsDocument(client: QmsRouteClient, organizationId: number, documentId: number): Promise<QmsDocumentRow> {
  const { rows } = await client.query(
    `SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [documentId, organizationId],
  );
  if (!rows[0]) throw new ReviewRouteRefusal(404, 'QMS_DOCUMENT_NOT_FOUND', 'Document not found in this organization. Nothing was changed.');
  return rows[0] as QmsDocumentRow;
}

/**
 * The named members' access to a document authored in the canonical editor:
 * a reviewer gets the Reviewer role and the approver the Approver role on the
 * authored copy (the approval asks `approve` on it, authorizeQmsAuthoredSignature),
 * through the one grant writer, as Authoring's request-review grants its
 * reviewers (grantRequestedReviewers). Granted only when the sender may
 * manage the document's permissions; otherwise a member keeps the access they
 * already have, and the approval says so if it is not enough.
 */
export async function grantRouteAccess(
  client: QmsRouteClient,
  p: { row: QmsDocumentRow; actorId: number; reason: string; members: Array<{ userId: number; role: RouteRole }> },
): Promise<void> {
  const docId = p.row.authoring_document_id ? String(p.row.authoring_document_id) : null;
  if (!docId || p.members.length === 0) return;
  const organizationId = Number(p.row.organization_id);
  const scope = await resolveAuthoringDocumentScope(client as never, organizationId, docId);
  const role = await resolveSignerOrgRole(p.actorId, organizationId, client as never);
  const manage = scope
    ? await decideAuthoringPermission({ pool: client as never, scope, principal: { id: String(p.actorId), email: null, roles: role ? [role.toUpperCase()] : [] }, action: 'manage_permissions' })
    : null;
  if (!manage?.allowed) return;
  for (const m of p.members) {
    await grantAuthoringPermission({
      pool: client as never, tenantId: organizationId, docId, principalId: String(m.userId),
      role: m.role === 'approver' ? 'APPROVER' : 'REVIEWER', grantedBy: String(p.actorId), reason: `Named ${m.role} on the review route: ${p.reason}`,
    });
  }
}

/** Send a route on the transaction that has just moved the document into review (the row is the updated one). */
export async function sendQmsRoute(
  client: QmsRouteClient,
  p: { row: QmsDocumentRow; senderId: number; reason: string; request: RouteRequest },
): Promise<{ routeId: string; notices: TaskEventNotice[] }> {
  const subject = await qmsRouteSubject(client, p.row);
  const sent = await sendReviewRoute(routeTxOf(client), {
    organizationId: Number(p.row.organization_id), senderId: p.senderId, reason: p.reason, subject, request: p.request,
  });
  await grantRouteAccess(client, {
    row: p.row, actorId: p.senderId, reason: p.reason,
    members: [...p.request.reviewers.map((userId) => ({ userId, role: 'reviewer' as const })), ...p.request.approvers.map((userId) => ({ userId, role: 'approver' as const }))],
  });
  return { routeId: sent.routeId, notices: sent.notices };
}

// ── Who may sign now ─────────────────────────────────────────────────────────

const refused = (status: 400 | 403 | 404 | 409, code: string, message: string) => new ReviewRouteRefusal(status, code, `${message} Nothing was signed.`);

/** The named member in this role whose turn it is, or the refusal (the Vault's codes, routedSignOff's memberRefusal). */
export function signingMember(standing: RouteStanding, userId: number, role: RouteRole): RouteMember {
  if (standing.state === 'withdrawn') throw refused(409, 'ROUTE_WITHDRAWN', 'This review route was withdrawn. Nothing can be signed until a new route is sent.');
  if (standing.state !== 'live') throw refused(409, 'ROUTE_NOT_OPEN', 'This document has no open review route.');
  const member = standing.members.find((m) => m.userId === userId && m.role === role);
  if (!member) throw refused(403, 'ROUTE_NOT_NAMED', `You are not named as ${role} on this document's review route.`);
  if (member.outcome === 'signed') throw refused(409, 'SIGNATURE_ALREADY_RECORDED', 'You have already signed on this route.');
  if (member.outcome !== 'pending') throw refused(409, 'ROUTE_HANDED_BACK', 'You handed this back to the sender, who reassigns it.');
  if (member.stepOpen) return member;
  throw role === 'approver'
    ? refused(409, 'REVIEW_INCOMPLETE', 'Every named reviewer signs before the approval.')
    : refused(409, 'ROUTE_STEP_NOT_OPEN', 'It is not your turn on this route yet.');
}

/** The route's digest is what is signed; content changed under it is refused (§3, "content that changes under a route"). */
function sameContent(standing: RouteStanding, contentDigest: string): void {
  if (standing.route!.contentDigest !== contentDigest) {
    throw refused(409, 'ROUTE_CONTENT_CHANGED', 'The document changed after it was sent for review, so the review route no longer covers it. Return it for revision and send it again.');
  }
}

/** The code-to-status map of every refusal above and below, for signGovernedAct and the routes. */
export const QMS_ROUTE_CODE_STATUS: Readonly<Record<string, number>> = {
  ROUTE_WITHDRAWN: 409, ROUTE_NOT_OPEN: 409, ROUTE_NOT_NAMED: 403, SIGNATURE_ALREADY_RECORDED: 409, ROUTE_HANDED_BACK: 409,
  REVIEW_INCOMPLETE: 409, ROUTE_STEP_NOT_OPEN: 409, ROUTE_CONTENT_CHANGED: 409, QMS_APPROVER_NOT_DESIGNATED: 403,
  QMS_DOCUMENT_NOT_FOUND: 404, QMS_INVALID_STATE: 409, ROUTE_SIGNATURE_UNVERIFIED: 409,
};

/** Throw a refusal as signGovernedAct reads it: an Error with a `code`. */
function coded(err: unknown): never {
  if (err instanceof ReviewRouteRefusal) throw Object.assign(new Error(err.message), { code: err.code });
  throw err;
}

// ── The review signature (POST /qms/documents/:id/review) ────────────────────

export interface QmsReviewSigning {
  /** Before the credential: a read that refuses a signer the act will refuse anyway. */
  precheck: (client: QmsRouteClient, orgId: number, userId: number) => Promise<void>;
  run: (client: QmsRouteClient, orgId: number, userId: number) => Promise<{ target: string; payload: Record<string, unknown>; body: Record<string, unknown> }>;
  afterSign: (client: QmsRouteClient, signature: { id: number }, orgId: number, userId: number) => Promise<void>;
  /** The notices to send once the act has committed. */
  notices: TaskEventNotice[];
}

/** The three steps of a routed review signature on one document, sharing what each read. */
export function qmsReviewSigning(documentId: number): QmsReviewSigning {
  const notices: TaskEventNotice[] = [];
  let held: { row: QmsDocumentRow; standing: RouteStanding; member: RouteMember } | null = null;
  return {
    notices,
    precheck: async (client, orgId, userId) => {
      try {
        const { rows } = await client.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [documentId, orgId]);
        if (!rows[0]) throw refused(404, 'QMS_DOCUMENT_NOT_FOUND', 'Document not found in this organization.');
        signingMember(await qmsStanding(client, rows[0] as QmsDocumentRow), userId, 'reviewer');
      } catch (err) { coded(err); }
    },
    run: async (client, orgId, userId) => {
      try {
        const row = await lockQmsDocument(client, orgId, documentId);
        if (row.status !== 'in_review') throw refused(409, 'QMS_INVALID_STATE', `Document is ${row.status}; only a document under review is reviewed on its route.`);
        const standing = await qmsStanding(client, row, true);
        const member = signingMember(standing, userId, 'reviewer');
        const { contentDigest } = await qmsSignedContent(client as never, row, false);
        sameContent(standing, contentDigest);
        held = { row, standing, member };
        const target = `qms-document:${documentId}`;
        return {
          target,
          payload: { routeId: standing.route!.id, role: 'reviewer', contentDigest, docNumber: row.doc_number, version: row.version },
          body: { data: { routeId: standing.route!.id, documentId, version: row.version } },
        };
      } catch (err) { return coded(err); }
    },
    afterSign: async (client, signature, orgId, userId) => {
      const { row, standing, member } = held!;
      const subjectTitle = qmsActSubject(row).title;
      notices.push(...await closeRouteTaskOnSignature(routeTxOf(client), {
        organizationId: orgId, standing, member, signatureId: signature.id, actorUserId: userId, reason: 'Review signed on the route', subjectTitle,
      }));
      const after = await qmsStanding(client, row, true);
      if (after.members.find((m) => m.taskId === member.taskId)?.outcome !== 'signed') {
        // The signature row does not verify against the route (digest, meaning, signer): roll the act back.
        coded(refused(409, 'ROUTE_SIGNATURE_UNVERIFIED', 'The review signature does not verify against this route.'));
      }
      notices.push(...await openReadySteps(routeTxOf(client), { organizationId: orgId, standing: after, actorUserId: userId, subjectTitle }));
    },
  };
}

// ── The approval's part (approveQmsDocumentSigned's route hooks) ────────────

interface RoutedApproval {
  row: QmsDocumentRow; standing: RouteStanding; member: RouteMember; userId: number; reason: string;
  /** Whether this signature is the last named approver's (RR2: every named approver signs). */
  completes: boolean;
  approvalsRequired: number;
  /** Approvals on the route once this one is recorded. */
  approvalsRecorded: number;
}

/** A QMS approver at signing time: the designation can have been removed after the route named them. */
async function stillQmsApprover(client: QmsRouteClient, organizationId: number, userId: number): Promise<void> {
  if (!(await isQmsDesignatedApprover(client, organizationId, userId))) {
    throw refused(403, 'QMS_APPROVER_NOT_DESIGNATED', 'You are no longer one of this organization’s QMS approvers, so you cannot approve a controlled document. An administrator designates QMS approvers.');
  }
}

/**
 * Asked before the approval's credential (the route's precheck): a document
 * on a live or withdrawn route is approved only by its named approver whose
 * step is open. A document with no route keeps today's rule (§2.13).
 */
export async function qmsApprovalPrecheck(client: QmsRouteClient, orgId: number, userId: number, documentId: number): Promise<void> {
  const { rows } = await client.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [documentId, orgId]);
  if (!rows[0]) return; // the approval's own read says "not found"
  const standing = await qmsStanding(client, rows[0] as QmsDocumentRow);
  if (standing.state === 'live' || standing.state === 'withdrawn') signingMember(standing, userId, 'approver');
}

/**
 * The hooks an approval takes on a routed document (approveQmsDocumentSigned
 * `route`). `before` says whether this signature completes the approval (every
 * other named approver has signed, RR2). Only that one makes the document
 * effective. `after` closes the approver's task on the signature and, on the
 * last one, completes the route; every signature must verify against the route.
 */
export function qmsApprovalRoute(p: { userId: number; reason: string; notices: TaskEventNotice[] }) {
  return {
    before: async (client: QmsRouteClient, row: QmsDocumentRow, contentDigest: string): Promise<RoutedApproval | null> => {
      const standing = await qmsStanding(client, row, true);
      if (standing.state !== 'live' && standing.state !== 'withdrawn') return null;
      const member = signingMember(standing, p.userId, 'approver');
      await stillQmsApprover(client, Number(row.organization_id), p.userId);
      sameContent(standing, contentDigest);
      const share = shareOfNextApproval(standing);
      return { row, standing, member, userId: p.userId, reason: p.reason, completes: !isInterimShare(share), ...share };
    },
    completes: (routed: unknown): { completes: boolean; approvalsRecorded: number; approvalsRequired: number } => {
      const r = routed as RoutedApproval;
      return { completes: r.completes, approvalsRecorded: r.approvalsRecorded, approvalsRequired: r.approvalsRequired };
    },
    after: async (client: QmsRouteClient, routed: unknown, signatureId: number): Promise<void> => {
      const r = routed as RoutedApproval;
      const organizationId = Number(r.row.organization_id);
      const subjectTitle = qmsActSubject(r.row).title;
      p.notices.push(...await closeRouteTaskOnSignature(routeTxOf(client), {
        organizationId, standing: r.standing, member: r.member, signatureId, actorUserId: r.userId, reason: r.reason, subjectTitle,
      }));
      const after = await qmsStanding(client, { ...r.row, status: 'in_review' }, true);
      const verified = after.members.find((m) => m.taskId === r.member.taskId)?.outcome === 'signed';
      if (!verified || after.approvalComplete !== r.completes) {
        throw refused(409, 'ROUTE_SIGNATURE_UNVERIFIED', 'The approval signature does not verify against this route.');
      }
      if (!r.completes) return;
      await closeReviewRoute(routeTxOf(client), {
        organizationId, standing: after, status: 'complete', reason: r.reason, actorUserId: r.userId,
        subjectType: 'qms_document', subjectId: String(r.row.id), subjectTitle,
      });
    },
  };
}

/** The hooks a retirement takes: retiring a document in review withdraws its open route (§2.9). */
export function qmsRetirementRoute(p: { userId: number; reason: string; notices: TaskEventNotice[] }) {
  return {
    before: async (client: QmsRouteClient, row: QmsDocumentRow): Promise<{ row: QmsDocumentRow; standing: RouteStanding } | null> => {
      if (row.status !== 'in_review') return null;
      const standing = await qmsStanding(client, row, true);
      return standing.state === 'live' ? { row, standing } : null;
    },
    after: async (client: QmsRouteClient, routed: unknown): Promise<void> => {
      const r = routed as { row: QmsDocumentRow; standing: RouteStanding };
      const closed = await closeReviewRoute(routeTxOf(client), {
        organizationId: Number(r.row.organization_id), standing: r.standing, status: 'withdrawn', reason: `Retired: ${p.reason}`,
        actorUserId: p.userId, subjectType: 'qms_document', subjectId: String(r.row.id), subjectTitle: qmsActSubject(r.row).title,
      });
      p.notices.push(...closed.notices);
    },
  };
}

// ── Return for revision, withdraw ────────────────────────────────────────────

const unchanged = (status: 400 | 403 | 404 | 409, code: string, message: string) => new ReviewRouteRefusal(status, code, `${message} Nothing was changed.`);

/** Who may return a document with no live route: its author or an administrator. */
async function mayReturnUnrouted(client: QmsRouteClient, row: QmsDocumentRow, userId: number): Promise<boolean> {
  return Number(row.author_id) === userId || isOrgAdmin(client, Number(row.organization_id), userId);
}

/**
 * Return for revision (§2.9, new for QMS): in_review → draft, on the caller's
 * transaction under the document's row lock. On a live route: the sender, or a
 * named member whose turn it is; the route becomes `returned`, every other
 * member is cancelled, and the sender is told. With no live route (legacy, or
 * withdrawn): the author or an administrator. The authored copy's IN_REVIEW
 * status goes back to draft, and the document's own `transition` row records it.
 */
export async function returnQmsDocument(
  client: QmsRouteClient,
  p: { organizationId: number; documentId: number; userId: number; reason: string },
): Promise<{ row: QmsDocumentRow; routeId: string | null; notices: TaskEventNotice[] }> {
  const row = await lockQmsDocument(client, p.organizationId, p.documentId);
  if (row.status !== 'in_review') throw unchanged(409, 'QMS_INVALID_STATE', `Document is ${row.status}; only a document under review is returned for revision.`);
  const standing = await qmsStanding(client, row, true);
  let notices: TaskEventNotice[] = [];
  let routeId: string | null = null;
  if (standing.state === 'live') {
    const returner = standing.members.find((m) => m.userId === p.userId && m.stepOpen && m.outcome === 'pending') ?? null;
    if (standing.route!.senderId !== p.userId && !returner) {
      throw unchanged(403, 'ROUTE_RETURN_NOT_PERMITTED', 'Only the sender, or a named member whose turn it is, returns this document.');
    }
    const closed = await closeReviewRoute(routeTxOf(client), {
      organizationId: p.organizationId, standing, status: 'returned', reason: p.reason, actorUserId: p.userId,
      subjectType: 'qms_document', subjectId: String(row.id), subjectTitle: qmsActSubject(row).title, returner,
    });
    notices = closed.notices;
    routeId = standing.route!.id;
  } else if (!(await mayReturnUnrouted(client, row, p.userId))) {
    throw unchanged(403, 'QMS_RETURN_NOT_PERMITTED', 'Only the author or an administrator returns a document that has no open review route.');
  }
  const { rows } = await client.query(
    `UPDATE qms_documents SET status = 'draft', approver_id = NULL, approved_at = NULL, updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'in_review' RETURNING *`,
    [row.id, p.organizationId],
  );
  if (row.authoring_document_id) {
    await client.query(`UPDATE authoring_documents SET status = 'draft', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'IN_REVIEW'`,
      [row.authoring_document_id, p.organizationId]);
  }
  await recordGovernedAction(client, {
    orgId: p.organizationId, userId: p.userId, command: 'transition', target: `qms-document:${row.id}`, reason: p.reason,
    payload: { kind: 'return-for-revision', from: 'in_review', to: 'draft', version: row.version, routeId }, domain: 'qms', surface: 'quality',
  });
  return { row: rows[0] as QmsDocumentRow, routeId, notices };
}

/** Withdraw (§2.10): the sender or an administrator, on a live route. The document stays in review; nothing is signed until a new route is sent. */
export async function withdrawQmsRoute(
  client: QmsRouteClient,
  p: { organizationId: number; documentId: number; userId: number; reason: string },
): Promise<{ routeId: string; notices: TaskEventNotice[] }> {
  const row = await lockQmsDocument(client, p.organizationId, p.documentId);
  const standing = await qmsStanding(client, row, true);
  if (standing.state !== 'live') throw unchanged(409, 'ROUTE_NOT_OPEN', 'This document has no open review route.');
  if (standing.route!.senderId !== p.userId && !(await isOrgAdmin(client, p.organizationId, p.userId))) {
    throw unchanged(403, 'ROUTE_WITHDRAW_NOT_PERMITTED', 'Only the sender or an administrator withdraws a review route.');
  }
  const closed = await closeReviewRoute(routeTxOf(client), {
    organizationId: p.organizationId, standing, status: 'withdrawn', reason: p.reason, actorUserId: p.userId,
    subjectType: 'qms_document', subjectId: String(row.id), subjectTitle: qmsActSubject(row).title,
  });
  return { routeId: standing.route!.id, notices: closed.notices };
}

/** Re-send (§2.10, §2.13): a route named on a document in review whose last route was withdrawn, or that entered review with none. */
export async function resendQmsRoute(
  client: QmsRouteClient,
  p: { organizationId: number; documentId: number; userId: number; reason: string; request: RouteRequest },
): Promise<{ routeId: string; notices: TaskEventNotice[] }> {
  const row = await lockQmsDocument(client, p.organizationId, p.documentId);
  const standing = await qmsStanding(client, row, true);
  if (row.status !== 'in_review' || (standing.state !== 'withdrawn' && standing.state !== 'legacy')) {
    throw new ReviewRouteRefusal(409, 'ROUTE_NOT_RESENDABLE', 'A route is sent again on a document in review whose last route was withdrawn, or that has none. Nothing was sent.');
  }
  return sendQmsRoute(client, { row, senderId: p.userId, reason: p.reason, request: p.request });
}

/**
 * The refusal an edit of a document's content meets while its route is open
 * (§2.9): the controlled-text save, a revision, and (document-lock.ts) a save
 * of its authored sections. Null when no route is open.
 */
export async function routeOpenEditRefusal(client: QmsRouteClient, row: QmsDocumentRow): Promise<string | null> {
  if (row.status !== 'in_review') return null;
  const standing = await qmsStanding(client, row);
  return standing.state === 'live'
    ? 'This document is on an open review route, so its content cannot change under the reviewers. Return it for revision first.'
    : null;
}
