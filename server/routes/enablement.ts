/**
 * Enablement / training API — contract endpoint declared by the `training`
 * surface's registry entry (`/api/enablement`).
 *
 * Establishes the org-scoped route so the training surface has a real backend
 * to read once its content store exists. Returns an empty canonical envelope
 * for now (GAP RULE — no fabricated data); swap the empty list for the query
 * when a backing store lands.
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

/** GET /api/enablement — org-scoped training/enablement catalog. */
router.get('/', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  return ok(res, [], { count: 0, pendingStore: true });
});

export default router;
