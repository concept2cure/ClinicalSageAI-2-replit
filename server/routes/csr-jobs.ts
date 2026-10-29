/**
 * @fileoverview Async CSR Build Job API Routes (Phase 3c)
 * @module server/routes/csr-jobs
 *
 * HTTP surface for the persistent CSR job runner:
 *   POST   /api/csr/jobs                  — enqueue + kick off worker
 *   GET    /api/csr/jobs/:jobId           — org-scoped status read
 *   GET    /api/csr/jobs/:jobId/sections  — org-scoped section listing
 *   POST   /api/csr/jobs/:jobId/cancel    — terminal cancel transition
 *   POST   /api/csr/jobs/:jobId/sections/:sectionNumber/review
 *                                          — record one section review decision
 *                                            (submit | approve | send_back), as the
 *                                            signed-in reviewer (csr-section-review.ts)
 *
 * Tenant scoping rules:
 *   - organizationId MUST be resolved from req.tenantContext / req.user.
 *     Never from the request body, query string, or HTTP headers — those
 *     are caller-controlled and would re-open the IDOR class of bug that
 *     ectd-export.ts patched.
 *   - Every read goes through getCSRBuildJobStatus / getCSRSectionOutputs
 *     which carry the org filter. The cancel UPDATE re-asserts the org
 *     scope in its WHERE clause as defense in depth.
 *
 * Error envelope:
 *   - 400 — malformed :jobId (non-numeric)
 *   - 401 — no tenant context
 *   - 404 — job missing OR cross-org (deliberately collapsed)
 *   - 409 — cancel attempted on a terminal-state job
 *   - 500 — handler exception; message is logged, body is { error } only
 */

import { Router, Request, Response } from 'express';
import { and, eq, notInArray } from 'drizzle-orm';

import { db } from '../db';
import { csrBuildJobs } from '@shared/schema';
import {
  launchCSRBuildAsync,
  type CSRBuildRequest,
} from '../services/csr-builder.js';
import {
  getCSRBuildJobStatus,
  getCSRSectionOutputs,
} from '../services/csr/csr-job-runner.js';
import { createScopedLogger } from '../utils/logger.js';
import { CsrScopeError, parseCsrScopeId, requireCsrJobAccess, resolveCsrScope } from '../services/csr/project-scope';
import {
  CsrSectionReviewError,
  decideCsrSectionReview,
  effectiveReviewState,
  type CsrReviewDecision,
} from '../services/csr/csr-section-review';
import { queryableFromDrizzle } from '../db/drizzle-queryable';

const log = createScopedLogger('csr-jobs');

const router = Router();

/**
 * Terminal job states. A job in any of these states must not be
 * transitioned further — re-running cancel against a terminal job is a
 * 409, and the cancel UPDATE refuses to clobber a terminal status row.
 *
 * Kept in lockstep with the status literals written by csr-job-runner
 * (queued/drafting → complete | failed; cancel writes 'cancelled').
 */
const TERMINAL_JOB_STATUSES = ['complete', 'cancelled', 'failed'] as const;
type TerminalJobStatus = (typeof TERMINAL_JOB_STATUSES)[number];

function isTerminalStatus(s: string): s is TerminalJobStatus {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the request's organizationId from JWT-bound context only.
 * Mirrors the precedence used by ectd-export.ts: tenantContext (set by the
 * tenancy middleware) takes priority, falling back to the auth principal.
 *
 * Returns null when context is missing — the caller MUST emit 401 in that
 * case rather than defaulting to a tenant id.
 */
function resolveOrganizationId(req: Request): number | null {
  const reqAny = req as any;
  const candidate =
    reqAny.tenantContext?.organizationId ?? reqAny.user?.organizationId;
  if (candidate == null) return null;
  const n = Number(candidate);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Resolve the requesting user's id if available (used for attribution only). */
function resolveUserId(req: Request): number | undefined {
  const user = (req as any).user;
  const raw = user?.id ?? user?.userId;
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Parse and validate a :jobId path param. Returns the numeric id on success
 * or null when the param is missing / non-numeric / non-positive. Callers
 * MUST emit 400 on null — never fall through to a DB query with NaN.
 */
function parseJobIdParam(raw: unknown): number | null {
  const s = String(raw ?? '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function requireDb(): NonNullable<typeof db> {
  if (!db) {
    throw new Error('[csr-jobs] Drizzle db is not initialized');
  }
  return db;
}

type Refusal = { status: number; body: { error: string; code: string } };

function inputRefusal(body: { projectId?: unknown; programId?: unknown }, buildRequest: CSRBuildRequest): Refusal | null {
  // A program UUID may resolve to its canonical project in the existing scope service.
  if (body.projectId === undefined && body.programId === undefined) {
    return { status: 400, body: { code: 'CSR_PROJECT_REQUIRED', error: 'Select a project before starting CSR drafting. No job was created.' } };
  }
  if (typeof buildRequest.studyInfo?.protocolNumber !== 'string' || !buildRequest.studyInfo.protocolNumber.trim()) {
    return { status: 400, body: { code: 'CSR_STUDY_IDENTIFIER_REQUIRED',
      error: 'Record the study protocol number before starting CSR drafting. No job was created.' } };
  }
  return null;
}

/**
 * A retained run binds only to a build for the program it was retained under:
 * the protocol number alone does not tie a run in one program to a CSR filed
 * in another. Checked before the run is read; a numeric-project build carries
 * no program id to compare, and the runner re-checks the run's own scope.
 */
function evidenceProgramRefusal(body: { programId?: unknown }, buildRequest: CSRBuildRequest): Refusal | null {
  const runProgram = buildRequest.evidenceSource?.programId;
  if (typeof body.programId !== 'string' || runProgram === body.programId) return null;
  return { status: 409, body: { code: 'CSR_EVIDENCE_PROGRAM_MISMATCH',
    error: 'The retained run belongs to another program than this build. No job was created.' } };
}

/**
 * Reads the bound run's retained tables through the canonical, receipt-verified
 * reader (cortex-authoring-reader) before a job exists, and checks they are for
 * the study being built. Returns the refusal to send, or null when the run is
 * readable. The runner re-reads per section; this only stops a build that
 * could never draft a results section from being queued.
 */
async function evidenceSourceRefusal(
  req: Request, organizationId: number, userId: number, buildRequest: CSRBuildRequest,
): Promise<Refusal | null> {
  const refuse = (status: number, code: string, why: string): Refusal =>
    ({ status, body: { code, error: `${why} No job was created.` } });
  const [{ requestPgClient }, { loadCsrAuthoringEvidence }, { CsrAuthoringContextError }, { CsrSourceInputError }] = await Promise.all([
    import('../db/requestDb.js'), import('../services/csr/cortex-authoring-reader.js'),
    import('../services/csr/cortex-authoring-context.js'), import('../services/csr/source-access.js'),
  ]);
  try {
    const evidence = await loadCsrAuthoringEvidence(requestPgClient(req), { organizationId, userId },
      { ...(buildRequest.evidenceSource as object), sectionNumber: '2' });
    if (evidence.source.protocolNumber !== buildRequest.studyInfo.protocolNumber.trim()) {
      return refuse(409, 'CSR_EVIDENCE_STUDY_MISMATCH', 'The retained run holds tables for another protocol.');
    }
    return null;
  } catch (err) {
    if (err instanceof CsrSourceInputError) return refuse(err.status, err.code, err.message);
    if (err instanceof CsrAuthoringContextError) {
      return refuse(err.status, err.code, 'The retained run’s clinical tables could not be read for this build.');
    }
    log.error('CSR evidence source check failed', { err: err instanceof Error ? err.message : String(err), organizationId });
    return refuse(503, 'CSR_EVIDENCE_UNAVAILABLE', 'The retained run’s clinical tables could not be verified.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/csr/jobs — enqueue a new build job
// ─────────────────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const organizationId = resolveOrganizationId(req);
  if (organizationId == null) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  // userId MUST come from the auth principal — never the body. A
  // body-controlled userId would let callers attribute build jobs (and
  // the quota / recordUsage rows that follow) to an arbitrary principal.
  // If we can't resolve a user from req, reject with 401 rather than
  // poisoning the audit trail with a sentinel id.
  const requestedBy = resolveUserId(req);
  if (requestedBy == null) {
    return res.status(401).json({ error: 'Authenticated user required' });
  }

  // Extract optional projectId from the body. Everything else flows
  // through as the CSRBuildRequest payload; launchCSRBuildAsync owns
  // quota validation and will throw on a bad payload.
  const body = (req.body ?? {}) as Partial<CSRBuildRequest> & {
    projectId?: number;
    programId?: string;
    clientWorkspaceId?: number;
  };

  // Pin the organizationId AND userId from the authenticated principal
  // so the downstream service layer cannot be tricked into using a
  // body-supplied tenant / user. The spread runs first; the server-
  // resolved values are written last and win unconditionally.
  const buildRequest: CSRBuildRequest = {
    ...(body as CSRBuildRequest),
    organizationId,
    userId: requestedBy,
  };

  // Missing anchor or study identity are client input errors, refused before
  // dispatching a job or consuming model quota. A build bound to a retained
  // run must also be able to read that run's tables now, for this study, as
  // this user; otherwise no job is created.
  const refusal = inputRefusal(body, buildRequest)
    ?? (buildRequest.evidenceSource !== undefined
      ? evidenceProgramRefusal(body, buildRequest)
        ?? await evidenceSourceRefusal(req, organizationId, requestedBy, buildRequest) : null);
  if (refusal) return res.status(refusal.status).json(refusal.body);

  try {
    const projectId = parseCsrScopeId(body.projectId, 'projectId');
    const clientWorkspaceId = parseCsrScopeId(body.clientWorkspaceId, 'clientWorkspaceId');
    const enqueued = await launchCSRBuildAsync(buildRequest, {
      organizationId,
      projectId,
      ...(body.programId !== undefined ? { programId: body.programId } : {}),
      ...(clientWorkspaceId !== undefined ? { clientWorkspaceId } : {}),
      requestedBy,
    });
    return res.status(202).json({
      jobId: enqueued.jobId,
      status: enqueued.status,
    });
  } catch (err) {
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    log.error('Failed to enqueue CSR build job', {
      err: err instanceof Error ? err.message : String(err),
      organizationId,
    });
    return res.status(500).json({ error: 'Failed to enqueue CSR build job' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/csr/jobs/:jobId — org-scoped status read
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:jobId', async (req: Request, res: Response) => {
  const jobId = parseJobIdParam(req.params.jobId);
  if (jobId == null) {
    return res.status(400).json({ error: 'Valid numeric job id required' });
  }

  const organizationId = resolveOrganizationId(req);
  if (organizationId == null) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    if (!await requireCsrJobAccess(requireDb(), organizationId, jobId, resolveUserId(req))) return res.status(404).json({ error: 'Job not found' });
    const status = await getCSRBuildJobStatus(jobId, organizationId);
    if (status == null) {
      // Collapsed not-found vs cross-org case — see module header.
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(status);
  } catch (err) {
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    log.error('Failed to read CSR build job status', {
      err: err instanceof Error ? err.message : String(err),
      organizationId,
      jobId,
    });
    return res.status(500).json({ error: 'Failed to read job status' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/csr/jobs/:jobId/sections — persisted section outputs
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:jobId/sections', async (req: Request, res: Response) => {
  const jobId = parseJobIdParam(req.params.jobId);
  if (jobId == null) {
    return res.status(400).json({ error: 'Valid numeric job id required' });
  }

  const organizationId = resolveOrganizationId(req);
  if (organizationId == null) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    if (!await requireCsrJobAccess(requireDb(), organizationId, jobId, resolveUserId(req))) return res.status(404).json({ error: 'Job not found' });
    // Probe existence first so missing / cross-org jobs surface as 404
    // instead of an indistinguishable 200 { sections: [] }. Mirrors the
    // cancel handler and keeps the existence-vs-cross-org collapse
    // consistent across every :jobId route in this file.
    const status = await getCSRBuildJobStatus(jobId, organizationId);
    if (status == null) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const sections = await getCSRSectionOutputs(jobId, organizationId);
    // The review state a reader should see: an approval of since-redrafted
    // text reads as a draft (csr-section-review.ts effectiveReviewState).
    return res.json({ sections: sections.map(section => ({ ...section, review: effectiveReviewState(section) })) });
  } catch (err) {
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    log.error('Failed to read CSR section outputs', {
      err: err instanceof Error ? err.message : String(err),
      organizationId,
      jobId,
    });
    return res.status(500).json({ error: 'Failed to read job sections' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/csr/jobs/:jobId/cancel — terminal cancel transition
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:jobId/cancel', async (req: Request, res: Response) => {
  const jobId = parseJobIdParam(req.params.jobId);
  if (jobId == null) {
    return res.status(400).json({ error: 'Valid numeric job id required' });
  }

  const organizationId = resolveOrganizationId(req);
  if (organizationId == null) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    // Org-scoped existence + state probe. A null return means the job
    // either does not exist or belongs to another tenant — both surface
    // as 404 so we don't leak job existence across tenants. The probe
    // also lets us return a precise 409.status payload when the row is
    // already terminal at probe time (common case, no race).
    if (!await requireCsrJobAccess(requireDb(), organizationId, jobId, resolveUserId(req))) return res.status(404).json({ error: 'Job not found' });
    const status = await getCSRBuildJobStatus(jobId, organizationId);
    if (status == null) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (isTerminalStatus(status.status)) {
      return res.status(409).json({
        error: 'Job is in a terminal state and cannot be cancelled',
        status: status.status,
      });
    }

    // Atomic transition: the UPDATE WHERE filters out any row that has
    // already reached a terminal state between the probe above and this
    // write. Without this guard the fire-and-forget worker (setImmediate
    // in launchCSRBuildAsync) could race the probe and we would silently
    // overwrite a 'complete' or 'failed' row back to 'cancelled',
    // corrupting audit/notification history.
    //
    // The org filter is re-asserted as defense in depth — a future
    // refactor that drops the existence probe above would still be safe.
    const d = requireDb();
    const updated = await d
      .update(csrBuildJobs)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(csrBuildJobs.id, jobId),
          eq(csrBuildJobs.organizationId, organizationId),
          notInArray(csrBuildJobs.status, [...TERMINAL_JOB_STATUSES])
        )
      )
      .returning({ id: csrBuildJobs.id });

    if (updated.length === 0) {
      // The worker transitioned the row to a terminal state between
      // probe and update. Re-read so the response reflects the actual
      // terminal status the client landed on.
      const after = await getCSRBuildJobStatus(jobId, organizationId);
      return res.status(409).json({
        error: 'Job is in a terminal state and cannot be cancelled',
        status: after?.status ?? 'unknown',
      });
    }

    return res.status(204).send();
  } catch (err) {
    if (err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
    log.error('Failed to cancel CSR build job', {
      err: err instanceof Error ? err.message : String(err),
      organizationId,
      jobId,
    });
    return res.status(500).json({ error: 'Failed to cancel job' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/csr/jobs/:jobId/sections/:sectionNumber/review — one review decision
// ─────────────────────────────────────────────────────────────────────────────

/** Write access to the job's project, checked now (not retained from enqueue). */
async function requireCsrJobWriteAccess(organizationId: number, jobId: number, userId: number): Promise<boolean> {
  const d = requireDb();
  if (!await requireCsrJobAccess(d, organizationId, jobId, userId)) return false;
  const [job] = await d.select({ projectId: csrBuildJobs.projectId }).from(csrBuildJobs)
    .where(and(eq(csrBuildJobs.id, jobId), eq(csrBuildJobs.organizationId, organizationId))).limit(1);
  if (!job) return false;
  if (job.projectId != null) {
    await resolveCsrScope(d, organizationId, { projectId: job.projectId }, { forWrite: true, actorUserId: userId });
  }
  return true;
}

router.post('/:jobId/sections/:sectionNumber/review', async (req: Request, res: Response) => {
  const jobId = parseJobIdParam(req.params.jobId);
  const sectionNumber = String(req.params.sectionNumber ?? '');
  if (jobId == null || !/^\d+(\.\d+)*$/.test(sectionNumber)) {
    return res.status(400).json({ error: 'Valid job id and ICH E3 section number required' });
  }
  const organizationId = resolveOrganizationId(req);
  const reviewerId = resolveUserId(req);
  if (organizationId == null || reviewerId == null) {
    return res.status(401).json({ error: 'A signed-in reviewer is required' });
  }
  const body = (req.body ?? {}) as { decision?: unknown; reason?: unknown; expectedContentHash?: unknown };
  try {
    if (!await requireCsrJobWriteAccess(organizationId, jobId, reviewerId)) return res.status(404).json({ error: 'Job not found' });
    const review = await decideCsrSectionReview(queryableFromDrizzle(requireDb()), {
      organizationId, jobId, sectionNumber, reviewerId,
      decision: body.decision as CsrReviewDecision,
      expectedContentHash: body.expectedContentHash as string,
      ...(typeof body.reason === 'string' ? { reason: body.reason } : {}),
    });
    return res.json({ review });
  } catch (err) {
    if (err instanceof CsrSectionReviewError || err instanceof CsrScopeError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    log.error('Failed to record CSR section review', {
      err: err instanceof Error ? err.message : String(err), organizationId, jobId, sectionNumber,
    });
    return res.status(500).json({ error: 'The review decision was not recorded' });
  }
});

export default router;
