/**
 * Regulatory work-package compiler API (MDX-PM-02).
 *
 * A read-only endpoint over the deterministic work-package compiler. It resolves
 * the program's effective industry context (specialization + pathways + markets)
 * via the shared resolver, then compiles the standard device / IVD regulatory
 * work-package plan — strategy, design controls, risk, evidence, software &
 * cybersecurity, labeling, quality, submission assembly, authority review,
 * registration & UDI, and postmarket — tailored to the specialization and
 * annotated with the filing sections each package supports.
 *
 *   GET /api/mdx/work-packages?programId=<UUID>   compiled plan (no persistence)
 *
 * There are no writes here: the plan is derived from governed context on every
 * request, so it always reflects the current profile without a materialized copy.
 */

import { Router, Request, Response } from 'express';

import { createScopedLogger } from '../utils/logger';
import { ok, clientError, orgRequired, serverError } from '../lib/api-response';
import { resolveEffectiveProjectContext } from '../services/industry-context/resolver';
import { compileWorkPackages } from '../../shared/regulatory/work-packages';

const router = Router();
const log = createScopedLogger('mdx-work-packages');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}
function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ─── GET /api/mdx/work-packages ──────────────────────────────────── */

router.get('/work-packages', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.programId === 'string' ? req.query.programId : null;
  if (programId && !UUID_RE.test(programId)) {
    return clientError(res, 422, 'programId must be a UUID');
  }

  try {
    const ctx = await resolveEffectiveProjectContext({
      organizationId: orgId,
      projectId: programId,
      userId: getUserId(req),
    });
    const packages = compileWorkPackages({
      specialization: ctx.specialization,
      pathways: ctx.pathways,
      markets: ctx.markets,
    });
    return ok(res, packages, { count: packages.length });
  } catch (err) {
    return serverError(res, log, 'work-packages', err);
  }
});

export default router;
