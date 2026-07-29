/** Global RI — Pediatric study-plan obligations (PREA iPSP / EMA PIP). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getPediatricObligation, assessPediatricPlan, PEDIATRIC_MARKETS, type PediatricMarket } from '../../services/global-ri/pediatric-requirements';

const router = Router();

/** A market's pediatric study-plan obligation reference. */
router.get('/pediatric/obligation/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as PediatricMarket;
  if (!PEDIATRIC_MARKETS.includes(market)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No pediatric obligation modeled for "${market}".` } });
  }
  res.json({ market, obligation: getPediatricObligation(market) });
});

/**
 * Assess a product's pediatric study-plan status for a market.
 * Body: { market, triggersRequirement?, planSubmitted?, waiverRequested?, deferralRequested? }.
 */
router.post('/pediatric/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(assessPediatricPlan(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

export default router;
