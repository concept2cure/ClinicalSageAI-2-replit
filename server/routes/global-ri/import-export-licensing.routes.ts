/** Global RI — import/export licensing for medicinal products. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getImportExportRequirements,
  getImportExportMatrix,
  IE_REGIONS,
  IE_CATEGORIES,
  type IERegion,
} from '../../services/global-ri/import-export-licensing';

const router = Router();

/** A region's import/export authorisation matrix (all categories). */
router.get('/import-export/matrix/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as IERegion;
  if (!IE_REGIONS.includes(region)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No import/export matrix modeled for "${region}".` } });
  }
  res.json({ regions: IE_REGIONS, categoryIds: IE_CATEGORIES, ...getImportExportMatrix(region) });
});

/**
 * Import/export requirements for a region + product category.
 * Body: { region, category, direction? }.
 */
router.post('/import-export/requirements', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !b.category) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region and category are required.' } });
  }
  try {
    res.json(getImportExportRequirements({ region: b.region, category: b.category, direction: b.direction }));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region/category.' } });
  }
});

export default router;
