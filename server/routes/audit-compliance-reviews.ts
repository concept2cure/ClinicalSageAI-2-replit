/**
 * Periodic review records, beside the compliance reports (P1-25 audit-trail
 * review, P1-43 access review; ADR-0014 §8):
 *
 *   GET  /api/audit/reviews             this organisation's records, and the latest
 *                                       signed review of each kind with whether it is overdue
 *   GET  /api/audit/reviews/:id         one record, with its decisions
 *   POST /api/audit/reviews             draft a record          { kind, periodStart, periodEnd, scope, outcome, decisions }
 *   POST /api/audit/reviews/:id/sign    sign it, through the ceremony   { reason, meaning: 'review', password, mfaToken? }
 *
 * Mounted by createComplianceReportRoutes (routes/audit-compliance-reports.ts),
 * which hands over its own gate: the session's usable organisation and the
 * audit-reader role (owners, admins, managers, platform administrators). A
 * write also needs signing authority (services/part11/signing-authority.ts),
 * the policy the ceremony itself enforces, so a session that could not sign
 * the record is not left holding a draft it cannot finish.
 *
 * Signing is signGovernedAct (routes/governed-signed-act.ts) with
 * signReviewAct as its domain write: password, second factor where enrolled,
 * meaning `review`, reason, signing authority, the per-signer attempt limit,
 * one transaction for the record, the ledger pair and the signature.
 *
 * @module server/routes/audit-compliance-reviews
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Pool, PoolClient } from 'pg';

import { serverError } from '../lib/api-response.js';
import { requireAuditRecorder } from '../services/audit/audit-api-authority.js';
import { inTenantSnapshot } from '../services/audit/compliance-reports/generate.js';
import {
  REVIEW_MEANING,
  REVIEW_REFUSAL_STATUS,
  ReviewRefusal,
  createReviewDraft,
  findReview,
  listReviews,
  reviewDraftSchema,
  reviewStatus,
  signReviewAct,
} from '../services/audit/compliance-reviews.js';
import { resolveSignerOrgRole } from '../services/part11/resolve-signer-role.js';
import { isSigningAuthorized } from '../services/part11/signing-authority.js';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context.js';
import { resolveUserId } from '../types/auth-request.js';
import { clientIpOf } from '../utils/client-ip.js';
import { createScopedLogger } from '../utils/logger.js';
import { signGovernedAct, signedActAttempts } from './governed-signed-act.js';

const log = createScopedLogger('audit-compliance-reviews');

/** The gate the compliance reports apply, handed over so there is one. */
export interface ReportGate {
  sessionOrg: (req: Request, res: Response) => number | null;
  readerGate: (req: Request, res: Response, next: NextFunction) => void;
}

function refuse(res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}): void {
  res.status(status).json({ success: false, error: { code, message, ...extra } });
}

/** A positive integer record id from the path, or null after answering 404. */
function reviewIdOr404(req: Request, res: Response): number | null {
  const raw = String(req.params.id ?? '');
  const id = /^\d{1,9}$/.test(raw) ? Number(raw) : 0;
  if (id > 0) return id;
  refuse(res, 404, 'REVIEW_NOT_FOUND', 'There is no review record with that number in this organisation.');
  return null;
}

/** Whether this member's role carries signing authority, from the membership row (§11.10(g)). */
async function canSign(req: Request, orgId: number): Promise<boolean> {
  const userId = Number(resolveUserId(req));
  return isSigningAuthorized(await resolveSignerOrgRole(userId, orgId));
}

async function list(pool: Pool, req: Request, res: Response, orgId: number): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const [read, signer] = await Promise.all([
      inTenantSnapshot(pool, orgId, async (c) => ({ reviews: await listReviews(c, orgId), status: await reviewStatus(c, orgId, nowIso) })),
      canSign(req, orgId),
    ]);
    res.json({ success: true, canSign: signer, asOf: nowIso, ...read });
  } catch (err) {
    serverError(res, log, 'reading the review records', err);
  }
}

async function one(pool: Pool, req: Request, res: Response, orgId: number): Promise<void> {
  const id = reviewIdOr404(req, res);
  if (id == null) return;
  try {
    const review = await inTenantSnapshot(pool, orgId, (c) => findReview(c, orgId, id));
    if (!review) return refuse(res, 404, 'REVIEW_NOT_FOUND', 'There is no review record with that number in this organisation.');
    res.json({ success: true, review });
  } catch (err) {
    serverError(res, log, 'reading the review record', err, { reviewId: id });
  }
}

async function draft(pool: Pool, req: Request, res: Response, orgId: number): Promise<void> {
  const parsed = reviewDraftSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).slice(0, 8);
    return refuse(res, 400, 'REVIEW_INVALID', `The review is incomplete: ${issues.join('; ')}. Nothing was recorded.`, { fieldErrors });
  }
  const userId = Number(resolveUserId(req));
  let client: PoolClient;
  try {
    if (!(await canSign(req, orgId))) {
      return refuse(res, 403, 'ESIGNATURE_NO_AUTHORITY', 'A review record is signed by its reviewer, and your role does not permit applying an electronic signature (21 CFR Part 11 §11.10(g)). Nothing was recorded.');
    }
    client = await pool.connect();
  } catch (err) {
    serverError(res, log, 'opening the review draft', err);
    return;
  }
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const review = await createReviewDraft(
      client,
      { orgId, userId, ipAddress: clientIpOf(req) ?? undefined, userAgent: req.get('user-agent') ?? undefined },
      parsed.data,
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, review });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (err instanceof ReviewRefusal) return refuse(res, REVIEW_REFUSAL_STATUS[err.code], err.code, err.message, err.extra);
    serverError(res, log, 'recording the review draft', err);
  } finally {
    client.release();
  }
}

async function sign(req: Request, res: Response): Promise<void> {
  const id = reviewIdOr404(req, res);
  if (id == null) return;
  // Before the ceremony checks the password, so a refused meaning spends no guess.
  const meaning = (req.body ?? {}).meaning;
  if (typeof meaning === 'string' && meaning.length > 0 && meaning !== REVIEW_MEANING) {
    return refuse(res, 400, 'SIGNATURE_MEANING_NOT_REVIEW', 'A review record is signed with the meaning "review". Nothing was signed.');
  }
  await signGovernedAct(req, res, { domain: 'compliance', codeStatus: REVIEW_REFUSAL_STATUS, run: signReviewAct(id) });
}

export function createComplianceReviewRoutes(pool: Pool, gate: ReportGate): Router {
  const router = Router();
  const recorderGate = (req: Request, res: Response, next: NextFunction) => {
    if (gate.sessionOrg(req, res) == null) return;
    if (!requireAuditRecorder(req, res)) return;
    next();
  };
  const withOrg = (fn: (pool: Pool, req: Request, res: Response, orgId: number) => Promise<void>) => (req: Request, res: Response) => {
    const orgId = gate.sessionOrg(req, res);
    if (orgId != null) void fn(pool, req, res, orgId);
  };

  router.get('/audit/reviews', gate.readerGate, withOrg(list));
  router.get('/audit/reviews/:id', gate.readerGate, withOrg(one));
  router.post('/audit/reviews', recorderGate, withOrg(draft));
  router.post('/audit/reviews/:id/sign', recorderGate, signedActAttempts, (req, res) => void sign(req, res));
  return router;
}
