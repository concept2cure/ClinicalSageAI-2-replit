/** Global RI — bioequivalence acceptance criteria & BCS biowaivers (ICH M9). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getBioequivalenceCriteria,
  getBcsBiowaiverEligibility,
  BE_REGIONS,
  BCS_CLASSES,
  type BeRegion,
  type BcsClass,
} from '../../services/global-ri/bioequivalence-requirements';

const router = Router();

/** Bioequivalence acceptance criteria for a region (FDA | EMA). */
router.get('/bioequivalence/criteria/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as BeRegion;
  if (!BE_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No bioequivalence criteria modeled for "${region}".` } });
  }
  res.json({ regions: BE_REGIONS, ...getBioequivalenceCriteria(region) });
});

/** BCS biowaiver eligibility for a BCS class (I | II | III | IV). */
router.get('/bioequivalence/biowaiver/:bcsClass', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const bcsClass = String(Array.isArray(req.params.bcsClass) ? req.params.bcsClass[0] : req.params.bcsClass) as BcsClass;
  if (!BCS_CLASSES.includes(bcsClass)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown BCS class "${bcsClass}" (expected I/II/III/IV).` } });
  }
  res.json({ bcsClasses: BCS_CLASSES, ...getBcsBiowaiverEligibility(bcsClass) });
});

export default router;
