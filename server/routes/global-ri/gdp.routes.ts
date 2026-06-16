/** Global RI — Good Distribution Practice (EU GDP) & supply-chain security (US DSCSA). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getGdpFramework,
  getGdpElements,
  assessGdpReadiness,
  GDP_REGIONS,
  type GdpRegion,
} from '../../services/global-ri/gdp-distribution';

const router = Router();

/** A region's GDP / supply-chain-security framework. */
router.get('/gdp/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as GdpRegion;
  if (getGdpElements(region).length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No GDP framework modeled for "${region}".` } });
  }
  res.json({ region, regions: GDP_REGIONS, framework: getGdpFramework(region) });
});

/** Assess GDP readiness against a region's required elements. Body: { region, providedElements }. */
router.post('/gdp/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !Array.isArray(b.providedElements)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and providedElements[] are required.' } });
  }
  try {
    res.json(assessGdpReadiness({ region: b.region, providedElements: b.providedElements }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

export default router;
