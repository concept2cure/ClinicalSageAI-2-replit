/**
 * EU SmPC (Summary of Product Characteristics) — QRD section authoring + readiness.
 *
 * GET  /api/labeling-smpc → the QRD section tree with each section's authoring
 *      status (from c2c_smpc_sections) + a submission-readiness rollup computed
 *      live by buildSmpcReadiness over the catalog. When the store is empty the
 *      honest all-missing skeleton is returned.
 * POST /api/labeling-smpc → set a section's authoring status (missing|draft|
 *      review|final), validated against the QRD catalog; returns the refreshed
 *      readiness.
 *
 * Org scoped; 403 without org; 400 for an unknown section/status; fails closed
 * to the empty skeleton on 42P01 (meta.pendingStore); 503 on write to a missing
 * store. The EU companion to the USPI /api/labeling-pi read.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import {
  buildSmpcReadiness,
  isKnownSmpcSection,
  isValidSmpcStatus,
  type SmpcSectionStatus,
} from '../services/labeling/smpc-qrd-catalog';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw = r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function loadStatuses(orgId: number): Promise<Record<string, SmpcSectionStatus>> {
  const { rows } = await pool.query(
    `SELECT section_number, status FROM c2c_smpc_sections WHERE organization_id = $1`,
    [orgId],
  );
  const map: Record<string, SmpcSectionStatus> = {};
  for (const r of rows) {
    if (isValidSmpcStatus(String(r.status))) map[String(r.section_number)] = r.status;
  }
  return map;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const statuses = await loadStatuses(orgId);
    const readiness = buildSmpcReadiness(statuses);
    return res.json({ data: readiness, meta: { count: readiness.sections.length } });
  } catch (err) {
    // An unprovisioned store answers with the all-sections-outstanding skeleton
    // (pendingStore) — that is a true statement about a deployment with no SmPC
    // rows yet. A genuine query failure is NOT that: reporting every section as
    // "not started" when the status query broke understates labelling readiness
    // and would let a reviewer sign off against a picture the database never
    // produced. Fail loudly instead.
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: buildSmpcReadiness({}), meta: { count: 0, pendingStore: true } });
    }
    console.error(
      '[labeling-smpc] readiness read failed:',
      err instanceof Error ? err.message : String(err),
    );
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read SmPC readiness.' } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sectionNumber = typeof body.sectionNumber === 'string' ? body.sectionNumber.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : '';
  if (!isKnownSmpcSection(sectionNumber) || !isValidSmpcStatus(status)) {
    return res.status(400).json({
      error: { code: 'INVALID_BODY', message: 'sectionNumber must be a QRD section and status one of missing|draft|review|final.' },
    });
  }
  try {
    await pool.query(
      `INSERT INTO c2c_smpc_sections (organization_id, section_number, status, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (organization_id, section_number)
       DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [orgId, sectionNumber, status],
    );
    const readiness = buildSmpcReadiness(await loadStatuses(orgId));
    return res.status(200).json({ data: readiness, meta: { updated: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({ error: { code: 'PENDING_STORE', message: 'SmPC store is not provisioned yet.' } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to update SmPC section.' } });
  }
});

export default router;
