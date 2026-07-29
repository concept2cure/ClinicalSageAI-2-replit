/**
 * NIH Other Support API — Capability C2C-24A
 *
 * Governed Other Support authoring: create a per-person document, add/edit
 * funding-source entries, read the committed person-month summary, read disclosure
 * readiness, and certify behind the deterministic readiness gate (effort
 * overcommitment + missing major-goals/overlap/foreign-country blockers). Every
 * mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped. Mounted at
 * /api/other-support.
 *
 * @module server/routes/other-support
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createDocumentTx,
  addEntryTx,
  updateEntryTx,
  certifyDocumentTx,
  getSummary,
  getReadiness,
  listDocuments,
  getDocument,
} from '../services/other-support/other-support-service';
import {
  recordOtherSupportCreated, recordOtherSupportEntryUpserted, recordOtherSupportCertified,
} from '../services/other-support-metrics';
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

// ─── Documents ─────────────────────────────────────────────────────────────────

const docSchema = z.object({
  personName: z.string().min(1).max(300),
  personnelId: z.number().int().positive().optional(),
  grantProposalId: z.number().int().positive().optional(),
  eraCommonsId: z.string().max(120).optional(),
  role: z.string().max(120).optional(),
  reason,
});
router.post('/documents', async (req, res) => {
  const parsed = docSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createDocumentTx(client, orgId, userId, parsed.data);
    recordOtherSupportCreated();
    return { target: `other-support:${id}`, body: { id } };
  });
});

router.get('/documents', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const pidRaw = req.query.personnelId;
  const gpRaw = req.query.grantProposalId;
  const personnelId = typeof pidRaw === 'string' && /^\d+$/.test(pidRaw) ? Number(pidRaw) : undefined;
  const grantProposalId = typeof gpRaw === 'string' && /^\d+$/.test(gpRaw) ? Number(gpRaw) : undefined;
  try { res.json(await listDocuments(orgId, { personnelId, grantProposalId })); } catch (err) { fail(res, err); }
});

router.get('/documents/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const doc = await getDocument(orgId, id);
    if (!doc) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Other Support document not found.' } });
    res.json(doc);
  } catch (err) { fail(res, err); }
});

router.get('/documents/:id/summary', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json({ summary: await getSummary(orgId, id), readiness: await getReadiness(orgId, id) }); } catch (err) { fail(res, err); }
});

// ─── Entries ───────────────────────────────────────────────────────────────

const entrySchema = z.object({
  supportType: z.enum(['grant', 'contract', 'in_kind', 'other']).optional(),
  projectTitle: z.string().min(1).max(500),
  fundingSource: z.string().min(1).max(500),
  status: z.enum(['active', 'pending']).optional(),
  isForeign: z.boolean().optional(),
  foreignCountry: z.string().max(120).optional(),
  personMonthsCalendar: z.number().min(0).max(99).optional(),
  personMonthsAcademic: z.number().min(0).max(99).optional(),
  personMonthsSummer: z.number().min(0).max(99).optional(),
  majorGoals: z.string().max(20000).optional(),
  overlapStatement: z.string().max(20000).optional(),
  awardIdentifier: z.string().max(200).optional(),
  reason,
});
router.post('/documents/:id/entries', async (req, res) => {
  const documentId = Number(req.params.id);
  if (!Number.isInteger(documentId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = entrySchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await addEntryTx(client, orgId, userId, documentId, parsed.data);
    recordOtherSupportEntryUpserted();
    return { target: `other-support-entry:${id}`, payload: { documentId }, body: { id } };
  });
});

const entryPatchSchema = entrySchema.partial({ projectTitle: true, fundingSource: true }).extend({ reason });
router.patch('/entries/:id', async (req, res) => {
  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = entryPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await updateEntryTx(client, orgId, entryId, parsed.data);
    recordOtherSupportEntryUpserted();
    return { target: `other-support-entry:${entryId}`, body: { id: entryId } };
  });
});

// ─── Certify ───────────────────────────────────────────────────────────────

router.post('/documents/:id/certify', async (req, res) => {
  const documentId = Number(req.params.id);
  if (!Number.isInteger(documentId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await certifyDocumentTx(client, orgId, userId, documentId);
    recordOtherSupportCertified();
    return { target: `other-support:${documentId}`, payload: { activePersonMonths: result.readiness.summary.active.total }, body: { documentId, ...result } };
  });
});

export default router;
