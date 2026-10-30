/**
 * CSR assembly on the build board (2026-10-30, reach of slice 8), mounted on
 * the jobs router (csr-jobs.ts), so the ectd-compile surface's existing claim
 * on /api/csr/jobs covers it:
 *
 *   POST /api/csr/jobs/:jobId/assembly        queue an assembly (202); body
 *        { notApplicable?: { "16.x": reason }, supplied?: { "16.1.x": { documentId, sha256 } } }
 *   GET  /api/csr/jobs/:jobId/assembly        the newest assembly: status, progress, stage, result
 *   GET  /api/csr/jobs/:jobId/assembly/supply-candidates   the project's current Vault PDFs
 *   GET  /api/csr/jobs/:jobId/assembly/targets             the program's open sequences
 *   POST /api/csr/jobs/:jobId/assembly/:assemblyId/place   { sequenceId, reason, keepOnFile?, withdraw? } → leaves placed
 *   GET  /api/csr/jobs/:jobId/assembly/:assemblyId/lifecycle?sequenceId=  each file's operation (new, or
 *        replace of the study's earlier file) and the earlier files left out, before placing; writes nothing
 *   POST /api/csr/jobs/:jobId/assembly/:assemblyId/withdraw-placement  { reason } → the partly placed files
 *        removed from their still-open sequence (csr-placement-withdraw.ts)
 *
 * Access is the job's project, checked now as the signed-in user (write for
 * the two POSTs). The assembly itself runs off the request thread
 * (csr-assembly-run.ts) as that user.
 */
import { Router, type Request, type Response } from 'express';
import { createScopedLogger } from '../utils/logger.js';
import { queryableFromDrizzle } from '../db/drizzle-queryable';
import { db } from '../db';
import { CsrScopeError, requireCsrJobAccess } from '../services/csr/project-scope';
import {
  CsrAssemblyRunError, enqueueCsrAssembly, readCsrJobBinding, readLatestCsrAssembly, startCsrAssembly,
} from '../services/csr/csr-assembly-run.js';
import { listCsrPlacementTargets, placeCsrAssembly, previewCsrPlacementLifecycle, type CsrPlacementDeps } from '../services/csr/csr-assembly-placement.js';
import { readPriorCsrStudyLeaves } from '../services/csr/csr-placement-lifecycle.js';
import { withdrawPartialCsrPlacement } from '../services/csr/csr-placement-withdraw.js';
import { listSuppliedCandidates } from '../services/csr/csr-assembly-supply.js';

const log = createScopedLogger('csr-jobs-assembly');

export interface CsrAssemblyRouteHelpers {
  resolveOrganizationId(req: Request): number | null;
  resolveUserId(req: Request): number | undefined;
  parseJobIdParam(raw: unknown): number | null;
  requireWriteAccess(organizationId: number, jobId: number, userId: number): Promise<boolean>;
  start?: typeof startCsrAssembly;
  placementDeps?: () => Promise<CsrPlacementDeps>;
}

function requireDb(): NonNullable<typeof db> {
  if (!db) throw new Error('[csr-jobs-assembly] Drizzle db is not initialized');
  return db;
}
const q = () => queryableFromDrizzle(requireDb());

async function defaultPlacementDeps(): Promise<CsrPlacementDeps> {
  const { getSequence, upsertLeaf, removeLeaf } = await import('../services/submission-service/submission-service.js');
  return {
    getSequence: (id, ctx) => getSequence(id, ctx),
    upsertLeaf: (input, ctx) => upsertLeaf(input as unknown as Parameters<typeof upsertLeaf>[0], ctx),
    removeLeaf: (leafId, sequenceId, ctx, reason) => removeLeaf(leafId, sequenceId, ctx, reason),
    priorStudyLeaves: (args) => readPriorCsrStudyLeaves(q(), args),
    submissionProgram: async (submissionId, organizationId) => {
      const { rows } = await q().query(`SELECT program_id::text AS program_id, title FROM submissions WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`, [submissionId, organizationId]);
      return rows[0] ? { programId: rows[0].program_id ?? null, title: String(rows[0].title) } : null;
    },
  };
}

function sendError(res: Response, err: unknown, what: string, context: Record<string, unknown>) {
  if (err instanceof CsrAssemblyRunError || err instanceof CsrScopeError) return res.status(err.status).json({ error: err.message, code: err.code });
  log.error(`Failed to ${what}`, { ...context, err: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: `Could not ${what}.` });
}

export function csrAssemblyRouter(h: CsrAssemblyRouteHelpers): Router {
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

  router.post('/:jobId/assembly', async (req, res) => {
    try {
      const s = await scope(req, res, true);
      if (!s) return;
      const body = (req.body ?? {}) as { notApplicable?: unknown; supplied?: unknown };
      const queued = await enqueueCsrAssembly(q(), { ...s, notApplicable: body.notApplicable, supplied: body.supplied });
      (h.start ?? startCsrAssembly)(queued.assemblyId, s.organizationId);
      return res.status(202).json(queued);
    } catch (err) { return sendError(res, err, 'queue the CSR assembly', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/assembly', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      return res.json({ assembly: await readLatestCsrAssembly(q(), s.organizationId, s.jobId) });
    } catch (err) { return sendError(res, err, 'read the CSR assembly', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/assembly/supply-candidates', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      const { programId } = await readCsrJobBinding(q(), s.organizationId, s.jobId);
      return res.json(await listSuppliedCandidates(q(), { organizationId: s.organizationId, programId }));
    } catch (err) { return sendError(res, err, 'list the Vault documents that can be supplied', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/assembly/targets', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      return res.json({ sequences: await listCsrPlacementTargets(q(), s.organizationId, s.jobId) });
    } catch (err) { return sendError(res, err, 'list the sequences the CSR can be placed in', { jobId: req.params.jobId }); }
  });

  router.post('/:jobId/assembly/:assemblyId/place', async (req, res) => {
    try {
      const s = await scope(req, res, true);
      if (!s) return;
      const assemblyId = h.parseJobIdParam(req.params.assemblyId);
      const sequenceId = h.parseJobIdParam((req.body ?? {}).sequenceId);
      if (assemblyId == null || sequenceId == null) return res.status(400).json({ error: 'Choose an assembly and a sequence.', code: 'CSR_PLACEMENT_TARGET_REQUIRED' });
      const deps = await (h.placementDeps ?? defaultPlacementDeps)();
      const placement = await placeCsrAssembly(q(), deps, { ...s, assemblyId, sequenceId, reason: (req.body ?? {}).reason,
        keepOnFile: (req.body ?? {}).keepOnFile, withdraw: (req.body ?? {}).withdraw });
      return res.json({ placement });
    } catch (err) { return sendError(res, err, 'place the CSR files', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/assembly/:assemblyId/lifecycle', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      const assemblyId = h.parseJobIdParam(req.params.assemblyId);
      const sequenceId = h.parseJobIdParam(req.query.sequenceId);
      if (assemblyId == null || sequenceId == null) return res.status(400).json({ error: 'Choose an assembly and a sequence.', code: 'CSR_PLACEMENT_TARGET_REQUIRED' });
      const deps = await (h.placementDeps ?? defaultPlacementDeps)();
      return res.json({ lifecycle: await previewCsrPlacementLifecycle(q(), deps, { ...s, assemblyId, sequenceId }) });
    } catch (err) { return sendError(res, err, 'read what the CSR files replace', { jobId: req.params.jobId }); }
  });

  router.post('/:jobId/assembly/:assemblyId/withdraw-placement', async (req, res) => {
    try {
      const s = await scope(req, res, true);
      if (!s) return;
      const assemblyId = h.parseJobIdParam(req.params.assemblyId);
      if (assemblyId == null) return res.status(400).json({ error: 'Choose an assembly.', code: 'CSR_PLACEMENT_TARGET_REQUIRED' });
      const deps = await (h.placementDeps ?? defaultPlacementDeps)();
      return res.json({ placement: await withdrawPartialCsrPlacement(q(), deps, { ...s, assemblyId, reason: (req.body ?? {}).reason }) });
    } catch (err) { return sendError(res, err, 'withdraw the partly placed CSR files', { jobId: req.params.jobId }); }
  });

  return router;
}
