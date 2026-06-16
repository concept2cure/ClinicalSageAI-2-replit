/** Global RI — Nonclinical requirements (ICH M3(R2)). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getNonclinicalRequirements, recommendToxDuration, NONCLINICAL_PHASES, type NonclinicalPhase } from '../../services/global-ri/nonclinical-requirements';

const router = Router();

/** The nonclinical package generally expected to support a clinical phase. */
router.get('/nonclinical/requirements/:phase', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const phase = String(Array.isArray(req.params.phase) ? req.params.phase[0] : req.params.phase) as NonclinicalPhase;
  if (!NONCLINICAL_PHASES.includes(phase)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No nonclinical requirements modeled for phase "${phase}".` } });
  }
  res.json(getNonclinicalRequirements(phase));
});

/**
 * Recommend the minimum repeat-dose toxicity study duration for an intended
 * clinical-trial dosing duration (ICH M3(R2) Table 1). Body: { clinicalDurationDays }.
 */
router.post('/nonclinical/tox-duration', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (typeof b.clinicalDurationDays !== 'number') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'clinicalDurationDays (number) is required.' } });
  }
  try {
    res.json(recommendToxDuration(b.clinicalDurationDays));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid clinicalDurationDays.' } });
  }
});

export default router;
