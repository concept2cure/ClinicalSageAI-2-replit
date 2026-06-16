/** Global RI — Regulatory fee estimation. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import { estimateFees, getFeeSchedule, type FeeMarket } from '../../services/global-ri/regulatory-fee-estimator';

const router = Router();

/** A market's indicative fee schedule. */
router.get('/fees/schedule/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as FeeMarket;
  const schedule = getFeeSchedule(market);
  if (!schedule) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No fee schedule modeled for "${market}".` } });
  }
  res.json({ market, schedule });
});

/**
 * Estimate agency fees for a marketing application, applying waivers.
 * Body: { market, requiresClinicalData?, orphan?, smallBusiness?, programYears?, feeScheduleOverride? }.
 */
router.post('/fees/estimate', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(estimateFees(b));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
