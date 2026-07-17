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

/**
 * POST /scenarios — persist a new hazard-related use scenario onto the org's
 * HFE/UE file. The v2 HumanFactors surface's "Add use scenario" form POSTs here
 * once its read has adopted the store (LIVE); the adopted row re-drives the
 * client-side completeness/use-related-risk compute. Plain org-scoped persisted
 * create — attaches to the org's single HFE/UE file. Org scoped; 403 without
 * org; 409 NO_FILE when the org has no file to attach to; 400 on a missing
 * task; 503 PENDING_STORE on 42P01 so the client falls back to local-only.
 */
const HF_SEVERITIES = ['negligible', 'minor', 'serious', 'critical'] as const;

router.post('/scenarios', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const task = str(body.task);
  if (!task) {
    return res.status(400).json({ error: { code: 'INVALID_BODY', message: 'Missing required field: task.' } });
  }
  const useError = str(body.useError);
  const sevRaw = str(body.potentialHarmSeverity);
  const potentialHarmSeverity = (HF_SEVERITIES as readonly string[]).includes(sevRaw) ? sevRaw : 'minor';
  const mitigated = body.mitigated === true;

  try {
    const file = await pool.query(
      `SELECT id FROM c2c_hf_files WHERE organization_id = $1 ORDER BY id LIMIT 1`,
      [orgId],
    );
    if (file.rows.length === 0) {
      return res.status(409).json({
        error: { code: 'NO_FILE', message: 'No HFE/UE file exists for this organization to attach a scenario to.' },
      });
    }
    const fileId = file.rows[0].id;
    const id = 'hfs-' + Date.now();
    const { rows } = await pool.query(
      `INSERT INTO c2c_hf_scenarios
         (id, organization_id, file_id, task, use_error, potential_harm_severity, mitigated)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING task, use_error AS "useError",
                 potential_harm_severity AS "potentialHarmSeverity", mitigated`,
      [id, orgId, fileId, task, useError, potentialHarmSeverity, mitigated],
    );
    const r = rows[0];
    const data = {
      task: r.task,
      useError: r.useError ?? '',
      potentialHarmSeverity: r.potentialHarmSeverity,
      mitigated: r.mitigated === true,
    };
    return res.status(201).json({ data, meta: { created: true } });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.status(503).json({
        error: { code: 'PENDING_STORE', message: 'Human-factors store is not provisioned yet.' },
      });
    }
    logger.error('hf-scenario create failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to create the use scenario.' } });
  }
});

logger.info('Human factors routes initialised');

export default router;
