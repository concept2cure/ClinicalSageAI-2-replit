/**
 * Laboratory-developed tests (LDT) — backs Surface 12 in the gap inventory.
 * Tracks LDT inventory per laboratory and per-test FDA LDT-rule phase
 * milestones (FDA 2024 final rule transitions through 2028).
 *
 *   GET    /api/mdx/ldt                            list inventory
 *   POST   /api/mdx/ldt                            register an LDT
 *   GET    /api/mdx/ldt/:id                        single LDT + milestones
 *   PATCH  /api/mdx/ldt/:id                        partial update
 *   POST   /api/mdx/ldt/:id/milestones             add a milestone
 *   PATCH  /api/mdx/ldt/milestones/:msId           update milestone status
 *   GET    /api/mdx/ldt-phase-summary              per-org phase counts
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-ldt');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const FDA_PATHWAY = ['510k', 'pma', 'de_novo', 'none', 'enforcement_discretion'] as const;
const DISCRETION_BASIS = ['unmet_need', 'hde_companion', 'forensic', 'cf_blood_banking', 'public_health'] as const;
const MS_STATUS = ['pending', 'in_progress', 'completed', 'not_applicable'] as const;

const listQuery = z.object({
  lab_name: z.string().max(200).optional(),
  phase:    z.string().regex(/^[1-5]$/).transform(Number).optional(),
  pathway:  z.enum(FDA_PATHWAY).optional(),
});
const createBody = z.object({
  labName:                       z.string().min(1).max(200),
  cliaCertificateNo:             z.string().max(60).optional().nullable(),
  testName:                      z.string().min(1).max(300),
  analyte:                       z.string().max(200).optional().nullable(),
  intendedUse:                   z.string().max(2000).optional().nullable(),
  firstOfferedDate:              z.string().date().optional().nullable(),
  grandfathered:                 z.boolean().optional(),
  enforcementDiscretionEligible: z.boolean().optional().nullable(),
  enforcementDiscretionBasis:    z.enum(DISCRETION_BASIS).optional().nullable(),
  fdaPathway:                    z.enum(FDA_PATHWAY).optional().nullable(),
  currentPhase:                  z.number().int().min(1).max(5).optional(),
});
const patchBody = createBody.partial();

const msCreate = z.object({
  phase:       z.number().int().min(1).max(5),
  requirement: z.string().min(1).max(500),
  dueDate:     z.string().date().optional().nullable(),
  evidenceRef: z.string().max(500).optional().nullable(),
  status:      z.enum(MS_STATUS).optional(),
});
const msPatch = z.object({
  status:      z.enum(MS_STATUS).optional(),
  completedAt: z.string().date().optional().nullable(),
  evidenceRef: z.string().max(500).optional().nullable(),
  dueDate:     z.string().date().optional().nullable(),
});

router.get('/ldt', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { lab_name: labName, phase, pathway } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (labName) { args.push(labName); filters.push(`lab_name = $${args.length}`); }
  if (phase !== undefined) { args.push(phase); filters.push(`current_phase = $${args.length}`); }
  if (pathway) { args.push(pathway); filters.push(`fda_pathway = $${args.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM ldt_inventory WHERE ${filters.join(' AND ')}
        ORDER BY lab_name, test_name`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list', err);
  }
});

router.post('/ldt', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ldt_inventory (
         organization_id, lab_name, clia_certificate_no, test_name, analyte,
         intended_use, first_offered_date, grandfathered,
         enforcement_discretion_eligible, enforcement_discretion_basis,
         fda_pathway, current_phase
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,COALESCE($8,false),$9,$10,$11,COALESCE($12,1)
       )
       RETURNING *`,
      [
        orgId, p.labName, p.cliaCertificateNo ?? null, p.testName, p.analyte ?? null,
        p.intendedUse ?? null, p.firstOfferedDate ?? null, p.grandfathered ?? null,
        p.enforcementDiscretionEligible ?? null, p.enforcementDiscretionBasis ?? null,
        p.fdaPathway ?? null, p.currentPhase ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create', err);
  }
});

router.get('/ldt/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM ldt_inventory WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'LDT');
    const ms = await pool.query(
      `SELECT * FROM ldt_phase_milestones WHERE ldt_id = $1 ORDER BY phase, due_date NULLS LAST`,
      [id],
    );
    return ok(res, { ...rows[0], milestones: ms.rows });
  } catch (err) {
    return serverError(res, log, 'get', err);
  }
});

router.patch('/ldt/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    labName: 'lab_name', cliaCertificateNo: 'clia_certificate_no',
    testName: 'test_name', analyte: 'analyte', intendedUse: 'intended_use',
    firstOfferedDate: 'first_offered_date', grandfathered: 'grandfathered',
    enforcementDiscretionEligible: 'enforcement_discretion_eligible',
    enforcementDiscretionBasis: 'enforcement_discretion_basis',
    fdaPathway: 'fda_pathway', currentPhase: 'current_phase',
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
      `UPDATE ldt_inventory SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'LDT');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch', err);
  }
});

router.post('/ldt/:id/milestones', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const ldtId = Number(req.params.id);
  if (!Number.isFinite(ldtId)) return clientError(res, 422, 'id must be numeric');
  const parsed = msCreate.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const own = await pool.query(
    `SELECT 1 FROM ldt_inventory WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [ldtId, orgId],
  );
  if (own.rows.length === 0) return notFoundInTenant(res, 'LDT');

  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ldt_phase_milestones (
         ldt_id, organization_id, phase, requirement, due_date, evidence_ref, status
       ) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'pending'))
       RETURNING *`,
      [
        ldtId, orgId, p.phase, p.requirement, p.dueDate ?? null,
        p.evidenceRef ?? null, p.status ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'ms-create', err);
  }
});

router.patch('/ldt/milestones/:msId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const msId = Number(req.params.msId);
  if (!Number.isFinite(msId)) return clientError(res, 422, 'msId must be numeric');
  const parsed = msPatch.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    status: 'status', completedAt: 'completed_at',
    evidenceRef: 'evidence_ref', dueDate: 'due_date',
  };
  const setFrags: string[] = []; const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k]; if (!col) continue;
    args.push(v); setFrags.push(`${col} = $${args.length}`);
  }
  /* Auto-stamp completed_at when status flips to 'completed'. */
  if (parsed.data.status === 'completed' && parsed.data.completedAt === undefined) {
    setFrags.push(`completed_at = COALESCE(completed_at, NOW()::date)`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(msId, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE ldt_phase_milestones SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'LDT milestone');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'ms-patch', err);
  }
});

router.get('/ldt-phase-summary', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  try {
    const { rows } = await pool.query<{ current_phase: number; n: number }>(
      `SELECT current_phase, COUNT(*)::int AS n
         FROM ldt_inventory
        WHERE organization_id = $1 AND deleted_at IS NULL
        GROUP BY current_phase
        ORDER BY current_phase`,
      [orgId],
    );
    /* Fill in 1..5 with zero where there are no rows so the kit's
       summary chart renders all phases. */
    const byPhase = new Map(rows.map((r) => [r.current_phase, r.n]));
    return ok(res, {
      phases: [1, 2, 3, 4, 5].map((p) => ({ phase: p, count: byPhase.get(p) ?? 0 })),
      total:  rows.reduce((s, r) => s + r.n, 0),
    });
  } catch (err) {
    return serverError(res, log, 'phase-summary', err);
  }
});

export default router;
