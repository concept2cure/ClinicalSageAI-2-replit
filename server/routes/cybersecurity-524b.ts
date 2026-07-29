/**
 * Premarket cybersecurity API (FDA §524B) — SBOM completeness and §524B
 * readiness. Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  scoreSbomCompleteness,
  assess524bReadiness,
} from '../services/regulatory/cybersecurity-524b';

const logger = createScopedLogger('cybersecurity-524b');
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
  '/sbom-completeness',
  author,
  handle(
    z.object({
      components: z
        .array(
          z.object({
            componentName: z.string().optional(),
            version: z.string().optional(),
            supplier: z.string().optional(),
            uniqueIdentifier: z.string().optional(),
            knownVulnerabilities: z.array(z.string()).optional(),
          })
        )
        .min(1),
      author: z.string().optional(),
      timestamp: z.string().optional(),
      dependencyRelationshipsDocumented: z.boolean().optional(),
    }),
    input => scoreSbomCompleteness(input)
  )
);

router.post(
  '/readiness',
  author,
  handle(
    z.object({
      sbom: z.boolean().optional(),
      threatModel: z.boolean().optional(),
      vulnerabilityManagementPlan: z.boolean().optional(),
      securityTesting: z.boolean().optional(),
      secureByDesign: z.boolean().optional(),
      coordinatedDisclosurePolicy: z.boolean().optional(),
      patchabilityPlan: z.boolean().optional(),
      securityRiskAssessment: z.boolean().optional(),
    }),
    input => assess524bReadiness(input)
  )
);

logger.info('Cybersecurity §524B routes initialised');

export default router;
