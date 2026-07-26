/**
 * Risk-Based Monitoring (RBM / RBQM) — ICH E6(R3) + E8(R1) conduct layer.
 *
 * The monitoring surface between study design (protocol / SAP / CRF) and
 * submission. Mounted at /api/mdx. Mirrors mdx-risk-management.ts idioms:
 * raw parameterized SQL over the shared pool, the api-response envelope, Zod
 * validation, tenant scoping via organization_id + deleted_at IS NULL.
 *
 *   Risk Assessment (RACT / CtQ)
 *     GET   /api/mdx/rbm-assessments?program_id=<UUID>&status=
 *     POST  /api/mdx/rbm-assessments
 *     POST  /api/mdx/rbm-assessments/seed           seed a default RACT
 *     GET   /api/mdx/rbm-assessments/:id            assessment + its CtQ items
 *     PATCH /api/mdx/rbm-assessments/:id
 *     GET   /api/mdx/rbm-risk-items?program_id=&assessment_id=&status=
 *     POST  /api/mdx/rbm-risk-items
 *     PATCH /api/mdx/rbm-risk-items/:id
 *
 *   Key Risk Indicators
 *     GET   /api/mdx/rbm-kris?program_id=
 *     POST  /api/mdx/rbm-kris            POST /api/mdx/rbm-kris/seed
 *     PATCH /api/mdx/rbm-kris/:id        (recomputes status from value/thresholds)
 *
 *   Quality Tolerance Limits
 *     GET   /api/mdx/rbm-qtls?program_id=
 *     POST  /api/mdx/rbm-qtls            POST /api/mdx/rbm-qtls/seed
 *     PATCH /api/mdx/rbm-qtls/:id        (recomputes status/breached)
 *
 *   Central-monitoring signals
 *     GET   /api/mdx/rbm-signals?program_id=&status=&severity=
 *     POST  /api/mdx/rbm-signals         PATCH /api/mdx/rbm-signals/:id
 *
 *   Site risk
 *     GET   /api/mdx/rbm-site-risk?program_id=
 *     POST  /api/mdx/rbm-site-risk/recompute   (derives from site_intel)
 *
 *   Monitoring plan + actions
 *     GET   /api/mdx/rbm-monitoring-plans?program_id=
 *     POST  /api/mdx/rbm-monitoring-plans       GET .../:id (plan + actions)
 *     POST  /api/mdx/rbm-monitoring-plans/generate  (derive a draft plan + actions
 *                                                    from the governing RACT)
 *     PATCH /api/mdx/rbm-monitoring-plans/:id
 *     GET   /api/mdx/rbm-monitoring-actions?plan_id=&program_id=
 *     POST  /api/mdx/rbm-monitoring-actions     PATCH .../:id
 *
 *   Program summary
 *     GET   /api/mdx/rbm-summary/:programId
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { createScopedLogger } from '../utils/logger';
import {
  ok, created, clientError, orgRequired, notFoundInTenant, serverError,
} from '../lib/api-response';
import { pool } from '../db';
import {
  scoreRisk, overallRiskFromScores, kriStatus, qtlStatus,
  DEFAULT_CTQ_FACTORS, DEFAULT_KRIS, DEFAULT_QTLS,
  type KriDirection,
} from '../services/rbm/rbm-engine';
import { generatePlanFromAssessment } from '../services/rbm/rbm-actuator';
import { recomputeSiteRisk } from '../services/rbm/site-risk-engine';
import {
  detectSiteOutliers, scorePatientCohort,
  type SiteMetric, type PatientMetric,
} from '../services/rbm/central-statistical-monitoring';
import {
  buildRiskReview, renderRiskReviewMarkdown, buildAttentionFeed,
} from '../services/rbm/risk-report';
import { loadRiskReviewInput } from '../services/rbm/risk-report-data';
import { verifySignerCredentials, defaultSignoffDeps } from '../services/ana-ri/governed-action-signoff';

const router = Router();
const log = createScopedLogger('mdx-rbm');

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
const CATEGORY = ['safety', 'efficacy', 'data_integrity', 'compliance', 'operational'] as const;
const ITEM_STATUS = ['open', 'mitigating', 'accepted', 'closed'] as const;
const FRAMEWORK = ['ich_e6r3', 'transcelerate_ract'] as const;
const ASSESS_STATUS = ['draft', 'active', 'archived'] as const;
const KRI_DIRECTION = ['higher_worse', 'lower_worse'] as const;
const KRI_SOURCE = ['edc', 'ctms', 'site_intel', 'central_stats', 'manual'] as const;
const SIGNAL_SOURCE = ['central_stat', 'kri', 'qtl', 'site_score', 'manual'] as const;
const SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
const SIGNAL_STATUS = ['new', 'triaged', 'investigating', 'resolved', 'dismissed'] as const;
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

// ════════════════════════════════════════════════════════════════════════════
// RISK ASSESSMENTS (RACT)
// ════════════════════════════════════════════════════════════════════════════

const assessListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status: z.enum(ASSESS_STATUS).optional(),
});

router.get('/rbm-assessments', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = assessListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (parsed.data.program_id) { args.push(parsed.data.program_id); filters.push(`program_id = $${args.length}`); }
  if (parsed.data.status) { args.push(parsed.data.status); filters.push(`status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_risk_assessments WHERE ${filters.join(' AND ')} ORDER BY updated_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-assessments', err); }
});

const createAssessBody = z.object({
  programId: z.string().regex(UUID_RE).optional().nullable(),
  title: z.string().min(1).max(300),
  framework: z.enum(FRAMEWORK).optional(),
  overallRisk: z.enum(['low', 'medium', 'high']).optional().nullable(),
  status: z.enum(ASSESS_STATUS).optional(),
});

router.post('/rbm-assessments', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createAssessBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_risk_assessments (organization_id, program_id, title, framework, overall_risk, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orgId, p.programId ?? null, p.title, p.framework ?? 'ich_e6r3', p.overallRisk ?? null, p.status ?? 'draft'],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-assessment', err); }
});

/** Seed a default RACT (assessment + the CtQ-factor library) for a program. */
const seedAssessBody = z.object({
  programId: z.string().regex(UUID_RE),
  title: z.string().min(1).max(300).optional(),
  framework: z.enum(FRAMEWORK).optional(),
});

router.post('/rbm-assessments/seed', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedAssessBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  const scores = DEFAULT_CTQ_FACTORS.map(f => scoreRisk(f.likelihood, f.impact).score);
  const overall = overallRiskFromScores(scores);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Seeded as DRAFT. A seeded RACT is a starting library, not an approved
    // risk basis: activation is a governed, re-authenticated signature
    // (POST /rbm-assessments/:id/approve). Inserting it 'active' would let an
    // unreviewed default library govern monitoring-tier assignment and the
    // risk review report without anyone having signed for it.
    const { rows: aRows } = await client.query(
      `INSERT INTO rbm_risk_assessments (organization_id, program_id, title, framework, overall_risk, status)
       VALUES ($1,$2,$3,$4,$5,'draft') RETURNING *`,
      [orgId, programId, parsed.data.title ?? 'Risk assessment (RACT)', parsed.data.framework ?? 'ich_e6r3', overall],
    );
    const assessment = aRows[0];
    for (const f of DEFAULT_CTQ_FACTORS) {
      const { score } = scoreRisk(f.likelihood, f.impact);
      await client.query(
        `INSERT INTO rbm_risk_items (
           organization_id, assessment_id, program_id, category, ctq_factor, risk_description,
           likelihood, impact, risk_score, is_critical, mitigation, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open')`,
        [orgId, assessment.id, programId, f.category, f.ctqFactor, f.riskDescription,
          f.likelihood, f.impact, score, f.isCritical, f.mitigation],
      );
    }
    await client.query('COMMIT');
    const { rows: items } = await pool.query(
      `SELECT * FROM rbm_risk_items WHERE assessment_id = $1 ORDER BY risk_score DESC, id`,
      [assessment.id],
    );
    return created(res, { ...assessment, items });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return serverError(res, log, 'seed-assessment', err);
  } finally {
    client.release();
  }
});

router.get('/rbm-assessments/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_risk_assessments WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk assessment');
    const items = await pool.query(
      `SELECT * FROM rbm_risk_items WHERE assessment_id = $1 AND deleted_at IS NULL ORDER BY risk_score DESC NULLS LAST, id`,
      [id],
    );
    return ok(res, { ...rows[0], items: items.rows });
  } catch (err) { return serverError(res, log, 'get-assessment', err); }
});

const patchAssessBody = createAssessBody.partial();
const ASSESS_COL: Record<string, string> = {
  title: 'title', framework: 'framework', overallRisk: 'overall_risk', status: 'status',
};

router.patch('/rbm-assessments/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchAssessBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, ASSESS_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  patch.args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE rbm_risk_assessments SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length} AND deleted_at IS NULL
        RETURNING *`,
      patch.args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk assessment');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-assessment', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// RISK ITEMS (CtQ factors)
// ════════════════════════════════════════════════════════════════════════════

const itemListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  assessment_id: z.string().regex(/^\d+$/).optional(),
  status: z.enum(ITEM_STATUS).optional(),
});

router.get('/rbm-risk-items', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = itemListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (parsed.data.program_id) { args.push(parsed.data.program_id); filters.push(`program_id = $${args.length}`); }
  if (parsed.data.assessment_id) { args.push(Number(parsed.data.assessment_id)); filters.push(`assessment_id = $${args.length}`); }
  if (parsed.data.status) { args.push(parsed.data.status); filters.push(`status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_risk_items WHERE ${filters.join(' AND ')}
        ORDER BY risk_score DESC NULLS LAST, updated_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-items', err); }
});

const createItemBody = z.object({
  assessmentId: z.number().int().positive().optional().nullable(),
  programId: z.string().regex(UUID_RE).optional().nullable(),
  refCode: z.string().max(40).optional().nullable(),
  category: z.enum(CATEGORY).optional(),
  ctqFactor: z.string().min(1).max(2000),
  riskDescription: z.string().max(4000).optional().nullable(),
  likelihood: SCALE_1_5,
  impact: SCALE_1_5,
  detectability: SCALE_1_5.optional().nullable(),
  isCritical: z.boolean().optional(),
  mitigation: z.string().max(4000).optional().nullable(),
  status: z.enum(ITEM_STATUS).optional(),
  assignedTo: z.number().int().positive().optional().nullable(),
});

router.post('/rbm-risk-items', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const { score } = scoreRisk(p.likelihood, p.impact);
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_risk_items (
         organization_id, assessment_id, program_id, ref_code, category, ctq_factor,
         risk_description, likelihood, impact, detectability, risk_score, is_critical,
         mitigation, status, assigned_to
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [orgId, p.assessmentId ?? null, p.programId ?? null, p.refCode ?? null, p.category ?? 'operational',
        p.ctqFactor, p.riskDescription ?? null, p.likelihood, p.impact, p.detectability ?? null, score,
        p.isCritical ?? false, p.mitigation ?? null, p.status ?? 'open', p.assignedTo ?? null],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-item', err); }
});

const patchItemBody = createItemBody.partial().extend({
  residualLikelihood: SCALE_1_5.optional().nullable(),
  residualImpact: SCALE_1_5.optional().nullable(),
});
const ITEM_COL: Record<string, string> = {
  category: 'category', ctqFactor: 'ctq_factor', riskDescription: 'risk_description',
  likelihood: 'likelihood', impact: 'impact', detectability: 'detectability',
  isCritical: 'is_critical', mitigation: 'mitigation', status: 'status',
  assignedTo: 'assigned_to', refCode: 'ref_code',
  residualLikelihood: 'residual_likelihood', residualImpact: 'residual_impact',
};

router.patch('/rbm-risk-items/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchItemBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, ITEM_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  // Recompute scores when components change.
  if (parsed.data.likelihood != null && parsed.data.impact != null) {
    patch.args.push(scoreRisk(parsed.data.likelihood, parsed.data.impact).score);
    patch.setSql += `, risk_score = $${patch.args.length}`;
  }
  if (parsed.data.residualLikelihood != null && parsed.data.residualImpact != null) {
    patch.args.push(scoreRisk(parsed.data.residualLikelihood, parsed.data.residualImpact).score);
    patch.setSql += `, residual_score = $${patch.args.length}`;
  }
  patch.args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE rbm_risk_items SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length} AND deleted_at IS NULL
        RETURNING *`,
      patch.args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk item');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-item', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// KEY RISK INDICATORS
// ════════════════════════════════════════════════════════════════════════════

router.get('/rbm-kris', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  if (programId && !UUID_RE.test(programId)) return clientError(res, 422, 'program_id must be a UUID');
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_kris WHERE ${filters.join(' AND ')}
        ORDER BY CASE status WHEN 'red' THEN 0 WHEN 'amber' THEN 1 ELSE 2 END, name`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-kris', err); }
});

const createKriBody = z.object({
  programId: z.string().regex(UUID_RE).optional().nullable(),
  assessmentId: z.number().int().positive().optional().nullable(),
  name: z.string().min(1).max(300),
  metricDefinition: z.string().max(2000).optional().nullable(),
  dataSource: z.enum(KRI_SOURCE).optional(),
  unit: z.string().max(60).optional().nullable(),
  direction: z.enum(KRI_DIRECTION).optional(),
  thresholdAmber: z.number().optional().nullable(),
  thresholdRed: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
});

function computeKriStatus(value: number | null | undefined, amber: number | null | undefined, red: number | null | undefined, dir: KriDirection) {
  return kriStatus(value ?? null, amber ?? null, red ?? null, dir);
}

router.post('/rbm-kris', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createKriBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const dir: KriDirection = p.direction ?? 'higher_worse';
  const status = computeKriStatus(p.currentValue, p.thresholdAmber, p.thresholdRed, dir);
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_kris (
         organization_id, program_id, assessment_id, name, metric_definition, data_source,
         unit, direction, threshold_amber, threshold_red, current_value, status, evaluated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $11 IS NULL THEN NULL ELSE NOW() END)
       RETURNING *`,
      [orgId, p.programId ?? null, p.assessmentId ?? null, p.name, p.metricDefinition ?? null,
        p.dataSource ?? 'manual', p.unit ?? null, dir, p.thresholdAmber ?? null, p.thresholdRed ?? null,
        p.currentValue ?? null, status],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-kri', err); }
});

const seedProgramBody = z.object({ programId: z.string().regex(UUID_RE) });

router.post('/rbm-kris/seed', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  try {
    const out: unknown[] = [];
    for (const k of DEFAULT_KRIS) {
      // Seeded KRIs carry thresholds but no reading yet — 'not_evaluated',
      // never 'green'. A freshly seeded library has measured nothing.
      const { rows } = await pool.query(
        `INSERT INTO rbm_kris (organization_id, program_id, name, metric_definition, data_source, unit, direction, threshold_amber, threshold_red, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'not_evaluated') RETURNING *`,
        [orgId, programId, k.name, k.metricDefinition, k.dataSource, k.unit, k.direction, k.thresholdAmber, k.thresholdRed],
      );
      out.push(rows[0]);
    }
    return created(res, out, { count: out.length });
  } catch (err) { return serverError(res, log, 'seed-kris', err); }
});

const patchKriBody = createKriBody.partial();
const KRI_COL: Record<string, string> = {
  name: 'name', metricDefinition: 'metric_definition', dataSource: 'data_source', unit: 'unit',
  direction: 'direction', thresholdAmber: 'threshold_amber', thresholdRed: 'threshold_red',
  currentValue: 'current_value',
};

router.patch('/rbm-kris/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchKriBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, KRI_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  // Recompute status against the row's effective values.
  try {
    const cur = await pool.query(
      `SELECT direction, threshold_amber, threshold_red, current_value FROM rbm_kris WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (cur.rows.length === 0) return notFoundInTenant(res, 'KRI');
    const row = cur.rows[0];
    const dir: KriDirection = (parsed.data.direction ?? row.direction ?? 'higher_worse') as KriDirection;
    const amber = parsed.data.thresholdAmber ?? num(row.threshold_amber);
    const red = parsed.data.thresholdRed ?? num(row.threshold_red);
    const value = parsed.data.currentValue ?? num(row.current_value);
    const status = computeKriStatus(value, amber, red, dir);
    patch.args.push(status);
    patch.setSql += `, status = $${patch.args.length}`;
    if (parsed.data.currentValue !== undefined) patch.setSql += `, evaluated_at = NOW()`;
    patch.args.push(id, orgId);
    const { rows } = await pool.query(
      `UPDATE rbm_kris SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length} AND deleted_at IS NULL
        RETURNING *`,
      patch.args,
    );
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-kri', err); }
});

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/* ─── KRI trend history ───────────────────────────────────────────────── */

const appendKriValueBody = z.object({
  value: z.number(),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}([T ].*)?$/).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

/** Append a KRI reading; recompute status and roll it onto the KRI snapshot. */
router.post('/rbm-kris/:id/values', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = appendKriValueBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const cur = await pool.query(
      `SELECT direction, threshold_amber, threshold_red FROM rbm_kris WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (cur.rows.length === 0) return notFoundInTenant(res, 'KRI');
    const row = cur.rows[0];
    const dir: KriDirection = (row.direction ?? 'higher_worse') as KriDirection;
    const status = kriStatus(p.value, num(row.threshold_amber), num(row.threshold_red), dir);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO rbm_kri_values (organization_id, kri_id, value, status, observed_at, note)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, NOW()), $6) RETURNING *`,
        [orgId, id, p.value, status, p.observedAt ?? null, p.note ?? null],
      );
      await client.query(
        `UPDATE rbm_kris SET current_value = $1, status = $2, evaluated_at = NOW(), updated_at = NOW()
          WHERE id = $3 AND organization_id = $4`,
        [p.value, status, id, orgId],
      );
      await client.query('COMMIT');
      return created(res, ins.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { return serverError(res, log, 'append-kri-value', err); }
});

/** List a KRI's readings (oldest first) for a trend sparkline. */
router.get('/rbm-kris/:id/values', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  try {
    const own = await pool.query(
      `SELECT 1 FROM rbm_kris WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (own.rows.length === 0) return notFoundInTenant(res, 'KRI');
    const { rows } = await pool.query(
      `SELECT * FROM rbm_kri_values WHERE kri_id = $1 AND organization_id = $2 ORDER BY observed_at ASC LIMIT 500`,
      [id, orgId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-kri-values', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// QUALITY TOLERANCE LIMITS
// ════════════════════════════════════════════════════════════════════════════

router.get('/rbm-qtls', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  if (programId && !UUID_RE.test(programId)) return clientError(res, 422, 'program_id must be a UUID');
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`program_id = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_qtls WHERE ${filters.join(' AND ')}
        ORDER BY CASE status WHEN 'breached' THEN 0 WHEN 'approaching' THEN 1 ELSE 2 END, parameter`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-qtls', err); }
});

const createQtlBody = z.object({
  programId: z.string().regex(UUID_RE).optional().nullable(),
  parameter: z.string().min(1).max(300),
  rationale: z.string().max(2000).optional().nullable(),
  threshold: z.number().optional().nullable(),
  secondaryLimit: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  breachActionTaken: z.string().max(2000).optional().nullable(),
});

router.post('/rbm-qtls', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createQtlBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  const status = qtlStatus(p.currentValue ?? null, p.threshold ?? null, p.secondaryLimit ?? null);
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_qtls (organization_id, program_id, parameter, rationale, threshold, secondary_limit, current_value, breached, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [orgId, p.programId ?? null, p.parameter, p.rationale ?? null, p.threshold ?? null,
        p.secondaryLimit ?? null, p.currentValue ?? null, status === 'breached', status],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-qtl', err); }
});

router.post('/rbm-qtls/seed', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  try {
    const out: unknown[] = [];
    for (const q of DEFAULT_QTLS) {
      const secondary = Math.round(q.threshold * q.secondaryFraction * 10000) / 10000;
      // Seeded with limits but no current value — 'not_evaluated'. Reporting a
      // never-measured parameter as 'within' would claim tolerance the study
      // has not demonstrated.
      const { rows } = await pool.query(
        `INSERT INTO rbm_qtls (organization_id, program_id, parameter, rationale, threshold, secondary_limit, status)
         VALUES ($1,$2,$3,$4,$5,$6,'not_evaluated') RETURNING *`,
        [orgId, programId, q.parameter, q.rationale, q.threshold, secondary],
      );
      out.push(rows[0]);
    }
    return created(res, out, { count: out.length });
  } catch (err) { return serverError(res, log, 'seed-qtls', err); }
});

const patchQtlBody = createQtlBody.partial();
const QTL_COL: Record<string, string> = {
  parameter: 'parameter', rationale: 'rationale', threshold: 'threshold',
  secondaryLimit: 'secondary_limit', currentValue: 'current_value', breachActionTaken: 'breach_action_taken',
};

router.patch('/rbm-qtls/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchQtlBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, QTL_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  try {
    const cur = await pool.query(
      `SELECT threshold, secondary_limit, current_value FROM rbm_qtls WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, orgId],
    );
    if (cur.rows.length === 0) return notFoundInTenant(res, 'QTL');
    const row = cur.rows[0];
    const threshold = parsed.data.threshold ?? num(row.threshold);
    const secondary = parsed.data.secondaryLimit ?? num(row.secondary_limit);
    const value = parsed.data.currentValue ?? num(row.current_value);
    const status = qtlStatus(value, threshold, secondary);
    patch.args.push(status, status === 'breached');
    patch.setSql += `, status = $${patch.args.length - 1}, breached = $${patch.args.length}`;
    patch.args.push(id, orgId);
    const { rows } = await pool.query(
      `UPDATE rbm_qtls SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length} AND deleted_at IS NULL
        RETURNING *`,
      patch.args,
    );
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-qtl', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// SIGNALS
// ════════════════════════════════════════════════════════════════════════════

const signalListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status: z.enum(SIGNAL_STATUS).optional(),
  severity: z.enum(SEVERITY).optional(),
});

router.get('/rbm-signals', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = signalListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (parsed.data.program_id) { args.push(parsed.data.program_id); filters.push(`program_id = $${args.length}`); }
  if (parsed.data.status) { args.push(parsed.data.status); filters.push(`status = $${args.length}`); }
  if (parsed.data.severity) { args.push(parsed.data.severity); filters.push(`severity = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_signals WHERE ${filters.join(' AND ')}
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, detected_at DESC`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-signals', err); }
});

const createSignalBody = z.object({
  programId: z.string().regex(UUID_RE).optional().nullable(),
  siteId: z.string().max(120).optional().nullable(),
  source: z.enum(SIGNAL_SOURCE).optional(),
  signalType: z.string().max(120).optional().nullable(),
  severity: z.enum(SEVERITY).optional(),
  title: z.string().min(1).max(400),
  detail: z.string().max(4000).optional().nullable(),
  statistic: z.record(z.unknown()).optional().nullable(),
});

router.post('/rbm-signals', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = createSignalBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_signals (organization_id, program_id, site_id, source, signal_type, severity, title, detail, statistic, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new') RETURNING *`,
      [orgId, p.programId ?? null, p.siteId ?? null, p.source ?? 'manual', p.signalType ?? null,
        p.severity ?? 'medium', p.title, p.detail ?? null, JSON.stringify(p.statistic ?? {})],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'create-signal', err); }
});

const patchSignalBody = z.object({
  severity: z.enum(SEVERITY).optional(),
  status: z.enum(SIGNAL_STATUS).optional(),
  resolutionNotes: z.string().max(4000).optional().nullable(),
  detail: z.string().max(4000).optional().nullable(),
});
const SIGNAL_COL: Record<string, string> = {
  severity: 'severity', status: 'status', resolutionNotes: 'resolution_notes', detail: 'detail',
};

router.patch('/rbm-signals/:id', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = patchSignalBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const patch = buildPatch(parsed.data, SIGNAL_COL);
  if (!patch) return clientError(res, 422, 'No updatable fields in body');
  patch.args.push(id, orgId);
  try {
    const { rows } = await pool.query(
      `UPDATE rbm_signals SET ${patch.setSql}, updated_at = NOW()
        WHERE id = $${patch.args.length - 1} AND organization_id = $${patch.args.length} AND deleted_at IS NULL
        RETURNING *`,
      patch.args,
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Signal');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'patch-signal', err); }
});

/**
 * Record a signal investigation and, optionally, the follow-up action it
 * raises — in ONE transaction.
 *
 * Doing this as two calls (PATCH the signal, then POST the action) can commit
 * the disposition and then fail to create the action, leaving a signal marked
 * resolved with the follow-up it promised missing, while the UI reports the
 * change as unsaved. A monitoring decision and the action it commits to are
 * one record; they land together or not at all.
 */
const investigateBody = z.object({
  status: z.enum(SIGNAL_STATUS),
  resolutionNotes: z.string().max(4000).optional().nullable(),
  action: z.object({
    planId: z.number().int().positive(),
    actionType: z.enum(ACTION_TYPE).optional(),
    description: z.string().min(1).max(2000),
    priority: z.enum(PRIORITY).optional(),
    owner: z.number().int().positive().optional().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  }).optional().nullable(),
});

router.post('/rbm-signals/:id/investigate', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const id = numericId(req.params.id);
  if (id === null) return clientError(res, 422, 'id must be numeric');
  const parsed = investigateBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sigRows } = await client.query(
      `UPDATE rbm_signals SET status = $1, resolution_notes = $2, updated_at = NOW()
        WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
        RETURNING *`,
      [p.status, p.resolutionNotes ?? null, id, orgId],
    );
    if (sigRows.length === 0) {
      await client.query('ROLLBACK');
      return notFoundInTenant(res, 'Signal');
    }

    let action = null;
    if (p.action) {
      const own = await client.query(
        `SELECT 1 FROM rbm_monitoring_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
        [p.action.planId, orgId],
      );
      if (own.rows.length === 0) {
        // Fail the whole thing: the investigation must not land without the
        // action it committed to.
        await client.query('ROLLBACK');
        return notFoundInTenant(res, 'Monitoring plan');
      }
      const { rows } = await client.query(
        `INSERT INTO rbm_monitoring_actions (organization_id, plan_id, signal_id, action_type, description, priority, owner, due_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open') RETURNING *`,
        [orgId, p.action.planId, id, p.action.actionType ?? 'issue', p.action.description,
          p.action.priority ?? 'medium', p.action.owner ?? null, p.action.dueDate ?? null],
      );
      action = rows[0];
    }

    await client.query('COMMIT');
    return ok(res, { signal: sigRows[0], action });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return serverError(res, log, 'investigate-signal', err);
  } finally {
    client.release();
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SITE RISK
// ════════════════════════════════════════════════════════════════════════════

router.get('/rbm-site-risk', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  // program_id is optional: scope to one program when given, else return the
  // org's whole site-risk roster (the v2 Clinical-ops board reads it org-wide,
  // with no program handle to pass).
  const programId = typeof req.query.program_id === 'string' ? req.query.program_id : undefined;
  if (programId && !UUID_RE.test(programId)) return clientError(res, 422, 'program_id must be a UUID');
  const filters = ['r.organization_id = $1'];
  const args: unknown[] = [orgId];
  if (programId) { args.push(programId); filters.push(`r.program_id = $${args.length}`); }
  try {
    // LEFT JOIN site_intel.sites for the site's country (not stored on the
    // score row). The RBM recompute already depends on site_intel.sites, so the
    // join is safe wherever scores exist; if the schema is absent the read
    // fails closed to empty rather than 500.
    const { rows } = await pool.query(
      `SELECT r.*, si.country_code
         FROM rbm_site_risk_scores r
         LEFT JOIN site_intel.sites si
           ON si.program_id = r.program_id AND si.site_number = r.site_number
        WHERE ${filters.join(' AND ')}
        ORDER BY r.composite_risk DESC NULLS LAST, r.site_number`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) {
    if ((err as { code?: string })?.code === '42P01') return ok(res, [], { count: 0, pendingStore: true });
    return serverError(res, log, 'list-site-risk', err);
  }
});

router.post('/rbm-site-risk/recompute', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  try {
    const snapshots = await recomputeSiteRisk(orgId, parsed.data.programId);
    return ok(res, snapshots, { count: snapshots.length });
  } catch (err) { return serverError(res, log, 'recompute-site-risk', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// CENTRAL STATISTICAL MONITORING (CluePoints SMART-style cross-site outliers)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Run unsupervised cross-site outlier detection over the program's site-risk
 * snapshot and raise a signal for each flagged site×dimension. Replaces prior
 * untriaged (status='new') central_stat signals so re-runs don't pile up;
 * triaged/investigating signals are preserved.
 */
router.post('/rbm-central-monitoring/run', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  try {
    const { rows: sites } = await pool.query(
      `SELECT site_id, site_number, composite_risk, enrollment_risk, quality_risk, operational_risk
         FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
      [orgId, programId],
    );
    const cohort: SiteMetric[] = sites.map((s: any) => ({
      siteId: s.site_id ?? null,
      siteNumber: s.site_number ?? null,
      metrics: {
        composite: num(s.composite_risk),
        enrollment: num(s.enrollment_risk),
        quality: num(s.quality_risk),
        operational: num(s.operational_risk),
      },
    }));
    const findings = detectSiteOutliers(cohort);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `DELETE FROM rbm_signals WHERE organization_id = $1 AND program_id = $2
           AND source = 'central_stat' AND status = 'new'`,
        [orgId, programId],
      );
      const inserted: unknown[] = [];
      for (const f of findings) {
        const { rows } = await client.query(
          `INSERT INTO rbm_signals (organization_id, program_id, site_id, source, signal_type, severity, title, detail, statistic, status)
           VALUES ($1,$2,$3,'central_stat',$4,$5,$6,$7,$8,'new') RETURNING *`,
          [
            orgId, programId, f.siteId, `outlier_${f.dimension}`, f.severity,
            `Site ${f.siteNumber ?? f.siteId ?? '?'} is a ${f.dimension}-risk outlier`,
            `Central statistical monitoring flagged this site: ${f.dimension} risk score ${f.value} is an outlier vs the study cohort (robust z ${f.score}).`,
            JSON.stringify({ dimension: f.dimension, value: f.value, score: f.score }),
          ],
        );
        inserted.push(rows[0]);
      }
      await client.query('COMMIT');
      return ok(res, { findings, signals: inserted }, { cohortSize: cohort.length, flagged: findings.length });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { return serverError(res, log, 'central-monitoring-run', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// SITE OVERSIGHT (SPOT-style per-site profile)
// ════════════════════════════════════════════════════════════════════════════

/** Per-site oversight profile: risk + tier + drivers + open-signal count. */
router.get('/rbm-site-oversight/:programId', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  try {
    const { rows } = await pool.query(
      `SELECT sr.site_id, sr.site_number, sr.site_name, sr.composite_risk, sr.monitoring_tier, sr.drivers,
              COALESCE(sig.open_signals, 0)::int AS open_signals,
              COALESCE(sig.high_signals, 0)::int AS high_signals
         FROM rbm_site_risk_scores sr
         LEFT JOIN (
           SELECT site_id,
                  COUNT(*) FILTER (WHERE status IN ('new','triaged','investigating')) AS open_signals,
                  COUNT(*) FILTER (WHERE status IN ('new','triaged','investigating') AND severity IN ('high','critical')) AS high_signals
             FROM rbm_signals
            WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
            GROUP BY site_id
         ) sig ON sig.site_id = sr.site_id
        WHERE sr.organization_id = $1 AND sr.program_id = $2
        ORDER BY sr.composite_risk DESC NULLS LAST, sr.site_number`,
      [orgId, programId],
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'site-oversight', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// PATIENT PROFILES (CluePoints-style patient-level anomaly detection)
// ════════════════════════════════════════════════════════════════════════════

const PATIENT_STATUS = ['normal', 'review', 'flagged'] as const;

const patientListQuery = z.object({
  program_id: z.string().regex(UUID_RE).optional(),
  status: z.enum(PATIENT_STATUS).optional(),
});

router.get('/rbm-patient-profiles', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = patientListQuery.safeParse(req.query);
  if (!parsed.success) return clientError(res, 422, 'Invalid query', parsed.error.flatten().fieldErrors);
  const filters = [`organization_id = $1`, `deleted_at IS NULL`];
  const args: unknown[] = [orgId];
  if (parsed.data.program_id) { args.push(parsed.data.program_id); filters.push(`program_id = $${args.length}`); }
  if (parsed.data.status) { args.push(parsed.data.status); filters.push(`status = $${args.length}`); }
  try {
    const { rows } = await pool.query(
      `SELECT * FROM rbm_patient_profiles WHERE ${filters.join(' AND ')}
        ORDER BY anomaly_score DESC NULLS LAST, subject_id`,
      args,
    );
    return ok(res, rows, { count: rows.length });
  } catch (err) { return serverError(res, log, 'list-patients', err); }
});

const upsertPatientBody = z.object({
  programId: z.string().regex(UUID_RE),
  subjectId: z.string().min(1).max(120),
  siteId: z.string().max(120).optional().nullable(),
  metrics: z.record(z.number()).default({}),
});

router.post('/rbm-patient-profiles', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = upsertPatientBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const p = parsed.data;
  try {
    const { rows } = await pool.query(
      `INSERT INTO rbm_patient_profiles (organization_id, program_id, site_id, subject_id, metrics)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (organization_id, program_id, subject_id)
       DO UPDATE SET site_id = EXCLUDED.site_id, metrics = EXCLUDED.metrics, updated_at = NOW()
       RETURNING *`,
      [orgId, p.programId, p.siteId ?? null, p.subjectId, JSON.stringify(p.metrics)],
    );
    return created(res, rows[0]);
  } catch (err) { return serverError(res, log, 'upsert-patient', err); }
});

/** Run patient-level anomaly scoring across the program's cohort. */
router.post('/rbm-patient-profiles/score', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const parsed = seedProgramBody.safeParse(req.body ?? {});
  if (!parsed.success) return clientError(res, 422, 'Invalid body', parsed.error.flatten().fieldErrors);
  const { programId } = parsed.data;
  try {
    const { rows } = await pool.query(
      `SELECT id, subject_id, site_id, metrics FROM rbm_patient_profiles
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
      [orgId, programId],
    );
    const cohort: PatientMetric[] = rows.map((r: any) => ({
      subjectId: r.subject_id,
      siteId: r.site_id ?? null,
      metrics: (r.metrics && typeof r.metrics === 'object') ? r.metrics : {},
    }));
    const scored = scorePatientCohort(cohort);
    const byId = new Map(rows.map((r: any, i: number) => [r.id, scored[i]]));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of rows) {
        const s = byId.get(r.id)!;
        await client.query(
          `UPDATE rbm_patient_profiles
              SET anomaly_score = $1, top_dimension = $2, status = $3, scored_at = NOW(), updated_at = NOW()
            WHERE id = $4 AND organization_id = $5`,
          [s.anomalyScore, s.topDimension, s.status, r.id, orgId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    const flagged = scored.filter(s => s.status === 'flagged').length;
    const review = scored.filter(s => s.status === 'review').length;
    return ok(res, scored, { cohortSize: cohort.length, flagged, review });
  } catch (err) { return serverError(res, log, 'score-patients', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// GOVERNED APPROVAL (reason-for-change; 21 CFR Part 11 audit via /api/mdx)
// ════════════════════════════════════════════════════════════════════════════

// Approval is a 21 CFR Part 11 e-signature: the reason-for-change plus the
// signer's re-authentication credentials (password, and TOTP when the signer
// has MFA enabled), verified server-side via verifySignerCredentials.
const approveBody = z.object({
  reason: z.string().min(3).max(2000),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});

/** Approve + activate a risk assessment, capturing the reason for change. */
router.post('/rbm-assessments/:id/approve', async (req, res) => {
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
  try {
    const { rows } = await pool.query(
      `UPDATE rbm_risk_assessments
          SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvalReason', $2::text)
        WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
        RETURNING *`,
      [signerId, parsed.data.reason, id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Risk assessment');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'approve-assessment', err); }
});

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
  try {
    const { rows } = await pool.query(
      `UPDATE rbm_monitoring_plans
          SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvalReason', $2::text)
        WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
        RETURNING *`,
      [signerId, parsed.data.reason, id, orgId],
    );
    if (rows.length === 0) return notFoundInTenant(res, 'Monitoring plan');
    return ok(res, rows[0]);
  } catch (err) { return serverError(res, log, 'approve-plan', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// MONITORING PLANS + ACTIONS
// ════════════════════════════════════════════════════════════════════════════

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
    const { rows } = await pool.query(
      `INSERT INTO rbm_monitoring_plans (organization_id, program_id, assessment_id, title, strategy, status)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orgId, p.programId ?? null, p.assessmentId ?? null, p.title, p.strategy ?? 'risk_based', p.status ?? 'draft'],
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
  patch.args.push(id, orgId);
  try {
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

// ════════════════════════════════════════════════════════════════════════════
// PROGRAM SUMMARY
// ════════════════════════════════════════════════════════════════════════════

router.get('/rbm-summary/:programId', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  try {
    const [items, kris, qtls, signals, sites, assessments] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_critical)::int AS critical,
                COUNT(*) FILTER (WHERE status IN ('open','mitigating'))::int AS open,
                COUNT(*) FILTER (WHERE risk_score >= 15)::int AS high
           FROM rbm_risk_items WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
        [orgId, programId]),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'red')::int AS red,
                COUNT(*) FILTER (WHERE status = 'amber')::int AS amber,
                COUNT(*) FILTER (WHERE status = 'not_evaluated')::int AS "notEvaluated"
           FROM rbm_kris WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
        [orgId, programId]),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'breached')::int AS breached,
                COUNT(*) FILTER (WHERE status = 'approaching')::int AS approaching,
                COUNT(*) FILTER (WHERE status = 'not_evaluated')::int AS "notEvaluated"
           FROM rbm_qtls WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
        [orgId, programId]),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ('new','triaged','investigating'))::int AS open,
                COUNT(*) FILTER (WHERE severity IN ('high','critical') AND status NOT IN ('resolved','dismissed'))::int AS high
           FROM rbm_signals WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
        [orgId, programId]),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE monitoring_tier = 'enhanced')::int AS enhanced
           FROM rbm_site_risk_scores WHERE organization_id = $1 AND program_id = $2`,
        [orgId, programId]),
      pool.query(
        `SELECT overall_risk FROM rbm_risk_assessments
           WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL AND status = 'active'
           ORDER BY updated_at DESC LIMIT 1`,
        [orgId, programId]),
    ]);
    return ok(res, {
      overallRisk: assessments.rows[0]?.overall_risk ?? null,
      riskItems: items.rows[0],
      kris: kris.rows[0],
      qtls: qtls.rows[0],
      signals: signals.rows[0],
      sites: sites.rows[0],
    });
  } catch (err) { return serverError(res, log, 'summary', err); }
});

// ════════════════════════════════════════════════════════════════════════════
// RISK REVIEW REPORT + ATTENTION FEED (premium deliverable + daily driver)
// ════════════════════════════════════════════════════════════════════════════

/** Assemble the aggregated inputs for the risk review / attention feed. */
const assembleReviewInput = (orgId: number, programId: string, asOf: string) =>
  loadRiskReviewInput(pool, orgId, programId, asOf);

/** Inspection-ready ICH E6(R3) risk review (structured + markdown). */
router.get('/rbm-report/:programId', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  try {
    const input = await assembleReviewInput(orgId, programId, new Date().toISOString());
    const report = buildRiskReview(input);
    return ok(res, { report, markdown: renderRiskReviewMarkdown(report) });
  } catch (err) { return serverError(res, log, 'report', err); }
});

/** Prioritized "needs attention now" feed. */
router.get('/rbm-attention/:programId', async (req, res) => {
  const orgId = getOrgId(req);
  if (orgId === null) return orgRequired(res);
  const programId = String(req.params.programId);
  if (!UUID_RE.test(programId)) return clientError(res, 422, 'programId must be a UUID');
  try {
    const input = await assembleReviewInput(orgId, programId, new Date().toISOString());
    const items = buildAttentionFeed(input);
    return ok(res, items, { count: items.length });
  } catch (err) { return serverError(res, log, 'attention', err); }
});

export default router;
