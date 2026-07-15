/**
 * Change assessment API — contract endpoint for the `change-assessment`
 * surface's live read (`GET /api/change-assessment`, consumed via useLiveList).
 *
 * This establishes the org-scoped route the client expects. There is no
 * change-assessment store yet, so it returns an empty canonical envelope; the
 * surface fails closed to its codebase fixture and shows the honest
 * "Sample data" pill (GAP RULE — never fabricate data as live). When a backing
 * table lands, swap the empty list for the query — the client contract is
 * already in place.
 */
import { Router, type Request, type Response } from 'express';
import { ok, orgRequired } from '../lib/api-response';

const router = Router();

function getOrgId(req: Request): number | null {
  const raw = (req as { user?: { organizationId?: unknown } }).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/change-assessment — org-scoped change-assessment list. */
router.get('/', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  return ok(res, [], { count: 0, pendingStore: true });
});

export default router;
