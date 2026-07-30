/**
 * Governed decision lineage — decision-trail list read for the v2 surface.
 *
 * GET /api/decision-lineage → the org's governed artifacts, each with its immutable,
 * Part-11 hash-chained decision graph, shaped to exactly the keys the v2 DecisionLineage
 * surface renders ({ rootEntityType, rootEntityId, artifactLabel, nodes, edges,
 * metadata }). Assembled ENTIRELY from the real workflow + audit store via
 * decisionLineageService.getLineageGraph — the same real service that backs the
 * per-artifact GET /api/decision-lineage/:entityType/:entityId endpoint and the export /
 * compliance-report / verify-chain endpoints. There is no legacy/seed blob and no
 * fallback: an org with no recorded decision trail returns an empty list and the surface
 * renders its own honest empty state. See decision-lineage-view-assembler.
 *
 * Org scoped; 403 without org context; fails to an empty list on 42P01 so an
 * unprovisioned store never 500s.
 */
import { Router, type Request, type Response } from 'express';
import { assembleOrgDecisionLineage } from '../services/workflow/decision-lineage-view-assembler.js';

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
    const data = await assembleOrgDecisionLineage(orgId);
    return res.json({ data, meta: { count: data.length, source: 'decision_lineage_service' } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: [], meta: { count: 0, pendingStore: true } });
    }
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read decision lineage.' } });
  }
});

export default router;
