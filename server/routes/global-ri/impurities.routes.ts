/** Global RI — ICH Q3A/Q3B/Q3C/Q3D impurities thresholds & limits. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getDrugSubstanceThresholds,
  getDrugProductThresholds,
  getResidualSolvent,
  getElementalImpurityPDE,
  RESIDUAL_SOLVENTS,
  ELEMENTAL_IMPURITIES,
  type AdministrationRoute,
} from '../../services/global-ri/impurities-thresholds';

const router = Router();

/** Q3A(R2) drug-substance impurity thresholds. Query: ?maxDailyDoseMg=NUMBER */
router.get('/impurities/drug-substance', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const mdd = Number(req.query.maxDailyDoseMg);
  if (!Number.isFinite(mdd)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'maxDailyDoseMg (numeric query) is required.' } });
  }
  try {
    res.json(getDrugSubstanceThresholds(mdd));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid dose.' } });
  }
});

/** Q3B(R2) drug-product degradation-product thresholds. Query: ?maxDailyDoseMg=NUMBER */
router.get('/impurities/drug-product', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const mdd = Number(req.query.maxDailyDoseMg);
  if (!Number.isFinite(mdd)) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'maxDailyDoseMg (numeric query) is required.' } });
  }
  try {
    res.json(getDrugProductThresholds(mdd));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid dose.' } });
  }
});

/** Q3C(R8) residual-solvent catalog. */
router.get('/impurities/residual-solvents', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ solvents: RESIDUAL_SOLVENTS });
});

/** A single residual solvent by name (case-insensitive). 404 when unmodeled. */
router.get('/impurities/residual-solvents/:name', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const name = String(Array.isArray(req.params.name) ? req.params.name[0] : req.params.name);
  const solvent = getResidualSolvent(name);
  if (!solvent) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No residual solvent "${name}" modeled.` } });
  }
  res.json(solvent);
});

/** Q3D(R2) Class-1 elemental-impurity catalog. */
router.get('/impurities/elemental', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ elements: ELEMENTAL_IMPURITIES });
});

/** Elemental-impurity PDE for an element + route (?route=oral|parenteral|inhalation). */
router.get('/impurities/elemental/:element', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const element = String(Array.isArray(req.params.element) ? req.params.element[0] : req.params.element);
  const route = (typeof req.query.route === 'string' ? req.query.route : 'oral') as AdministrationRoute;
  try {
    const pde = getElementalImpurityPDE(element, route);
    if (!pde) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No elemental impurity "${element}" modeled.` } });
    }
    res.json(pde);
  } catch (err) {
    // Unmodeled route → 400 validation.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid route.' } });
  }
});

export default router;
