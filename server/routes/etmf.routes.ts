/**
 * eTMF REST surface — Trial Master File completeness / inspection-readiness.
 *
 * Deterministic assessment of a trial's filed artifacts against the DIA TMF
 * Reference Model (ICH E6(R2) §8 essential documents). Mounted at /api/etmf
 * with authenticateToken applied at mount time.
 */

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import { assessTmfCompleteness, getTmfReferenceModel } from '../services/etmf/tmf-completeness';
import {
  recordTmfArtifactFiling,
  listTmfArtifacts,
  removeTmfArtifactFiling,
  getTrialTmfCompleteness,
  TmfArtifactError,
} from '../services/etmf/tmf-artifact-persistence';
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('etmf-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function fail(res: Response, err: unknown): void {
  logger.error('etmf route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'eTMF request failed.' } });
}

interface Ctx { userId: number; organizationId: number }
function ctxOf(req: Request): Ctx | null {
  const r = req as any;
  const userId = Number(r.user?.id);
  const orgRaw = r.tenantContext?.organizationId ?? r.tenantId ?? r.user?.organizationId;
  const organizationId = Number(orgRaw);
  if (!Number.isInteger(userId) || userId <= 0 || !Number.isInteger(organizationId) || organizationId <= 0) return null;
  return { userId, organizationId };
}
function noAuth(res: Response) {
  return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required.' } });
}

/** The DIA TMF Reference Model (zones + artifacts) for a checklist. */
router.get('/reference-model', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ zones: getTmfReferenceModel() });
});

/**
 * Assess a trial's filed artifacts against the TMF Reference Model.
 * Body: { providedArtifacts: string[], scope?: 'essential'|'all' }.
 */
router.post('/completeness', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!Array.isArray(b.providedArtifacts)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'providedArtifacts[] is required.' } });
  }
  try {
    res.json(assessTmfCompleteness({ providedArtifacts: b.providedArtifacts, scope: b.scope }));
  } catch (err) {
    fail(res, err);
  }
});

// ── Persisted per-trial TMF artifacts ─────────────────────────────────────────

/** File (or re-file) a TMF artifact for a trial. Body: { artifactCode, documentRef? }. */
router.post('/trials/:trialId/artifacts', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.artifactCode) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'artifactCode is required.' } });
  }
  try {
    const row = await recordTmfArtifactFiling({ trialId, artifactCode: String(b.artifactCode), documentRef: b.documentRef }, ctx);
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof TmfArtifactError) return res.status(400).json({ error: { code: err.code, message: err.message } });
    fail(res, err);
  }
});

/** List a trial's filed TMF artifacts. */
router.get('/trials/:trialId/artifacts', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  try {
    res.json(await listTmfArtifacts(trialId, ctx));
  } catch (err) {
    fail(res, err);
  }
});

/** Inspection-readiness for a trial computed from its stored artifacts. ?scope=essential|all. */
router.get('/trials/:trialId/completeness', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const trialId = String(Array.isArray(req.params.trialId) ? req.params.trialId[0] : req.params.trialId);
  const scope = req.query.scope === 'all' ? 'all' : 'essential';
  try {
    res.json(await getTrialTmfCompleteness(trialId, ctx, scope));
  } catch (err) {
    fail(res, err);
  }
});

/** Remove a filed TMF artifact. */
router.delete('/artifacts/:id', limiter, requireRole(AUTHOR), async (req: Request, res: Response) => {
  const ctx = ctxOf(req);
  if (!ctx) return noAuth(res);
  const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  try {
    await removeTmfArtifactFiling(id, ctx);
    res.status(204).end();
  } catch (err) {
    if (err instanceof TmfArtifactError) return res.status(404).json({ error: { code: err.code, message: err.message } });
    fail(res, err);
  }
});

export default router;
