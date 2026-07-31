/**
 * Dossier map — CTD / eCTD module-map read for the v2 DossierMap surface.
 *
 * GET /api/dossier-map → the org's per-module (M1–M5) completeness + readiness map,
 * shaped to exactly the keys the v2 DossierMap grid renders ({ m, label, pct, tone,
 * sections }), assembled ENTIRELY from the real, org-scoped CTD section-tracking store
 * (project_sections + its parent projects) — the same table a tenant populates by
 * creating a regulatory project and working its sections through the authoring workflow.
 * There is no seed-only blob and no fallback: an org with no tracked CTD sections returns
 * an empty list and the surface renders its own honest empty state. See
 * server/services/dossier/dossier-map-view-assembler.ts. Distinct from the artifact
 * roll-up /api/dossier-readiness endpoint.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgDossierMap } from '../services/dossier/dossier-map-view-assembler.js';

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
    const data = await assembleOrgDossierMap(orgId);
    return res.json({ data, meta: { count: data.length, source: 'project_sections' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read dossier map.' } });
  }
});

export default router;
