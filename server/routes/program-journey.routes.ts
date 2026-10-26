/**
 * Program-journey spine — retained organization-bound legacy read.
 *
 * GET /api/program-journey → the org's program-journey instances (segment scoped:
 * pharma BX-204 · NDA, biotech BX-301 · BLA), held in the REAL, org-scoped store
 * `program_journeys` + `program_journey_stages` (program-journey-service.ts),
 * each shaped to exactly the
 * keys the v2 BiopharmaJourney surface renders ({ seg, code, name, app, modality,
 * indication, pathway, sponsor, agency, readiness, current, target, overlay, modules,
 * clock, haqs, contra, blockers }). The per-stage overlay is assembled from REAL
 * per-stage rows.
 *
 *   GET  /api/program-journey                       → list (honest empty when none)
 *
 * Org scoped; 403 without org context; GET fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { listProgramJourneys } from '../services/program-journey/program-journey-service';

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
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const data = await listProgramJourneys(orgId);
    return res.json({ data, meta: { count: data.length, source: 'program_journeys' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read program journey.' } });
  }
});

export default router;
