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
 *   GET  /api/csr/jobs/:jobId/narratives/text    a page of the composed narratives with their text
 *        (?afterSequence=&afterSubject=&limit≤50), for the read-only §14.3.3 viewer in Authoring,
 *        which holds §14.3.3 by reference to this store (2026-10-30)
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
import { requestDb } from '../db/requestDb';
import { CsrScopeError, requireCsrJobAccess } from '../services/csr/project-scope';
import { CsrNarrativeBuildError, readCsrNarrativeQc, readCsrNarrativeTextPage } from '../services/csr/csr-narrative-store.js';
import { CsrNarrativeRunError, enqueueNarrativeRun, readLatestNarrativeRun, startNarrativeRun } from '../services/csr/csr-narrative-run.js';
import { readCsrNarrativeStoreDigest, readLandedNarrativePage, requireNarrativeSnapshot,
  type ImportedNarrativePins, type LandedNarrativePageCursor, type NarrativeSnapshotFingerprints } from '../services/csr/csr-narrative-landed.js';

const log = createScopedLogger('csr-jobs-narratives');

export interface CsrNarrativeRouteHelpers {
  resolveOrganizationId(req: Request): number | null;
  resolveUserId(req: Request): number | undefined;
  parseJobIdParam(raw: unknown): number | null;
  requireWriteAccess(organizationId: number, jobId: number, userId: number): Promise<boolean>;
  start?: typeof startNarrativeRun;
}

/** The request's own tenant-scoped connection (requireTenantContext), never the shared pool: a request without one
 *  is refused by requestDb's typed error (ci:requestdb-coverage; red from 2026-10-29 until 2026-11-09). */
const q = (req: Request) => queryableFromDrizzle(requestDb(req));

/** Imported references name an exact store; ordinary build reads remain current. */
async function readImportedNarratives<T extends object>(sql: ReturnType<typeof q>,
  job: { organizationId: number; jobId: number }, rawDigest: unknown, read: (fingerprints?: NarrativeSnapshotFingerprints) => Promise<T>) {
  if (rawDigest === undefined) return read();
  if (typeof rawDigest !== 'string' || !/^[a-f0-9]{64}$/.test(rawDigest)) {
    throw new CsrNarrativeBuildError('CSR_NARRATIVE_REFERENCE_INVALID', 400, 'The imported narrative reference needs one valid store SHA-256.');
  }
  const fingerprints = new Map<string, string>();
  const verify = async (capture = false) => {
    if (await readCsrNarrativeStoreDigest(sql, job, capture ? fingerprints : undefined) !== rawDigest) {
      throw new CsrNarrativeBuildError('CSR_NARRATIVE_REFERENCE_CHANGED', 409,
        'The narrative store changed after this section was imported. Reimport the section before reading the narratives.');
    }
  };
  await verify(true);
  const value = await read(fingerprints);
  // A replacement between the first check and the actual page/QC query must
  // not be returned beneath an earlier imported reference's identity.
  await verify();
  return { ...value, storeDigest: rawDigest };
}

function importedPins(query: Request['query']): ImportedNarrativePins | null {
  if (query.expectedLandedSha256 === undefined) return null;
  if (typeof query.expectedLandedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(query.expectedLandedSha256)
    || typeof query.expectedStoreDigest !== 'string' || !/^[a-f0-9]{64}$/.test(query.expectedStoreDigest)) {
    throw new CsrNarrativeBuildError('CSR_NARRATIVE_REFERENCE_INVALID', 400, 'The imported narrative reference needs valid store and landed-section SHA-256 values.');
  }
  return { storeDigest: query.expectedStoreDigest, landedSha256: query.expectedLandedSha256 };
}

function currentCursor(query: Request['query']) {
  const sequence = Number(query.afterSequence);
  const subject = typeof query.afterSubject === 'string' ? query.afterSubject : '';
  if (query.afterSequence === undefined) return null;
  if (Number.isSafeInteger(sequence) && sequence >= 0 && subject && subject.length <= 200) return { sequence, subjectId: subject };
  throw new CsrNarrativeBuildError('CSR_NARRATIVE_PAGE_INVALID', 400, 'afterSequence must be a whole number and afterSubject a subject identifier.');
}

function importedCursor(query: Request['query']): LandedNarrativePageCursor | null {
  const after = currentCursor(query);
  if (!after && query.afterSubject === undefined && query.afterLandedOffset === undefined && query.afterProof === undefined) return null;
  const offset = typeof query.afterLandedOffset === 'string' ? Number(query.afterLandedOffset) : NaN;
  if (!after || !Number.isSafeInteger(offset) || offset < 0 || typeof query.afterProof !== 'string' || !/^[a-f0-9]{64}$/.test(query.afterProof)) {
    throw new CsrNarrativeBuildError('CSR_NARRATIVE_PAGE_INVALID', 400, 'This narrative page needs its verified landed position. Return to the first page.');
  }
  return { ...after, landedOffset: offset, proof: query.afterProof };
}

function landedPayload(page: Awaited<ReturnType<typeof readLandedNarrativePage>>, qc: boolean) {
  const shared = { next: page.next, landedSha256: page.landedSha256 };
  if (qc) return { ...shared, subjects: page.rows.map(row => ({ subjectId: row.subjectId, sequence: row.sequence,
    status: row.status, contentHash: row.contentHash, qc: row.qc })) };
  return { ...shared, narratives: page.rows.map(row => ({ subjectId: row.subjectId, sequence: row.sequence,
    armName: String(row.qc.armName ?? ''), events: Array.isArray(row.qc.events) ? row.qc.events : [],
    categories: Array.isArray(row.qc.categories) ? row.qc.categories : [], text: row.content, contentHash: row.contentHash, verified: true })) };
}

async function readNarrativeResponse(sql: ReturnType<typeof q>, job: { organizationId: number; jobId: number }, query: Request['query'], qc: boolean) {
  const pins = importedPins(query);
  if (pins) {
    const after = importedCursor(query);
    return readImportedNarratives(sql, job, query.expectedStoreDigest, async fingerprints => {
      if (!fingerprints) throw new CsrNarrativeBuildError('CSR_NARRATIVE_REFERENCE_UNAVAILABLE', 503, 'The imported narrative snapshot could not be verified. Reopen this section.');
      return landedPayload(await readLandedNarrativePage(sql, job, { ...pins, fingerprints }, after, Number(query.limit ?? 20)), qc);
    });
  }
  const after = qc ? null : currentCursor(query);
  return readImportedNarratives(sql, job, query.expectedStoreDigest, async fingerprints => {
    const verify = fingerprints ? (rows: Parameters<typeof requireNarrativeSnapshot>[1]) => requireNarrativeSnapshot(sql, rows, fingerprints) : undefined;
    return qc ? { subjects: await readCsrNarrativeQc(sql, job.organizationId, job.jobId, verify) }
      : readCsrNarrativeTextPage(sql, job.organizationId, job.jobId, after, { size: Number(query.limit ?? 20), verify });
  });
}

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
    const allowed = write ? await h.requireWriteAccess(organizationId, jobId, userId) : await requireCsrJobAccess(requestDb(req), organizationId, jobId, userId);
    if (!allowed) { res.status(404).json({ error: 'Job not found' }); return null; }
    return { organizationId, userId, jobId };
  };

  router.post('/:jobId/narratives', async (req, res) => {
    try {
      const s = await scope(req, res, true);
      if (!s) return;
      const queued = await enqueueNarrativeRun(q(req), s);
      (h.start ?? startNarrativeRun)(queued.runId, s.organizationId);
      return res.status(202).json(queued);
    } catch (err) { return sendError(res, err, 'queue the narrative build', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/narratives/status', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      return res.json({ run: await readLatestNarrativeRun(q(req), s.organizationId, s.jobId) });
    } catch (err) { return sendError(res, err, 'read the narrative build', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/narratives', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      const sql = q(req);
      return res.json(await readNarrativeResponse(sql, s, req.query, true));
    } catch (err) { return sendError(res, err, 'read the narrative QC list', { jobId: req.params.jobId }); }
  });

  router.get('/:jobId/narratives/text', async (req, res) => {
    try {
      const s = await scope(req, res, false);
      if (!s) return;
      const sql = q(req);
      return res.json(await readNarrativeResponse(sql, s, req.query, false));
    } catch (err) { return sendError(res, err, 'read the narratives', { jobId: req.params.jobId }); }
  });

  return router;
}
