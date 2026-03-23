/**
 * HARMONIZE API Routes — Cross-Module Consistency Enforcement
 * @module server/routes/harmonize
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { harmonizeEngine } from '../services/harmonize-engine';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('harmonize-routes');

router.use(authMiddleware);

const HarmonizeSchema = z.object({
  sections: z.record(z.string(), z.string()),
  submissionType: z.string().min(1),
  productName: z.string().optional(),
  activeIngredient: z.string().optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'harmonize', timestamp: new Date().toISOString() });
});

router.post('/check', async (req: Request, res: Response) => {
  try {
    const parsed = HarmonizeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await harmonizeEngine.check(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`HARMONIZE check failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
