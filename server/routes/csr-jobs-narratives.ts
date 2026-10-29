/**
 * Patient safety narratives on the build board (CSR slice 7; off the request
 * path since 2026-10-30), mounted on the jobs router (csr-jobs.ts), so the
 * ectd-compile surface's existing claim on /api/csr/jobs covers it:
 *
 *   POST /api/csr/jobs/:jobId/narratives         queue the build (202 { runId, status, resumed });
 *        a cancelled build or one with no bound run is refused now, by code
 *   GET  /api/csr/jobs/:jobId/narratives/status  the newest build: status, subjects done of total,
 *        stalled, the outcome or the refusal by code
 *   GET  /api/csr/jobs/:jobId/narratives         the per-subject QC list (no text)
 *
 * Access is the job's project, checked now as the signed-in user (write for
 * the POST). The build itself runs off the request thread
 * (csr-narrative-run.ts) as that user. No prose model is passed: the
 * high-risk drafting model has not passed PQ-DRAFT-001 (ADR-0015 §3), so
 * narratives are the engine's fact-only template prose.
 */
import { Router, type Request, type Response } from 'express';
import { createScopedLogger } from '../utils/logger.js';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { db } from '../db';
import { CsrScopeError, requireCsrJobAccess } from '../services/csr/project-scope';
import { CsrNarrativeBuildError, readCsrNarrativeQc } from '../services/csr/csr-narrative-store.js';
import { CsrNarrativeRunError, enqueueNarrativeRun, readLatestNarrativeRun, startNarrativeRun } from '../services/csr/csr-narrative-run.js';

const log = createScopedLogger('csr-jobs-narratives');

export interface CsrNarrativeRouteHelpers {
  resolveOrganizationId(req: Request): number | null;
  resolveUserId(req: Request): number | undefined;
  parseJobIdParam(raw: unknown): number | null;
  requireWriteAccess(organizationId: number, jobId: number, userId: number): Promise<boolean>;
  start?: typeof startNarrativeRun;
}

function requireDb(): NonNullable<typeof db> {
  if (!db) throw new Error('[csr-jobs-narratives] Drizzle db is not initialized');
  return db;
}
const q = () => queryableFromDrizzle(requireDb());

function sendError(res: Response, err: unknown, what: string, context: Record<string, unknown>) {
  if (err instanceof CsrNarrativeRunError) return res.status(err.status).json({ error: err.message, code: err.code, ...(err.runId ? { runId: err.runId } : {}) });
  if (err instanceof CsrNarrativeBuildError || err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
  log.error(`Failed to ${what}`, { ...context, err: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: `Could not ${what}.` });
}

export function csrNarrativeRouter(h: CsrNarrativeRouteHelpers): Router {
  const router = Router();
  /** Org, user and job, or the response already sent. */
  const scope = async (req: Request, res: Response, write: boolean) => {
    const jobId = h.parseJobIdParam(req.params.jobId);
    if (jobId == null) { res.status(400).json({ error: 'Valid numeric job id required' }); return null; }
    const organizationId = h.resolveOrganizationId(req);
    const userId = h.resolveUserId(req);
    if (organizationId == null || userId == null) { res.status(401).json({ error: 'A signed-in user is required' }); return null; }
    const allowed = write ? await h.requireWriteAccess(organizationId, jobId, userId) : await requireCsrJobAccess(requireDb(), organizationId, jobId, userId);
    if (!allowed) { res.status(404).json({ error: 'Job not found' }); return null; }
    return { organizationId, userId, jobId };
  };

  router.post('/:jobId/narratives', async (req, res) => {
    try {
      const s = await scope(req, res, true);
      if (!s) return;
      const queued = await enqueueNarrativeRun(q(), s);
      (h.start ?? startNarrativeRun)(queued.runId, s.organizationId);
      return res.status(202).json(queued);
    } catch (err) { return sendError(res, err, 'queue the narrative build', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/narratives/status', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      return res.json({ run: await readLatestNarrativeRun(q(), s.organizationId, s.jobId) });
    } catch (err) { return sendError(res, err, 'read the narrative build', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/narratives', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      return res.json({ subjects: await readCsrNarrativeQc(q(), s.organizationId, s.jobId) });
    } catch (err) { return sendError(res, err, 'read the narrative QC list', { jobId: req.params.jobId }); }
  });

  return router;
}
