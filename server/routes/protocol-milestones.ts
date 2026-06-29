/**
 * Protocol Milestones API — Capability C2C-20b
 *
 * Governed milestone timeline: add milestones to a protocol document, transition
 * status, and read the deterministic timeline summary. Mutations run BEGIN → Tx →
 * recordGovernedAction → COMMIT, org-scoped. Mounted at /api/protocol-milestones.
 *
 * @module server/routes/protocol-milestones
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { addMilestoneTx, setMilestoneStatusTx, listMilestones, getTimeline } from '../services/protocol-milestones/protocol-milestones-service';
import { recordProtocolMilestoneAdded, recordProtocolMilestoneStatus, recordProtocolTimelineView } from '../services/protocol-milestones-metrics';
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
  if (code && CODE_STATUS[code]) { res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');
const MTYPE = z.enum(['protocol_approval', 'irb_submission', 'site_activation', 'first_subject', 'last_subject', 'enrollment_complete', 'database_lock', 'csr', 'closeout', 'other']);

async function governed(req: Request, res: Response, command: string, reasonText: string, run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>): Promise<void> {
  const userId = resolveUserId(req); const orgId = resolveOrgId(req);
  if (!userId || !orgId) { res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); return; }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { target, payload, body } = await run(client, orgId, userId);
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'protocol_development' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) { await client.query('ROLLBACK').catch(() => undefined); fail(res, err); } finally { client.release(); }
}

const milestoneSchema = z.object({ name: z.string().min(1).max(300), milestoneType: MTYPE.optional(), targetDate: z.string().optional(), notes: z.string().max(2000).optional(), reason });
router.post('/documents/:id/milestones', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = milestoneSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: mid } = await addMilestoneTx(client, orgId, userId, id, parsed.data);
    recordProtocolMilestoneAdded(parsed.data.milestoneType ?? 'other');
    return { target: `protocol-document:${id}`, payload: { milestoneId: mid }, body: { documentId: id, milestoneId: mid } };
  });
});

const statusSchema = z.object({ status: z.enum(['planned', 'in_progress', 'met', 'missed', 'cancelled']), actualDate: z.string().optional(), reason });
router.patch('/milestones/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setMilestoneStatusTx(client, orgId, id, parsed.data.status, parsed.data.actualDate);
    recordProtocolMilestoneStatus(parsed.data.status);
    return { target: `protocol-milestone:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

router.get('/documents/:id/milestones', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await listMilestones(orgId, id)); } catch (err) { fail(res, err); }
});

router.get('/documents/:id/timeline', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { const t = await getTimeline(orgId, id); recordProtocolTimelineView(); res.json(t); } catch (err) { fail(res, err); }
});

export default router;
