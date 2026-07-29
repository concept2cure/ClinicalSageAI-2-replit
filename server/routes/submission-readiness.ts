/**
 * Submission-readiness API — composes per-domain readiness scores into a single
 * pathway readiness scorecard. Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  assessSubmissionReadiness,
  PATHWAY_DOMAINS,
} from '../services/regulatory/submission-readiness';

const logger = createScopedLogger('submission-readiness');
const router = Router();
const author = requireRole('regulatory-author');

const score = z.number().min(0).max(1);

router.post('/assess', author, (req: Request, res: Response) => {
  const schema = z.object({
    pathway: z.enum(['510k', 'ivd-510k', 'de-novo', 'pma', 'cdx', 'eu-ivdr']),
    domainScores: z
      .object({
        substantialEquivalence: score.optional(),
        analyticalPerformance: score.optional(),
        clinicalPerformance: score.optional(),
        cybersecurity: score.optional(),
        humanFactors: score.optional(),
        udiGudid: score.optional(),
        samdClassification: score.optional(),
        ivdrPerformanceEvaluation: score.optional(),
        companionDiagnostics: score.optional(),
        postMarketPlan: score.optional(),
        labelingSpl: score.optional(),
      })
      .default({}),
    completeThreshold: score.optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: 'Invalid request body.', details: parsed.error.flatten() } });
  }
  try {
    return res.json({ result: assessSubmissionReadiness(parsed.data) });
  } catch (err) {
    return res
      .status(400)
      .json({ error: { code: 'COMPUTATION', message: err instanceof Error ? err.message : 'Computation failed.' } });
  }
});

// Discover which domains a pathway requires.
router.get('/pathways', author, (_req: Request, res: Response) => {
  return res.json({ result: PATHWAY_DOMAINS });
});

logger.info('Submission-readiness routes initialised');

export default router;
