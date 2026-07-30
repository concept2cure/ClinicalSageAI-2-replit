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
import {
  createHfFile,
  listHfFiles,
  HfFileValidationError,
} from '../services/human-factors/hf-files-service';
import auditService from '../services/auditService';

const logger = createScopedLogger('human-factors');
const router = Router();
const author = requireRole('regulatory-author');

function getOrgId(req: Request): number | null {
  const r = req as {
    tenantId?: unknown;
    organizationId?: unknown;
    tenantContext?: { organizationId?: unknown };
    user?: { organizationId?: unknown };
  };
  const raw =
    r.tenantId ?? r.organizationId ?? r.tenantContext?.organizationId ?? r.user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const r = req as { userId?: unknown; user?: { id?: unknown } };
  const raw = r.userId ?? r.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * GET / — the org's HFE/UE file (device + element presence map) with its
 * hazard-related use scenarios. The file is read from the REAL, org-scoped store
 * `hf_engineering_files` (hf-files-service.ts — a live write path, not the
 * seed-only c2c_hf_files blob); its use scenarios come from c2c_hf_scenarios (the
 * existing wired scenario store, referenced by the file's id). The v2
 * HumanFactors surface adopts this and computes completeness/use-related risk
 * deterministically from it. Org scoped; 403 without org. Fails CLOSED to an
 * honest empty envelope (never fabricated) when the store isn't provisioned
 * (42P01).
 */
router.get('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  try {
    const files = await listHfFiles(orgId);
    const file = files[0];
    if (!file) {
      return res.json({ data: null, meta: { count: 0, source: 'hf_engineering_files' } });
    }
    const scenarios = await pool.query(
      `SELECT task, use_error AS "useError",
              potential_harm_severity AS "potentialHarmSeverity", mitigated
         FROM c2c_hf_scenarios
        WHERE organization_id = $1 AND file_id = $2 ORDER BY id`,
      [orgId, file.id],
    );
    return res.json({
      data: { device: file.device, framework: file.framework, present: file.present, scenarios: scenarios.rows },
      meta: { count: scenarios.rows.length, source: 'hf_engineering_files' },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') {
      return res.json({ data: null, meta: { count: 0, pendingStore: true } });
    }
    logger.error('hf-file read failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to read the HFE/UE file.' } });
  }
});

/**
 * POST / — record the org's HFE/UE file (the real write path). A live tenant (or
 * the demo seed) creates its IEC 62366-1 file here; GET / then reads it from the
 * real store. Org scoped; 403 without org; 400 on a missing device / malformed
 * element map; 201 with the created file's display shape. Audited HF_FILE_RECORDED.
 */
router.post('/', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: { code: 'ORG_REQUIRED', message: 'Organization context required.' } });
  }
  const userId = getUserId(req);
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const file = await createHfFile(orgId, {
      device: String(b.device ?? ''),
      framework: b.framework != null ? String(b.framework) : null,
      present: b.present,
      createdBy: userId,
    });
    await auditService.logAction({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: 'HF_FILE_RECORDED',
      resourceType: 'hf_engineering_file',
      resourceId: file.id,
      details: { device: file.device, framework: file.framework },
    });
    return res.status(201).json({
      data: { device: file.device, framework: file.framework, present: file.present, scenarios: [] },
      id: file.id,
    });
  } catch (err) {
    if (err instanceof HfFileValidationError) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
    }
    logger.error('hf-file create failed', { err: err instanceof Error ? err.message : String(err) });
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Failed to record the HFE/UE file.' } });
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
 * HFE/UE file. The v2 HumanFactors surface's "Add use scenario" form POSTs here;
 * the persisted row re-drives the client-side use-related-risk compute. Plain
 * org-scoped persisted create — attaches to the org's HFE/UE file, resolved from
 * the REAL hf_engineering_files store (the file store this route now reads).
 * Org scoped; 403 without org; 409 NO_FILE when the org has no file to attach to;
 * 400 on a missing task; 503 PENDING_STORE on 42P01 so the client degrades
 * gracefully. (The scenario rows themselves live in the existing c2c_hf_scenarios
 * store, which keeps its own writer — this contract is unchanged.)
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
      `SELECT id FROM hf_engineering_files
        WHERE organization_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`,
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
