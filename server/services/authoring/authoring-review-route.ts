/**
 * Authoring's review route (slice RR5 of docs/design/REVIEW_ROUTING_2026-10-23.md,
 * §2.1, §2.8, §2.9, §2.13; findings B5, M1, M2).
 *
 * The route is RR1a's, written only by server/services/review/review-route.ts
 * (the header in review_routes, one unified_tasks row per member) and read by
 * review-route-standing.ts. This module is what an Authoring document asks of
 * it, and nothing here writes a route row itself:
 *
 *   - the subject: `authoring-document:<id>`, its project (the document's
 *     client_program_id, the program the task project reader uses), and the
 *     digest the route is about: the sections digest (sectionsDigest) the
 *     REVIEWER e-sign binds and the FD5(c) carry-over reads;
 *   - the request (POST /documents/:id/request-review): on the request's own
 *     transaction, after its authoring_reviews rows, a route naming the
 *     requested reviewers (sendReviewRoute), or, when one is open on the same
 *     content, each new reviewer added to it (addRouteReviewer). Until RR6 an
 *     Authoring route names reviewers only, so it has no approval date;
 *   - the REVIEWER e-sign (POST /docs/:id/e-sign, meaning REVIEWER): before the
 *     credential, on a live route only a named reviewer whose step is open
 *     signs, over the content the route is about; after the signature row, on
 *     its transaction, their member row is stamped with it and closes, the
 *     next step opens, and a route whose every reviewer has signed (and which
 *     names no approver) is complete;
 *   - the verdict (POST /documents/:id/review): "changes requested" and
 *     "rejected" from a named reviewer return the route (closeReviewRoute,
 *     which cancels every member who has not signed and tells the sender).
 *     Nothing is unblocked by it. An approval verdict changes nothing on the
 *     route: the review signature does;
 *   - reassign and hand back, as RR3 gave the Vault (reassignMember,
 *     handBackMember), through the one member validator.
 *
 * Grandfathering (§2.13): a document whose review was requested before RR5
 * has authoring_reviews rows and no route. Its reviewers' verdicts and tasks
 * keep today's loop (closeReviewTasksOnVerdict, which since RR5 leaves route
 * rows to the route). The same holds for a reviewer who is on no route of a
 * document that has one.
 *
 * Lock order on every path: the authoring_documents row (the caller holds
 * it), then the route's rows (routeStanding forUpdate), then the audit chain.
 *
 * @module server/services/authoring/authoring-review-route
 */
import { sectionsDigest } from './authoring-content-digests';
import {
  addRouteReviewer, closeReviewRoute, closeRouteTaskOnSignature, openReadySteps, parseRouteRequest,
  ReviewRouteRefusal, routeTxOf, sendReviewRoute, type RouteRequest, type RouteSubject,
} from '../review/review-route';
import { routeStanding, type RouteMember, type RouteQueryable, type RouteStanding } from '../review/review-route-standing';
import type { TaskEventNotice } from '../tasking/task-side-effects';

/** An Authoring route names its reviewers; its approvers join it in RR6. */
export const AUTHORING_ROUTE_RULES = { approversOptional: true } as const;

const SUBJECT = 'authoring_document' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The route a request names: the requested reviewers (account ids, in the
 * order asked), at the same time or one after another, with their due dates.
 * Nothing is read; a refusal says what is missing, with nothing written.
 */
export function parseAuthoringRoute(route: unknown, reviewerIds: number[]): RouteRequest {
  const raw = route && typeof route === 'object' ? (route as Record<string, unknown>) : {};
  return parseRouteRequest({ ...raw, reviewers: reviewerIds, approvers: [] }, AUTHORING_ROUTE_RULES);
}

/** The document's route standing; `forUpdate` after the document's own row lock. Throws on a read failure. */
export function authoringStanding(q: RouteQueryable, tenantId: number, docId: string, forUpdate = false): Promise<RouteStanding> {
  return routeStanding(q, { organizationId: tenantId, subjectType: SUBJECT, subjectId: docId, inReview: false, forUpdate });
}

/**
 * The document as a route's subject, read on the caller's transaction (which
 * holds its row lock): its canonical id, title, program, and the sections
 * digest, over the rows in the order the signing ceremony reads them
 * (lockedSigningContent: order_index, created_at, id).
 */
export async function authoringRouteSubject(
  q: RouteQueryable,
  p: { tenantId: number; docId: string; taskDetails?: RouteSubject['taskDetails'] },
): Promise<RouteSubject> {
  const doc = await q.query(
    `SELECT d.id::text AS id, d.title, to_jsonb(d)->>'client_program_id' AS program_id
       FROM authoring_documents d WHERE d.id::text = lower($1) AND d.tenant_id = $2`,
    [p.docId, p.tenantId],
  );
  const row = doc.rows[0];
  if (!row) throw new ReviewRouteRefusal(404, 'REVIEW_DOCUMENT_NOT_FOUND', 'Document not found. Nothing was sent.');
  const sections = await q.query(
    `SELECT code, content FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id`,
    [row.id, p.tenantId],
  );
  const programId = typeof row.program_id === 'string' && UUID.test(row.program_id) ? row.program_id : null;
  return {
    type: SUBJECT, id: String(row.id), title: String(row.title ?? 'Authoring document'), programId,
    contentDigest: sectionsDigest(sections.rows as Array<{ code: string; content: string | null }>),
    ...(p.taskDetails ? { taskDetails: p.taskDetails } : {}),
  };
}

export interface AuthoringRouteSent {
  routeId: string;
  /** True when the reviewers were added to a route already open on this content. */
  added: boolean;
  /** Each requested reviewer's task on the route. */
  members: Array<{ userId: number; taskId: string; dueDate: string | null }>;
  /** The time zone each due date is the end of a day in. */
  timeZone: string | null;
  /** To send once the request has committed. */
  notices: TaskEventNotice[];
}

const CONTENT_CHANGED =
  'This document changed after review was requested, so its open review route is about earlier content. ' +
  'A reviewer records “changes requested”, which returns that route, and review is then requested again.';

/** The new reviewers, added to the route open on this content one by one (RR2's addRouteReviewer, the same validator). */
async function addToOpenRoute(
  q: RouteQueryable,
  p: { tenantId: number; senderId: number; reason: string; subject: RouteSubject; request: RouteRequest; standing: RouteStanding },
): Promise<TaskEventNotice[]> {
  if (p.standing.route!.contentDigest !== p.subject.contentDigest) {
    throw new ReviewRouteRefusal(409, 'ROUTE_CONTENT_CHANGED', `${CONTENT_CHANGED} Nothing was sent.`);
  }
  const notices: TaskEventNotice[] = [];
  let standing = p.standing;
  for (const [i, assigneeId] of p.request.reviewers.entries()) {
    const done = await addRouteReviewer(routeTxOf(q), {
      organizationId: p.tenantId, actorUserId: p.senderId, reason: p.reason, subject: p.subject, standing, assigneeId,
      dueDate: p.request.reviewStepDueDates?.[i] ?? p.request.reviewDueDate,
    });
    notices.push(...done.notices);
    standing = await authoringStanding(q, p.tenantId, p.subject.id, true);
  }
  return notices;
}

/**
 * The route behind a review request, on the request's own transaction (which
 * holds the document's row lock and has written its authoring_reviews rows).
 * A refusal throws ReviewRouteRefusal, and the caller's rollback takes the
 * request with it: the request and its route commit together, or neither does.
 */
export async function routeReviewRequest(
  q: RouteQueryable,
  p: { tenantId: number; senderId: number; docId: string; reason: string; request: RouteRequest; taskDetails?: RouteSubject['taskDetails'] },
): Promise<AuthoringRouteSent> {
  const subject = await authoringRouteSubject(q, { tenantId: p.tenantId, docId: p.docId, taskDetails: p.taskDetails });
  const standing = await authoringStanding(q, p.tenantId, subject.id, true);
  let routeId: string;
  let notices: TaskEventNotice[];
  let timeZone: string | null = null;
  if (standing.state === 'live') {
    notices = await addToOpenRoute(q, { ...p, subject, standing });
    routeId = standing.route!.id;
  } else {
    const sent = await sendReviewRoute(routeTxOf(q), { organizationId: p.tenantId, senderId: p.senderId, reason: p.reason, subject, request: p.request });
    ({ routeId, notices, timeZone } = sent);
  }
  const after = await authoringStanding(q, p.tenantId, subject.id);
  const members = after.members
    .filter((m) => p.request.reviewers.includes(m.userId))
    .map((m) => ({ userId: m.userId, taskId: m.taskId, dueDate: m.dueDate }));
  return { routeId, added: standing.state === 'live', members, timeZone, notices };
}

// ── The REVIEWER e-sign (§2.8) ──────────────────────────────────────────────

/** A named reviewer's signing on a live route: what the e-sign closes after its signature row. */
export interface AuthoringReviewerSigning {
  docId: string;
  title: string;
  standing: RouteStanding;
  member: RouteMember;
}

const unsigned = (status: 403 | 409, code: string, message: string) => new ReviewRouteRefusal(status, code, `${message} Nothing was signed.`);

/** Why this member may not sign the review now, or null. */
function signingRefusal(member: RouteMember | undefined, standing: RouteStanding, digest: string): ReviewRouteRefusal | null {
  if (!member) {
    return unsigned(403, 'ROUTE_NOT_NAMED', 'This document is on a review route that does not name you as a reviewer, so a review signature from you is not taken. Ask the person who sent it to add you.');
  }
  if (member.outcome === 'signed') return unsigned(409, 'ROUTE_MEMBER_SIGNED', 'You have signed the review on this route already.');
  if (member.outcome === 'handed back') return unsigned(409, 'ROUTE_HANDED_BACK', 'You handed this review back; the sender reassigns it.');
  if (!member.stepOpen) return unsigned(409, 'ROUTE_STEP_NOT_OPEN', 'It is not your turn on this route yet: the reviewer before you has not signed.');
  if (standing.route!.contentDigest !== digest) {
    return unsigned(409, 'ROUTE_CONTENT_CHANGED', `${CONTENT_CHANGED} A review signature now would be about content the route is not about.`);
  }
  return null;
}

/**
 * Before the credential (§2.8 step 1). On a live route only a named reviewer
 * whose step is open signs REVIEWER, and only over the content the route is
 * about (`digest`, the sections digest the signature would bind). Anyone else
 * is refused before any password or code is spent. Null when no route is open
 * on the document: the signature is taken as today (grandfathering, §2.13).
 */
export async function authoringReviewerPrecheck(
  q: RouteQueryable,
  p: { tenantId: number; docId: string; title: string; signerId: number; digest: string },
): Promise<AuthoringReviewerSigning | null> {
  const standing = await authoringStanding(q, p.tenantId, p.docId, true);
  if (standing.state !== 'live') return null;
  const member = standing.members.find((m) => m.userId === p.signerId && m.role === 'reviewer');
  const refusal = signingRefusal(member, standing, p.digest);
  if (refusal) throw refusal;
  return { docId: p.docId, title: p.title, standing, member: member! };
}

/**
 * After the signature row, on the signing transaction (§2.8 steps 3-4): the
 * member row is stamped with the authoring_signatures id and closes (its
 * task.transition row cites `authoring-sig:<id>`), the route is read again and
 * the signature must verify on it (else the whole signing rolls back), the
 * next step opens, and a route whose every reviewer has signed, naming no
 * approver, is complete. Returns the notices to send after COMMIT.
 */
export async function closeAuthoringReviewerTask(
  q: RouteQueryable,
  signing: AuthoringReviewerSigning,
  p: { tenantId: number; signatureId: string; actorUserId: number; reason: string },
): Promise<TaskEventNotice[]> {
  const base = { organizationId: p.tenantId, actorUserId: p.actorUserId, subjectTitle: signing.title };
  const notices = await closeRouteTaskOnSignature(routeTxOf(q), {
    ...base, standing: signing.standing, member: signing.member, signatureId: p.signatureId, reason: p.reason,
  });
  const after = await authoringStanding(q, p.tenantId, signing.docId, true);
  if (after.members.find((m) => m.taskId === signing.member.taskId)?.outcome !== 'signed') {
    throw new Error(`The review signature ${p.signatureId} did not verify on route ${signing.standing.route!.id}`);
  }
  notices.push(...await openReadySteps(routeTxOf(q), { ...base, standing: after }));
  if (after.reviewComplete && !after.members.some((m) => m.role === 'approver')) {
    const closed = await closeReviewRoute(routeTxOf(q), {
      ...base, standing: after, status: 'complete', reason: null, subjectType: SUBJECT, subjectId: signing.docId,
    });
    notices.push(...closed.notices);
  }
  return notices;
}

// ── The verdict (§2.8, §2.9, B5) ────────────────────────────────────────────

const NEGATIVE = new Set(['changes_requested', 'rejected']);

/**
 * What a reviewer's verdict does to the document's route. Phase 1 (called
 * before the verdict's audit row): the route's rows are locked. Phase 2
 * (`record`, after it): a negative verdict from a named reviewer returns the
 * route with the verdict's reason, cancels every member who has not signed,
 * stamps the act on the reviewer's row and tells the sender; it unblocks
 * nobody. An approval verdict, a verdict on a document with no open route, or
 * one from a reviewer the route does not name (grandfathered) changes nothing.
 */
export async function routeOnVerdict(
  q: RouteQueryable,
  v: { tenantId: number; docId: string; reviewerId: string; verdict: string; reason: string | null },
): Promise<{ routeId: string | null; record: () => Promise<TaskEventNotice[]> }> {
  const none = { routeId: null, record: async () => [] as TaskEventNotice[] };
  if (!NEGATIVE.has(v.verdict) || !/^[1-9]\d*$/.test(v.reviewerId)) return none;
  const standing = await authoringStanding(q, v.tenantId, v.docId, true);
  const member = standing.state === 'live'
    ? standing.members.find((m) => m.userId === Number(v.reviewerId) && m.role === 'reviewer')
    : undefined;
  if (!member) return none;
  const title = await q.query(`SELECT title FROM authoring_documents WHERE id::text = $1 AND tenant_id = $2`, [v.docId, v.tenantId]);
  return {
    routeId: standing.route!.id,
    record: async () => (await closeReviewRoute(routeTxOf(q), {
      organizationId: v.tenantId, standing, status: 'returned', reason: v.reason, actorUserId: member.userId,
      subjectType: SUBJECT, subjectId: v.docId, subjectTitle: String(title.rows[0]?.title ?? 'Authoring document'), returner: member,
    })).notices,
  };
}
