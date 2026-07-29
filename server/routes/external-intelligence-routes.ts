/**
 * External Intelligence API.
 *
 * Public surface for AnA's nightly scan of regulatory agencies and
 * study-methodology knowledge sources (SCDM, PubMed, medRxiv, …).
 *
 *   GET    /api/external-intelligence/digest?days=1
 *          The nightly digest: findings from the last N days grouped by
 *          regulatory body / knowledge category.
 *
 *   GET    /api/external-intelligence/findings?days=7&regulatoryBody=FDA&sourceType=academic&limit=25
 *          Raw findings with optional filters.
 *
 *   GET    /api/external-intelligence/sources
 *          The active source registry (built-ins + env-configured extras).
 *
 *   POST   /api/external-intelligence/run
 *          Trigger a sweep on demand (the cron runs nightly regardless).
 *
 * Mounted behind authenticateToken in register-advanced-platform-routes.
 *
 * @module server/routes/external-intelligence-routes
 */

import { Router, type Request, type Response } from 'express';
import { createScopedLogger } from '../utils/logger.js';
import {
  runExternalIntelligenceSweep,
  getRecentFindings,
  buildDigest,
  getExternalIntelSources,
} from '../services/external-intelligence/index.js';

const logger = createScopedLogger('external-intel-api');
const router = Router();

router.get('/digest', async (req: Request, res: Response) => {
  try {
    const days = Math.max(1, Math.min(31, Number(req.query.days) || 1));
    const digest = await buildDigest(days);
    res.json({ success: true, ...digest });
  } catch (err: any) {
    logger.error(`digest failed: ${err?.message}`);
    res.status(500).json({ success: false, error: 'Failed to build digest' });
  }
});

router.get('/findings', async (req: Request, res: Response) => {
  try {
    const findings = await getRecentFindings({
      days: Math.max(1, Math.min(90, Number(req.query.days) || 7)),
      limit: Math.max(1, Math.min(100, Number(req.query.limit) || 25)),
      regulatoryBody:
        typeof req.query.regulatoryBody === 'string' ? req.query.regulatoryBody : null,
      sourceType: typeof req.query.sourceType === 'string' ? req.query.sourceType : null,
    });
    res.json({ success: true, count: findings.length, findings });
  } catch (err: any) {
    logger.error(`findings failed: ${err?.message}`);
    res.status(500).json({ success: false, error: 'Failed to load findings' });
  }
});

router.get('/sources', (_req: Request, res: Response) => {
  const sources = getExternalIntelSources().map(({ key, name, sourceType, market, regulatoryBody }) => ({
    key,
    name,
    sourceType,
    market,
    regulatoryBody,
  }));
  res.json({ success: true, count: sources.length, sources });
});

router.post('/run', async (_req: Request, res: Response) => {
  try {
    const result = await runExternalIntelligenceSweep();
    res.json({ success: true, ...result });
  } catch (err: any) {
    logger.error(`on-demand sweep failed: ${err?.message}`);
    res.status(500).json({ success: false, error: 'Sweep failed' });
  }
});

export default router;
