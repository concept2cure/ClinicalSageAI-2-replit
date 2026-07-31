/**
 * Research administration — CITI training-matrix read for the v2 surface.
 *
 * GET /api/research-admin → the org's study-personnel training matrix, each row
 * shaped to exactly the keys the v2 ResearchAdmin surface's Training section
 * renders ({ id, name, role, cells[] }), assembled ENTIRELY from the real,
 * org-scoped research-compliance roster (research_personnel + personnel_training)
 * — the same tables the roster service, the CITI bulk-import and AnA's training
 * tools write. The per-module CITI status vector (cells) is DERIVED live from
 * each person's real completion/expiry dates, never rehydrated from a blob. There
 * is no legacy/seed blob and no fallback: an org with no roster returns an empty
 * list and the surface renders its own honest empty state. See
 * research-admin-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgResearchAdmin } from '../services/research-admin/research-admin-view-assembler.js';

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
    const data = await assembleOrgResearchAdmin(orgId);
    return res.json({ data, meta: { count: data.length, source: 'personnel_training' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read research administration training matrix.' } });
  }
});

export default router;
