/**
 * CRO sponsor-portfolio — multi-sponsor client roster read for the v2 surface.
 *
 * GET /api/cro-portfolio → the org's sponsor clients (one row per engagement),
 * each shaped to exactly the keys the v2 CroPortfolio surface renders
 * ({ id, name, type, lead, sow, sowNote, studies[], subs[] }), assembled ENTIRELY
 * from the real, org-scoped CRO engagement store (cro_clients + cro_studies +
 * cro_regulatory_submissions + cro_milestones + cro_team_assignments) — the same
 * tables the /api/cro CRUD routes write. There is no legacy/seed blob and no
 * fallback: an org with no clients returns an empty list and the surface renders
 * its own honest empty state. See cro-portfolio-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgCroPortfolio } from '../services/cro/cro-portfolio-view-assembler.js';

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
    const data = await assembleOrgCroPortfolio(orgId);
    return res.json({ data, meta: { count: data.length, source: 'cro_clients' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read CRO portfolio.' } });
  }
});

export default router;
