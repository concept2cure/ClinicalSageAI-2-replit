/** Global RI — investigational (clinical-trial) expedited safety reporting (ICH E2). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getSafetyReportingTimelines,
  classifySafetyReport,
  SAFETY_REGIONS,
  type SafetyRegion,
} from '../../services/global-ri/clinical-safety-reporting';

const router = Router();

/** A region's expedited + periodic clinical-trial safety reporting timelines. */
router.get('/safety-reporting/timelines/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as SafetyRegion;
  if (!SAFETY_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No safety-reporting timelines modeled for "${region}".` } });
  }
  res.json({ region, regions: SAFETY_REGIONS, timelines: getSafetyReportingTimelines(region) });
});

/**
 * Classify an adverse event for expedited reportability + timeline.
 * Body: { region, serious?, unexpected?, suspectedCausality?, fatalOrLifeThreatening? }.
 */
router.post('/safety-reporting/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region is required.' } });
  }
  try {
    res.json(classifySafetyReport(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

export default router;
