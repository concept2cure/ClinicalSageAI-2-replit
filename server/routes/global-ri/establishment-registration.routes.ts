/** Global RI — manufacturer/establishment registration & drug listing. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getEstablishmentFramework,
  getEstablishmentElements,
  assessEstablishmentReadiness,
  ESTABLISHMENT_REGIONS,
  type EstablishmentRegion,
} from '../../services/global-ri/establishment-registration';

const router = Router();

/** A region's establishment-registration framework. */
router.get('/establishment/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as EstablishmentRegion;
  if (getEstablishmentElements(region).length === 0) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No establishment framework modeled for "${region}".` } });
  }
  res.json({ regions: ESTABLISHMENT_REGIONS, ...getEstablishmentFramework(region) });
});

/** Assess establishment-registration readiness. Body: { region, providedElements }. */
router.post('/establishment/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !Array.isArray(b.providedElements)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and providedElements[] are required.' } });
  }
  try {
    res.json(assessEstablishmentReadiness({ region: b.region, providedElements: b.providedElements }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

export default router;
