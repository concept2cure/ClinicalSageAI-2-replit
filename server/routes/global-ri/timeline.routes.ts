/** Global RI — Global review-timeline projection. */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { projectReviewTimeline } from '../../services/global-ri/global-review-timeline';

const router = Router();

/**
 * Project the regulatory review timeline for a region/procedure.
 * Body: { region, procedure, startDate }.
 */
router.post('/review-timeline', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.region || !b.procedure || !b.startDate) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'region, procedure and startDate are required.' } });
  }
  try {
    res.json(projectReviewTimeline({ region: b.region, procedure: String(b.procedure), startDate: b.startDate }));
  } catch (err) {
    // An unknown region/procedure throws — surface as a 400 validation error.
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid region/procedure.' } });
  }
});

export default router;
