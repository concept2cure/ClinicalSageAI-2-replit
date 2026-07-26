/**
 * Risk-Based Monitoring — the monitoring plan and its actions.
 *
 * Split out of mdx-rbm.ts, which owns the risk basis (assessments, CtQ factors,
 * KRIs, QTLs, signals) and mdx-rbm-data.ts, which owns ingestion and the engine
 * runs. This module owns the document that directs monitoring activity, and the
 * work items under it:
 *
 *   Monitoring plan
 *     GET   /api/mdx/rbm-monitoring-plans?program_id=
 *     POST  /api/mdx/rbm-monitoring-plans        GET .../:id  (plan + actions)
 *     POST  /api/mdx/rbm-monitoring-plans/generate  derive a draft from the RACT
 *     PATCH /api/mdx/rbm-monitoring-plans/:id    refused on an approved plan
 *     POST  /api/mdx/rbm-monitoring-plans/:id/approve  e-signed; archives the
 *                                                      version it supersedes
 *     POST  /api/mdx/rbm-monitoring-plans/:id/amend    opens the next version
 *
 *   Monitoring actions
 *     GET   /api/mdx/rbm-monitoring-actions?plan_id=&program_id=&status=
 *     POST  /api/mdx/rbm-monitoring-actions      PATCH .../:id
 *
 * Plans are VERSIONED and an approved plan is read-only — see
 * amendMonitoringPlan in the RBM actuator for why revision opens a new version
 * rather than editing content a signature is already attached to.
 *
 * Mounted at /api/mdx alongside mdx-rbm.ts. Same conventions throughout: raw
 * parameterized SQL over the shared pool, the api-response envelope, Zod
 * validation, tenant scoping via organization_id + deleted_at IS NULL.
 *
 * @module server/routes/mdx-rbm-plans
 */

import { Router, Request } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import {
  generatePlanFromAssessment, amendMonitoringPlan, nextPlanVersion,
} from '../services/rbm/rbm-actuator';
import { verifySignerCredentials, defaultSignoffDeps } from '../services/ana-ri/governed-action-signoff';

const router = Router();
const log = createScopedLogger('mdx-rbm-plans');

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
const PLAN_STRATEGY = ['centralized', 'risk_based', 'on_site', 'hybrid'] as const;
const PLAN_STATUS = ['draft', 'active', 'archived'] as const;
const ACTION_TYPE = ['issue', 'capa', 'site_visit', 'query', 'escalation'] as const;
const PRIORITY = ['low', 'medium', 'high'] as const;
const ACTION_STATUS = ['open', 'in_progress', 'done'] as const;

/** Build a partial UPDATE from a camelCase→column map. Returns null if empty. */
function buildPatch(
  data: Record<string, unknown>,
  colMap: Record<string, string>,
): { setSql: string; args: unknown[] } | null {
  const setFrags: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const col = colMap[k];
    if (!col) continue;
    args.push(v);
    setFrags.push(`${col} = $${args.length}`);
  }
  if (setFrags.length === 0) return null;
  return { setSql: setFrags.join(', '), args };
}

function numericId(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Re-authentication at the point of signing (21 CFR 11.200) — the password
// always, plus the authenticator code when the signer has MFA enabled. Verified
// server-side via verifySignerCredentials.
const approveBody = z.object({
  reason: z.string().min(3).max(2000),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});

/** Opening an amendment is not itself a signed act, so it takes a reason for
 *  the record but no e-signature; the signature is required to approve it. */
const amendBody = z.object({ reason: z.string().min(3).max(2000) });

// ════════════════════════════════════════════════════════════════════════════
// MONITORING PLANS + ACTIONS
// ════════════════════════════════════════════════════════════════════════════

/** Approve + activate a monitoring plan, capturing the reason for change. */
router.post('/rbm-monitoring-plans/:id/approve', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = approveBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'A reason for change is required', parsed.error.flatten().fieldErrors);
  const signerId = getUserId(req);
  if (signerId === null) return clientError(res, 401, 'An authenticated signer is required to approve');
  const signoff = await verifySignerCredentials(defaultSignoffDeps, { userId: signerId, password: parsed.data.password, mfaToken: parsed.data.mfaToken });
  if (!signoff.verified) return clientError(res, 401, signoff.error ?? 'Signer verification failed (21 CFR 11.200)', signoff.code ? { code: signoff.code } : undefined);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE rbm_monitoring_plans
          SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvalReason', $2::text)
        WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
        RETURNING *`,
      [signerId, parsed.data.reason, id, orgId],
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return notFoundInTenant(res, 'Monitoring plan');
    }
    // Approving a version supersedes the one it replaces, in the SAME
    // transaction, so a study never has two plans claiming to direct monitoring
    // at once. The archived row and its actions are left untouched — that is the
    // signed record of what was being done before.
    const superseded = await client.query(
      `UPDATE rbm_monitoring_plans SET status = 'archived', updated_at = NOW()
        WHERE organization_id = $1 AND program_id IS NOT DISTINCT FROM $2
          AND deleted_at IS NULL AND id <> $3 AND status = 'active'
        RETURNING version`,
      [orgId, rows[0].program_id, id],
    );
    await client.query('COMMIT');
    return ok(res, rows[0], {
      supersededVersions: superseded.rows.map((r: { version: number }) => r.version),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return serverError(res, log, 'approve-plan', err);
  } finally {
    client.release();
  }
});


router.get('/rbm-monitoring-plans', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  if (programId && !UUID_RE.test(programId)) return clientError(res, 422, 'program_id must be a UUID');
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_monitoring_plans WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-plans', err); }
});

const createPlanBody = z.object({
  programId: z.string().regex(UUID_RE).optional().nullable(),
  assessmentId: z.number().int().positive().optional().nullable(),
  title: z.string().min(1).max(300),
  strategy: z.enum(PLAN_STRATEGY).optional(),
  status: z.enum(PLAN_STATUS).optional(),
});

router.post('/rbm-monitoring-plans', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createPlanBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    // A hand-created plan takes the next version in the study's chain rather
    // than always being v1, so it cannot collide with a version already on file.
    const version = await nextPlanVersion(pool, orgId, p.programId ?? null);
    const { rows } = await pool.query(
      `INSERT INTO rbm_monitoring_plans (organization_id, program_id, assessment_id, title, strategy, status, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [orgId, p.programId ?? null, p.assessmentId ?? null, p.title, p.strategy ?? 'risk_based', p.status ?? 'draft', version],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-plan', err); }
});

/**
 * Derive a draft monitoring plan (and its opening actions) from the program's
 * governing risk assessment. The derivation itself lives in the RBM actuator so
 * this route and the AnA tools run the same code; see
 * generatePlanFromAssessment for what is derived and why.
 */
const generatePlanBody = z.object({
  programId: z.string().regex(UUID_RE),
  title: z.string().min(1).max(300).optional(),
});

router.post('/rbm-monitoring-plans/generate', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = generatePlanBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await generatePlanFromAssessment(client, orgId, parsed.data);
    if (!result.generated) {
      await client.query('ROLLBACK');
      if (result.reason === 'draft_already_open') {
        return clientError(res, 409,
          'A draft monitoring plan version is already open for this study — approve or archive it before generating another.');
      }
      return clientError(res, 409, result.reason === 'assessment_not_approved'
        ? 'This study\'s risk assessment has not been approved. A monitoring plan must derive from a signed RACT — approve the assessment first.'
        : 'No risk assessment exists for this study — run the risk assessment (RACT) before generating a monitoring plan');
    }
    await client.query('COMMIT');
    return created(res, { ...result.plan, actions: result.actions }, {
      derivedFrom: { assessmentId: result.derivedFrom!.assessmentId, overallRisk: result.derivedFrom!.overallRisk },
      criticalFactors: result.derivedFrom!.criticalFactors,
      enhancedSites: result.derivedFrom!.enhancedSites,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return serverError(res, log, 'generate-plan', err);
  } finally {
    client.release();
  }
});

router.get('/rbm-monitoring-plans/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_monitoring_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Monitoring plan');
    const actions = await pool.query(
      `SELECT * FROM rbm_monitoring_actions WHERE plan_id = $1 AND organization_id = $2 ORDER BY
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date NULLS LAST, id`,
      [id, orgId],
    );
    return ok(res, { ...rows[0], actions: actions.rows });
  } catch (err) { return serverError(res, log, 'get-plan', err); }
});

const patchPlanBody = createPlanBody.partial();
const PLAN_COL: Record<string, string> = { title: 'title', strategy: 'strategy', status: 'status' };

router.patch('/rbm-monitoring-plans/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchPlanBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, PLAN_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  try {
    const cur = await pool.query(
      `SELECT status, version FROM rbm_monitoring_plans
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (cur.rows.length === 0) return notFoundInTenant(res, 'Monitoring plan');
    // An approved plan is read-only. Its e-signature attests to a specific
    // strategy and set of actions, so editing in place would leave the
    // approver's name and timestamp attached to content they never saw. The
    // amend endpoint opens a new draft version instead. `status` itself is
    // exempt so a plan can still be archived without being amended.
    const statusOnly = Object.keys(parsed.data).every(k => k === 'status');
    if (cur.rows[0].status === 'active' && !statusOnly) {
      return clientError(res, 409,
        `Monitoring plan v${cur.rows[0].version} is approved and cannot be edited. `
        + `POST /rbm-monitoring-plans/${id}/amend to open a new draft version — the signed version stays on file.`);
    }
    patch.args.push(id, orgId);
    const { rows } = await pool.query(
      `UPDATE rbm_monitoring_plans SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length} AND deleted_at IS NULL
        RETURNING *`,
      patch.args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Monitoring plan');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-plan', err); }
});

/**
 * Open a versioned amendment to an approved monitoring plan — a new draft
 * carrying the unfinished actions forward, leaving the signed version intact.
 * See amendMonitoringPlan for why this is a new version rather than an edit.
 *
 * Opening an amendment is not itself a signed act, so it takes a reason for the
 * record but no e-signature; the signature is required to approve the result.
 */
router.post('/rbm-monitoring-plans/:id/amend', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = amendBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'A reason for the amendment is required', parsed.error.flatten().fieldErrors);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await amendMonitoringPlan(client, orgId, {
      planId: id, reason: parsed.data.reason, openedBy: getUserId(req),
    });
    if (!result.amended) {
      await client.query('ROLLBACK');
      if (result.reason === 'not_found') return notFoundInTenant(res, 'Monitoring plan');
      return clientError(res, 409, result.reason === 'amendment_already_open'
        ? 'A draft plan version is already open for this study — approve or archive it before opening another.'
        : 'Only an approved monitoring plan can be amended. This one is still a draft, so edit it directly.');
    }
    await client.query('COMMIT');
    return created(res, { ...result.plan, actions: result.actions }, {
      supersedes: result.supersedes,
      actionsCopied: result.actions?.length ?? 0,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return serverError(res, log, 'amend-plan', err);
  } finally {
    client.release();
  }
});

const actionListQuery = z.object({
  plan_id: z.string().regex(/^\d+$/).optional(),
  program_id: z.string().regex(UUID_RE).optional(),
  status: z.enum(ACTION_STATUS).optional(),
});

router.get('/rbm-monitoring-actions', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = actionListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const filters = [`a.organization_id = $1`];
  const args: unknown[] = [orgId];
  if (parsed.data.plan_id) { args.push(Number(parsed.data.plan_id)); filters.push(`a.plan_id = $${args.length}`); }
  if (parsed.data.status) { args.push(parsed.data.status); filters.push(`a.status = $${args.length}`); }
  if (parsed.data.program_id) { args.push(parsed.data.program_id); filters.push(`p.program_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT a.* FROM rbm_monitoring_actions a
         LEFT JOIN rbm_monitoring_plans p ON p.id = a.plan_id
        WHERE ${filters.join(' AND ')}
        ORDER BY CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.due_date NULLS LAST, a.id`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-actions', err); }
});

const createActionBody = z.object({
  planId: z.number().int().positive(),
  riskItemId: z.number().int().positive().optional().nullable(),
  signalId: z.number().int().positive().optional().nullable(),
  actionType: z.enum(ACTION_TYPE).optional(),
  description: z.string().min(1).max(2000),
  priority: z.enum(PRIORITY).optional(),
  owner: z.number().int().positive().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

router.post('/rbm-monitoring-actions', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createActionBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  // Verify the plan belongs to the caller's org.
  const own = await pool.query(
    `SELECT 1 FROM rbm_monitoring_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [p.planId, orgId],
  );
  if (own.rows.length === 0) return notFoundInTenant(res, 'Monitoring plan');
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_monitoring_actions (organization_id, plan_id, risk_item_id, signal_id, action_type, description, priority, owner, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') RETURNING *`,
      [orgId, p.planId, p.riskItemId ?? null, p.signalId ?? null, p.actionType ?? 'issue',
        p.description, p.priority ?? 'medium', p.owner ?? null, p.dueDate ?? null],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-action', err); }
});

const patchActionBody = z.object({
  actionType: z.enum(ACTION_TYPE).optional(),
  description: z.string().min(1).max(2000).optional(),
  priority: z.enum(PRIORITY).optional(),
  owner: z.number().int().positive().optional().nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(ACTION_STATUS).optional(),
});
const ACTION_COL: Record<string, string> = {
  actionType: 'action_type', description: 'description', priority: 'priority',
  owner: 'owner', dueDate: 'due_date', status: 'status',
};

router.patch('/rbm-monitoring-actions/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchActionBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, ACTION_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  patch.args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE rbm_monitoring_actions SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length}
        RETURNING *`,
      patch.args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Action');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-action', err); }
});

export default router;
