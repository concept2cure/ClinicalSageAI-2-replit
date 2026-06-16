/** Global RI — Cross-market labeling (PI / SmPC / package insert). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import { assessLabeling, getLabelingRequirements, type LabelMarket } from '../../services/global-ri/labeling-requirements';

const router = Router();

/** A market's required labeling sections. */
router.get('/labeling/requirements/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as LabelMarket;
  const sections = getLabelingRequirements(market);
  if (sections.length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No labeling requirements modeled for "${market}".` } });
  }
  res.json({ market, sections });
});

/** Assess provided labeling sections against a market's required set. Body: { market, providedSections }. */
router.post('/labeling/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market || !Array.isArray(b.providedSections)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market and providedSections[] are required.' } });
  }
  try {
    res.json(assessLabeling({ market: b.market, providedSections: b.providedSections }));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
