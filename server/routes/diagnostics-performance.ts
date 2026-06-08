/**
 * Diagnostics performance API — analytical (CLSI EP05/EP06/EP07/EP09/EP17/EP28)
 * and clinical (2×2 accuracy, ROC/AUC) performance computations for IVD /
 * diagnostic submissions. Pure, deterministic math (no tenant data persisted);
 * every endpoint is role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import {
  estimateImprecision,
  estimateDetectionCapability,
  assessLinearity,
  compareMethods,
  assessInterference,
  estimateReferenceInterval,
} from '../services/stats/analytical-performance';
import { computeDiagnosticAccuracy, computeRoc } from '../services/stats/clinical-performance';

const logger = createScopedLogger('diagnostics-performance');
const router = Router();

const num = z.number().finite();
const numArray = z.array(num).min(1);

/** Run a validated computation, mapping validation/computation errors to 400. */
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
      // Domain guards (e.g. unbalanced design, empty 2×2) throw — surface as 400.
      return res
        .status(400)
        .json({ error: { code: 'COMPUTATION', message: err instanceof Error ? err.message : 'Computation failed.' } });
    }
  };
}

const author = requireRole('regulatory-author');

// ── Analytical performance ───────────────────────────────────────────────────

router.post(
  '/analytical/imprecision',
  author,
  handle(z.object({ runs: z.array(numArray).min(2) }), input => estimateImprecision(input))
);

router.post(
  '/analytical/detection-capability',
  author,
  handle(
    z.object({
      blankReplicates: z.array(num).min(2),
      lowSamples: z.array(z.array(num).min(2)).min(1),
      alpha: num.optional(),
      beta: num.optional(),
      biasCorrectionK: num.optional(),
    }),
    input => estimateDetectionCapability(input)
  )
);

router.post(
  '/analytical/linearity',
  author,
  handle(
    z.object({
      levels: z
        .array(z.object({ concentration: num, measurements: numArray }))
        .min(3),
    }),
    input => assessLinearity(input.levels)
  )
);

router.post(
  '/analytical/method-comparison',
  author,
  handle(
    z.object({ reference: numArray, test: numArray, decisionLevel: num.optional() }),
    input => compareMethods(input)
  )
);

router.post(
  '/analytical/interference',
  author,
  handle(
    z.object({
      baseline: numArray,
      withInterferent: numArray,
      allowableBiasPct: num.optional(),
    }),
    input => assessInterference(input)
  )
);

router.post(
  '/analytical/reference-interval',
  author,
  handle(
    z.object({
      values: z.array(num).min(3),
      lowerQuantile: num.gt(0).lt(1).optional(),
      upperQuantile: num.gt(0).lt(1).optional(),
    }),
    input => estimateReferenceInterval(input)
  )
);

// ── Clinical performance ─────────────────────────────────────────────────────

router.post(
  '/clinical/accuracy',
  author,
  handle(
    z.object({
      tp: z.number().int().nonnegative(),
      fp: z.number().int().nonnegative(),
      fn: z.number().int().nonnegative(),
      tn: z.number().int().nonnegative(),
      prevalence: num.min(0).max(1).optional(),
      conf: num.min(0).max(1).optional(),
    }),
    ({ tp, fp, fn, tn, prevalence, conf }) =>
      computeDiagnosticAccuracy({ tp, fp, fn, tn }, { prevalence, conf })
  )
);

router.post(
  '/clinical/roc',
  author,
  handle(
    z.object({
      observations: z
        .array(z.object({ score: num, positive: z.boolean() }))
        .min(2),
    }),
    input => computeRoc(input.observations)
  )
);

logger.info('Diagnostics performance routes initialised');

export default router;
