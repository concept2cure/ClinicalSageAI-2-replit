/**
 * eTMF API — Trial Master File (Capability C2C-08)
 *
 * Governed CRUD for TMF files and their classified artifacts. Every mutation runs
 * BEGIN → Tx → recordGovernedAction → COMMIT, org-scoped. Adding an artifact
 * without a zone auto-classifies it (DIA RM). Read endpoints surface the
 * completeness gap-check (feeds inspection readiness). Mounted at /api/etmf.
 *
 * @module server/routes/etmf
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { setTenantContextTx } from '../services/tenant/governed-tenant-context';
import {
  createTmfTx,
  addArtifactTx,
  setArtifactStatusTx,
  listTmfFiles,
  listArtifacts,
  getCompletenessInput,
} from '../services/etmf/etmf-service';
import { evaluateCompleteness, classifyArtifact } from '../services/etmf/etmf-logic';
import { recordTmfFileCreated, recordTmfArtifact } from '../services/etmf-metrics';

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
    const gov = await recordGovernedAction(client, { orgId, userId, command, target, reason: reasonText, payload, domain: 'etmf' });
    await client.query('COMMIT');
    res.status(201).json({ ...body, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
}

const tmfSchema = z.object({ title: z.string().min(1).max(500), studyId: z.number().int().positive().optional(), reason });
router.post('/files', async (req, res) => {
  const parsed = tmfSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await createTmfTx(client, orgId, userId, parsed.data);
    recordTmfFileCreated();
    return { target: `tmf-file:${id}`, body: { id } };
  });
});

router.get('/files', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try { res.json(await listTmfFiles(orgId)); } catch (err) { fail(res, err); }
});

const artifactSchema = z.object({
  artifactName: z.string().min(1).max(500),
  zone: z.number().int().min(1).max(11).optional(),
  section: z.string().max(200).optional(),
  expected: z.boolean().optional(),
  completenessRequired: z.boolean().optional(),
  status: z.enum(['expected', 'received', 'in_review', 'final', 'missing', 'not_applicable']).optional(),
  documentDate: z.string().optional(),
  reason,
});
router.post('/files/:id/artifacts', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = artifactSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id: aid, zone, classification } = await addArtifactTx(client, orgId, userId, id, parsed.data);
    recordTmfArtifact(zone, classification !== 'explicit');
    return { target: `tmf-file:${id}`, payload: { artifactId: aid, zone, classification }, body: { tmfFileId: id, artifactId: aid, zone, classification } };
  });
});

router.get('/files/:id/artifacts', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { res.json(await listArtifacts(orgId, id)); } catch (err) { fail(res, err); }
});

const statusSchema = z.object({ status: z.enum(['expected', 'received', 'in_review', 'final', 'missing', 'not_applicable']), documentDate: z.string().optional(), reason });
router.patch('/artifacts/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = statusSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'transition', parsed.data.reason, async (client, orgId) => {
    await setArtifactStatusTx(client, orgId, id, parsed.data.status, parsed.data.documentDate);
    return { target: `tmf-artifact:${id}`, payload: { status: parsed.data.status }, body: { id, status: parsed.data.status } };
  });
});

router.get('/files/:id/completeness', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try {
    const artifacts = await getCompletenessInput(orgId, id);
    res.json(evaluateCompleteness(artifacts));
  } catch (err) { fail(res, err); }
});

router.get('/classify', async (req, res) => {
  const name = typeof req.query.artifactName === 'string' ? req.query.artifactName : '';
  if (!name) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'artifactName is required.' } });
  res.json(classifyArtifact(name));
});

export default router;
