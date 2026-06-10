/**
 * Human factors API (IEC 62366-1) — HFE/UE file completeness and use-related
 * risk analysis. Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  assessHfeCompleteness,
  analyzeUseRelatedRisk,
} from '../services/regulatory/human-factors';

const logger = createScopedLogger('human-factors');
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
  '/hfe-completeness',
  author,
  handle(
    z.object({
      useSpecification: z.boolean().optional(),
      userProfiles: z.boolean().optional(),
      useEnvironments: z.boolean().optional(),
      userInterfaceCharacteristics: z.boolean().optional(),
      knownUseProblems: z.boolean().optional(),
      hazardRelatedUseScenarios: z.boolean().optional(),
      criticalTasks: z.boolean().optional(),
      formativeEvaluation: z.boolean().optional(),
      summativeEvaluation: z.boolean().optional(),
      hfeUeReport: z.boolean().optional(),
    }),
    input => assessHfeCompleteness(input)
  )
);

router.post(
  '/use-related-risk',
  author,
  handle(
    z.object({
      scenarios: z
        .array(
          z.object({
            task: z.string().min(1),
            useError: z.string(),
            potentialHarmSeverity: z.enum(['negligible', 'minor', 'serious', 'critical']),
            mitigated: z.boolean(),
          })
        )
        .min(1),
    }),
    input => analyzeUseRelatedRisk(input.scenarios)
  )
);

logger.info('Human factors routes initialised');

export default router;
