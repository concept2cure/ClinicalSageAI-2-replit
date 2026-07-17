/**
 * Human factors API (IEC 62366-1) — HFE/UE file completeness and use-related
 * risk analysis. Pure, deterministic; role-gated and Zod-validated.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth';
import { pool } from '../db';
import { createScopedLogger } from '../utils/logger.js';
import {
  assessHfeCompleteness,
  analyzeUseRelatedRisk,
} from '../services/regulatory/human-factors';

const logger = createScopedLogger('human-factors');
const router = Router();
const author = requireRole('regulatory-author');

function getOrgId(req: Request): number | null {
  const raw = (req as { user?: { organizationId?: unknown } }).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : (raw as number);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET / — the org's HFE/UE file (device + element presence map) with its
 * hazard-related use scenarios. The v2 HumanFactors surface adopts this via
 * useLive and computes completeness/risk deterministically from it. Fails
 * closed to an empty envelope when the store isn't provisioned (42P01).
 */
router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const file = await pool.query(
      `SELECT id, device, framework, present FROM c2c_hf_files
        WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [orgId],
    );
    if (file.rows.length === 0) {
      return res.json({ data: null, meta: { count: 0 } });
    }
    const f = file.rows[0];
    const scenarios = await pool.query(
      `SELECT task, use_error AS "useError",
              potential_harm_severity AS "potentialHarmSeverity", mitigated
         FROM c2c_hf_scenarios
        WHERE organization_id = $1 AND file_id = $2 ORDER BY id`,
      [orgId, f.id],
    );
    return res.json({
      data: { device: f.device, framework: f.framework, present: f.present, scenarios: scenarios.rows },
      meta: { count: scenarios.rows.length },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: null, meta: { count: 0, pendingStore: true } });
    }
    logger.error('hf-file read failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read the HFE/UE file.' } });
  }
});

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
