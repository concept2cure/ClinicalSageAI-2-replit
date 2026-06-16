/** Global RI — CMC stability requirements (ICH Q1A(R2)). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { CLIMATIC_ZONES, STORAGE_CONDITIONS, getClimaticZone, getStabilityConditions, getStudyDesign, type StorageCondition } from '../../services/global-ri/stability-requirements';

const router = Router();

/** The WHO/ICH climatic zones. */
router.get('/stability/zones', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ zones: CLIMATIC_ZONES, storageConditions: STORAGE_CONDITIONS });
});

/** A single climatic zone by id (I, II, III, IVa, IVb). */
router.get('/stability/zones/:zone', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const zone = String(Array.isArray(req.params.zone) ? req.params.zone[0] : req.params.zone);
  const z = getClimaticZone(zone);
  if (!z) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No climatic zone "${zone}".` } });
  }
  res.json(z);
});

/** Stability storage conditions for a storage class (room/refrigerated/frozen). */
router.get('/stability/conditions/:storageCondition', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const sc = String(Array.isArray(req.params.storageCondition) ? req.params.storageCondition[0] : req.params.storageCondition) as StorageCondition;
  try {
    res.json(getStabilityConditions(sc));
  } catch (err) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: err instanceof Error ? err.message : 'Unknown storage condition.' } });
  }
});

/** The ICH Q1A(R2) stability study design (batches, time points, frequency). */
router.get('/stability/study-design', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json(getStudyDesign());
});

export default router;
