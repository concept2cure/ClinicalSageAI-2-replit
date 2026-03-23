/**
 * AnA Continuous Evaluation Loop API Routes
 * @module server/routes/ana-continuous-eval
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { continuousEvalEngine } from '../services/ana-continuous-eval';
import { authMiddleware } from '../auth.js';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('ana-continuous-eval-routes');

router.use(authMiddleware);

const EvalSchema = z.object({
  sectionId: z.string().min(1),
  content: z.string().min(1),
  submissionType: z.string().min(1),
  targetAgency: z.string().optional(),
  projectId: z.string().optional(),
  persist: z.boolean().optional(),
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'ana-continuous-eval', timestamp: new Date().toISOString() });
});

/** Run continuous evaluation checkpoint */
router.post('/evaluate', async (req: Request, res: Response) => {
  try {
    const parsed = EvalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Validation failed', details: parsed.error.issues });
    }
    const result = await continuousEvalEngine.evaluate(parsed.data);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`Continuous eval failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Get project quality summary */
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!projectId) {
      return res.status(400).json({ success: false, error: 'projectId is required' });
    }
    const result = await continuousEvalEngine.getProjectSummary(projectId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    log.error(`Project summary failed: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
