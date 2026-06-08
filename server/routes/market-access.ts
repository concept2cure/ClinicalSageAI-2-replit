/**
 * Market access / reimbursement API — procedure-code classification and
 * coverage-evidence dossier completeness. Pure, deterministic; role-gated and
 * Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  classifyProcedureCode,
  assessCoverageDossierCompleteness,
} from '../services/regulatory/market-access';

const logger = createScopedLogger('market-access');
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
  '/classify-code',
  author,
  handle(z.object({ code: z.string().min(1) }), input => classifyProcedureCode(input.code))
);

router.post(
  '/coverage-dossier-completeness',
  author,
  handle(
    z.object({
      clinicalEvidence: z.boolean().optional(),
      comparatorEvidence: z.boolean().optional(),
      patientPopulationDefinition: z.boolean().optional(),
      codingStrategy: z.boolean().optional(),
      coveragePolicyAnalysis: z.boolean().optional(),
      costEffectivenessAnalysis: z.boolean().optional(),
      budgetImpactModel: z.boolean().optional(),
      valueProposition: z.boolean().optional(),
    }),
    input => assessCoverageDossierCompleteness(input)
  )
);

logger.info('Market access routes initialised');

export default router;
