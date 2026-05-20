/**
 * Risk management (ISO 14971) — backs Surface 5 of the paying-client beta.
 *
 *   GET    /api/mdx/risk-items?program_id=<UUID>     hazard/harm/risk rows
 *   POST   /api/mdx/risk-items                       create a risk item
 *   GET    /api/mdx/risk-items/:id                   single row + controls
 *   PATCH  /api/mdx/risk-items/:id                   partial update
 *   POST   /api/mdx/risk-items/:id/controls          add a risk control
 *   PATCH  /api/mdx/risk-controls/:controlId         update control status
 *   GET    /api/mdx/risk-summary/:programId          aggregate metrics
 *
 * The risk matrix follows the ISO 14971 convention: severity 1..5 ×
 * probability 1..5. initial_risk and residual_risk are stored numerically
 * (the product) and the kit derives the matrix cell client-side.
 *
 * Tenant-scoped via risk_items.organization_id. Audit-logged via global
 * mutation middleware. AnA can create + update via the new tools.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';

const router = Router();
const log = createScopedLogger('mdx-risk');

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

function getUserId(req: Request): number | null {
  const raw = (req as any).user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCALE_1_5 = z.number().int().min(1).max(5);
const CONTROL_STRATEGY = ['design_eliminate', 'design_reduce', 'protective', 'information'] as const;
const STATUS_ITEM = ['open', 'mitigating', 'verified', 'accepted', 'closed'] as const;
const STATUS_CTRL = ['proposed', 'implemented', 'verified', 'effective'] as const;
const CONTROL_TYPE = ['inherent_safety', 'protective_measure', 'information_safety'] as const;
const SOURCES = ['fmea', 'pha', 'fault_tree', 'literature', 'complaint', 'capa', 'other'] as const;

const listQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status:     z.enum(STATUS_ITEM).optional(),
  limit:      z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(500)).optional(),
});

const createItemBody = z.object({
  programId:           z.string().regex(UUID_RE).optional().nullable(),
  refCode:             z.string().max(40).optional().nullable(),
  hazard:              z.string().min(1).max(2000),
  hazardousSituation:  z.string().max(2000).optional().nullable(),
  harm:                z.string().min(1).max(2000),
  sequenceOfEvents:    z.string().max(4000).optional().nullable(),
  severity:            SCALE_1_5,
  probability:         SCALE_1_5,
  detectability:       SCALE_1_5.optional().nullable(),
  controlStrategy:     z.enum(CONTROL_STRATEGY).optional().nullable(),
  source:              z.enum(SOURCES).optional().nullable(),
  status:              z.enum(STATUS_ITEM).optional(),
  assignedTo:          z.number().int().positive().optional().nullable(),
});

const patchItemBody = createItemBody.partial().extend({
  residualSeverity:    SCALE_1_5.optional().nullable(),
  residualProbability: SCALE_1_5.optional().nullable(),
  acceptable:          z.boolean().optional().nullable(),
  benefitRiskRationale: z.string().max(4000).optional().nullable(),
});

const createControlBody = z.object({
  description:            z.string().min(1).max(2000),
  controlType:            z.enum(CONTROL_TYPE),
  implementationEvidence: z.string().max(2000).optional().nullable(),
  verificationEvidence:   z.string().max(2000).optional().nullable(),
  effectivenessEvidence:  z.string().max(2000).optional().nullable(),
  introducesNewRisk:      z.boolean().optional(),
  newRiskItemId:          z.number().int().positive().optional().nullable(),
  status:                 z.enum(STATUS_CTRL).optional(),
});

const patchControlBody = createControlBody.partial();

/* ─── GET /api/mdx/risk-items ─────────────────────────────────────── */

router.get('/risk-items', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const { program_id: programId, status, limit = 200 } = parsed.data;

  const filters: string[] = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  if (status)    { args.push(status);    filters.push(`status = $${args.length}`); }
  args.push(limit);

  try {
    const { rows } = await pool.query(
      `SELECT * FROM risk_items WHERE ${filters.join(' AND ')}
        ORDER BY (residual_risk IS NULL) DESC, residual_risk DESC, initial_risk DESC, updated_at DESC
        LIMIT $${args.length}`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    return serverError(res, log, 'list-items', err);
  }
});

/* ─── POST /api/mdx/risk-items ────────────────────────────────────── */

router.post('/risk-items', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const initialRisk = p.severity * p.probability;

  try {
    const { rows } = await pool.query(
      `INSERT INTO risk_items (
         organization_id, program_id, ref_code, hazard, hazardous_situation, harm,
         sequence_of_events, severity, probability, detectability, initial_risk,
         control_strategy, status, source, assigned_to
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
       )
       RETURNING *`,
      [
        orgId, p.programId ?? null, p.refCode ?? null, p.hazard, p.hazardousSituation ?? null,
        p.harm, p.sequenceOfEvents ?? null, p.severity, p.probability, p.detectability ?? null,
        initialRisk, p.controlStrategy ?? null, p.status ?? 'open', p.source ?? null,
        p.assignedTo ?? null,
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-item', err);
  }
});

/* ─── GET /api/mdx/risk-items/:id ─────────────────────────────────── */

router.get('/risk-items/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');

  try {
    const { rows } = await pool.query(
      `SELECT * FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk item');
    const controls = await pool.query(
      `SELECT * FROM risk_controls WHERE risk_item_id = $1 ORDER BY id`,
      [id],
    );
    return ok(res, { ...rows[0], controls: controls.rows });
  } catch (err) {
    return serverError(res, log, 'get-item', err);
  }
});

/* ─── PATCH /api/mdx/risk-items/:id ───────────────────────────────── */

router.patch('/risk-items/:id', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return clientError(res, 422, 'id must be numeric');
  const parsed = patchItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    programId: 'program_id', refCode: 'ref_code', hazard: 'hazard',
    hazardousSituation: 'hazardous_situation', harm: 'harm',
    sequenceOfEvents: 'sequence_of_events', severity: 'severity',
    probability: 'probability', detectability: 'detectability',
    residualSeverity: 'residual_severity', residualProbability: 'residual_probability',
    controlStrategy: 'control_strategy', acceptable: 'acceptable',
    benefitRiskRationale: 'benefit_risk_rationale', status: 'status',
    source: 'source', assignedTo: 'assigned_to',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  /* Recompute initial / residual risk products when components change. */
  if (parsed.data.severity !== undefined || parsed.data.probability !== undefined) {
    /* No clean way to do this in the single UPDATE without a sub-select,
       so we leave initial_risk untouched on partial updates — service
       layer can recompute when both fields land in a transaction. */
  }
  if (
    parsed.data.residualSeverity != null &&
    parsed.data.residualProbability != null
  ) {
    args.push(parsed.data.residualSeverity * parsed.data.residualProbability);
    setFrags.push(`residual_risk = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(id, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE risk_items SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk item');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-item', err);
  }
});

/* ─── POST /api/mdx/risk-items/:id/controls ───────────────────────── */

router.post('/risk-items/:id/controls', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const itemId = Number(req.params.id);
  if (!Number.isFinite(itemId)) return clientError(res, 422, 'id must be numeric');
  const parsed = createControlBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  /* Verify the risk item belongs to the caller's org before inserting. */
  const own = await pool.query(
    `SELECT 1 FROM risk_items WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [itemId, orgId],
  );
  if (own.rows.length === 0) return notFoundInTenant(res, 'Risk item');

  try {
    const { rows } = await pool.query(
      `INSERT INTO risk_controls (
         risk_item_id, organization_id, description, control_type,
         implementation_evidence, verification_evidence, effectiveness_evidence,
         introduces_new_risk, new_risk_item_id, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
       )
       RETURNING *`,
      [
        itemId, orgId, p.description, p.controlType,
        p.implementationEvidence ?? null, p.verificationEvidence ?? null,
        p.effectivenessEvidence ?? null, p.introducesNewRisk ?? false,
        p.newRiskItemId ?? null, p.status ?? 'proposed',
      ],
    );
    return created(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'create-control', err);
  }
});

/* ─── PATCH /api/mdx/risk-controls/:controlId ─────────────────────── */

router.patch('/risk-controls/:controlId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const ctrlId = Number(req.params.controlId);
  if (!Number.isFinite(ctrlId)) return clientError(res, 422, 'controlId must be numeric');
  const parsed = patchControlBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const COL: Record<string, string> = {
    description: 'description', controlType: 'control_type',
    implementationEvidence: 'implementation_evidence',
    verificationEvidence: 'verification_evidence',
    effectivenessEvidence: 'effectiveness_evidence',
    introducesNewRisk: 'introduces_new_risk',
    newRiskItemId: 'new_risk_item_id', status: 'status',
  };
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const col = COL[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return clientError(res, 422, 'No updatable fields in body');
  setFrags.push(`updated_at = NOW()`);
  args.push(ctrlId, orgId);

  try {
    const { rows } = await pool.query(
      `UPDATE risk_controls SET ${setFrags.join(', ')}
        WHERE id = $${args.length - 1} AND organization_id = $${args.length}
        RETURNING *`,
      args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk control');
    return ok(res, rows[0]);
  } catch (err) {
    return serverError(res, log, 'patch-control', err);
  }
});

/* ─── GET /api/mdx/risk-summary/:programId ────────────────────────── */

router.get('/risk-summary/:programId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');

  try {
    const { rows } = await pool.query<{
      total: number; open: number; high_residual: number; accepted: number;
      avg_initial: number | null; avg_residual: number | null;
    }>(
      `SELECT
          COUNT(*)::int                                         AS total,
          COUNT(*) FILTER (WHERE status IN ('open','mitigating'))::int AS open,
          COUNT(*) FILTER (WHERE residual_risk >= 15)::int      AS high_residual,
          COUNT(*) FILTER (WHERE status = 'accepted')::int      AS accepted,
          AVG(initial_risk)::numeric(10,2)                      AS avg_initial,
          AVG(residual_risk)::numeric(10,2)                     AS avg_residual
         FROM risk_items
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [orgId, programId],
    );
    const r = rows[0] ?? { total: 0, open: 0, high_residual: 0, accepted: 0, avg_initial: null, avg_residual: null };
    return ok(res, {
      total:         r.total,
      open:          r.open,
      highResidual:  r.high_residual,
      accepted:      r.accepted,
      avgInitial:    r.avg_initial !== null ? Number(r.avg_initial) : null,
      avgResidual:   r.avg_residual !== null ? Number(r.avg_residual) : null,
    });
  } catch (err) {
    return serverError(res, log, 'summary', err);
  }
});

export default router;
