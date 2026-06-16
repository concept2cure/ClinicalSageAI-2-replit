/** Global RI — Inspection readiness (PAI / GMP / BIMO). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getInspectionProfile, getReadinessDomains, assessInspectionReadiness, INSPECTION_MARKETS, type InspectionMarket } from '../../services/global-ri/inspection-readiness';

const router = Router();

/** A market's inspection profile (inspection types + readiness domains). */
router.get('/inspection/profile/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as InspectionMarket;
  if (getReadinessDomains(market).length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No inspection profile modeled for "${market}".` } });
  }
  res.json({ market, markets: INSPECTION_MARKETS, profile: getInspectionProfile(market) });
});

/**
 * Assess inspection readiness against a market's required readiness domains.
 * Body: { market, providedDomains: string[] }.
 */
router.post('/inspection/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedDomains)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedDomains[] are required.' } });
  }
  try {
    res.json(assessInspectionReadiness({ market: b.market, providedDomains: b.providedDomains }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

export default router;
