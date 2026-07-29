/**
 * Interoperability API — LOINC code validation, SPL section completeness, and
 * FHIR resource validation. Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  validateLoincCode,
  assessSplCompleteness,
  validateFhirResource,
} from '../services/regulatory/spl-fhir';

const logger = createScopedLogger('spl-fhir');
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
  '/loinc/validate',
  author,
  handle(z.object({ code: z.string().min(1) }), input => validateLoincCode(input.code))
);

router.post(
  '/spl/completeness',
  author,
  handle(
    z.object({
      indicationsAndUsage: z.boolean().optional(),
      dosageAndAdministration: z.boolean().optional(),
      contraindications: z.boolean().optional(),
      warningsAndPrecautions: z.boolean().optional(),
      adverseReactions: z.boolean().optional(),
      drugInteractions: z.boolean().optional(),
      useInSpecificPopulations: z.boolean().optional(),
      description: z.boolean().optional(),
      clinicalPharmacology: z.boolean().optional(),
      howSupplied: z.boolean().optional(),
    }),
    input => assessSplCompleteness(input)
  )
);

router.post(
  '/fhir/validate',
  author,
  handle(z.object({ resource: z.record(z.string(), z.unknown()) }), input =>
    validateFhirResource(input.resource)
  )
);

logger.info('SPL/FHIR routes initialised');

export default router;
