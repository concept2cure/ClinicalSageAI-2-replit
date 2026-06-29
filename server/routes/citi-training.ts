/**
 * CITI Training API — Capability C2C-01/02 (training full integration)
 *
 * Governed bulk import of CITI completion records, the org training matrix, and
 * the expiring-soon report. Import runs BEGIN → Tx → recordGovernedAction →
 * COMMIT, org-scoped; matrix/expiring are read-only. Mounted at /api/citi-training.
 *
 * @module server/routes/citi-training
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../db';
import { recordGovernedAction } from './c2c/actions';
import { importCitiRecordsTx, getTrainingMatrix, getExpiringTraining } from '../services/citi/citi-service';
import { recordCitiImported, recordCitiMatrixView, recordCitiExpiringReport } from '../services/citi-metrics';
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
const TRAINING_TYPE = z.enum(['citi_human_subjects', 'citi_gcp', 'citi_animal', 'citi_rcr', 'biosafety', 'bloodborne_pathogens', 'iata_shipping', 'hipaa', 'fcoi_disclosure', 'other']);

const importSchema = z.object({
  records: z.array(z.object({
    trainingType: TRAINING_TYPE,
    completedDate: z.string().optional(),
    expiresDate: z.string().optional(),
    certificateRef: z.string().max(200).optional(),
  })).min(1),
  reason,
});
router.post('/personnel/:id/import', async (req, res) => {
  const userId = resolveUserId(req);
  const orgId = resolveOrgId(req);
  if (!userId || !orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const personnelId = Number(req.params.id);
  if (!Number.isInteger(personnelId)) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid id.' } });
  const parsed = importSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION', details: parsed.error.flatten() } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContextTx(client, orgId);
    const { ids, byType } = await importCitiRecordsTx(client, orgId, userId, personnelId, parsed.data.records);
    const gov = await recordGovernedAction(client, { orgId, userId, command: 'create', target: `research-personnel:${personnelId}`, reason: parsed.data.reason, payload: { imported: ids.length }, domain: 'research_compliance' });
    await client.query('COMMIT');
    recordCitiImported(byType);
    res.status(201).json({ personnelId, imported: ids.length, trainingIds: ids, ...gov });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(res, err);
  } finally {
    client.release();
  }
});

router.get('/matrix', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  try {
    const matrix = await getTrainingMatrix(orgId);
    recordCitiMatrixView();
    res.json(matrix);
  } catch (err) { fail(res, err); }
});

router.get('/expiring', async (req, res) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
  const withinDays = req.query.withinDays ? Number(req.query.withinDays) : undefined;
  try {
    const out = await getExpiringTraining(orgId, Number.isFinite(withinDays) ? withinDays : undefined);
    recordCitiExpiringReport();
    res.json({ withinDays: Number.isFinite(withinDays) ? withinDays : 60, count: out.length, expiring: out });
  } catch (err) { fail(res, err); }
});

export default router;
