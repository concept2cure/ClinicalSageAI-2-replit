/** Global RI — medical device & IVD risk classification + market pathway. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getDeviceFramework,
  classifyDevicePathway,
  DEVICE_REGIONS,
  type DeviceRegion,
} from '../../services/global-ri/device-classification';

const router = Router();

/** A region's device/IVD risk-classification framework. */
router.get('/device/framework/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as DeviceRegion;
  if (!DEVICE_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No device framework modeled for "${region}".` } });
  }
  res.json({ region, regions: DEVICE_REGIONS, framework: getDeviceFramework(region) });
});

/**
 * Classify a device class to its conformity-assessment pathway.
 * Body: { region, deviceClass }.
 */
router.post('/device/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !b.deviceClass) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and deviceClass are required.' } });
  }
  try {
    res.json(classifyDevicePathway({ region: b.region, deviceClass: b.deviceClass }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region/class.' } });
  }
});

export default router;
