/** Global RI — Pharmacovigilance obligations. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getPvObligations, getPvElements, assessPvReadiness, PV_MARKETS, type PvMarket } from '../../services/global-ri/pharmacovigilance-obligations';

const router = Router();

/** A market's post-approval pharmacovigilance obligations. */
router.get('/pharmacovigilance/obligations/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as PvMarket;
  if (getPvElements(market).length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No pharmacovigilance obligations modeled for "${market}".` } });
  }
  res.json({ market, markets: PV_MARKETS, obligations: getPvObligations(market) });
});

/** Assess PV readiness against a market's required elements. Body: { market, providedElements }. */
router.post('/pharmacovigilance/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedElements)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedElements[] are required.' } });
  }
  try {
    res.json(assessPvReadiness({ market: b.market, providedElements: b.providedElements }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

export default router;
