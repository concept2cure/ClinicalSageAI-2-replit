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

import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger';
import { pool } from '../db';
import { enforceAuthorLineage } from '../services/clinical-regulatory-evidence/lineage-gate';
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
// Rate-limit every q-sub handler (all perform authenticated DB access). Uses
// express-rate-limit directly (recognized by CodeQL's missing-rate-limiting
// query); generous window for interactive submission editing.
router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' } },
  }),
);

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

/* ─── GET /api/q-sub/:id/sections — briefing body per section ────────── */

router.get('/:id/sections', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const qSubId = String(req.params.id);
    /* Tenant gate via getQSubDetail (already enforces program → org). */
    const detail = await getQSubDetail(orgId, qSubId);
    if (!detail) return notFoundInTenant(res, 'Q-Sub');
    const { rows } = await pool.query(
      `SELECT section_key, content, draft_source, drafted_at, drafted_summary,
              accepted_at, accepted_by
         FROM q_sub_section_bodies
        WHERE q_submission_id = $1 AND organization_id = $2`,
      [qSubId, orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-sections', err);
  }
});

/* ─── PUT /api/q-sub/:id/sections/:sectionKey — upsert section body ──── */

const sectionBodySchema = z.object({
  content: z.string().min(1).max(50000),
  draft_source: z.enum(['ana', 'human']).optional(),
  drafted_summary: z.string().max(500).optional(),
});

router.put('/:id/sections/:sectionKey', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = sectionBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  }
  const qSubId = String(req.params.id);
  const sectionKey = String(req.params.sectionKey);

  try {
    /* Tenant gate. */
    const detail = await getQSubDetail(orgId, qSubId);
    if (!detail) return notFoundInTenant(res, 'Q-Sub');

    // NULL, not 'human'. `q_sub_section_bodies.draft_source` is nullable and its
    // schema comment names NULL as a value ('ana' | 'human' | NULL), so "the
    // caller did not say" is directly representable. Resolving an omitted origin
    // to 'human' turned silence into a positive claim that a person wrote this
    // prose — in the body of a Pre-Sub briefing document that goes to FDA, and
    // beside the accepted_at/accepted_by columns that exist to record a human
    // ACCEPTING an AnA draft. A machine draft nobody accepted then became
    // indistinguishable from text a person wrote. Same defect, and same fix, as
    // the governed c2c store (server/routes/c2c/documents.ts).
    const draftSource = parsed.data.draft_source ?? null;
    const draftedAt = draftSource === 'ana' ? new Date() : null;

    // Refuse rather than attribute the prose to a literal. `asserted_by` on
    // document_span_lineage exists precisely to guarantee attribution — its
    // CHECK requires the column to be NOT NULL for an author_assertion — so
    // writing 'system' to satisfy that constraint defeats the thing the
    // constraint is for. This router is behind authenticateToken (see the
    // router.use above), so a missing user id is a broken invariant, not an
    // anonymous caller to be accommodated.
    const userId = getUserId(req);
    if (userId === null || userId === undefined) {
      return clientError(res, 401, 'Sign-in required to author a section body');
    }
    const actor = String(userId);

    // The section body is authored regulatory prose — content and its author
    // lineage commit together in one transaction, or not at all (the same gate
    // the authoring/protocol/biosketch writers use). A lineage failure rolls
    // the upsert back rather than persisting prose with no provenance.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO q_sub_section_bodies (
           q_submission_id, organization_id, section_key, content,
           draft_source, drafted_at, drafted_summary
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (q_submission_id, section_key) DO UPDATE SET
           content         = EXCLUDED.content,
           draft_source    = EXCLUDED.draft_source,
           drafted_at      = COALESCE(EXCLUDED.drafted_at, q_sub_section_bodies.drafted_at),
           drafted_summary = COALESCE(EXCLUDED.drafted_summary, q_sub_section_bodies.drafted_summary),
           accepted_at     = NULL,
           accepted_by     = NULL,
           updated_at      = NOW()
         RETURNING *`,
        [qSubId, orgId, sectionKey, parsed.data.content, draftSource, draftedAt, parsed.data.drafted_summary ?? null],
      );
      await enforceAuthorLineage(
        client,
        orgId,
        { documentTable: 'q_sub_section_bodies', documentId: String(rows[0].id) },
        parsed.data.content,
        actor,
      );
      await client.query('COMMIT');
      return ok(res, rows[0]);
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    return serverError(res, log, 'upsert-section', err);
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
