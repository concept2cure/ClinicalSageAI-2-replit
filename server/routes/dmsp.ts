/**
 * NIH Data Management & Sharing Plan API — Capability C2C-23
 *
 * Governed DMS plan authoring: create a plan (auto-seeded with the six required
 * DMS plan elements per NIH NOT-OD-21-013), edit an element's content + addressed
 * flag, read plans / a single plan with elements, read completeness, and finalize
 * behind the deterministic completeness gate. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Mounted at /api/dmsp.
 *
 * @module server/routes/dmsp
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createPlanTx,
  updateElementTx,
  finalizePlanTx,
  getCompleteness,
  listPlans,
  getPlan,
} from '../services/dmsp/dmsp-service';
import {
  recordDmsPlanCreated, recordDmsPlanElementUpdated, recordDmsPlanFinalized,
} from '../services/dmsp-metrics';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';

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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

// ─── Plans ─────────────────────────────────────────────────────────────────────

const planSchema = z.object({
  title: z.string().min(1).max(500),
  grantProposalId: z.number().int().positive().optional(),
  protocolDocumentId: z.number().int().positive().optional(),
  reason,
});
router.post('/plans', async (req, res) => {
  const parsed = planSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, elementsSeeded } = await createPlanTx(client, orgId, userId, parsed.data);
    recordDmsPlanCreated();
    return { target: `dms-plan:${id}`, payload: { elementsSeeded }, body: { id, elementsSeeded } };
  });
});

router.get('/plans', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const gp = req.query.grantProposalId;
  const pd = req.query.protocolDocumentId;
  const grantProposalId = typeof gp === 'string' && /^\d+$/.test(gp) ? Number(gp) : undefined;
  const protocolDocumentId = typeof pd === 'string' && /^\d+$/.test(pd) ? Number(pd) : undefined;
  try { res.json(await listPlans(orgId, { grantProposalId, protocolDocumentId })); } catch (err) { fail(res, err); }
});

router.get('/plans/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const plan = await getPlan(orgId, id);
    if (!plan) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'DMS plan not found.' } });
    res.json(plan);
  } catch (err) { fail(res, err); }
});

router.get('/plans/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getCompleteness(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── Elements ──────────────────────────────────────────────────────────────

const elementSchema = z.object({ content: z.string().max(50000).optional(), addressed: z.boolean().optional(), reason });
router.patch('/elements/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = elementSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    // The element's prose is attributed to the person saving it (lineage gate
    // inside updateElementTx, ledger L158); governed() already refuses a
    // request with no identified user.
    await updateElementTx(client, orgId, id, parsed.data, userId);
    recordDmsPlanElementUpdated();
    return { target: `dms-plan-element:${id}`, payload: { addressed: parsed.data.addressed }, body: { id } };
  });
});

// ─── Finalize ────────────────────────────────────────────────────────────────

router.post('/plans/:id/finalize', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await finalizePlanTx(client, orgId, userId, id);
    recordDmsPlanFinalized();
    return { target: `dms-plan:${id}`, payload: { addressedPct: result.completeness.addressedPct }, body: { planId: id, ...result } };
  });
});

export default router;
