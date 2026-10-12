/**
 * Biostatistics bridge — the API that joins study design, the biostatistics
 * engines, the program's filing type, the governed artifact store and the
 * canonical task board.
 *
 * Mounted at `/api/biostat-bridge` behind `authMiddleware`, so every handler
 * runs tenant-scoped. Endpoints:
 *
 *   GET  /designs?program_id=              this tenant's designs with statistical readiness
 *   GET  /designs/:studyId/assessment      read-only: engine input + result + judgment, gaps,
 *                                          filing placements, proposed tasks (nothing written)
 *   POST /designs/:studyId/apply-sample-size  governed: write the engine's N/power onto the
 *                                          design — reason required, Part 11 audit row in the
 *                                          same transaction
 *   POST /designs/:studyId/tasks           governed: raise selected proposed tasks on the board
 *   GET  /filing-placements?applicationType=  the placement catalog for one filing type
 *
 * Envelope: `{ data }` on success (server/lib/api-response), `{ error, details? }` on failure.
 *
 * @module server/routes/biostat-bridge
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { clientError, ok, serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger.js';
import {
  APPLICATION_TYPE_VALUES,
  BridgeError,
  applySampleSizeToDesign,
  assessDesign,
  createTasksForDesign,
  isApplicationType,
  listBridgeDesigns,
  placementsForApplication,
  reproduceSizingRun,
} from '../services/biostatistics-bridge/bridge-service';
/* The CANONICAL resolvers. This module defined its own pair, reading the same
   places in a different order — and a second answer to "which organization is
   this" is a tenant-isolation decision, not a helper (`ci:tenant-resolvers`).
   Every caller below already refuses a falsy id, so the canonical resolveUserId
   admitting 0 changes no behaviour here. */
import { resolveOrgId, resolveUserId } from '../types/auth-request';

const router = Router();
const logger = createScopedLogger('biostat-bridge');

// ─── Request context (polymorphic per the auth middleware, as study-design.ts) ─

const studyIdParam = z.string().min(1).max(100);

function bridgeErrorStatus(code: BridgeError['code']): 400 | 404 | 409 | 422 {
  switch (code) {
    case 'NOT_FOUND': return 404;
    case 'REASON_REQUIRED': return 400;
    case 'CANNOT_SIZE': return 422;
    case 'NO_TASKS': return 409;
    case 'NO_PROJECT': return 409;
    default: return 400;
  }
}

// ─── GET /designs ─────────────────────────────────────────────────────────────

router.get('/designs', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return clientError(res, 401, 'AUTH_REQUIRED');
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : undefined;
  try {
    const rows = await listBridgeDesigns(orgId, { programId, limit });
    return ok(res, rows, { count: rows.length, programId: programId ?? null });
  } catch (err) {
    // An unprovisioned PRM store is an honest empty list, as /api/study-design does.
    if ((err as { code?: string })?.code === '42P01') return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, logger, 'listing designs', err);
  }
});

// ─── GET /designs/:studyId/assessment ─────────────────────────────────────────

router.get('/designs/:studyId/assessment', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return clientError(res, 401, 'AUTH_REQUIRED');
  const id = studyIdParam.safeParse(req.params.studyId);
  if (!id.success) return clientError(res, 400, 'INVALID_STUDY_ID');
  try {
    const assessment = await assessDesign(orgId, id.data);
    if (!assessment) return clientError(res, 404, 'NOT_FOUND', { studyId: id.data });
    return ok(res, assessment);
  } catch (err) {
    return serverError(res, logger, 'assessing the design', err);
  }
});

// ─── GET /computation-runs/:runId/reproduce ───────────────────────────────────

/**
 * GET /api/biostat-bridge/computation-runs/:runId/reproduce
 *
 * Re-run a stored computation and report whether it still produces the figure
 * that was filed.
 *
 * The two questions a sponsor gets asked under statistical defence:
 * *"reproduce the planned sample size in your SAP from the inputs you filed"*
 * and *"prove this N was not edited after it was computed"*. Both were
 * answerable in principle since 2026-10-08, when `recordComputationRun` began
 * storing each run's inputs, outputs and a SHA-256 of each
 * (migrations/20261008f) — and `reproduceComputationRun`, which checks them,
 * was reachable from nothing. The records existed and could not be checked.
 *
 * Reports four separate facts, because they fail for different reasons and a
 * single verdict would hide which:
 *   inputsIntact          the stored inputs still hash to their stored digest
 *   outputsIntact         the stored outputs still hash to theirs
 *   reproduced            re-running the engine on the stored inputs gives
 *                         the stored outputs digest
 *   engineVersionMatches  the engine is the version that produced it
 *
 * A reproduction that fails because the engine moved on is a different event
 * from one that fails because a row changed, and a submission needs to be able
 * to say which. A run in another tenant reads as not found.
 */
router.get('/computation-runs/:runId/reproduce', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return clientError(res, 401, 'AUTH_REQUIRED');
  const runId = Number(req.params.runId);
  if (!Number.isInteger(runId) || runId <= 0) {
    return clientError(res, 400, 'INVALID_RUN_ID', { message: 'A computation-run id must be a positive integer.' });
  }
  try {
    const result = await reproduceSizingRun(orgId, runId);
    if (!result.found) return clientError(res, 404, 'NOT_FOUND', { runId });
    return ok(res, result);
  } catch (err) {
    return serverError(res, logger, 'reproducing the computation run', err);
  }
});

// ─── POST /designs/:studyId/apply-sample-size (governed) ──────────────────────

const applySchema = z.object({
  reason: z.string().min(8, 'Provide a reason of at least 8 characters.'),
  idempotencyKey: z.string().max(200).optional(),
});

router.post('/designs/:studyId/apply-sample-size', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return clientError(res, 401, 'AUTH_REQUIRED');
  const id = studyIdParam.safeParse(req.params.studyId);
  if (!id.success) return clientError(res, 400, 'INVALID_STUDY_ID');
  const body = applySchema.safeParse(req.body ?? {});
  if (!body.success) return clientError(res, 400, 'REASON_REQUIRED', { issues: body.error.issues });
  try {
    const result = await applySampleSizeToDesign({
      organizationId: orgId,
      userId,
      studyId: id.data,
      reason: body.data.reason,
      idempotencyKey: body.data.idempotencyKey ?? null,
    });
    // The full design is not echoed: the caller re-reads it through the
    // assessment, which is the one shape the surface renders.
    return ok(res, {
      studyId: result.studyId,
      plannedSampleSize: result.plannedSampleSize,
      power: result.power,
      actionId: result.actionId,
      auditId: result.auditId,
      sha256Chain: result.sha256Chain,
    });
  } catch (err) {
    if (err instanceof BridgeError) {
      return clientError(res, bridgeErrorStatus(err.code), err.code, { message: err.message, ...(err.details ? { gaps: err.details } : {}) });
    }
    return serverError(res, logger, 'applying the sample size', err);
  }
});

// ─── POST /designs/:studyId/tasks (governed) ──────────────────────────────────

const tasksSchema = z.object({
  keys: z.array(z.string().min(1).max(120)).min(1).max(40),
  reason: z.string().max(500).optional(),
});

router.post('/designs/:studyId/tasks', async (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  const userId = resolveUserId(req);
  if (!orgId || !userId) return clientError(res, 401, 'AUTH_REQUIRED');
  const id = studyIdParam.safeParse(req.params.studyId);
  if (!id.success) return clientError(res, 400, 'INVALID_STUDY_ID');
  const body = tasksSchema.safeParse(req.body ?? {});
  if (!body.success) return clientError(res, 400, 'INVALID_BODY', { issues: body.error.issues });
  try {
    const result = await createTasksForDesign({
      organizationId: orgId,
      userId,
      studyId: id.data,
      keys: body.data.keys,
      reason: body.data.reason,
    });
    return ok(res, result, { created: result.created.length, skipped: result.skipped.length });
  } catch (err) {
    if (err instanceof BridgeError) {
      return clientError(res, bridgeErrorStatus(err.code), err.code, { message: err.message });
    }
    return serverError(res, logger, 'raising tasks from the assessment', err);
  }
});

// ─── GET /filing-placements ───────────────────────────────────────────────────

router.get('/filing-placements', (req: Request, res: Response) => {
  const orgId = resolveOrgId(req);
  if (!orgId) return clientError(res, 401, 'AUTH_REQUIRED');
  const t = req.query.applicationType;
  if (!isApplicationType(t)) {
    return clientError(res, 400, 'INVALID_APPLICATION_TYPE', { allowed: [...APPLICATION_TYPE_VALUES] });
  }
  return ok(res, placementsForApplication(t), { applicationType: t });
});

export default router;
