/** Global RI — Post-approval changes / variations. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { classifyChange, getChangeVehicles, CHANGE_CATEGORIES, type ChangeMarket } from '../../services/global-ri/post-approval-changes';

const router = Router();

/** The modeled change-category list + a market's change-vehicle catalog. */
router.get('/changes/vehicles/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as ChangeMarket;
  const vehicles = getChangeVehicles(market);
  if (!vehicles) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No change vehicles modeled for "${market}".` } });
  }
  res.json({ market, categories: CHANGE_CATEGORIES, vehicles });
});

/**
 * Classify a post-approval change into the correct regulatory vehicle.
 * Body: { market, category }.
 */
router.post('/changes/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.category) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and category are required.' } });
  }
  try {
    res.json(classifyChange({ market: b.market, category: b.category }));
  } catch (err) {
    // Unmodeled market/category → 400 validation.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid change.' } });
  }
});

export default router;
