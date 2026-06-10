/**
 * UDI/GUDID and EU IVDR Performance-Evaluation API. Pure, deterministic;
 * role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  validateGs1DeviceIdentifier,
  assessGudidCompleteness,
} from '../services/regulatory/udi-gudid';
import { assessPerformanceEvaluationReport } from '../services/regulatory/ivdr-performance-evaluation';

const logger = createScopedLogger('udi-ivdr');
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
  '/udi/validate-di',
  author,
  handle(z.object({ deviceIdentifier: z.string().min(1) }), input =>
    validateGs1DeviceIdentifier(input.deviceIdentifier)
  )
);

router.post(
  '/udi/gudid-completeness',
  author,
  handle(
    z.object({
      primaryDi: z.boolean().optional(),
      brandName: z.boolean().optional(),
      versionOrModel: z.boolean().optional(),
      companyName: z.boolean().optional(),
      deviceCountInBasePackage: z.boolean().optional(),
      fdaProductCodeOrGmdn: z.boolean().optional(),
      sterilization: z.boolean().optional(),
      mriSafetyStatus: z.boolean().optional(),
      singleUse: z.boolean().optional(),
      labeledContainsNrl: z.boolean().optional(),
    }),
    input => assessGudidCompleteness(input)
  )
);

router.post(
  '/ivdr/performance-evaluation',
  author,
  handle(
    z.object({
      scientificValidityReport: z.boolean().optional(),
      analyticalSensitivity: z.boolean().optional(),
      analyticalSpecificity: z.boolean().optional(),
      trueness: z.boolean().optional(),
      precision: z.boolean().optional(),
      limitOfDetection: z.boolean().optional(),
      measuringRange: z.boolean().optional(),
      diagnosticSensitivity: z.boolean().optional(),
      diagnosticSpecificity: z.boolean().optional(),
      clinicalEvidence: z.boolean().optional(),
    }),
    input => assessPerformanceEvaluationReport(input)
  )
);

logger.info('UDI/IVDR routes initialised');

export default router;
