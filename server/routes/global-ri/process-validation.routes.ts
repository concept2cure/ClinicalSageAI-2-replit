/** Global RI — pharmaceutical process validation (FDA 3-stage / EU Annex 15). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getProcessValidationFramework,
  getValidationStage,
  PV_REGIONS,
  type PvRegion,
} from '../../services/global-ri/process-validation';

const router = Router();

/** A region's process-validation framework (stages + approaches). */
router.get('/process-validation/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as PvRegion;
  if (!PV_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No process-validation framework modeled for "${region}".` } });
  }
  res.json({ regions: PV_REGIONS, ...getProcessValidationFramework(region) });
});

/** A single validation stage by region + stage id. */
router.get('/process-validation/stage/:region/:stageId', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as PvRegion;
  const stageId = String(Array.isArray(req.params.stageId) ? req.params.stageId[0] : req.params.stageId);
  try {
    res.json(getValidationStage(region, stageId));
  } catch (err) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: err instanceof Error ? err.message : 'Unknown region/stage.' } });
  }
});

export default router;
