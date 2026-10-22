/**
 * IND master-data REST surface — sponsor / US agent (21 CFR 312.3) /
 * investigator registries that feed FDA Forms 1571/1572/3674 and submission
 * metadata.
 *
 * Mounted at /api/ind-master-data with authenticateToken applied at mount time
 * (see server/bootstrap/register-ind-lifecycle-routes.ts). Every handler
 * resolves organizationId/userId from the authenticated session only (never
 * from body/params) and is RBAC-gated. Sponsor business facts use canonical
 * identifier/contact validation and exact revisions. The service layer is the
 * authoritative tenant/audit boundary.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import {
  createSponsor,
  listSponsors,
  getSponsor,
  updateSponsor,
  createRegulatoryAgent,
  listRegulatoryAgents,
  getRegulatoryAgent,
  updateRegulatoryAgent,
  createInvestigator,
  listInvestigators,
  getInvestigator,
  updateInvestigator,
  IndMasterDataError,
} from '../services/ind-master-data/ind-master-data-service';
import { createScopedLogger } from '../utils/logger.js';
import { normalizeSponsorBusiness, sponsorReason } from '../services/ind-master-data/sponsor-input';

const logger = createScopedLogger('ind-master-data-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

interface Ctx {
  userId: number;
  organizationId: number;
}
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) {
    return null;
  }
  return { userId, organizationId };
}

const CODE_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  FORBIDDEN: 403,
  SPONSOR_REVISION_CHANGED: 409,
};

function fail(res: Response, err: unknown): void {
  const code = err instanceof IndMasterDataError ? err.code : (err as { code?: string } | null)?.code;
  if (code && CODE_STATUS[code]) {
    res.status(CODE_STATUS[code]).json({ error: { code, message: err instanceof Error ? err.message : 'Request failed.' } });
    return;
  }
  logger.error('ind-master-data route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Request failed.' } });
}

function noAuth(res: Response) {
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
}

const idParam = (v: unknown): string | null => {
  const raw = Array.isArray(v) ? v[0] : v;
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? raw : null;
};

// The legacy agents/investigators factory strips trusted identity fields.
// Sponsor writes below also validate every business field and govern revisions.
const STRIP = ['id', 'organizationId', 'createdBy', 'createdAt', 'updatedAt'] as const;
function stripIdentity(body: unknown): Record<string, unknown> {
  const obj = (body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : {});
  for (const k of STRIP) delete obj[k];
  return obj;
}

// ── factory: wires the four CRUD verbs for one entity ───────────────────────
function mountEntity(
  base: string,
  ops: {
    create: (input: any, ctx: Ctx) => Promise<unknown>;
    list: (ctx: { organizationId: number }) => Promise<unknown>;
    get: (id: string, ctx: { organizationId: number }) => Promise<unknown>;
    update: (id: string, patch: any, ctx: Ctx) => Promise<unknown>;
  },
) {
  router.get(`/${base}`, limiter, requireRole(AUTHOR), async (req, res) => {
    const ctx = ctxOf(req);
    if (!ctx) return noAuth(res);
    try {
      res.json(await ops.list(ctx));
    } catch (err) {
      fail(res, err);
    }
  });

  router.post(`/${base}`, limiter, requireRole(AUTHOR), async (req, res) => {
    const ctx = ctxOf(req);
    if (!ctx) return noAuth(res);
    try {
      res.status(201).json(await ops.create(stripIdentity(req.body), ctx));
    } catch (err) {
      fail(res, err);
    }
  });

  router.get(`/${base}/:id`, limiter, requireRole(AUTHOR), async (req, res) => {
    const ctx = ctxOf(req);
    if (!ctx) return noAuth(res);
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    try {
      res.json(await ops.get(id, ctx));
    } catch (err) {
      fail(res, err);
    }
  });

  router.patch(`/${base}/:id`, limiter, requireRole(AUTHOR), async (req, res) => {
    const ctx = ctxOf(req);
    if (!ctx) return noAuth(res);
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
    try {
      res.json(await ops.update(id, stripIdentity(req.body), ctx));
    } catch (err) {
      fail(res, err);
    }
  });
}

function sponsorMutation(body: unknown, mode: 'create' | 'patch') {
  const stripped = stripIdentity(body);
  const { reason: suppliedReason, expectedRevision, ...business } = stripped;
  const reason = sponsorReason(suppliedReason);
  if (mode === 'create' && Object.hasOwn(stripped, 'expectedRevision')) {
    throw new IndMasterDataError('VALIDATION', 'A newly created sponsor has no previous revision.');
  }
  if (mode === 'patch' && (typeof expectedRevision !== 'string' || !expectedRevision.trim() || expectedRevision.length > 100)) {
    throw new IndMasterDataError('VALIDATION', 'expectedRevision from the last sponsor read is required. Read the current record before saving.');
  }
  return { facts: normalizeSponsorBusiness(business, mode), governance: { reason, ...(mode === 'patch' ? { expectedRevision: expectedRevision as string } : {}) } };
}

router.get('/sponsors', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  try { res.json(await listSponsors(ctx)); } catch (err) { fail(res, err); }
});
router.get('/sponsors/:id', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
  try { res.json(await getSponsor(id, ctx)); } catch (err) { fail(res, err); }
});
router.post('/sponsors', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  try {
    const { facts, governance } = sponsorMutation(req.body, 'create');
    res.status(201).json(await createSponsor(facts as Parameters<typeof createSponsor>[0], ctx, governance));
  } catch (err) { fail(res, err); }
});
router.patch('/sponsors/:id', limiter, requireRole(AUTHOR), async (req, res) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = idParam(req.params.id);
  if (!id) return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid id.' } });
  try {
    const { facts, governance } = sponsorMutation(req.body, 'patch');
    res.json(await updateSponsor(id, facts, ctx, governance));
  } catch (err) { fail(res, err); }
});
mountEntity('agents', {
  create: createRegulatoryAgent,
  list: listRegulatoryAgents,
  get: getRegulatoryAgent,
  update: updateRegulatoryAgent,
});
mountEntity('investigators', {
  create: createInvestigator,
  list: listInvestigators,
  get: getInvestigator,
  update: updateInvestigator,
});

export default router;
