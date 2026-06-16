/** Global RI — Lifecycle periodic-obligations calendar. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getLifecycleObligations, computeObligationSchedule, LIFECYCLE_MARKETS, type Market as LifecycleMarket } from '../../services/global-ri/lifecycle-obligations-calendar';

const router = Router();

/** A market's recurring post-approval lifecycle obligations. */
router.get('/lifecycle/obligations/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as LifecycleMarket;
  if (!LIFECYCLE_MARKETS.includes(market)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No lifecycle obligations modeled for "${market}".` } });
  }
  res.json(getLifecycleObligations(market));
});

/**
 * Compute the post-approval obligation deadline schedule from an approval date.
 * Body: { market, approvalDate, horizonMonths? }.
 */
router.post('/lifecycle/schedule', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.approvalDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and approvalDate are required.' } });
  }
  try {
    res.json(computeObligationSchedule(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid lifecycle request.' } });
  }
});

export default router;
