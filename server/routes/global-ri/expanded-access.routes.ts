/** Global RI — pre-approval access (expanded access / compassionate use / named patient). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getExpandedAccessFramework,
  recommendExpandedAccessMechanism,
  EXPANDED_ACCESS_REGIONS,
  type ExpandedAccessRegion,
} from '../../services/global-ri/expanded-access';

const router = Router();

/** A region's pre-approval access framework. */
router.get('/expanded-access/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as ExpandedAccessRegion;
  if (!EXPANDED_ACCESS_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No expanded-access framework modeled for "${region}".` } });
  }
  res.json({ regions: EXPANDED_ACCESS_REGIONS, ...getExpandedAccessFramework(region) });
});

/** Recommend the access mechanism for a population size. Body: { region, populationSize }. */
router.post('/expanded-access/recommend', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !b.populationSize) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and populationSize are required.' } });
  }
  try {
    res.json(recommendExpandedAccessMechanism({ region: b.region, populationSize: b.populationSize }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid input.' } });
  }
});

export default router;
