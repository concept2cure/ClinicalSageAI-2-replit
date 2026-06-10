/**
 * HA Interaction & Commitment API — Capability C2C-03
 *
 * Governed CRUD for agency meetings, their questions, and the commitments
 * (PMR/PMC/REMS) they spawn. Every mutation runs BEGIN → Tx → recordGovernedAction
 * → COMMIT, org-scoped from the verified request context. Commitments thread onto
 * the provenance spine in the service. Mounted at /api/ha-interactions.
 *
 * @module server/routes/ha-interactions
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createInteractionTx,
  updateInteractionStatusTx,
  addQuestionTx,
  createCommitmentTx,
  fulfillCommitmentTx,
  addMilestoneTx,
  listInteractions,
  listCommitments,
  getInteractionReadinessInput,
} from '../services/ha-interactions/ha-service';
import { evaluateMeetingReadiness, deriveCommitmentStatus, summarizeCommitmentPortfolio } from '../services/ha-interactions/ha-logic';
import { recordHaInteractionCreated, recordHaCommitmentCreated, recordHaCommitmentFulfilled } from '../services/ha-metrics';

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
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');

async function governedMutation(
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
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'ha' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Interactions ────────────────────────────────────────────────────────────

const interactionSchema = z.object({
  interactionType: z.enum(['pre_ind', 'eop1', 'eop2', 'pre_nda', 'pre_bla', 'type_a', 'type_b', 'type_c', 'scientific_advice', 'other']),
  agency: z.enum(['fda', 'ema', 'pmda', 'mhra', 'other']),
  title: z.string().min(1).max(500),
  objective: z.string().max(4000).optional(),
  submissionId: z.number().int().positive().optional(),
  requestedDate: z.string().optional(),
  scheduledDate: z.string().optional(),
  reason,
});

router.post('/interactions', async (req, res) => {
  const parsed = interactionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedMutation(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createInteractionTx(client, orgId, userId, parsed.data);
    recordHaInteractionCreated();
    return { target: `ha-interaction:${id}`, payload: { type: parsed.data.interactionType, agency: parsed.data.agency }, body: { id } };
  });
});

router.get('/interactions', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    res.json(await listInteractions(orgId, Number.isFinite(submissionId) ? submissionId : undefined));
  } catch (err) {
    fail(res, err);
  }
});

const statusSchema = z.object({
  status: z.enum(['planned', 'requested', 'scheduled', 'held', 'minutes_received', 'closed', 'cancelled']),
  heldDate: z.string().optional(),
  scheduledDate: z.string().optional(),
  minutesReceivedDate: z.string().optional(),
  reason,
});

router.patch('/interactions/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedMutation(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await updateInteractionStatusTx(client, orgId, id, parsed.data.status, parsed.data);
    return { target: `ha-interaction:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

const questionSchema = z.object({
  questionNumber: z.number().int().positive(),
  questionText: z.string().min(1).max(4000),
  sponsorPosition: z.string().max(4000).optional(),
  agencyResponse: z.string().max(4000).optional(),
  agreementReached: z.boolean().optional(),
  reason,
});

router.post('/interactions/:id/questions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = questionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedMutation(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: qid } = await addQuestionTx(client, orgId, userId, id, parsed.data);
    return { target: `ha-interaction:${id}`, payload: { questionId: qid }, body: { interactionId: id, questionId: qid } };
  });
});

router.get('/interactions/:id/readiness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const client = await pool.connect();
  try {
    const input = await getInteractionReadinessInput(client, orgId, id);
    res.json(evaluateMeetingReadiness(input as any));
  } catch (err) {
    fail(res, err);
  } finally {
    client.release();
  }
});

// ─── Commitments ─────────────────────────────────────────────────────────────

const commitmentSchema = z.object({
  commitmentType: z.enum(['pmr', 'pmc', 'rems', 'meeting_commitment', 'other']),
  description: z.string().min(1).max(4000),
  submissionId: z.number().int().positive().optional(),
  sourceInteractionId: z.number().int().positive().optional(),
  regulatoryBasis: z.string().max(500).optional(),
  dueDate: z.string().optional(),
  reason,
});

router.post('/commitments', async (req, res) => {
  const parsed = commitmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedMutation(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, provenanceLinkIds } = await createCommitmentTx(client, orgId, userId, parsed.data);
    recordHaCommitmentCreated(parsed.data.commitmentType);
    return { target: `regulatory-commitment:${id}`, payload: { type: parsed.data.commitmentType, provenanceLinkIds }, body: { id, provenanceLinkIds } };
  });
});

router.get('/commitments', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const submissionId = req.query.submissionId ? Number(req.query.submissionId) : undefined;
  try {
    const rows = await listCommitments(orgId, Number.isFinite(submissionId) ? submissionId : undefined);
    const t = today();
    const commitments = rows.map((r) => ({
      ...r,
      effectiveStatus: deriveCommitmentStatus({ status: r.status, dueDate: r.due_date, fulfilledDate: r.fulfilled_date }, t),
    }));
    const summary = summarizeCommitmentPortfolio(rows.map((r) => ({ status: r.status, dueDate: r.due_date, fulfilledDate: r.fulfilled_date })), t);
    res.json({ commitments, summary });
  } catch (err) {
    fail(res, err);
  }
});

const fulfillSchema = z.object({ fulfilledDate: z.string().optional(), reason });

router.post('/commitments/:id/fulfill', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = fulfillSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedMutation(req, res, 'resolve', parsed.data.reason, async (client, orgId) => {
    await fulfillCommitmentTx(client, orgId, id, parsed.data.fulfilledDate ?? null);
    recordHaCommitmentFulfilled();
    return { target: `regulatory-commitment:${id}`, payload: { status: 'fulfilled' }, body: { id, status: 'fulfilled' } };
  });
});

const milestoneSchema = z.object({ title: z.string().min(1).max(500), dueDate: z.string().optional(), reason });

router.post('/commitments/:id/milestones', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = milestoneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governedMutation(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: mid } = await addMilestoneTx(client, orgId, userId, id, parsed.data);
    return { target: `regulatory-commitment:${id}`, payload: { milestoneId: mid }, body: { commitmentId: id, milestoneId: mid } };
  });
});

export default router;
