/**
 * Device software classification API — IMDRF SaMD risk categorization and
 * IEC 62304 software safety classification. Pure, deterministic, standards-
 * grounded; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { createScopedLogger } from '../utils/logger.js';
import { categorizeSamd } from '../services/regulatory/samd-classification';
import { classifySoftware } from '../services/market-specs/software-lifecycle';

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

const iec62304Schema = z.object({
  canContributeToHazard: z.boolean(),
  harmSeverityAfterExternalControls: z.enum(['none', 'non-serious', 'serious-or-death']),
});

/**
 * The route's two answers as classifySoftware's harm facts, both judged after
 * external risk controls: software that cannot contribute to a hazardous
 * situation contributes to no injury; otherwise the residual harm says which.
 */
function harmFacts(input: z.infer<typeof iec62304Schema>): Parameters<typeof classifySoftware>[0] {
  if (!input.canContributeToHazard) {
    return { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false };
  }
  switch (input.harmSeverityAfterExternalControls) {
    case 'serious-or-death':
      return { canContributeToDeathOrSeriousInjury: true };
    case 'non-serious':
      return { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: true };
    case 'none':
      return { canContributeToDeathOrSeriousInjury: false, canContributeToNonSeriousInjury: false };
  }
}

// 2026-10-15: this ran classifyIec62304 (regulatory/samd-classification.ts), a
// third IEC 62304 classifier with its own rationale and response shape. It now
// answers from the canonical engine (market-specs/software-lifecycle.ts).
router.post(
  '/iec62304-class',
  author,
  handle(iec62304Schema, input => classifySoftware(harmFacts(input)))
);

logger.info('Device classification routes initialised');

export default router;
