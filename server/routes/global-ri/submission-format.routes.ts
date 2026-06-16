/** Global RI — Electronic submission format (eCTD / gateway / validation). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import { getSubmissionFormat, assessSubmissionReadiness, SUBMISSION_MARKETS, type SubmissionMarket } from '../../services/global-ri/electronic-submission-format';

const router = Router();

/** A market's electronic submission format + gateway + validation profile. */
router.get('/submission-format/:market', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const market = String(Array.isArray(req.params.market) ? req.params.market[0] : req.params.market) as SubmissionMarket;
  const format = getSubmissionFormat(market);
  if (!format) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `No submission format modeled for "${market}".` } });
  }
  res.json({ market, format, markets: SUBMISSION_MARKETS });
});

/**
 * Assess electronic-submission readiness for a market.
 * Body: { market, format?, gatewayEnrolled?, validationPassed? }.
 */
router.post('/submission-format/assess', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as any;
  if (!b.market) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'market is required.' } });
  }
  try {
    res.json(assessSubmissionReadiness(b));
  } catch (err) {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err instanceof Error ? err.message : 'Invalid market.' } });
  }
});

export default router;
