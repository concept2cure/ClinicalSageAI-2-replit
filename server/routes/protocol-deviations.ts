/**
 * Protocol Deviations & CAPA API — Capability C2C-18b
 *
 * Governed deviation management: record a deviation (deterministic reportability),
 * attach CAPA actions, advance CAPA status, and close a deviation behind the
 * deterministic CAPA-closure gate. Every mutation runs BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Read endpoints are unguarded by a
 * transaction. Mounted at /api/protocol-deviations.
 *
 * @module server/routes/protocol-deviations
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createDeviationTx,
  addCapaActionTx,
  setCapaStatusTx,
  closeDeviationTx,
  listDeviations,
  getDeviation,
} from '../services/protocol-deviations/protocol-deviations-service';
import {
  recordDeviationReported, recordCapaActionAdded, recordDeviationClosed,
} from '../services/protocol-deviations-metrics';
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

// ─── Deviations ──────────────────────────────────────────────────────────────

const deviationSchema = z.object({
  protocolDocumentId: z.number().int().positive(),
  description: z.string().min(1).max(8000),
  category: z.enum(['enrollment', 'consent', 'procedure', 'safety', 'data', 'other']).optional(),
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  affectsSafety: z.boolean().optional(),
  rootCause: z.string().max(4000).optional(),
  deviationNumber: z.string().max(120).optional(),
  discoveredDate: z.string().max(40).optional(),
  reason,
});
router.post('/deviations', async (req, res) => {
  const parsed = deviationSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const result = await createDeviationTx(client, orgId, userId, parsed.data);
    recordDeviationReported(parsed.data.severity ?? 'minor');
    return { target: `protocol-deviation:${result.id}`, payload: { reportable: result.reportable, severity: parsed.data.severity ?? 'minor' }, body: { id: result.id, reportable: result.reportable, timelinessDays: result.timelinessDays, basis: result.basis } };
  });
});

router.get('/deviations', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const docIdRaw = typeof req.query.protocolDocumentId === 'string' ? Number(req.query.protocolDocumentId) : undefined;
  try { res.json(await listDeviations(orgId, Number.isInteger(docIdRaw) ? docIdRaw : undefined)); } catch (err) { fail(res, err); }
});

router.get('/deviations/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const dev = await getDeviation(orgId, id);
    if (!dev) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deviation not found.' } });
    res.json(dev);
  } catch (err) { fail(res, err); }
});

// ─── CAPA actions ────────────────────────────────────────────────────────────

const capaSchema = z.object({ action: z.string().min(1).max(4000), owner: z.string().max(300).optional(), dueDate: z.string().max(40).optional(), reason });
router.post('/deviations/:id/capa', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = capaSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid } = await addCapaActionTx(client, orgId, userId, id, parsed.data);
    recordCapaActionAdded();
    return { target: `protocol-deviation:${id}`, payload: { capaId: cid }, body: { deviationId: id, capaId: cid } };
  });
});

const capaStatusSchema = z.object({ status: z.enum(['open', 'in_progress', 'completed', 'verified']), reason });
router.patch('/capa/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = capaStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await setCapaStatusTx(client, orgId, id, parsed.data.status);
    return { target: `protocol-capa:${id}`, payload: { status: parsed.data.status }, body: { id } };
  });
});

// ─── Closure ─────────────────────────────────────────────────────────────────

router.post('/deviations/:id/close', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId) => {
    const result = await closeDeviationTx(client, orgId, id);
    recordDeviationClosed();
    return { target: `protocol-deviation:${id}`, body: { deviationId: id, ...result } };
  });
});

export default router;
