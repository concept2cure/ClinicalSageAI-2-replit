/**
 * Protocol Schedule-of-Assessments API — Capability C2C-21
 *
 * Governed SoA grid: add assessments (rows), set/clear assessment×visit cells, and
 * read the built + validated matrix. Mutations run BEGIN → Tx → recordGovernedAction
 * → COMMIT, org-scoped. Mounted at /api/protocol-soa.
 *
 * @module server/routes/protocol-soa
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { addAssessmentTx, setCellTx, clearCellTx, getSoaMatrix } from '../services/protocol-soa/protocol-soa-service';
import { recordSoaAssessmentAdded, recordSoaCellSet, recordSoaMatrixView } from '../services/protocol-soa-metrics';
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
const CATEGORY = z.enum(['lab', 'imaging', 'exam', 'vital_signs', 'pk', 'questionnaire', 'procedure', 'eligibility', 'other']);

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

const assessmentSchema = z.object({ name: z.string().min(1).max(300), category: CATEGORY.optional(), orderIndex: z.number().int().optional(), reason });
router.post('/documents/:id/assessments', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = assessmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'create', parsed.data.reason, async (client, orgId, userId) => {
    const { id: aid } = await addAssessmentTx(client, orgId, userId, id, parsed.data);
    recordSoaAssessmentAdded();
    return { target: `protocol-document:${id}`, payload: { assessmentId: aid }, body: { documentId: id, assessmentId: aid } };
  });
});

const cellSchema = z.object({ assessmentId: z.number().int().positive(), visitId: z.number().int().positive(), required: z.boolean().optional(), notes: z.string().max(1000).optional(), reason });
router.post('/cells', async (req, res) => {
  const parsed = cellSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId, userId) => {
    const { id } = await setCellTx(client, orgId, userId, parsed.data);
    recordSoaCellSet();
    return { target: `protocol-soa-assessment:${parsed.data.assessmentId}`, payload: { visitId: parsed.data.visitId }, body: { id } };
  });
});

const clearSchema = z.object({ assessmentId: z.number().int().positive(), visitId: z.number().int().positive(), reason });
router.post('/cells/clear', async (req, res) => {
  const parsed = clearSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  await governed(req, res, 'update', parsed.data.reason, async (client, orgId) => {
    await clearCellTx(client, orgId, parsed.data.assessmentId, parsed.data.visitId);
    return { target: `protocol-soa-assessment:${parsed.data.assessmentId}`, payload: { visitId: parsed.data.visitId, cleared: true }, body: { cleared: true } };
  });
});

router.get('/documents/:id/matrix', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  try { const out = await getSoaMatrix(orgId, id); recordSoaMatrixView(); res.json(out); } catch (err) { fail(res, err); }
});

export default router;
