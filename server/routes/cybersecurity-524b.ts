/**
 * Premarket cybersecurity API (FDA §524B) — SBOM completeness and §524B
 * artifact presence. Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  scoreSbomCompleteness,
  assess524bArtifacts,
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

// 2026-10-15: the body was eight per-artifact booleans, scored as `readinessScore`
// for any device. It is now the cyber-device status (omitted: undetermined) and the
// §524B artifact ids recorded present; the answer is presence, not readiness.
router.post(
  '/readiness',
  author,
  handle(
    z.object({
      cyberDevice: z.boolean().optional(),
      present: z.array(z.string().max(64)).max(50),
    }),
    input => assess524bArtifacts({ cyberDevice: input.cyberDevice }, input.present)
  )
);

logger.info('Cybersecurity §524B routes initialised');

export default router;
