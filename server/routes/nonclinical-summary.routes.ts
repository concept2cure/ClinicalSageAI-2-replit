/**
 * Nonclinical Module 2.6 / Module 4 summary — a live projection of the governed
 * nonclinical registry.
 *
 * GET /api/nonclinical-summary → the org's M2.6 subsection readiness, Module 4
 * (4.2.x) placement readiness, and SEND package-readiness rollup, computed from
 * the governed `nonclinical_studies` + `send_datasets` rows via the existing
 * deterministic composers (`assembleNonclinicalSummary` → `buildM26NonclinicalSummaries`
 * + `ctdSectionFor` + `evaluateSendReadiness`). Nothing is fabricated: the view
 * reflects the audited registry and cannot drift stale.
 *
 * Shape: `{ data: { m26, m4, send, completeness, gaps, provisioned }, meta }`.
 *
 * Org scoped; 403 without org context. When the org has no governed studies (or
 * on any store error) it returns the honest ICH M4S skeleton (every data-bearing
 * subsection `missing`, expected categories as gaps) — never 500, never invents
 * study data. A missing store (42P01) is surfaced via `meta.pendingStore`.
 */
import { Router, type Request, type Response } from 'express';
import { listStudiesForSummary } from '../services/nonclinical/nonclinical-service';
import { assembleNonclinicalSummary } from '../services/nonclinical/m26-m4-view';

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
    return res
      .status(403)
      .json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const studies = await listStudiesForSummary(orgId);
    const view = assembleNonclinicalSummary(studies);
    return res.json({ data: view, meta: { count: studies.length, provisioned: view.provisioned } });
  } catch (err) {
    // Fail closed to the honest empty-registry skeleton — never 500, never
    // fabricate nonclinical content. Surface a missing store via meta.pendingStore.
    const view = assembleNonclinicalSummary([]);
    return res.json({
      data: view,
      meta: {
        count: 0,
        provisioned: false,
        pendingStore: (err as { code?: string })?.code === '42P01',
      },
    });
  }
});

export default router;
