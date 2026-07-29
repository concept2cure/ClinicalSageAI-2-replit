/**
 * CLIA categorization + waiver tracking — backs the IVD pathway surface
 * (Surface 9, CLIA portion). One row per test_name × analyte; the kit's
 * surface filters by program_id and complexity.
 *
 *   GET    /api/mdx/clia                          list
 *   POST   /api/mdx/clia                          create
 *   GET    /api/mdx/clia/:id                      single
 *   PATCH  /api/mdx/clia/:id                      partial update
 *   POST   /api/mdx/clia/:id/apply-waiver         mark waiver application
 *   POST   /api/mdx/clia/:id/grant-waiver         mark waiver granted (CMS letter)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-clia');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPLEXITY = ['waived', 'moderate', 'high'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  complexity: z.enum(COMPLEXITY).optional(),
});
const createBody = z.object({
  programId:           z.string().regex(UUID_RE).optional().nullable(),
  testName:            z.string().min(1).max(500),
  analyte:             z.string().max(200).optional().nullable(),
  cliaComplexity:      z.enum(COMPLEXITY),
  cmsLetterDate:       z.string().date().optional().nullable(),
  cmsLetterRef:        z.string().max(200).optional().nullable(),
});
const patchBody = createBody.partial();

router.get('/clia', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: pid, complexity } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (pid)        { args.push(pid);        filters.push(`program_id = $${args.length}`); }
  if (complexity) { args.push(complexity); filters.push(`clia_complexity = $${args.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivd_clia_categorization WHERE ${filters.join(' AND ')}
        ORDER BY updated_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

router.post('/clia', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ivd_clia_categorization (
         organization_id, program_id, test_name, analyte, clia_complexity,
         cms_letter_date, cms_letter_ref
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.testName, p.analyte ?? null, p.cliaComplexity,
        p.cmsLetterDate ?? null, p.cmsLetterRef ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create', err);
  }
});

router.get('/clia/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ivd_clia_categorization WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'CLIA categorization');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'get', err);
  }
});

router.patch('/clia/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', testName: 'test_name', analyte: 'analyte',
    cliaComplexity: 'clia_complexity', cmsLetterDate: 'cms_letter_date',
    cmsLetterRef: 'cms_letter_ref',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE ivd_clia_categorization SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'CLIA categorization');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch', err);
  }
});

router.post('/clia/:id/apply-waiver', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `UPDATE ivd_clia_categorization
          SET waiver_applied = true,
              waiver_application_date = COALESCE($3::date, NOW()::date),
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
        RETURNING *`,
      [id, orgId, typeof req.body?.applicationDate === 'string' ? req.body.applicationDate : null],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'CLIA categorization');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'apply-waiver', err);
  }
});

router.post('/clia/:id/grant-waiver', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const granted = req.body?.granted !== false;
  try {
    const { rows } = await pool.query(
      `UPDATE ivd_clia_categorization
          SET waiver_granted = $3,
              waiver_granted_date = CASE WHEN $3 THEN COALESCE($4::date, NOW()::date) ELSE NULL END,
              waiver_revocation_date = CASE WHEN $3 THEN NULL ELSE NOW()::date END,
              clia_complexity = CASE WHEN $3 THEN 'waived' ELSE clia_complexity END,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
          AND waiver_applied = true
        RETURNING *`,
      [
        id, orgId, granted,
        typeof req.body?.grantedDate === 'string' ? req.body.grantedDate : null,
      ],
    );
    if (rows.length === 0) {
      return clientError(res, 409, 'CLIA row not found, or waiver has not been applied for');
    }
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'grant-waiver', err);
  }
});

export default router;
