/** Global RI — companion diagnostics (CDx) co-development. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getCompanionDiagnosticFramework,
  getCodevelopmentConsiderations,
  CDX_REGIONS,
  type CdxRegion,
} from '../../services/global-ri/companion-diagnostics';

const router = Router();

/** A region's companion-diagnostic regulatory framework. */
router.get('/companion-diagnostics/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as CdxRegion;
  if (!CDX_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No companion-diagnostic framework modeled for "${region}".` } });
  }
  res.json({ regions: CDX_REGIONS, ...getCompanionDiagnosticFramework(region) });
});

/** The region-neutral drug + CDx co-development checklist. */
router.get('/companion-diagnostics/codevelopment', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getCodevelopmentConsiderations());
});

export default router;
