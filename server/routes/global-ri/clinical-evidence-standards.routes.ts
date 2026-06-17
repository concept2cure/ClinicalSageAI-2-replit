/** Global RI — standard of evidence for efficacy (substantial evidence). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getEvidenceStandard,
  getControlTypes,
  EVIDENCE_REGIONS,
  type EvidenceRegion,
} from '../../services/global-ri/clinical-evidence-standards';

const router = Router();

/** A region's standard of evidence for efficacy. */
router.get('/clinical-evidence/standard/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as EvidenceRegion;
  if (!EVIDENCE_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No evidence standard modeled for "${region}".` } });
  }
  res.json({ regions: EVIDENCE_REGIONS, ...getEvidenceStandard(region) });
});

/** The control types for adequate and well-controlled studies (21 CFR 314.126(b)(2)). */
router.get('/clinical-evidence/control-types', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getControlTypes());
});

export default router;
