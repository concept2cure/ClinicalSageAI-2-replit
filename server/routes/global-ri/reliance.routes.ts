/** Global RI — Reliance / work-sharing / collaborative registration pathways. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR, fail } from './_shared';
import { RELIANCE_PATHWAYS, RELIANCE_PATHWAY_IDS, getReliancePathway, recommendReliancePathways } from '../../services/global-ri/reliance-pathways';

const router = Router();

/** The catalog of international reliance pathways (ids + full entries). */
router.get('/reliance-pathways', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ ids: RELIANCE_PATHWAY_IDS, pathways: RELIANCE_PATHWAYS });
});

/** A single reliance pathway by id. */
router.get('/reliance-pathways/:id', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const id = String(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const pathway = getReliancePathway(id);
  if (!pathway) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No reliance pathway "${id}".` } });
  }
  res.json(pathway);
});

/**
 * Recommend reliance pathways for a program profile.
 * Body: { isOncology?, targetMarkets?, globalHealth? }.
 */
router.post('/reliance-pathways/recommend', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  try {
    res.json(recommendReliancePathways(b));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
