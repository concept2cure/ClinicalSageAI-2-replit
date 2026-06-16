/** Global RI — Clinical-trial-application requirements (IND / CTA / CTN). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import { assessCtaReadiness, getCtaRequirements, type CtaMarket } from '../../services/global-ri/clinical-trial-application-requirements';

const router = Router();

/** A market's required clinical-trial-application components. */
router.get('/cta/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as CtaMarket;
  const requirements = getCtaRequirements(market);
  if (requirements.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No CTA requirements modeled for "${market}".` } });
  }
  res.json({ market, requirements });
});

/** Assess CTA readiness for a market. Body: { market, providedComponents }. */
router.post('/cta/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedComponents)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedComponents[] are required.' } });
  }
  try {
    res.json(assessCtaReadiness({ market: b.market, providedComponents: b.providedComponents }));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
