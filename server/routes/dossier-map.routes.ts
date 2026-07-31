/**
 * Dossier map — CTD / eCTD module-map read for the v2 DossierMap surface.
 *
 * GET /api/dossier-map?projectId=<id> → ONE project's per-module (M1–M5) completeness +
 * readiness map, shaped to exactly the keys the v2 DossierMap grid renders ({ m, label,
 * pct, tone, sections }), assembled ENTIRELY from the real CTD section-tracking store
 * (project_sections + its parent projects) — the same table a tenant populates by
 * creating a regulatory project and working its sections through the authoring workflow.
 *
 * This is a project-readiness view, so `projectId` is REQUIRED and the read is scoped to
 * that single project (within the acting org); it never falls back to an org-wide roll-up
 * that would mix one program's readiness with another's. There is no seed-only blob: a
 * project with no tracked CTD sections returns an empty list and the surface renders its
 * own honest empty state. See server/services/dossier/dossier-map-view-assembler.ts.
 * Distinct from the artifact roll-up /api/dossier-readiness endpoint.
 *
 * Org scoped; 403 without org context; 400 without a valid projectId; fails to an empty
 * list on 42P01 so an unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleProjectDossierMap } from '../services/dossier/dossier-map-view-assembler.js';

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
  // Project-readiness read: an explicit project id is required. Never fall back to an
  // org-wide roll-up (that would contaminate one program's readiness with another's).
  const rawProject = req.query.projectId;
  const projectId =
    typeof rawProject === 'string' ? parseInt(rawProject, 10) : Number(rawProject);
  if (rawProject === undefined || !Number.isInteger(projectId) || projectId <= 0) {
    return res
      .status(400)
      .json({ error: { code: 'PROJECT_REQUIRED', message: 'A projectId query parameter is required.' } });
  }
  try {
    const data = await assembleProjectDossierMap(orgId, projectId);
    return res.json({ data, meta: { count: data.length, source: 'project_sections', projectId } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read dossier map.' } });
  }
});

export default router;
