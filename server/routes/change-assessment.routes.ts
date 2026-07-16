/**
 * Change assessment API (`GET /api/change-assessment`, consumed via useLiveList).
 *
 * Org-scoped read of the `change_assessments` store — each row is a 510(k)-change
 * / MDR significant-change determination shaped 1:1 to the surface's display
 * contract (id/title/device/area/raised/owner/fda/eu/doc). If the store is empty
 * or unavailable the route returns an empty canonical envelope and the client
 * fails closed to its fixture (GAP RULE — never fabricate data as live).
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('change-assessment');

function getOrgId(req: Request): number | null {
  const raw = (req as { user?: { organizationId?: unknown } }).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/change-assessment — org-scoped change determinations. */
router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query(
      `SELECT id, title, device, area, raised, owner, fda, eu, doc
         FROM change_assessments
        WHERE organization_id = $1 AND deleted_at IS NULL
        ORDER BY raised DESC NULLS LAST, id`,
      [orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    // Store not provisioned yet in this tenant → honest empty (client keeps fixture).
    if ((err as { code?: string })?.code === '42P01') {
      return ok(res, [], { count: 0, pendingStore: true });
    }
    return serverError(res, log, 'list-change-assessments', err);
  }
});

export default router;
