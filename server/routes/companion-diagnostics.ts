/**
 * Companion-diagnostics API — drug↔Dx co-development readiness and linkage.
 * Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import { assessCdxReadiness } from '../services/regulatory/companion-diagnostics';

const logger = createScopedLogger('companion-diagnostics');
const router = Router();
const author = requireRole('regulatory-author');

router.post('/readiness', author, (req: Request, res: Response) => {
  const schema = z.object({
    therapeuticProductIdentified: z.boolean().optional(),
    diagnosticDeviceIdentified: z.boolean().optional(),
    biomarkerDefined: z.boolean().optional(),
    intendedUseAlignment: z.boolean().optional(),
    analyticalValidation: z.boolean().optional(),
    clinicalValidation: z.boolean().optional(),
    labelingCrossReference: z.boolean().optional(),
    contemporaneousReview: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: { code: 'VALIDATION', message: 'Invalid request body.', details: parsed.error.flatten() } });
  }
  return res.json({ result: assessCdxReadiness(parsed.data) });
});

logger.info('Companion-diagnostics routes initialised');

export default router;
