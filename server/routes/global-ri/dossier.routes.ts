/** Global RI — Marketing-application legal-basis / dossier-type classifier. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { classifyDossier, getLegalBases, type DossierRegion } from '../../services/global-ri/dossier-classifier';

const router = Router();

/** The modeled legal bases for a region (reference catalog). */
router.get('/dossier/legal-bases/:region', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const region = String(Array.isArray(req.params.region) ? req.params.region[0] : req.params.region) as DossierRegion;
  const legalBases = getLegalBases(region);
  if (!legalBases) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No legal bases modeled for region "${region}".` } });
  }
  res.json({ region, legalBases });
});

/**
 * Classify a product's marketing-application legal basis for a region.
 * Body: { region, isBiologic?, referencesApprovedProduct?, reliesOnOthersData?, differsFromReference?, ... }.
 */
router.post('/dossier/classify', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region is required.' } });
  }
  try {
    res.json(classifyDossier(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region.' } });
  }
});

export default router;
