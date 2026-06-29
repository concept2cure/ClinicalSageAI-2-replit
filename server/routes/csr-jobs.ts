/**
 * @fileoverview Async CSR Build Job API Routes (Phase 3c)
 * @module server/routes/csr-jobs
 *
 * HTTP surface for the persistent CSR job runner:
 *   POST   /api/csr/jobs                  — enqueue + kick off worker
 *   GET    /api/csr/jobs/:jobId           — org-scoped status read
 *   GET    /api/csr/jobs/:jobId/sections  — org-scoped section listing
 *   POST   /api/csr/jobs/:jobId/cancel    — terminal cancel transition
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
  };
  const projectIdRaw = body.projectId;
  // Match parseJobIdParam's discipline: positive integer or nothing.
  // Zero, negatives, and floats are rejected as undefined rather than
  // forwarded into the downstream service layer.
  const projectId =
    typeof projectIdRaw === 'number' &&
    Number.isInteger(projectIdRaw) &&
    projectIdRaw > 0
      ? projectIdRaw
      : undefined;

  // Pin the organizationId AND userId from the authenticated principal
  // so the downstream service layer cannot be tricked into using a
  // body-supplied tenant / user. The spread runs first; the server-
  // resolved values are written last and win unconditionally.
  const buildRequest: CSRBuildRequest = {
    ...(body as CSRBuildRequest),
    organizationId,
    userId: requestedBy,
  };

  try {
    const enqueued = await launchCSRBuildAsync(buildRequest, {
      organizationId,
      projectId,
      requestedBy,
    });
    return res.status(202).json({
      jobId: enqueued.jobId,
      status: enqueued.status,
    });
  } catch (err) {
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
    const status = await getCSRBuildJobStatus(jobId, organizationId);
    if (status == null) {
      // Collapsed not-found vs cross-org case — see module header.
      return res.status(404).json({ error: 'Job not found' });
    }
    return res.json(status);
  } catch (err) {
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
    // Probe existence first so missing / cross-org jobs surface as 404
    // instead of an indistinguishable 200 { sections: [] }. Mirrors the
    // cancel handler and keeps the existence-vs-cross-org collapse
    // consistent across every :jobId route in this file.
    const status = await getCSRBuildJobStatus(jobId, organizationId);
    if (status == null) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const sections = await getCSRSectionOutputs(jobId, organizationId);
    return res.json({ sections });
  } catch (err) {
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
    log.error('Failed to cancel CSR build job', {
      err: err instanceof Error ? err.message : String(err),
      organizationId,
      jobId,
    });
    return res.status(500).json({ error: 'Failed to cancel job' });
  }
});

export default router;
