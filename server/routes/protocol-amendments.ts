/**
 * Protocol Amendments API — Capability C2C-18a
 *
 * Governed amendment authoring against an authored protocol document: create an
 * amendment, append change line items, walk the validated status lifecycle, read
 * the amendment + its changes, and read submission readiness. Every mutation runs
 * BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped. Mounted at
 * /api/protocol-amendments.
 *
 * @module server/routes/protocol-amendments
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createAmendmentTx,
  addChangeTx,
  setAmendmentStatusTx,
  listAmendments,
  getAmendment,
  getAmendmentReadiness,
} from '../services/protocol-amendments/protocol-amendments-service';
import {
  recordAmendmentCreated, recordAmendmentChangeAdded, recordAmendmentStatus,
} from '../services/protocol-amendments-metrics';
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

// ─── Amendments ──────────────────────────────────────────────────────────────

const amendmentSchema = z.object({
  protocolDocumentId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  amendmentNumber: z.string().max(120).optional(),
  rationale: z.string().max(8000).optional(),
  amendmentType: z.enum(['major', 'minor', 'administrative']).optional(),
  affectsConsent: z.boolean().optional(),
  affectsRisk: z.boolean().optional(),
  reason,
});
router.post('/amendments', async (req, res) => {
  const parsed = amendmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createAmendmentTx(client, orgId, userId, parsed.data);
    recordAmendmentCreated(parsed.data.amendmentType ?? 'unspecified');
    return { target: `protocol-amendment:${id}`, payload: { protocolDocumentId: parsed.data.protocolDocumentId, type: parsed.data.amendmentType }, body: { id } };
  });
});

router.get('/amendments', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const docIdRaw = req.query.protocolDocumentId;
  const docId = typeof docIdRaw === 'string' && docIdRaw !== '' ? Number(docIdRaw) : undefined;
  if (docId !== undefined && !Number.isInteger(docId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid protocolDocumentId.' } });
  try { res.json(await listAmendments(orgId, docId)); } catch (err) { fail(res, err); }
});

router.get('/amendments/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const amd = await getAmendment(orgId, id);
    if (!amd) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Amendment not found.' } });
    res.json(amd);
  } catch (err) { fail(res, err); }
});

router.get('/amendments/:id/readiness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getAmendmentReadiness(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── Change line items ───────────────────────────────────────────────────────

const changeSchema = z.object({
  sectionRef: z.string().max(200).optional(),
  changeDescription: z.string().min(1).max(8000),
  previousText: z.string().max(50000).optional(),
  proposedText: z.string().max(50000).optional(),
  reason,
});
router.post('/amendments/:id/changes', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = changeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: cid } = await addChangeTx(client, orgId, userId, id, parsed.data);
    recordAmendmentChangeAdded();
    return { target: `protocol-amendment:${id}`, payload: { changeId: cid }, body: { amendmentId: id, changeId: cid } };
  });
});

// ─── Status lifecycle ────────────────────────────────────────────────────────

const statusSchema = z.object({ status: z.enum(['draft', 'submitted', 'under_review', 'approved', 'rejected', 'implemented']), reason });
router.patch('/amendments/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    const { status } = await setAmendmentStatusTx(client, orgId, id, parsed.data.status);
    recordAmendmentStatus(status);
    return { target: `protocol-amendment:${id}`, payload: { status }, body: { amendmentId: id, status } };
  });
});

export default router;
