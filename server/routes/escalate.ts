/**
 * ESCALATE API Routes — Structured Escalation Framework
 * @module server/routes/escalate
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { escalateEngine } from '../services/escalate-engine';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('escalate-routes');

router.use(authMiddleware);

const EscalateSchema = z.object({
  issueType: z.string().min(1),
  description: z.string().min(1).max(5000),
  domain: z.enum(['clinical', 'cmc', 'safety', 'regulatory', 'labeling', 'nonclinical', 'statistical', 'operational']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  submissionType: z.string().min(1),
  submissionPhase: z.enum(['pre-submission', 'active-review', 'post-approval', 'amendment']).optional(),
  currentDeadline: z.string().optional(),
  affectedSections: z.array(z.string()).optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'escalate', timestamp: new Date().toISOString() });
});

router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const parsed = EscalateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await escalateEngine.evaluate(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`ESCALATE evaluation failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
