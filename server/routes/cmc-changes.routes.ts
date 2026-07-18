/**
 * Post-approval CMC change control — GET /api/cmc-changes.
 *
 * Projects the org's governed proposed-change store (`c2c_cmc_changes`) through
 * the deterministic SUPAC/variations classifier (`projectCmcChanges` →
 * `classifyVariation`) into the shape the v2 Lifecycle "CMC change control" card
 * renders ({ risk, title, area, programs, status } + fdaCategory / emaCategory /
 * supacTier / citation). The reporting category and risk band are COMPUTED from
 * each change's structured attributes — never a stored/fabricated verdict.
 *
 * Org scoped; 403 without org context; fails CLOSED to an honest empty list
 * (never 500, never fabricated) when the store is absent or errors, so the
 * surface shows its sample fallback. `meta.pendingStore` on a missing table.
 *
 * @module server/routes/cmc-changes.routes
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { projectCmcChanges, type CmcChangeRow } from '../services/cmc/cmc-change-view';

const router = Router();

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const { rows } = await pool.query(
      `SELECT title, area, programs, status, dosage_form_family, change_category,
              scale_change_factor, excipient_level_change, site_change_kind,
              process_change_kind, touches_critical_step, affects,
              has_comparability_data, description
         FROM c2c_cmc_changes
        WHERE organization_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [orgId],
    );
    const data = projectCmcChanges(rows as CmcChangeRow[]);
    return res.json({ data, meta: { count: data.length, provisioned: true } });
  } catch (err) {
    const pendingStore = (err as { code?: string } | null)?.code === '42P01';
    // Fail closed: honest empty list, never a 500, never a fabricated verdict.
    return res.json({ data: [], meta: { count: 0, provisioned: false, pendingStore } });
  }
});

export default router;
