/** Global RI — Regional Module 1 requirements. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import {
  assessRegionalModule1,
  getRegionalModule1Requirements,
  type RegulatoryMarket,
} from '../../services/global-ri/regional-module1-requirements';

const router = Router();

/**
 * Assess a sponsor's Module 1 components against a market's required set.
 * Body: { market, providedComponents: string[] }.
 */
router.post('/module1/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedComponents)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedComponents[] are required.' } });
  }
  try {
    res.json(assessRegionalModule1({ market: b.market as RegulatoryMarket, providedComponents: b.providedComponents }));
  } catch (err) {
    fail(res, err);
  }
});

/** List a market's required Module 1 components (checklist). */
router.get('/module1/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as RegulatoryMarket;
  const requirements = getRegionalModule1Requirements(market);
  if (requirements.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No Module 1 requirements modeled for market "${market}".` } });
  }
  res.json({ market, requirements });
});

export default router;
