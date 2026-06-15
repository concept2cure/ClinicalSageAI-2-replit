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
import { createScopedLogger } from '../utils/logger.js';

const logger = createScopedLogger('etmf-routes');
const router = Router();
const limiter = createRateLimiter();
const AUTHOR = 'regulatory-author';

function fail(res: Response, err: unknown): void {
  logger.error('etmf route error', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'eTMF request failed.' } });
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

export default router;
