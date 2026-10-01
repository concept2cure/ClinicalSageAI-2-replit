/**
 * IACUC / Animal Study Governance API — Capability C2C-05
 *
 * Governed CRUD for animal-use protocols, census cohorts, committee
 * determinations, and amendments. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped from the verified request context.
 * Approval writes a provenance link to Module 4. Mounted at /api/iacuc.
 *
 * @module server/routes/iacuc
 */

import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { signGovernedAct, signedActAttempts } from './governed-signed-act';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  createProtocolTx,
  setProtocolStatusTx,
  recordReviewTx,
  addCohortTx,
  addAmendmentTx,
  listProtocols,
  getProtocolCompletenessInput,
} from '../services/iacuc/iacuc-service';
import { evaluateProtocolCompleteness, reviewStatus, recommendReviewType } from '../services/iacuc/iacuc-logic';
import { recordIacucProtocolCreated, recordIacucApproval, recordIacucReview } from '../services/iacuc-metrics';

const router = Router();

function resolveUserId(req: Request): number | null {
  const r = req as any;
  const raw = r.userId ?? r.user?.id ?? r.user?.userId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
function resolveOrgId(req: Request): number | null {
  const r = req as any;
  const raw = r.tenantId ?? r.organizationId ?? r.user?.organizationId ?? r.user?.tenantId;
  const n = raw == null ? NaN : typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, INVALID_STATE: 409, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');

async function governed(
  req: Request,
  res: Response,
  command: string,
  reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) {
    res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'iacuc' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const PAIN = z.enum(['B', 'C', 'D', 'E']);

const protocolSchema = z.object({
  protocolNumber: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  painCategory: PAIN,
  submissionId: z.number().int().positive().optional(),
  threeRsReplacement: z.string().max(4000).optional(),
  threeRsReduction: z.string().max(4000).optional(),
  threeRsRefinement: z.string().max(4000).optional(),
  painJustification: z.string().max(4000).optional(),
  reason,
});

router.post('/protocols', async (req, res) => {
  const parsed = protocolSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createProtocolTx(client, orgId, userId, parsed.data);
    recordIacucProtocolCreated(parsed.data.painCategory);
    const rec = recommendReviewType(parsed.data.painCategory);
    return { target: `iacuc-protocol:${id}`, payload: { painCategory: parsed.data.painCategory }, body: { id, recommendedReview: rec } };
  });
});

router.get('/protocols', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    res.json(await listProtocols(orgId, Number.isFinite(submissionId) ? submissionId : undefined));
  } catch (err) {
    fail(res, err);
  }
});

const statusSchema = z.object({
  status: z.enum(['draft', 'submitted', 'dmr', 'fcr', 'approved', 'conditional', 'tabled', 'withdrawn', 'expired']),
  reviewType: z.enum(['designated_member_review', 'full_committee_review']).optional(),
  reason,
});

/*
 * A status a committee determination sets is set only by the determination,
 * POST /api/iacuc/protocols/:id/reviews, where an approval is an electronic signature
 * (signGovernedAct) and every outcome leaves a review record. This route used
 * to accept 'approved' too and wrote it under a 'transition' ledger row and
 * nothing else: an approval with no signature, no review and no reviewer, from
 * a session alone (P0-10b fix round, DP-02). The statuses no determination
 * sets still move here.
 */
const SET_BY_DETERMINATION: ReadonlySet<string> = new Set(['approved', 'conditional']);

router.patch('/protocols/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  if (SET_BY_DETERMINATION.has(parsed.data.status)) {
    return res.status(409).json({ error: { code: 'STATUS_SET_BY_DETERMINATION', message: `'${parsed.data.status}' is a committee determination. Record it at POST /api/iacuc/protocols/:id/reviews; an approval there is an electronic signature. Nothing was changed.` } });
  }
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setProtocolStatusTx(client, orgId, id, parsed.data.status, parsed.data.reviewType);
    return { target: `iacuc-protocol:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

const reviewSchema = z.object({
  reviewType: z.enum(['designated_member_review', 'full_committee_review']),
  reviewerCount: z.number().int().positive().optional(),
  outcome: z.enum(['approved', 'conditional', 'tabled', 'withdrawn']),
  conditions: z.string().max(4000).optional(),
  determinationDate: z.string().optional(),
  reason,
});

/*
 * An approval is an electronic signature (21 CFR 11.50, 11.200): it runs the
 * platform's one signing ceremony (governed-signed-act.ts): password, enrolled
 * second factor, declared meaning and reason, then the act, the ledger `sign`
 * and the electronic_signatures row on one transaction. A request without them
 * writes nothing. Any other outcome is a determination recorded under
 * 'resolve' and asks for no password. It used to write a 'sign' ledger row
 * with neither (P0-10b, DP-02).
 */
/** The signing-attempt limit, for the requests that sign. */
const whenApproving: RequestHandler = (req, res, next) =>
  req.body?.outcome === 'approved' ? signedActAttempts(req, res, next) : next();

router.post('/protocols/:id/reviews', whenApproving, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  const record = async (client: any, orgId: number, userId: number) => {
    const result = await recordReviewTx(client, orgId, userId, id, parsed.data);
    recordIacucReview(parsed.data.outcome);
    if (parsed.data.outcome === 'approved') recordIacucApproval();
    return { target: `iacuc-protocol:${id}`, payload: { outcome: parsed.data.outcome, expirationDate: result.expirationDate, provenanceLinkId: result.provenanceLinkId }, body: { id, ...result } };
  };
  if (parsed.data.outcome !== 'approved') return governed(req, res, 'resolve', parsed.data.reason, record);
  await signGovernedAct(req, res, { domain: 'iacuc', codeStatus: CODE_STATUS, run: record });
});

const cohortSchema = z.object({
  species: z.string().min(1).max(200),
  strain: z.string().max(200).optional(),
  plannedCount: z.number().int().nonnegative(),
  painCategory: PAIN,
  housingLocation: z.string().max(200).optional(),
  reason,
});

router.post('/protocols/:id/cohorts', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = cohortSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid } = await addCohortTx(client, orgId, userId, id, parsed.data);
    return { target: `iacuc-protocol:${id}`, payload: { cohortId: cid, species: parsed.data.species }, body: { protocolId: id, cohortId: cid } };
  });
});

const amendmentSchema = z.object({ description: z.string().min(1).max(4000), significant: z.boolean(), reason });

router.post('/protocols/:id/amendments', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = amendmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: aid } = await addAmendmentTx(client, orgId, userId, id, parsed.data);
    return { target: `iacuc-protocol:${id}`, payload: { amendmentId: aid, significant: parsed.data.significant }, body: { protocolId: id, amendmentId: aid } };
  });
});

router.get('/protocols/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const client = await pool.connect();
  try {
    const input = await getProtocolCompletenessInput(client, orgId, id);
    const completeness = evaluateProtocolCompleteness(input);
    const status = reviewStatus(input.approvalDate, new Date().toISOString().slice(0, 10));
    res.json({ completeness, reviewStatus: status, recommendedReview: recommendReviewType(input.painCategory) });
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

export default router;
