/**
 * Q-Submission routes — mounted at /api/q-sub.
 *
 *   GET    /api/q-sub                            list (filters: type, stage, program_id, limit)
 *   POST   /api/q-sub                            create new Q-Sub (plan stage)
 *   GET    /api/q-sub/:id                        full detail (questions + commitments + timeline)
 *   PATCH  /api/q-sub/commitments/:id/rolled-in  toggle commitment.rolled_in
 *
 * All endpoints require an authenticated user with an organization context.
 * Per-row access control is enforced inside the service via JOINs against
 * regulatory_programs.organization_id.
 *
 * Response envelope: canonical `{ data, meta? }` via the api-response
 * helpers — same shape as regulatory-programs and saved-precedent-queries.
 * Errors are `{ error, details? }` with the appropriate HTTP status.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger';
import {
  ok,
  created,
  clientError,
  serverError,
  orgRequired,
  notFoundInTenant,
} from '../lib/api-response';
import {
  createQSubmission,
  getQSubDetail,
  listQSubsForOrg,
  setCommitmentRolledIn,
  TenantAccessError,
  type ListFilters,
  type QSubType,
  type QSubStage,
} from '../services/q-sub/q-sub.service';
import { Q_SUB_TYPES, Q_SUB_STAGES } from '../../shared/schema/q-sub';

const router = Router();
const log = createScopedLogger('q-sub-routes');
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): string | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

/* ─── Zod schemas ─────────────────────────────────────────────────────── */

const listQuerySchema = z.object({
  type:       z.enum(Q_SUB_TYPES as readonly [string, ...string[]]).optional(),
  stage:      z.enum(Q_SUB_STAGES as readonly [string, ...string[]]).optional(),
  program_id: z.string().min(1).optional(),
  limit:      z
    .string()
    .regex(/^\d+$/)
    .transform((s) => Number.parseInt(s, 10))
    .pipe(z.number().int().min(1).max(500))
    .optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createBodySchema = z.object({
  programId: z.string().regex(UUID_RE, 'programId must be a UUID'),
  qSubType:  z.enum(Q_SUB_TYPES as readonly [string, ...string[]]),
  title:     z.string().trim().min(1, 'title is required').max(500),
  fdaTeam:   z.string().min(1).max(200).optional().nullable(),
  targetDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  summary:   z.string().max(8000).optional().nullable(),
});

const patchCommitmentSchema = z.object({
  rolledIn: z.boolean(),
});

/* ─── GET /api/q-sub — list ───────────────────────────────────────────── */

router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  }
  const filters: ListFilters = {};
  if (parsed.data.type)       filters.type      = parsed.data.type as QSubType;
  if (parsed.data.stage)      filters.stage     = parsed.data.stage as QSubStage;
  if (parsed.data.program_id) filters.programId = parsed.data.program_id;
  if (parsed.data.limit)      filters.limit     = parsed.data.limit;

  try {
    const rows = await listQSubsForOrg(orgId, filters);
    return ok(res, { rows, count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

/* ─── POST /api/q-sub — create new ────────────────────────────────────── */

router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const parsed = createBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  }

  let targetDate: Date | null = null;
  if (parsed.data.targetDate) {
    const d = new Date(parsed.data.targetDate);
    if (Number.isNaN(d.getTime())) {
      return clientError(res, 422, 'targetDate must be an ISO-8601 date');
    }
    targetDate = d;
  }

  try {
    const row = await createQSubmission(orgId, {
      programId: parsed.data.programId,
      qSubType:  parsed.data.qSubType as QSubType,
      title:     parsed.data.title,
      fdaTeam:   parsed.data.fdaTeam ?? null,
      targetDate,
      summary:   parsed.data.summary ?? null,
      createdBy: getUserId(req),
    });
    return created(res, row);
  } catch (err: unknown) {
    if (err instanceof TenantAccessError) return clientError(res, 403, err.message);
    return serverError(res, log, 'create', err);
  }
});

/* ─── GET /api/q-sub/:id — detail ─────────────────────────────────────── */

router.get('/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  try {
    const detail = await getQSubDetail(orgId, String(req.params.id));
    if (!detail) return notFoundInTenant(res, 'Q-Sub');
    return ok(res, detail);
  } catch (err) {
    return serverError(res, log, 'detail', err);
  }
});

/* ─── PATCH /api/q-sub/commitments/:id/rolled-in ──────────────────────── */

router.patch('/commitments/:id/rolled-in', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);

  const parsed = patchCommitmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  }

  try {
    const updated = await setCommitmentRolledIn(orgId, {
      commitmentId: String(req.params.id),
      rolledIn:     parsed.data.rolledIn,
      rolledInBy:   parsed.data.rolledIn ? getUserId(req) : null,
    });
    return ok(res, updated);
  } catch (err: unknown) {
    if (err instanceof TenantAccessError) return clientError(res, 403, err.message);
    return serverError(res, log, 'patch-commitment', err);
  }
});

export default router;
