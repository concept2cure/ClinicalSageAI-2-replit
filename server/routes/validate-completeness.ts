/**
 * VALIDATE-COMPLETENESS API Routes
 * @module server/routes/validate-completeness
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { validateCompletenessEngine } from '../services/validate-completeness-engine';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('validate-completeness-routes');

router.use(authMiddleware);

const ValidateSchema = z.object({
  submissionType: z.string().min(1),
  presentSections: z.array(z.string()),
  sectionScores: z.record(z.string(), z.number()).optional(),
  harmonizeIssueCount: z.number().int().min(0).optional(),
  openEscalations: z.number().int().min(0).optional(),
  targetAgency: z.string().optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'validate-completeness', timestamp: new Date().toISOString() });
});

router.post('/validate', async (req: Request, res: Response) => {
  try {
    const parsed = ValidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await validateCompletenessEngine.validate(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`VALIDATE-COMPLETENESS failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
