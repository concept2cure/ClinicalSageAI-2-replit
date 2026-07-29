/** Global RI — Combination-product / drug-device classification. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getCombinationFramework, classifyCombinationProduct, COMBINATION_REGIONS, type CombinationRegion } from '../../services/global-ri/combination-product-classification';

const router = Router();

/** A region's combination-product classification framework. */
router.get('/combination/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as CombinationRegion;
  if (!COMBINATION_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No combination-product framework modeled for "${region}".` } });
  }
  res.json({ region, framework: getCombinationFramework(region) });
});

/**
 * Classify a combination product to its lead authority / regulatory route.
 * Body: { region, primaryModeOfAction?, integral? }.
 */
router.post('/combination/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region is required.' } });
  }
  try {
    res.json(classifyCombinationProduct(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

export default router;
