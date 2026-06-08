/**
 * Substantial-equivalence API — runs the FDA 510(k) SE decision flowchart and
 * compares technological characteristics. Pure, deterministic; role-gated and
 * Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  evaluateSubstantialEquivalence,
  compareTechnologicalCharacteristics,
} from '../services/regulatory/substantial-equivalence';

const logger = createScopedLogger('substantial-equivalence');
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
  '/evaluate',
  author,
  handle(
    z.object({
      sameIntendedUse: z.boolean(),
      sameTechnologicalCharacteristics: z.boolean(),
      differencesRaiseNewQuestions: z.boolean().optional(),
      performanceDataSupportsEquivalence: z.boolean().nullable().optional(),
    }),
    input => evaluateSubstantialEquivalence(input)
  )
);

router.post(
  '/compare-characteristics',
  author,
  handle(
    z.object({
      characteristics: z
        .array(
          z.object({
            name: z.string().min(1),
            subjectValue: z.string(),
            predicateValue: z.string(),
          })
        )
        .min(1),
    }),
    input => compareTechnologicalCharacteristics(input.characteristics)
  )
);

logger.info('Substantial-equivalence routes initialised');

export default router;
