/**
 * Cross-Jurisdictional Intelligence API Routes
 * @module server/routes/cross-jurisdictional
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { crossJurisdictionalEngine } from '../services/cross-jurisdictional-intelligence';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('cross-jurisdictional-routes');

router.use(authMiddleware);

const AnalyzeSchema = z.object({
  submissionType: z.string().min(1),
  therapeuticArea: z.string().optional(),
  indication: z.string().optional(),
  targetAgencies: z.array(z.string()).optional(),
  productType: z.string().optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'cross-jurisdictional-intelligence', timestamp: new Date().toISOString() });
});

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await crossJurisdictionalEngine.analyze(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`Cross-jurisdictional analysis failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
