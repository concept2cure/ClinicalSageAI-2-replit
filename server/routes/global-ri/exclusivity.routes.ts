/** Global RI — Regulatory exclusivity & loss-of-exclusivity (LOE). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { computeExclusivity, getExclusivityRules, PRODUCT_CLASSES, type ExclusivityMarket } from '../../services/global-ri/exclusivity-periods';

const router = Router();

/** A market's modeled exclusivity rules (base regime per product class + orphan). */
router.get('/exclusivity/rules/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as ExclusivityMarket;
  const rules = getExclusivityRules(market);
  if (!rules) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No exclusivity rules modeled for "${market}".` } });
  }
  res.json({ market, productClasses: PRODUCT_CLASSES, ...rules });
});

/**
 * Compute the binding regulatory exclusivity and project the LOE date.
 * Body: { market, productClass, orphan?, pediatricExtension?, approvalDate? }.
 */
router.post('/exclusivity/compute', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !b.productClass) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and productClass are required.' } });
  }
  try {
    res.json(computeExclusivity(b));
  } catch (err) {
    // Unmodeled market/class or invalid approvalDate → 400 validation.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid exclusivity request.' } });
  }
});

export default router;
