/**
 * Dossier map — CTD / eCTD module-map read.
 *
 * GET /api/dossier-map → the org's per-module (M1–M5) map rows, shaped to
 * exactly the keys the v2 DossierMap grid renders ({ m, label, pct, tone,
 * sections }), with the JSONB section leaves rehydrated back into a string
 * array. Self-contained to this surface — distinct from the artifact-rollup
 * /api/dossier-readiness endpoint. Org scoped; 403 without org context; fails
 * closed to an empty list on 42P01 so an unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';

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
      `SELECT m, label, pct, tone, sections
         FROM c2c_dossier_map
        WHERE organization_id = $1
        ORDER BY m`,
      [orgId],
    );
    const data = rows.map((r) => ({
      m: r.m,
      label: r.label,
      pct: r.pct,
      tone: r.tone,
      sections: Array.isArray(r.sections) ? r.sections : [],
    }));
    return res.json({ data, meta: { count: data.length } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read dossier map.' } });
  }
});

export default router;
