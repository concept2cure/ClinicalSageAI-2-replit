/**
 * Device software classification API — IMDRF SaMD risk categorization and
 * IEC 62304 software safety classification. Pure, deterministic, standards-
 * grounded; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  categorizeSamd,
  classifyIec62304,
} from '../services/regulatory/samd-classification';

const logger = createScopedLogger('device-classification');
const router = Router();
const author = requireRole('regulatory-author');

function handle<T>(schema: z.ZodType<T>, compute: (input: T) => unknown) {
  return (req: Request, res: Response) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION', message: 'Invalid request body.', details: parsed.error.flatten() } });
    }
    try {
      return res.json({ result: compute(parsed.data) });
    } catch (err) {
      return res
        .status(400)
        .json({ error: { code: 'COMPUTATION', message: err instanceof Error ? err.message : 'Computation failed.' } });
    }
  };
}

router.post(
  '/samd-risk',
  author,
  handle(
    z.object({
      healthcareSituation: z.enum(['critical', 'serious', 'non-serious']),
      significance: z.enum(['treat-or-diagnose', 'drive', 'inform']),
    }),
    input => categorizeSamd(input)
  )
);

router.post(
  '/iec62304-class',
  author,
  handle(
    z.object({
      canContributeToHazard: z.boolean(),
      harmSeverityAfterExternalControls: z.enum(['none', 'non-serious', 'serious-or-death']),
    }),
    input => classifyIec62304(input)
  )
);

logger.info('Device classification routes initialised');

export default router;
