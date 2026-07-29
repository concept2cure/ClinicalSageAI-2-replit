/**
 * Enablement / training API — declared by the `training` surface's registry
 * entry (`/api/enablement`).
 *
 *   GET /                 catalog root (kept as an empty envelope for callers
 *                         that probed the contract before the store landed)
 *   GET /paths            learning paths      → training surface
 *   GET /certifications   certifications      → training surface
 *
 * The list routes return org-scoped rows shaped to the surface's display
 * contract and fail closed to an empty canonical envelope (client keeps its
 * fixture) when the store isn't provisioned (`42P01`).
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('enablement');

function getOrgId(req: Request): number | null {
  const raw = (req as { user?: { organizationId?: unknown } }).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

/** Run an org-scoped SELECT, failing closed to an empty list if the table
 *  isn't provisioned yet. */
async function readList(res: Response, orgId: number, sql: string, op: string) {
  try {
    const { rows } = await pool.query(sql, [orgId]);
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return ok(res, [], { count: 0, pendingStore: true });
    }
    return serverError(res, log, op, err);
  }
}

/** GET /api/enablement — catalog root (empty envelope; content lives under the
 *  /paths and /certifications sub-routes). */
router.get('/', (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  return ok(res, [], { count: 0, pendingStore: true });
});

router.get('/paths', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  return readList(
    res,
    orgId,
    `SELECT id, title, lessons, done, mins, level, tone
       FROM enablement_learning_paths WHERE organization_id = $1 ORDER BY id`,
    'list-paths',
  );
});

router.get('/certifications', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  return readList(
    res,
    orgId,
    `SELECT id, name, status, when_label AS "when"
       FROM enablement_certifications WHERE organization_id = $1 ORDER BY id`,
    'list-certifications',
  );
});

export default router;
