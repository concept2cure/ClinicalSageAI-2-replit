/** Global RI — Clinical-trial disclosure (registration + results posting). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getDisclosureRequirements, computeDisclosureDeadlines, DISCLOSURE_MARKETS, type DisclosureMarket } from '../../services/global-ri/clinical-trial-disclosure';

const router = Router();

/** A market's clinical-trial registration & results-disclosure requirements. */
router.get('/disclosure/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as DisclosureMarket;
  if (!DISCLOSURE_MARKETS.includes(market)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No disclosure requirements modeled for "${market}".` } });
  }
  res.json({ market, markets: DISCLOSURE_MARKETS, requirements: getDisclosureRequirements(market) });
});

/**
 * Compute registration + results-posting deadlines for a trial.
 * Body: { market, firstEnrollmentDate?, primaryCompletionDate?, pediatric? }.
 */
router.post('/disclosure/deadlines', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(computeDisclosureDeadlines(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid disclosure request.' } });
  }
});

export default router;
