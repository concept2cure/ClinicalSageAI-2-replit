/**
 * Document-journey read — one document's lifecycle, ideation → submission.
 *
 * GET /api/doc-journey → the org's current authoring document as an ordered list of
 * stage rows, shaped to exactly the keys the v2 DocJourney surface renders (the DjStage
 * rail fields { id, label, ic, when, who, ver, done, active, sub, kind } plus the
 * per-stage content snapshot `snap`). Assembled ENTIRELY from the real, org-scoped
 * authoring document loop (authoring_documents + authoring_sections + doc_revisions +
 * authoring_comments + frozen_documents) — the same tables server/routes/authoring.router.ts
 * writes. There is no seed blob (c2c_doc_journeys is deprecated) and no fallback: an org
 * that has authored nothing returns an empty list and the surface renders its own honest
 * empty state. See doc-journey-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgDocJourney } from '../services/authoring/doc-journey-view-assembler.js';

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
    const data = await assembleOrgDocJourney(orgId);
    return res.json({ data, meta: { count: data.length, source: 'authoring_documents' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read document journey.' } });
  }
});

export default router;
