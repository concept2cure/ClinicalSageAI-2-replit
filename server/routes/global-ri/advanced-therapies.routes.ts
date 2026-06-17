/** Global RI — advanced therapies (ATMP / cell & gene therapy / regenerative medicine). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getAdvancedTherapyFramework,
  classifyAdvancedTherapy,
  ADVANCED_THERAPY_REGIONS,
  type AdvancedTherapyRegion,
} from '../../services/global-ri/advanced-therapies';

const router = Router();

/** A region's advanced-therapy regulatory framework. */
router.get('/advanced-therapies/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as AdvancedTherapyRegion;
  if (!ADVANCED_THERAPY_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No advanced-therapy framework modeled for "${region}".` } });
  }
  res.json({ regions: ADVANCED_THERAPY_REGIONS, ...getAdvancedTherapyFramework(region) });
});

/** Classify an advanced therapy. Body: { region, modality }. */
router.post('/advanced-therapies/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !b.modality) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and modality are required.' } });
  }
  try {
    res.json(classifyAdvancedTherapy({ region: b.region, modality: b.modality }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid input.' } });
  }
});

export default router;
