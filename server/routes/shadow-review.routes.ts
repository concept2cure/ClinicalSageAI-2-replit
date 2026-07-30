/**
 * Shadow-review — pre-file reviewer worklist read for the v2 surface.
 *
 * GET /api/shadow-review → the org's simulated-reviewer findings, grouped by reviewer
 * lens (fda_filing, ema_d120, pmda, nb_mdr, nb_ivdr), assembled ENTIRELY from the real,
 * org-scoped shadow-review store (shadow_review_runs + shadow_review_findings) — the
 * same tables runShadowReview persists. Each row is { lens, findings[] }, every finding
 * carrying the ShadowFinding display keys ({ dimension, severity, title, detail, basis,
 * recommendation, leafRef }). There is no legacy/seed blob and no fallback: an org that
 * has never run a reviewer returns an empty list and the surface renders its own honest
 * empty state. See shadow-review-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgShadowReview } from '../services/shadow-review/shadow-review-view-assembler.js';

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
    const data = await assembleOrgShadowReview(orgId);
    return res.json({ data, meta: { count: data.length, source: 'shadow_review_runs' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read shadow review.' } });
  }
});

export default router;
