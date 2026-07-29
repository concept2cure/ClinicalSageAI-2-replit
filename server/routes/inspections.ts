/**
 * Inspection Readiness API — BIMO / PAI (Capability C2C-13)
 *
 * Governed CRUD for inspections, Form 483 findings, finding responses (15-
 * business-day clock), and per-area readiness assessments. Every mutation runs
 * BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped. Read endpoints surface
 * the readiness score and response urgency. Mounted at /api/inspections.
 *
 * @module server/routes/inspections
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  createInspectionTx,
  setInspectionStatusTx,
  addFindingTx,
  addResponseTx,
  upsertReadinessTx,
  listInspections,
  listFindings,
  listReadinessAreas,
} from '../services/inspection/inspection-service';
import { scoreReadiness } from '../services/inspection/inspection-logic';
import { recordInspectionCreated, recordInspectionFinding, recordInspectionOutcome } from '../services/inspection-metrics';

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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'inspection' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const inspectionSchema = z.object({
  inspectionType: z.enum(['bimo', 'pai', 'gcp', 'gmp', 'routine', 'for_cause', 'other']),
  agency: z.enum(['fda', 'ema', 'mhra', 'pmda', 'other']),
  siteName: z.string().min(1).max(300),
  scheduledDate: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  reason,
});
router.post('/', async (req, res) => {
  const parsed = inspectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createInspectionTx(client, orgId, userId, parsed.data);
    recordInspectionCreated(parsed.data.inspectionType);
    return { target: `inspection:${id}`, payload: { type: parsed.data.inspectionType, agency: parsed.data.agency }, body: { id } };
  });
});

router.get('/', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listInspections(orgId)); } catch (err) { fail(res, err); }
});

const statusSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'closed']).optional(),
  outcome: z.enum(['pending', 'nai', 'vai', 'oai']).optional(),
  endDate: z.string().optional(),
  reason,
});
router.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setInspectionStatusTx(client, orgId, id, parsed.data.status, parsed.data.outcome, parsed.data.endDate);
    if (parsed.data.outcome && parsed.data.outcome !== 'pending') recordInspectionOutcome(parsed.data.outcome);
    return { target: `inspection:${id}`, payload: { status: parsed.data.status, outcome: parsed.data.outcome }, body: { id, status: parsed.data.status, outcome: parsed.data.outcome } };
  });
});

const findingSchema = z.object({
  observationNumber: z.number().int().positive(),
  description: z.string().min(1).max(4000),
  classification: z.enum(['critical', 'major', 'minor', 'observation']),
  reason,
});
router.post('/:id/findings', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = findingSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: fid } = await addFindingTx(client, orgId, userId, id, parsed.data);
    recordInspectionFinding(parsed.data.classification);
    return { target: `inspection:${id}`, payload: { findingId: fid, classification: parsed.data.classification }, body: { inspectionId: id, findingId: fid } };
  });
});

router.get('/:id/findings', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await listFindings(orgId, id)); } catch (err) { fail(res, err); }
});

const responseSchema = z.object({ findingId: z.number().int().positive(), responseDescription: z.string().min(1).max(8000), dueDate: z.string().optional(), reason });
router.post('/findings/responses', async (req, res) => {
  const parsed = responseSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'resolve', parsed.data.reason, async (client, orgId, userId) => {
    const { id: rid, dueDate } = await addResponseTx(client, orgId, userId, parsed.data.findingId, parsed.data);
    return { target: `inspection-finding:${parsed.data.findingId}`, payload: { responseId: rid, dueDate }, body: { findingId: parsed.data.findingId, responseId: rid, dueDate } };
  });
});

const readinessSchema = z.object({
  inspectionId: z.number().int().positive().optional(),
  area: z.string().min(1).max(200),
  status: z.enum(['not_started', 'in_progress', 'ready', 'at_risk']),
  gaps: z.string().max(4000).optional(),
  reason,
});
router.put('/readiness', async (req, res) => {
  const parsed = readinessSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await upsertReadinessTx(client, orgId, userId, parsed.data);
    return { target: parsed.data.inspectionId ? `inspection:${parsed.data.inspectionId}` : `readiness-area:${id}`, payload: { area: parsed.data.area, status: parsed.data.status }, body: { id } };
  });
});

router.get('/readiness/score', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const inspectionId = req.query.inspectionId ? Number(req.query.inspectionId) : undefined;
  try {
    const areas = await listReadinessAreas(orgId, Number.isFinite(inspectionId) ? inspectionId : undefined);
    res.json(scoreReadiness(areas));
  } catch (err) { fail(res, err); }
});

export default router;
