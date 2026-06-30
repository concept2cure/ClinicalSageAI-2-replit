/**
 * Protocol Risk Register API — Capability C2C-19
 *
 * Governed per-protocol risk assessment: add risks (likelihood × impact), update
 * mitigation / residual targets / status, and read the scored register with a
 * summary. Mutations run BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped.
 * Mounted at /api/protocol-risks.
 *
 * @module server/routes/protocol-risks
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { addRiskTx, updateRiskTx, getRiskRegister } from '../services/protocol-risks/protocol-risks-service';
import { recordProtocolRiskAdded, recordProtocolRiskUpdated, recordProtocolRiskRegisterView } from '../services/protocol-risks-metrics';
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
const CODE_STATUS: Record<string, number> = { NOT_FOUND: 404, BAD_INPUT: 400 };
function fail(res: Response, err: unknown): void {
  const code = (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const LIKELIHOOD = z.enum(['rare', 'unlikely', 'possible', 'likely', 'almost_certain']);
const IMPACT = z.enum(['negligible', 'minor', 'moderate', 'major', 'severe']);

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

const riskSchema = z.object({
  category: z.enum(['participant_safety', 'data_integrity', 'regulatory', 'operational', 'privacy', 'other']).optional(),
  description: z.string().min(1).max(2000),
  likelihood: LIKELIHOOD.optional(),
  impact: IMPACT.optional(),
  mitigation: z.string().max(2000).optional(),
  owner: z.string().max(200).optional(),
  reason,
});
router.post('/documents/:id/risks', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = riskSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: riskId, level } = await addRiskTx(client, orgId, userId, { ...parsed.data, protocolDocumentId: id });
    recordProtocolRiskAdded(level);
    return { target: `protocol-document:${id}`, payload: { riskId, level }, body: { documentId: id, riskId, level } };
  });
});

const updateSchema = z.object({
  mitigation: z.string().max(2000).optional(),
  residualLikelihood: LIKELIHOOD.optional(),
  residualImpact: IMPACT.optional(),
  status: z.enum(['open', 'mitigating', 'accepted', 'closed']).optional(),
  owner: z.string().max(200).optional(),
  reason,
});
router.patch('/risks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await updateRiskTx(client, orgId, id, parsed.data);
    recordProtocolRiskUpdated();
    return { target: `protocol-risk:${id}`, payload: { status: parsed.data.status }, body: { id } };
  });
});

router.get('/documents/:id/register', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const register = await getRiskRegister(orgId, id);
    recordProtocolRiskRegisterView();
    res.json(register);
  } catch (err) { fail(res, err); }
});

export default router;
