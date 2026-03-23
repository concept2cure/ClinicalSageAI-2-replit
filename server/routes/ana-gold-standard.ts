/**
 * AnA Gold Standard Pack API Routes
 * @module server/routes/ana-gold-standard
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { goldStandardEngine } from '../services/ana-gold-standard';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('ana-gold-standard-routes');

router.use(authMiddleware);

const EvaluateSchema = z.object({
  content: z.string().min(1),
  sectionId: z.string().min(1),
  submissionType: z.string().min(1),
  targetAgency: z.string().optional(),
  metadata: z.object({
    productName: z.string().optional(),
    indication: z.string().optional(),
    therapeuticArea: z.string().optional(),
    wordCount: z.number().optional(),
  }).optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'ana-gold-standard', timestamp: new Date().toISOString() });
});

router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const parsed = EvaluateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await goldStandardEngine.evaluate(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`Gold Standard evaluation failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
