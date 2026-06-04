/**
 * /api/c2c/study-twin/* — study digital twins + simulation.
 *
 * Create a twin (a persisted StudyDesign), list them, and run a simulation that
 * predicts outcomes across any therapeutic area / phase. Every simulation result
 * carries the mandatory disclaimer and, when the org has uploaded no learnable
 * history, a request to upload prior CSRs — both enforced by the service. Each
 * run is persisted. Org-scoped via the verified JWT.
 *
 * @module server/routes/c2c/study-twin
 */
import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../../db.js';
import { getSecureOrgId } from '../../utils/tenantContext.js';
import { simulateStudyTwin } from '../../services/study-design/study-twin-service.js';

const router = Router();

function requireOrg(req: Request, res: Response): number | null {
  const raw = getSecureOrgId(req);
  const org = raw ? Number(raw) : NaN;
  if (!Number.isFinite(org) || org <= 0) {
    res.status(401).json({ error: 'AUTH_REQUIRED' });
    return null;
  }
  return org;
}

function actorId(req: Request): number | null {
  const raw = (req as any).user?.id ?? (req as any).userId;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** POST /api/c2c/study-twin — create a twin from a StudyDesign. */
router.post('/', async (req: Request, res: Response) => {
  const org = requireOrg(req, res);
  if (org == null) return;
  const body = (req.body ?? {}) as Record<string, any>;
  const design = (body.design ?? body) as Record<string, any>;
  const title = String(design.title ?? body.title ?? 'Untitled study twin');
  const id = `twin_${randomUUID().replace(/-/g, '')}`;
  try {
    await pool.query(
      `INSERT INTO study_twins (id, org_id, project_id, program_id, title, phase, indication, design, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        id,
        org,
        body.projectId ?? null,
        body.programId ?? null,
        title,
        design.phase ?? null,
        design.indication ?? null,
        JSON.stringify(design),
        actorId(req),
      ],
    );
    return res.status(201).json({ id, title });
  } catch (err: any) {
    console.error('[c2c/study-twin/create]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/** GET /api/c2c/study-twin — list the org's twins. */
router.get('/', async (req: Request, res: Response) => {
  const org = requireOrg(req, res);
  if (org == null) return;
  try {
    const r = await pool.query(
      `SELECT id, title, phase, indication, status, updated_at
         FROM study_twins WHERE org_id = $1 ORDER BY updated_at DESC LIMIT 200`,
      [org],
    );
    return res.json({ twins: r.rows });
  } catch (err: any) {
    console.error('[c2c/study-twin/list]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

/**
 * POST /api/c2c/study-twin/:id/simulate — run a simulation on a stored twin.
 * Returns { prediction, disclaimer, needsHistoryUpload, historyRequest?, grounded }.
 */
router.post('/:id/simulate', async (req: Request, res: Response) => {
  const org = requireOrg(req, res);
  if (org == null) return;
  const id = String(req.params.id);
  try {
    const r = await pool.query(
      `SELECT design, project_id FROM study_twins WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [id, org],
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'TWIN_NOT_FOUND' });
    const design = (r.rows[0].design ?? {}) as Record<string, any>;
    const question = typeof req.body?.question === 'string' ? req.body.question : undefined;

    const result = await simulateStudyTwin({
      design: design as any,
      organizationId: org,
      projectId: r.rows[0].project_id ?? null,
      question,
    });

    // Persist the run (best-effort — the result still returns if this fails).
    try {
      await pool.query(
        `INSERT INTO study_twin_simulations
           (org_id, twin_id, requested_by, question, prediction, disclaimer, grounded, needs_history_upload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          org,
          id,
          actorId(req),
          question ?? null,
          result.prediction,
          result.disclaimer,
          result.grounded,
          result.needsHistoryUpload,
        ],
      );
    } catch (persistErr: any) {
      console.warn('[c2c/study-twin/simulate] run persist failed (non-fatal):', persistErr?.message);
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[c2c/study-twin/simulate]', err?.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

export default router;
