/**
 * The Vault review route on the document lifecycle (RR1a of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.6, §2.8–§2.10). The router
 * (document-lifecycle.ts) owns the transaction, the record's row lock and the
 * signing ceremony; this module decides what a routed record allows and writes
 * the route through server/services/review/review-route.ts:
 *
 *   - routedSignOff: POST /:id/sign on a record whose route is live. Only a
 *     named member whose step is open signs; a reviewer's signature closes
 *     their task, and the one that completes the review writes
 *     review_signature (so REVIEW_SIGNOFF_REQUIRED and every reader keep their
 *     meaning) and opens the approver; the approver's signature advances the
 *     record to approved on the same transaction (supersession included) and
 *     completes the route.
 *   - withdraw and return: governed acts with a reason, each closing the route
 *     on its own transaction.
 *   - closeRouteOnExit: an /advance out of review closes the open route.
 *
 * @module server/routes/document-lifecycle-review-route
 */
import type { Request, RequestHandler, Response, Router } from 'express';
import { resolveOrgId, resolveUserId } from '../types/auth-request';
import { requireGovernedReason } from './governed-reason';
import { drizzleSignatureClient, type SignatureDbClient } from '../services/part11/signature-persistence';
import { advanceDocument, projectCanonicalDocument, type ProjectionInput } from '../services/regulatory/documentLifecycleOrchestrator';
import { LifecycleRecordRefusal, loadProjectionInput, persistState, recordReviewSignature, reviewSignatureRefusal, type CanonicalStoreDb, type CanonicalStoreHandle } from '../services/regulatory/canonicalDocumentStore';
import { supersedeOnVaultApproval, vaultApprovalRefusal } from '../services/regulatory/vault-lifecycle-record';
import type { LifecycleBindingDeps } from '../services/regulatory/lifecycleBindings';
import type { LifecycleBindings } from '../services/regulatory/documentLifecycleOrchestrator';
import { canAdvanceDocument, type ApprovalSignature } from '../../shared/regulatory/document-lifecycle';
import { vaultSourceId, type LifecycleBinding } from '../services/regulatory/lifecycle-signature';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import {
  closeReviewRoute,
  closeRouteTaskOnSignature,
  isOrgAdmin,
  openApproverStep,
  parseRouteRequest,
  ReviewRouteRefusal,
  sendReviewRoute,
  type RouteRequest,
  type RouteTx,
} from '../services/review/review-route';
import { routeStanding, type RouteMember, type RouteStanding } from '../services/review/review-route-standing';
import { notifyTaskEvent, type TaskEventNotice } from '../services/tasking/task-side-effects';
import { readRouteCandidates } from '../services/review/review-route-candidates';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Outcome = { responded: true } | { status: number; body: unknown };

/** The router's own signing steps, handed in so there is one ceremony. */
export interface RoutedSigningDeps {
  signingPrecheck: (req: Request, client: SignatureDbClient, doc: ProjectionInput, meaning: 'REVIEWED' | 'APPROVED') =>
    Promise<{ binding: LifecycleBinding } | { status: number; body: unknown }>;
  reverifiedSigner: (req: Request, res: Response) =>
    Promise<{ userId: number; role: string; authenticationMethod: string; secondFactorVerified: boolean } | null>;
  recordLifecycleSignature: (client: SignatureDbClient, params: {
    doc: ProjectionInput; meaning: 'reviewed' | 'approved'; signer: { userId: number; role: string; authenticationMethod: string; secondFactorVerified: boolean; ipAddress?: string | null };
    binding: LifecycleBinding; reason: string; occurredAt: Date; routeId?: string;
  }) => Promise<ApprovalSignature>;
  bindingsFactory: (deps: LifecycleBindingDeps) => LifecycleBindings;
}

const refuse = (status: number, error: string, message: string): Outcome => ({ status, body: { ok: false, error, message } });
const asTx = (tx: CanonicalStoreHandle) => tx as unknown as RouteTx;
const esigId = (ref: string): number => {
  const m = /^esig:(\d+)$/.exec(ref);
  if (!m) throw new Error(`A route signature must name its electronic_signatures row; got ${ref}`);
  return Number(m[1]);
};

/** The subject's route standing, with the route rows locked (after the record's own lock). */
export function lockedStanding(tx: CanonicalStoreHandle, doc: ProjectionInput): Promise<RouteStanding> {
  return routeStanding(queryableFromDrizzle(tx as never), {
    organizationId: doc.organizationId, subjectType: 'canonical_document', subjectId: doc.canonicalId,
    inReview: doc.stage === 'in_review', forUpdate: true,
  });
}

/** A transition out of review with a route still open (§2.9). */
async function leaveReview(tx: CanonicalStoreHandle, deps: RoutedSigningDeps, doc: ProjectionInput, actorUserId: number, reason: string) {
  const projected = projectCanonicalDocument(doc);
  const client = drizzleSignatureClient(tx as never);
  const bindings = deps.bindingsFactory({ organizationId: doc.organizationId, actor: String(actorUserId), client });
  const result = await advanceDocument(projected.state, 'authoring', { actor: String(actorUserId), at: new Date().toISOString(), reason, contentHash: doc.contentHash }, bindings, projected.document);
  if (!result.ok) throw new Error(`in_review → authoring was refused: ${(result.blockedBy ?? []).join(', ')}`);
  await persistState(tx, doc.canonicalId, doc.organizationId, result.state, result.auditEvent!);
}

/** Who may sign now: a named member in this role whose step is open and who has not signed. */
function memberRefusal(standing: RouteStanding, userId: number, role: 'reviewer' | 'approver'): Outcome | RouteMember {
  const member = standing.members.find((m) => m.userId === userId && m.role === role);
  if (!member) return refuse(403, 'ROUTE_NOT_NAMED', `You are not named as ${role} on this document's review route. Nothing was signed.`);
  if (member.outcome === 'signed') return refuse(409, 'SIGNATURE_ALREADY_RECORDED', 'You have already signed on this route. Nothing was signed.');
  if (member.stepOpen) return member;
  return role === 'approver'
    ? refuse(409, 'REVIEW_INCOMPLETE', 'Every named reviewer signs before the approval. Nothing was signed.')
    : refuse(409, 'ROUTE_STEP_NOT_OPEN', 'It is not your turn on this route yet. Nothing was signed.');
}

/** What the record itself refuses for this sign-off, asked before any credential. */
async function recordRefusal(client: SignatureDbClient, doc: ProjectionInput, meaning: 'reviewed' | 'approved', userId: number): Promise<Outcome | null> {
  if (meaning === 'reviewed') {
    const refusal = reviewSignatureRefusal(doc);
    return refusal ? refuse(409, refusal.code, refusal.message) : null;
  }
  const gate = canAdvanceDocument(projectCanonicalDocument(doc).state, 'approved');
  if (!gate.allowed) return { status: 409, body: { ok: false, from: doc.stage, to: 'approved', blockedBy: gate.blockedBy } };
  return vaultApprovalRefusal(client, doc, userId);
}

/** The review is complete: its completing signature becomes review_signature, and the approver's step opens. */
async function completeReview(
  tx: CanonicalStoreHandle,
  { doc, after, signature, userId, notices }: { doc: ProjectionInput; after: RouteStanding; signature: ApprovalSignature; userId: number; notices: TaskEventNotice[] },
) {
  // The sign-off every reader of review_signature (and the approval gate) already understands.
  const event = await recordReviewSignature(tx, doc.canonicalId, doc.organizationId, signature);
  if (!event) throw new Error(`Canonical document ${doc.canonicalId} disappeared while its review was completed`);
  notices.push(...await openApproverStep(asTx(tx), { organizationId: doc.organizationId, standing: after, actorUserId: userId, subjectTitle: doc.title }));
}

/** The last approval: the server advances in_review → approved on this transaction, citing the signature just recorded. */
async function completeApproval(
  tx: CanonicalStoreHandle, deps: RoutedSigningDeps,
  p: { doc: ProjectionInput; after: RouteStanding; signature: ApprovalSignature; userId: number; reason: string },
) {
  const { doc, signature, userId } = p;
  const client = drizzleSignatureClient(tx as never);
  const current = (await loadProjectionInput(tx, doc.canonicalId, doc.organizationId, { forUpdate: true }))!;
  const projected = projectCanonicalDocument(current);
  const ctx = { actor: String(userId), at: signature.signedAt, reason: p.reason, contentHash: current.contentHash };
  const bindings = deps.bindingsFactory({ organizationId: doc.organizationId, actor: String(userId), client, applySignature: async () => signature });
  const result = await advanceDocument(projected.state, 'approved', ctx, bindings, projected.document);
  if (!result.ok) throw new Error(`The approval was signed but in_review → approved was refused: ${(result.blockedBy ?? []).join(', ')}`);
  const sealed = await persistState(tx, doc.canonicalId, doc.organizationId, result.state, result.auditEvent!);
  const superseded = await supersedeOnVaultApproval(tx, client, current, bindings, ctx);
  await closeReviewRoute(asTx(tx), {
    organizationId: doc.organizationId, standing: p.after, status: 'complete', reason: p.reason, actorUserId: userId,
    subjectType: 'canonical_document', subjectId: doc.canonicalId, subjectTitle: doc.title,
  });
  return { stage: result.state.stage, auditEvent: sealed, superseded };
}

/**
 * POST /:id/sign on a live route. Runs inside the router's transaction, under
 * the record's row lock, with `standing` read FOR UPDATE.
 */
export async function routedSignOff(
  req: Request,
  res: Response,
  tx: CanonicalStoreHandle,
  deps: RoutedSigningDeps,
  p: { doc: ProjectionInput; standing: RouteStanding; meaning: 'reviewed' | 'approved'; reason: string; notices: TaskEventNotice[] },
): Promise<Outcome> {
  const { doc, standing, meaning } = p;
  const userId = resolveUserId(req);
  if (userId === null) return { status: 401, body: { ok: false, error: 'AUTH_REQUIRED' } };
  const member = memberRefusal(standing, userId, meaning === 'reviewed' ? 'reviewer' : 'approver');
  if (!('taskId' in member)) return member;
  const client = drizzleSignatureClient(tx as never);
  const refused = await recordRefusal(client, doc, meaning, userId);
  if (refused) return refused;
  const pre = await deps.signingPrecheck(req, client, doc, meaning === 'reviewed' ? 'REVIEWED' : 'APPROVED');
  if (!('binding' in pre)) return pre;
  const signer = await deps.reverifiedSigner(req, res);
  if (!signer) return { responded: true };

  const signature = await deps.recordLifecycleSignature(client, {
    doc, meaning, signer: { ...signer, ipAddress: req.ip ?? null }, binding: pre.binding, reason: p.reason,
    occurredAt: new Date(), routeId: standing.route!.id,
  });
  p.notices.push(...await closeRouteTaskOnSignature(asTx(tx), {
    organizationId: doc.organizationId, standing, member, signatureId: esigId(signature.signatureRef),
    actorUserId: userId, reason: p.reason, subjectTitle: doc.title,
  }));
  const after = await lockedStanding(tx, doc);
  const base = { ok: true, signature, routeId: after.route!.id };
  if (meaning === 'reviewed') {
    if (after.reviewComplete) await completeReview(tx, { doc, after, signature, userId, notices: p.notices });
    return { status: 200, body: { ...base, reviewComplete: after.reviewComplete, stage: doc.stage } };
  }
  if (!after.approvalComplete) return { status: 200, body: { ...base, approvalComplete: false, stage: doc.stage } };
  const approved = await completeApproval(tx, deps, { doc, after, signature, userId, reason: p.reason });
  return { status: 200, body: { ...base, approvalComplete: true, ...approved } };
}

/**
 * Withdraw (the sender or an admin) or return for revision (the sender, or a
 * named member whose step is open), with the actor's reason (§2.9, §2.10).
 *
 * Return moves the record in_review → authoring, which clears the live
 * review_signature. Withdraw leaves the record in review, so a new route can
 * be sent on it — unless the review was already complete: its sign-off is then
 * cleared through the same in_review → authoring revision, the only change the
 * append-only guard on canonical_documents admits for that column
 * (migrations/20260925_canonical_documents_append_only.sql). Either way the
 * signatures stay in the trail.
 */
/** Withdraw is the sender's or an administrator's; return is the sender's or a named member's whose turn it is. */
async function actRefusal(
  tx: CanonicalStoreHandle,
  p: { doc: ProjectionInput; act: 'withdraw' | 'return'; userId: number; senderId: number; returner: RouteMember | null },
): Promise<Outcome | null> {
  if (p.userId === p.senderId) return null;
  if (p.act === 'return') {
    return p.returner ? null : refuse(403, 'ROUTE_RETURN_NOT_PERMITTED', 'Only the sender, or a named member whose turn it is, returns this document. Nothing was changed.');
  }
  return (await isOrgAdmin(queryableFromDrizzle(tx as never), p.doc.organizationId, p.userId))
    ? null
    : refuse(403, 'ROUTE_WITHDRAW_NOT_PERMITTED', 'Only the sender or an administrator withdraws a review route. Nothing was changed.');
}

export async function closeRouteByAct(
  req: Request,
  tx: CanonicalStoreHandle,
  deps: RoutedSigningDeps,
  p: { doc: ProjectionInput; act: 'withdraw' | 'return'; notices: TaskEventNotice[] },
): Promise<Outcome> {
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) return refuse(400, 'REASON_REQUIRED', `${reason.error} Nothing was changed.`);
  const userId = resolveUserId(req);
  if (userId === null) return { status: 401, body: { ok: false, error: 'AUTH_REQUIRED' } };
  const { doc } = p;
  const standing = await lockedStanding(tx, doc);
  if (standing.state !== 'live') return refuse(409, 'ROUTE_NOT_OPEN', 'This document has no open review route. Nothing was changed.');
  const route = standing.route!;
  const returner = standing.members.find((m) => m.userId === userId && m.stepOpen && m.outcome === 'pending') ?? null;
  const notPermitted = await actRefusal(tx, { doc, act: p.act, userId, senderId: route.senderId, returner });
  if (notPermitted) return notPermitted;
  const leaves = p.act === 'return' || Boolean(doc.reviewSignature);
  if (leaves) await leaveReview(tx, deps, doc, userId, reason.reason);
  const closed = await closeReviewRoute(asTx(tx), {
    organizationId: doc.organizationId, standing, status: p.act === 'return' ? 'returned' : 'withdrawn', reason: reason.reason,
    actorUserId: userId, subjectType: 'canonical_document', subjectId: doc.canonicalId, subjectTitle: doc.title,
    returner: p.act === 'return' ? returner : null,
  });
  p.notices.push(...closed.notices);
  return { status: 200, body: { ok: true, routeId: route.id, status: p.act === 'return' ? 'returned' : 'withdrawn', stage: leaves ? 'authoring' : doc.stage, actId: closed.actId } };
}

/** An /advance out of review (to authoring or withdrawn) with a route open: the route is withdrawn with the advance's reason. */
export async function closeRouteOnExit(
  tx: CanonicalStoreHandle,
  p: { doc: ProjectionInput; standing: RouteStanding; actorUserId: number; reason: string; notices: TaskEventNotice[] },
): Promise<void> {
  if (p.standing.state !== 'live') return;
  const closed = await closeReviewRoute(asTx(tx), {
    organizationId: p.doc.organizationId, standing: p.standing, status: 'withdrawn', reason: p.reason, actorUserId: p.actorUserId,
    subjectType: 'canonical_document', subjectId: p.doc.canonicalId, subjectTitle: p.doc.title,
  });
  p.notices.push(...closed.notices);
}

// ── The router's hooks: what /sign and /advance ask, and the route acts ─────

/**
 * /sign's routed branch, asked under the record's row lock: a withdrawn route
 * signs nothing (ROUTE_WITHDRAWN), a live one signs through routedSignOff, and
 * null leaves a record with no live route to the legacy path.
 */
export async function routedSignGate(
  req: Request, res: Response, tx: CanonicalStoreHandle, deps: RoutedSigningDeps,
  p: { doc: ProjectionInput; meaning: 'reviewed' | 'approved'; reason: string; notices: TaskEventNotice[] },
): Promise<Outcome | null> {
  const standing = await lockedStanding(tx, p.doc);
  if (standing.state === 'withdrawn' && p.doc.stage === 'in_review') {
    return refuse(409, 'ROUTE_WITHDRAWN', 'This review route was withdrawn. Nothing can be signed until a new route is sent.');
  }
  if (standing.state !== 'live') return null;
  return routedSignOff(req, res, tx, deps, { ...p, standing });
}

/** /advance {to:'in_review', route}: the sender's reason and the route's shape, before anything is read. */
export function parseRoutedAdvance(req: Request, to: string): { route: RouteRequest | null } | { status: number; body: unknown } {
  if (to !== 'in_review' || req.body?.route === undefined) return { route: null };
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) return { status: 400, body: { ok: false, error: 'REASON_REQUIRED', message: `${reason.error} Nothing was sent.` } };
  try {
    return { route: parseRouteRequest(req.body.route) };
  } catch (err) {
    if (err instanceof ReviewRouteRefusal) return { status: err.status, body: { ok: false, error: err.code, message: err.message } };
    throw err;
  }
}

export interface RoutedAdvance {
  standing: RouteStanding;
  /** Set when the advance leaves review with a route open: the reason it is withdrawn with. */
  exitReason: string | null;
}

/**
 * /advance's routed checks, under the record's row lock: a routed record is
 * approved by its approver's signature, never by an advance (B8); leaving
 * review with a route open needs the actor's reason (§2.9); a route is sent on
 * a Vault version.
 */
export async function routedAdvanceGate(
  req: Request, tx: CanonicalStoreHandle, p: { doc: ProjectionInput; to: string; route: RouteRequest | null },
): Promise<RoutedAdvance | { status: number; body: unknown }> {
  const standing = await lockedStanding(tx, p.doc);
  const inReview = p.doc.stage === 'in_review';
  if (p.to === 'approved' && inReview && (standing.state === 'live' || standing.state === 'withdrawn')) {
    return refuse(409, 'ROUTE_APPROVAL_BY_SIGN', 'This document is approved by its named approver signing on the review route. Nothing was approved.') as { status: number; body: unknown };
  }
  // RR1b (§2.6, §2.13): a Vault version enters review with named reviewers
  // and an approver. The FD5(c) carry-over advances through the orchestrator,
  // not this handler, so it is not asked.
  if (p.to === 'in_review' && !p.route && vaultSourceId(p.doc.sources) !== null) {
    return refuse(409, 'REVIEW_ROUTE_REQUIRED',
      'Name the reviewers and the approver to send this version for review. Nothing was sent.') as { status: number; body: unknown };
  }
  let exitReason: string | null = null;
  if (inReview && standing.state === 'live') {
    const reason = requireGovernedReason(req.body?.reason);
    if (!reason.ok) return refuse(400, 'REASON_REQUIRED', `${reason.error} Leaving review withdraws its route. Nothing was changed.`) as { status: number; body: unknown };
    exitReason = reason.reason;
  }
  if (p.route && vaultSourceId(p.doc.sources) === null) {
    return refuse(409, 'ROUTE_SUBJECT_NOT_VAULT', 'A review route is sent on a Vault version. Nothing was sent.') as { status: number; body: unknown };
  }
  return { standing, exitReason };
}

/** After the advance is persisted: send its route, or close the route it left behind. Returns the new route's id. */
export async function afterRoutedAdvance(
  req: Request, tx: CanonicalStoreHandle,
  p: { doc: ProjectionInput; gate: RoutedAdvance; route: RouteRequest | null; actorUserId: number; notices: TaskEventNotice[] },
): Promise<string | undefined> {
  if (p.gate.exitReason) await closeRouteOnExit(tx, { doc: p.doc, standing: p.gate.standing, actorUserId: p.actorUserId, reason: p.gate.exitReason, notices: p.notices });
  if (!p.route) return undefined;
  const sent = await sendReviewRoute(asTx(tx), {
    organizationId: p.doc.organizationId, senderId: p.actorUserId, reason: String(req.body.reason).trim(), request: p.route,
    subject: { type: 'canonical_document', id: p.doc.canonicalId, title: p.doc.title, programId: p.doc.projectId ?? null, contentDigest: p.doc.contentHash },
  });
  p.notices.push(...sent.notices);
  return sent.routeId;
}

type Handler = (req: Request, res: Response) => Promise<Response | void>;
export interface ReviewRouteActMount {
  router: Router;
  guard: RequestHandler;
  wrap: (fn: Handler) => Handler;
  getDb: () => Promise<CanonicalStoreDb>;
  deps: RoutedSigningDeps;
}

/** Run one route act on its own transaction under the record's lock; notices after COMMIT. */
async function onRecord(m: ReviewRouteActMount, req: Request, res: Response, act: (tx: CanonicalStoreHandle, doc: ProjectionInput, notices: TaskEventNotice[]) => Promise<Outcome>) {
  const organizationId = resolveOrgId(req);
  if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });
  const notices: TaskEventNotice[] = [];
  let outcome: Outcome;
  try {
    outcome = await (await m.getDb()).transaction(async (tx): Promise<Outcome> => {
      const doc = await loadProjectionInput(tx, String(req.params.id), organizationId, { forUpdate: true });
      if (!doc) return { status: 404, body: { ok: false, error: 'not_found' } };
      return act(tx, doc, notices);
    });
  } catch (err) {
    if (err instanceof ReviewRouteRefusal) return res.status(err.status).json({ ok: false, error: err.code, message: err.message });
    if (err instanceof LifecycleRecordRefusal) return res.status(409).json({ ok: false, error: err.code, message: err.message });
    throw err;
  }
  for (const n of notices) notifyTaskEvent(n);
  return 'responded' in outcome ? undefined : res.status(outcome.status).json(outcome.body);
}

/**
 * The route's own acts on a record (§2.9–§2.10), each a governed act with the
 * actor's reason: re-send on a record still in review whose last route was
 * withdrawn (or that entered review with none), withdraw, and return.
 */
export function mountReviewRouteActs(m: ReviewRouteActMount): void {
  // The picker's read (RR1b): who may be named on this Vault version, by the
  // validator's own rules. Read-only, on the sender's grant.
  m.router.get('/route-candidates/:vaultId', m.guard, m.wrap(async (req, res) => {
    const organizationId = resolveOrgId(req);
    if (organizationId === null) return res.status(403).json({ ok: false, error: 'organization_context_required' });
    const readerId = resolveUserId(req);
    if (readerId === null) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });
    const vaultId = String(req.params.vaultId);
    if (!UUID.test(vaultId)) return res.status(404).json({ ok: false, error: 'not_found' });
    const read = await (await m.getDb()).transaction((tx) =>
      readRouteCandidates(queryableFromDrizzle(tx as never), { organizationId, vaultId, readerId }));
    if (!read) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.json({ ok: true, ...read });
  }));
  m.router.post('/:id/review-route', m.guard, m.wrap((req, res) => onRecord(m, req, res, async (tx, doc, notices) => {
    const reason = requireGovernedReason(req.body?.reason);
    if (!reason.ok) return refuse(400, 'REASON_REQUIRED', `${reason.error} Nothing was sent.`);
    const senderId = resolveUserId(req);
    if (senderId === null) return { status: 401, body: { ok: false, error: 'AUTH_REQUIRED' } };
    const request = parseRouteRequest(req.body?.route);
    const standing = await lockedStanding(tx, doc);
    if (doc.stage !== 'in_review' || (standing.state !== 'withdrawn' && standing.state !== 'legacy')) {
      return refuse(409, 'ROUTE_NOT_RESENDABLE', 'A route is re-sent on a document in review whose last route was withdrawn. Nothing was sent.');
    }
    if (vaultSourceId(doc.sources) === null) return refuse(409, 'ROUTE_SUBJECT_NOT_VAULT', 'A review route is sent on a Vault version. Nothing was sent.');
    const sent = await sendReviewRoute(asTx(tx), {
      organizationId: doc.organizationId, senderId, reason: reason.reason, request,
      subject: { type: 'canonical_document', id: doc.canonicalId, title: doc.title, programId: doc.projectId ?? null, contentDigest: doc.contentHash },
    });
    notices.push(...sent.notices);
    return { status: 201, body: { ok: true, routeId: sent.routeId, stage: doc.stage } };
  })));
  for (const act of ['withdraw', 'return'] as const) {
    m.router.post(`/:id/review-route/${act}`, m.guard, m.wrap((req, res) =>
      onRecord(m, req, res, (tx, doc, notices) => closeRouteByAct(req, tx, m.deps, { doc, act, notices }))));
  }
}
