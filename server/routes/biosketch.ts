/**
 * NIH Biosketch API — Capability C2C-24B
 *
 * Governed biosketch authoring: create a biosketch (auto-seeded with the required
 * NIH biosketch sections per FORMS-H), edit a section's content + addressed flag,
 * read biosketches / a single biosketch with sections, read completeness, and
 * finalize behind the deterministic completeness gate. Every mutation runs
 * BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped. Mounted at /api/biosketch.
 *
 * @module server/routes/biosketch
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import {
  createBiosketchTx,
  updateSectionTx,
  finalizeBiosketchTx,
  getCompleteness,
  listBiosketches,
  getBiosketch,
} from '../services/biosketch/biosketch-service';
import {
  recordBiosketchCreated, recordBiosketchSectionUpdated, recordBiosketchFinalized,
} from '../services/biosketch-metrics';
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

// ─── Biosketches ───────────────────────────────────────────────────────────────

const bioSchema = z.object({
  personName: z.string().min(1).max(300),
  personnelId: z.number().int().positive().optional(),
  grantProposalId: z.number().int().positive().optional(),
  biosketchType: z.enum(['nih', 'nsf', 'other']).optional(),
  reason,
});
router.post('/biosketches', async (req, res) => {
  const parsed = bioSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id, sectionsSeeded } = await createBiosketchTx(client, orgId, userId, parsed.data);
    recordBiosketchCreated();
    return { target: `biosketch:${id}`, payload: { sectionsSeeded }, body: { id, sectionsSeeded } };
  });
});

router.get('/biosketches', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const pidRaw = req.query.personnelId;
  const gpRaw = req.query.grantProposalId;
  const personnelId = typeof pidRaw === 'string' && /^\d+$/.test(pidRaw) ? Number(pidRaw) : undefined;
  const grantProposalId = typeof gpRaw === 'string' && /^\d+$/.test(gpRaw) ? Number(gpRaw) : undefined;
  try { res.json(await listBiosketches(orgId, { personnelId, grantProposalId })); } catch (err) { fail(res, err); }
});

router.get('/biosketches/:id', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const bio = await getBiosketch(orgId, id);
    if (!bio) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Biosketch not found.' } });
    res.json(bio);
  } catch (err) { fail(res, err); }
});

router.get('/biosketches/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await getCompleteness(orgId, id)); } catch (err) { fail(res, err); }
});

// ─── Sections ────────────────────────────────────────────────────────────────

const sectionSchema = z.object({ content: z.string().max(50000).optional(), addressed: z.boolean().optional(), reason });
router.patch('/sections/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = sectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await updateSectionTx(client, orgId, id, parsed.data);
    recordBiosketchSectionUpdated();
    return { target: `biosketch-section:${id}`, payload: { addressed: parsed.data.addressed }, body: { id } };
  });
});

// ─── Finalize ────────────────────────────────────────────────────────────────

router.post('/biosketches/:id/finalize', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = z.object({ reason }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'sign', parsed.data.reason, async (client, orgId, userId) => {
    const result = await finalizeBiosketchTx(client, orgId, userId, id);
    recordBiosketchFinalized();
    return { target: `biosketch:${id}`, payload: { addressedPct: result.completeness.addressedPct }, body: { biosketchId: id, ...result } };
  });
});

export default router;
