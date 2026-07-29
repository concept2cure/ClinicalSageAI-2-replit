/**
 * Biopharma specialty read routes — pediatric / orphan / lifecycle.
 *
 *   GET /api/biopharma/pediatric    → pediatric investigation plans
 *   GET /api/biopharma/orphan       → orphan designations
 *   GET /api/biopharma/supplements  → lifecycle supplements/variations
 *
 * Each returns org-scoped rows shaped to the surface's display contract, and
 * fails closed to an empty canonical envelope (client keeps its fixture) when
 * the store isn't provisioned (`42P01`). Consumed by the specialty surfaces via
 * useLiveList.
 *
 * Exposed as three routers each mounted at its own sub-prefix (rather than one
 * router at the bare `/api/biopharma`) so they resolve ahead of the programs
 * router's `GET /:id` without adding a second mount on the shared prefix.
 */
import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { ok, orgRequired, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const log = createScopedLogger('biopharma-specialty');

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

/** Build a single-endpoint router that serves an org-scoped list at `GET /`. */
function listRouter(sql: string, op: string): Router {
  const router = Router();
  router.get('/', async (req: Request, res: Response) => {
    const orgId = getOrgId(req);
    if (orgId === null) return orgRequired(res);
    return readList(res, orgId, sql, op);
  });
  return router;
}

export const pediatricRouter = listRouter(
  `SELECT id, product, kind, age_range AS "ageRange", deferrals, waivers, milestones, due, status
     FROM biopharma_pediatric_plans WHERE organization_id = $1 ORDER BY id`,
  'list-pediatric',
);

export const orphanRouter = listRouter(
  `SELECT id, product, agency, indication, date, prevalence, benefit, status
     FROM biopharma_orphan_designations WHERE organization_id = $1 ORDER BY id`,
  'list-orphan',
);

export const supplementsRouter = listRouter(
  `SELECT id, agency, product, subject, filed, due, status
     FROM biopharma_supplements WHERE organization_id = $1 ORDER BY id`,
  'list-supplements',
);

// ── Batch 2: the three sub-cards that were still static surface fixtures ──────

export const preaMilestonesRouter = listRouter(
  `SELECT product, milestone AS "ms", due
     FROM biopharma_prea_milestones WHERE organization_id = $1 ORDER BY id`,
  'list-prea-milestones',
);

export const orphanRpdRouter = listRouter(
  `SELECT product, kind, value, notes, status
     FROM biopharma_orphan_rpd WHERE organization_id = $1 ORDER BY id`,
  'list-orphan-rpd',
);

export const orphanAdvocacyRouter = listRouter(
  `SELECT product, org_name AS "org", engagement
     FROM biopharma_orphan_advocacy WHERE organization_id = $1 ORDER BY id`,
  'list-orphan-advocacy',
);
