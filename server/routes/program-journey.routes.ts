/**
 * Read existing org-scoped program journeys and their recorded stage overlays.
 * A2.9 retires the separate creation/stage-write routes; Projects owns project
 * creation through /api/c2c/projects. Existing journey rows remain readable.
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
