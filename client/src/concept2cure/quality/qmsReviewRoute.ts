/**
 * The QMS controlled document's review route, as the register calls it (RR4 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.7–§2.10). The server is
 * server/routes/mdx-qms-review-route.ts and the send, PATCH
 * /api/mdx/qms/documents/:id {status:'in_review', route} (mdx-qms.ts).
 *
 * The round is the Vault's own shape (RouteRoundView, read by
 * review-route-standing.ts readRouteRounds), so the register says it with the
 * Vault round's words (memberLine, routeHeadline in
 * v2/reviewRoute/routeRound.ts) rather than a copy of them. What is QMS
 * here is the rule (one or more QMS approvers, reviewers optional, NEW-4) and the
 * endpoints. Every refusal is thrown as the server's own sentence. RR2: the
 * shape (reviewers one after another, several QMS approvers) is the shared
 * v2/reviewRoute/routeShape.ts, as the Vault's form uses it.
 *
 * @module client/src/concept2cure/quality/qmsReviewRoute
 */
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import type { EsigSignedManifest } from '../_shared/components/EsignModal';
import type { RouteMemberView, RouteRoundView } from '../v2/reviewRoute/routeRound';
import { routeShapeBody, routeShapeMissing, withReason, type RouteShapeInput } from '../v2/reviewRoute/routeShape';

export type { RouteRoundView, RouteMemberView };

/** What a document's route means for what the register offers (the Vault's routeView, for a QMS document). */
export type QmsRouteView =
  | { kind: 'unread' }
  | { kind: 'none' }
  /** In review with no route: it entered review before RR4, and keeps today's rule until reviewers are named. */
  | { kind: 'legacy' }
  | { kind: 'live'; round: RouteRoundView }
  /** In review on a withdrawn route: nothing is signed until a new route is sent. */
  | { kind: 'withdrawn'; round: RouteRoundView }
  | { kind: 'closed'; round: RouteRoundView };

export function qmsRouteView(doc: { status: string; reviewRoute?: RouteRoundView | null; reviewRouteUnread?: boolean }): QmsRouteView {
  if (doc.reviewRouteUnread) return { kind: 'unread' };
  const inReview = doc.status === 'in_review';
  const round = doc.reviewRoute ?? null;
  if (!round) return inReview ? { kind: 'legacy' } : { kind: 'none' };
  if (round.route.status === 'open') return { kind: 'live', round };
  if (inReview) return round.route.status === 'withdrawn' ? { kind: 'withdrawn', round } : { kind: 'legacy' };
  return { kind: 'closed', round };
}

/** The member whose turn it is, when it is the reader's: they sign (a reviewer) or approve (the approver). */
export function myTurn(view: QmsRouteView, meId: number | null): RouteMemberView | null {
  if (view.kind !== 'live' || meId === null) return null;
  return view.round.members.find((m) => m.userId === meId && m.stepOpen && m.outcome === 'pending') ?? null;
}

// ── The form ─────────────────────────────────────────────────────────────────

export interface QmsRouteFormInput extends RouteShapeInput {
  reason: string;
}

/** What Send is waiting for, in words; empty when it can be sent. Reviewers are optional on a QMS route (NEW-4). */
export function qmsRouteFormMissing(f: QmsRouteFormInput): string[] {
  return withReason(routeShapeMissing(f, { reviewersOptional: true, approverMissing: 'Choose the QMS approver.' }), f.reason);
}

/** The route the server takes: one or more QMS approvers, reviewers (none is a QMS route too) at the same time or one after another (RR2). */
export function qmsRouteBody(f: QmsRouteFormInput): Record<string, unknown> {
  return routeShapeBody(f);
}

/**
 * What the approval dialog says (RR2, NEW-4): which approval the reader's is,
 * when other named QMS approvers are still to sign; else that the version
 * becomes effective when they sign.
 */
export function qmsApprovalMeta(version: string, share: { k: number; n: number } | null): string {
  const tail = 'The author cannot approve their own document.';
  if (share && share.k < share.n) {
    return `Your approval is ${share.k} of ${share.n} required: v${version} becomes effective once every named QMS approver has signed. ${tail}`;
  }
  return `v${version} becomes effective when you sign. ${tail}`;
}

const UNKNOWN_OUTCOME = 'The connection dropped, so it is not known whether this was recorded. Reload the register and check the document before trying again.';

/** One request to the QMS routes, the refusal thrown as the server's sentence. */
async function qmsRequest(method: 'POST' | 'PATCH', url: string, body: Record<string, unknown>, failed: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await apiRequest(method, url, body);
  } catch (e) {
    if (e instanceof ApiRequestError) throw new Error(`${failed} ${redactInternals(serverMessage(e.payload), e.message)}`, { cause: e });
    throw new Error(UNKNOWN_OUTCOME, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json) throw new Error(`${failed} ${redactInternals(serverMessage(json), 'No reason was returned. Reload and try again.')}`);
  return json;
}

/** Send for review: the draft moves into review on its named route (one transaction, server side). */
export function sendQmsForReview(id: number, f: QmsRouteFormInput) {
  return qmsRequest('PATCH', `/api/mdx/qms/documents/${id}`, { status: 'in_review', reason: f.reason.trim(), route: qmsRouteBody(f) },
    'The document was not sent for review.');
}

/** Name reviewers on a document in review with no route, or whose route was withdrawn. */
export function resendQmsRoute(id: number, f: QmsRouteFormInput) {
  return qmsRequest('POST', `/api/mdx/qms/documents/${id}/review-route`, { reason: f.reason.trim(), route: qmsRouteBody(f) },
    'The review route was not sent.');
}

export type QmsRouteAct = 'return' | 'withdraw' | 'hand-back';

const ACT_URL: Record<QmsRouteAct, (id: number) => string> = {
  return: (id) => `/api/mdx/qms/documents/${id}/return`,
  withdraw: (id) => `/api/mdx/qms/documents/${id}/review-route/withdraw`,
  'hand-back': (id) => `/api/mdx/qms/documents/${id}/review-route/hand-back`,
};
const ACT_FAILED: Record<QmsRouteAct, string> = {
  return: 'The document was not returned.', withdraw: 'The route was not withdrawn.', 'hand-back': 'Your assignment was not handed back.',
};

/** Return for revision, withdraw, or hand back: each a governed act with the actor's reason. */
export function postQmsRouteAct(act: QmsRouteAct, id: number, reason: string) {
  return qmsRequest('POST', ACT_URL[act](id), { reason: reason.trim() }, ACT_FAILED[act]);
}

/** Add a reviewer to the open route (the sender or an administrator, RR2): the approvers wait again. */
export function addQmsReviewer(id: number, body: { assigneeId: number; dueDate: string; reason: string }) {
  return qmsRequest('POST', `/api/mdx/qms/documents/${id}/review-route/members`, body, 'The reviewer was not added.');
}

/** Give an unsigned member's assignment to another person (the sender or an administrator). */
export function reassignQmsMember(id: number, taskId: string, assigneeId: number, reason: string) {
  return qmsRequest('POST', `/api/mdx/qms/documents/${id}/review-route/reassign`, { taskId, assigneeId, reason: reason.trim() },
    'The assignment was not reassigned.');
}

/**
 * A named reviewer's signature on the route: the platform's signing ceremony
 * (POST /qms/documents/:id/review, meaning REVIEWED). The time is the server's.
 */
export async function postQmsReviewSignature(id: number, input: { reason: string; password: string; totp?: string }): Promise<EsigSignedManifest> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/mdx/qms/documents/${id}/review`, {
      password: input.password, ...(input.totp ? { mfaToken: input.totp } : {}), meaning: 'REVIEWED', reason: input.reason,
    });
  } catch (e) {
    const status = (e as { status?: unknown } | null)?.status;
    if (typeof status === 'number' && status < 500) throw e;
    throw new Error('The server did not confirm the review signature. Reload the register and check the route before you sign again.');
  }
  const json = (await res.json().catch(() => null)) as { signedAt?: string; sha256Chain?: string } | null;
  if (res.status === 401) throw new Error(`${serverMessage(json) ?? 'Your password or code was not verified.'} Nothing was signed.`);
  if (!json?.signedAt) throw new Error('The server did not confirm the review signature. Reload the register and check the route before you sign again.');
  return { meaning: 'review', reason: input.reason, signedAt: json.signedAt, ...(json.sha256Chain ? { hash: json.sha256Chain } : {}) };
}

/** Remind a member whose turn it is, through the task's existing notify route (it writes nothing on the task). */
export async function remindQmsMember(m: RouteMemberView, title: string): Promise<string> {
  const what = m.role === 'reviewer' ? 'your review' : 'your approval';
  const name = m.printedName ?? `Account #${m.userId}`;
  try {
    const res = await apiRequest('POST', `/api/tasks/tasks/${encodeURIComponent(m.taskId)}/notify`,
      { message: `A reminder: ${what} of ${title} is waiting. Open it in the Quality register to sign.` });
    const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (!res.ok || body?.success !== true) return `${name} was not reminded. ${redactInternals(serverMessage(body), 'No reason was returned.')}`;
    return `${name} was reminded.`;
  } catch (e) {
    if (e instanceof ApiRequestError) return `${name} was not reminded. ${redactInternals(serverMessage(e.payload), e.message)}`;
    return `The connection dropped, so it is not known whether ${name} was reminded.`;
  }
}
