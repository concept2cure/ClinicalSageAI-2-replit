/** Global RI — Regulatory strategy brief (cross-market orchestration). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import { buildStrategyBrief } from '../../services/global-ri/regulatory-strategy-brief';

const router = Router();

/**
 * Build a cross-market regulatory strategy brief: pathway + designations +
 * expedited programs + HA meetings + Module 1 per target market.
 * Body: { productType, targetMarkets, developmentPhase?, nextMilestone?, disease?, pediatricDevelopment? }.
 */
router.post('/strategy-brief', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.productType || !Array.isArray(b.targetMarkets)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'productType and targetMarkets[] are required.' } });
  }
  try {
    res.json(buildStrategyBrief(b));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
