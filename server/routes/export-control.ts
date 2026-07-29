/**
 * Export Control review API — Capability C2C-26
 *
 * Governed export-control screening: create a review, edit its inputs, read the
 * deterministic ITAR/EAR/OFAC assessment + Fundamental Research Exclusion outcome,
 * read determination readiness, and finalize the determination behind the
 * deterministic readiness gate (persisting the computed license-required result).
 * Every mutation runs BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped.
 * Mounted at /api/export-control.
 *
 * @module server/routes/export-control
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createReviewTx, updateReviewTx, determineReviewTx, getAssessment, getReadiness, listReviews, getReview,
} from '../services/export-control/export-control-service';
import { recordExportReviewCreated, recordExportReviewUpdated, recordExportReviewDetermined } from '../services/export-control-metrics';
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
  if (code && CODE_STATUS[code]) { res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL', message: err instanceof Error ? err.message : 'Request failed.' } });
}
const reason = z.string().trim().min(8, 'Provide a reason of at least 8 characters.');

async function governed(
  req: Request, res: Response, command: string, reasonText: string,
  run: (client: any, orgId: number, userId: number) => Promise<{ target: string; payload?: Record<string, unknown>; body: Record<string, unknown> }>,
): Promise<void> {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) { res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } }); return; }
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
  } finally { client.release(); }
}

const reviewFields = {
  description: z.string().max(20000).optional(),
  jurisdiction: z.enum(['itar', 'ear', 'ofac', 'not_subject', 'pending']).optional(),
  classification: z.string().max(200).optional(),
  involvesForeignNationals: z.boolean().optional(),
  foreignCountries: z.string().max(2000).optional(),
  hasPublicationRestrictions: z.boolean().optional(),
  hasProprietaryRestrictions: z.boolean().optional(),
  involvesPhysicalExport: z.boolean().optional(),
  grantProposalId: z.number().int().positive().optional(),
};
const createSchema = z.object({ projectTitle: z.string().min(1).max(500), ...reviewFields, reason });
router.post('/reviews', async (req, res) => {
  const parsed = createSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createReviewTx(client, orgId, userId, parsed.data);
    recordExportReviewCreated();
    return { target: `export-control:${id}`, body: { id } };
  });
});

const updateSchema = z.object({ projectTitle: z.string().min(1).max(500).optional(), ...reviewFields, reason });
router.patch('/reviews/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = updateSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await updateReviewTx(client, orgId, id, parsed.data);
    recordExportReviewUpdated();
    return { target: `export-control:${id}`, payload: { jurisdiction: parsed.data.jurisdiction }, body: { id } };
  });
});

router.get('/reviews', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const jurisdiction = typeof req.query.jurisdiction === 'string' ? req.query.jurisdiction : undefined;
  const gp = req.query.grantProposalId;
  const grantProposalId = typeof gp === 'string' && /^\d+$/.test(gp) ? Number(gp) : undefined;
  try { res.json(await listReviews(orgId, { status, jurisdiction, grantProposalId })); } catch (err) { fail(res, err); }
});

router.get('/reviews/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const r = await getReview(orgId, id);
    if (!r) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Export-control review not found.' } });
    res.json(r);
  } catch (err) { fail(res, err); }
});

router.get('/reviews/:id/assessment', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json({ assessment: await getAssessment(orgId, id), readiness: await getReadiness(orgId, id) }); } catch (err) { fail(res, err); }
});

router.post('/reviews/:id/determine', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await determineReviewTx(client, orgId, userId, id);
    recordExportReviewDetermined();
    return { target: `export-control:${id}`, payload: { licenseRequired: result.readiness.assessment.licenseRequired }, body: { id, ...result } };
  });
});

export default router;
