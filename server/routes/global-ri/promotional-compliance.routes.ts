/** Global RI — prescription-medicine promotion & advertising compliance. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getPromotionalRules,
  getPromotionalRuleIds,
  assessPromotionalReadiness,
  PROMO_REGIONS,
  type PromoRegion,
} from '../../services/global-ri/promotional-compliance';

const router = Router();

/** A region's promotional/advertising rules. */
router.get('/promotional-compliance/rules/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as PromoRegion;
  if (getPromotionalRuleIds(region).length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No promotional rules modeled for "${region}".` } });
  }
  res.json({ regions: PROMO_REGIONS, ...getPromotionalRules(region) });
});

/** Assess promotional-control readiness. Body: { region, providedControls }. */
router.post('/promotional-compliance/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !Array.isArray(b.providedControls)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and providedControls[] are required.' } });
  }
  try {
    res.json(assessPromotionalReadiness({ region: b.region, providedControls: b.providedControls }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

export default router;
