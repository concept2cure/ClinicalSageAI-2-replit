/**
 * The review route's acts on a QMS controlled document (slice RR4 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.7–§2.10). Mounted on the QMS
 * router (mdx-qms.ts), under /api/mdx/qms:
 *
 *   GET  /qms/documents/:id/route-candidates[?for=reassign]  who may be named, with the validator's answer per role
 *   GET  /qms/documents/:id/review-route                     the document's round: every member, the naming history
 *   POST /qms/documents/:id/review                           a named reviewer's signature (signGovernedAct,
 *                                                            precheck before the credential, afterSign on its transaction)
 *   POST /qms/documents/:id/return                           Return for revision: in_review → draft, the route returned
 *   POST /qms/documents/:id/review-route                     send a route on a document in review with none, or a withdrawn one
 *   POST /qms/documents/:id/review-route/withdraw            the sender or an administrator
 *   POST /qms/documents/:id/review-route/reassign            the sender or an administrator, RR3's reassignMember
 *   POST /qms/documents/:id/review-route/hand-back           a named member, RR3's handBackMember
 *
 * Sending (PATCH /qms/documents/:id {status:'in_review', route}) and the
 * approval (POST /qms/documents/:id/approve) stay where they were, in
 * mdx-qms.ts, and ask services/qms/qms-review-route.ts for the route's part.
 * Every act is governed with the actor's reason (requireGovernedReason), runs
 * on one transaction under the document's row lock, and sends its notices
 * after COMMIT. Refusals answer in the QMS envelope: { error, details: { code } }.
 *
 * @module server/routes/mdx-qms-review-route
 */
import type { Request, Response, Router } from 'express';
import { clientError, orgRequired, serverError } from '../lib/api-response';
import { requestConnectable, requestPgClient, type RequestSqlClient } from '../db/requestDb';
import { requireEditorAccess } from '../middleware/orgMembership';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import { resolveOrgId, resolveUserId } from '../types/auth-request';
import { createScopedLogger } from '../utils/logger';
import { requireGovernedReason } from './governed-reason';
import { signedActAttempts, signGovernedAct } from './governed-signed-act';
import { parseRouteRequest, reassignMember, handBackMember, ReviewRouteRefusal, senderTimeZone } from '../services/review/review-route';
import { readRouteRounds } from '../services/review/review-route-standing';
import { listRouteCandidates, namingOf } from '../services/review/review-route-candidates';
import { notifyTaskEvent, type TaskEventNotice } from '../services/tasking/task-side-effects';
import {
  grantRouteAccess, lockQmsDocument, qmsActSubject, qmsReviewSigning, qmsRouteSubject, qmsStanding, resendQmsRoute, returnQmsDocument,
  routeTxOf, withdrawQmsRoute, QMS_ROUTE_CODE_STATUS, QMS_ROUTE_RULES, type QmsRouteClient,
} from '../services/qms/qms-review-route';
import type { QmsDocumentRow } from '../services/qms/document-approval-signature';
import { QmsContentRefusedError } from '../services/qms/controlled-document-content';
import { TASK_SIGNATURE_MEANINGS } from '../services/part11/signature-meanings';
import { positiveId } from './mdx-qms-context';

const log = createScopedLogger('mdx-qms-review-route');

/** The review signature's one meaning: the route's reviewer meaning (review-route-standing.ts ROUTE_SIGN_MEANING). */
const REVIEWED = ['REVIEWED'] as const satisfies readonly (typeof TASK_SIGNATURE_MEANINGS)[number][];

const documentIdOf = (req: Request): number | null => {
  const id = Number(req.params.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** A ReviewRouteRefusal, said in the QMS envelope; null for anything else. */
export function qmsRouteRefusal(res: Response, err: unknown): Response | null {
  if (!(err instanceof ReviewRouteRefusal)) return null;
  return clientError(res, err.status, err.message, { code: err.code });
}

type Act = (client: QmsRouteClient, ids: { orgId: number; userId: number; documentId: number }, notices: TaskEventNotice[]) => Promise<Record<string, unknown>>;

/** One route act on its own transaction, the document locked first; notices after COMMIT. */
async function onDocument(req: Request, res: Response, operation: string, act: Act): Promise<Response> {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (orgId === null) return orgRequired(res);
  if (userId === null) return clientError(res, 401, 'User context required');
  const documentId = documentIdOf(req);
  if (documentId === null) return clientError(res, 422, 'id must be a positive integer. Nothing was changed.');
  const notices: TaskEventNotice[] = [];
  let client: (RequestSqlClient & { release(error?: Error): void }) | null = null;
  try {
    client = await requestConnectable(req).connect();
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const body = await act(client, { orgId, userId, documentId }, notices);
    await client.query('COMMIT');
    for (const n of notices) notifyTaskEvent(n);
    return res.json({ ok: true, ...body });
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => undefined);
    const refusal = qmsRouteRefusal(res, err);
    if (refusal) return refusal;
    if (err instanceof QmsContentRefusedError && err.status !== 503) return clientError(res, err.status as 400 | 403 | 404 | 409, err.message, { code: err.code });
    return serverError(res, log, operation, err);
  } finally {
    client?.release();
  }
}

/** The actor's reason, or the 400 that says so with nothing written. */
function reasonOf(req: Request, res: Response, nothing = 'Nothing was changed.'): string | null {
  const reason = requireGovernedReason(req.body?.reason);
  if (!reason.ok) {
    clientError(res, 400, `${reason.error} ${nothing}`, { code: 'REASON_REQUIRED' });
    return null;
  }
  return reason.reason;
}

async function readCandidates(req: Request, res: Response): Promise<Response> {
  const orgId = resolveOrgId(req);
  const readerId = resolveUserId(req);
  if (orgId === null) return orgRequired(res);
  if (readerId === null) return clientError(res, 401, 'User context required');
  const documentId = documentIdOf(req);
  if (documentId === null) return clientError(res, 422, 'id must be a positive integer');
  try {
    const q = requestPgClient(req) as unknown as QmsRouteClient;
    const { rows } = await q.query(`SELECT * FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [documentId, orgId]);
    const row = rows[0] as QmsDocumentRow | undefined;
    if (!row) return clientError(res, 404, 'Document not found in this organization.');
    const forReassign = req.query.for === 'reassign';
    const standing = await qmsStanding(q, row);
    const subject = await qmsRouteSubject(q, row);
    const candidates = await listRouteCandidates(q, {
      organizationId: orgId, subjectTarget: `qms-document:${documentId}`, programId: subject.programId, contentDigest: subject.contentDigest,
      readerId, naming: namingOf(standing, readerId, forReassign),
    });
    return res.json({ ok: true, timeZone: await senderTimeZone(q, readerId), documentId, candidates });
  } catch (err) {
    return serverError(res, log, 'qms-route-candidates', err);
  }
}

async function readRound(req: Request, res: Response): Promise<Response> {
  const orgId = resolveOrgId(req);
  if (orgId === null) return orgRequired(res);
  const documentId = documentIdOf(req);
  if (documentId === null) return clientError(res, 422, 'id must be a positive integer');
  try {
    const q = requestPgClient(req) as unknown as QmsRouteClient;
    const { rows } = await q.query(`SELECT id, status FROM qms_documents WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [documentId, orgId]);
    if (!rows[0]) return clientError(res, 404, 'Document not found in this organization.');
    const rounds = await readRouteRounds(q, { organizationId: orgId, subjectType: 'qms_document', subjectIds: [String(documentId)] });
    return res.json({ ok: true, documentId, status: rows[0].status, round: rounds.get(String(documentId)) ?? null });
  } catch (err) {
    return serverError(res, log, 'qms-route-round', err);
  }
}

/** POST /qms/documents/:id/review: a named reviewer signs the review, as an electronic signature. */
async function signReview(req: Request, res: Response): Promise<void> {
  const documentId = documentIdOf(req);
  if (documentId === null) { clientError(res, 422, 'id must be a positive integer. Nothing was signed.'); return; }
  const signing = qmsReviewSigning(documentId);
  await signGovernedAct(req, res, {
    domain: 'qms',
    target: `qms-document:${documentId}`,
    meanings: REVIEWED,
    codeStatus: QMS_ROUTE_CODE_STATUS,
    contentBasis: 'qms-document-version-content-sha256',
    precheck: (client, orgId, userId) => signing.precheck(client as unknown as QmsRouteClient, orgId, userId),
    run: (client, orgId, userId) => signing.run(client as unknown as QmsRouteClient, orgId, userId),
    afterSign: (client, signature, _result, orgId, userId) => signing.afterSign(client as unknown as QmsRouteClient, signature, orgId, userId),
    afterCommit: async () => { for (const n of signing.notices) notifyTaskEvent(n); },
  });
}

export function mountQmsReviewRoute(router: Router): void {
  router.get('/qms/documents/:id/route-candidates', readCandidates);
  router.get('/qms/documents/:id/review-route', readRound);
  router.post('/qms/documents/:id/review', signedActAttempts, signReview);

  router.post('/qms/documents/:id/return', requireEditorAccess, async (req, res) => {
    const reason = reasonOf(req, res); if (reason === null) return;
    return onDocument(req, res, 'qms-return', async (client, ids, notices) => {
      const done = await returnQmsDocument(client, { organizationId: ids.orgId, documentId: ids.documentId, userId: ids.userId, reason });
      notices.push(...done.notices);
      return { data: done.row, routeId: done.routeId, status: 'draft' };
    });
  });

  router.post('/qms/documents/:id/review-route', requireEditorAccess, async (req, res) => {
    const reason = reasonOf(req, res, 'Nothing was sent.'); if (reason === null) return;
    let request;
    try { request = parseRouteRequest(req.body?.route, QMS_ROUTE_RULES); }
    catch (err) { return qmsRouteRefusal(res, err) ?? serverError(res, log, 'qms-route-resend', err); }
    return onDocument(req, res, 'qms-route-resend', async (client, ids, notices) => {
      const sent = await resendQmsRoute(client, { organizationId: ids.orgId, documentId: ids.documentId, userId: ids.userId, reason, request });
      notices.push(...sent.notices);
      return { routeId: sent.routeId };
    });
  });

  router.post('/qms/documents/:id/review-route/withdraw', async (req, res) => {
    const reason = reasonOf(req, res); if (reason === null) return;
    return onDocument(req, res, 'qms-route-withdraw', async (client, ids, notices) => {
      const done = await withdrawQmsRoute(client, { organizationId: ids.orgId, documentId: ids.documentId, userId: ids.userId, reason });
      notices.push(...done.notices);
      return { routeId: done.routeId, status: 'withdrawn' };
    });
  });

  router.post('/qms/documents/:id/review-route/reassign', async (req, res) => {
    const reason = reasonOf(req, res); if (reason === null) return;
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
    const assigneeId = positiveId(req.body?.assigneeId);
    if (!taskId || assigneeId === null) {
      return clientError(res, 400, 'Name the assignment (taskId) and the person to give it to (assigneeId). Nothing was changed.', { code: 'ROUTE_INVALID' });
    }
    return onDocument(req, res, 'qms-route-reassign', async (client, ids, notices) => {
      const row = await lockQmsDocument(client, ids.orgId, ids.documentId);
      // The standing under the document's row lock, without locking the member rows: assignTaskInTx
      // then locks the project and the task in a generic assignment's own order (RR3's decision 1).
      const standing = await qmsStanding(client, row);
      if (standing.state !== 'live') throw new ReviewRouteRefusal(409, 'ROUTE_NOT_OPEN', 'This document has no open review route. Nothing was changed.');
      const done = await reassignMember(routeTxOf(client), req, {
        organizationId: ids.orgId, actorUserId: ids.userId, reason, subject: qmsActSubject(row), standing, taskId, assigneeId,
      });
      await grantRouteAccess(client, { row, actorId: ids.userId, reason, members: [{ userId: done.to.userId, role: done.member.role }] });
      notices.push(...done.notices);
      return { routeId: standing.route!.id, taskId, role: done.member.role, from: done.member.userId, to: done.to.userId, actId: done.actId };
    });
  });

  router.post('/qms/documents/:id/review-route/hand-back', async (req, res) => {
    const reason = reasonOf(req, res); if (reason === null) return;
    return onDocument(req, res, 'qms-route-hand-back', async (client, ids, notices) => {
      const row = await lockQmsDocument(client, ids.orgId, ids.documentId);
      const standing = await qmsStanding(client, row, true);
      if (standing.state !== 'live') throw new ReviewRouteRefusal(409, 'ROUTE_NOT_OPEN', 'This document has no open review route. Nothing was changed.');
      const done = await handBackMember(routeTxOf(client), { organizationId: ids.orgId, actorUserId: ids.userId, reason, subject: qmsActSubject(row), standing });
      notices.push(...done.notices);
      return { routeId: standing.route!.id, taskId: done.member.taskId, role: done.member.role, actId: done.actId };
    });
  });
}
