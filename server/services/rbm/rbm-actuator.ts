/**
 * @fileoverview RBM actuation service — the canonical write + engine-inference
 * operations for Risk-Based Monitoring (ICH E6(R3)/E8(R1)).
 * @module server/services/rbm/rbm-actuator
 *
 * Extracted so the AnA tool handlers can drive the exact same mutations the
 * `/api/mdx/rbm-*` routes expose — create Critical-to-Quality factors, KRIs, KRI
 * readings, QTLs, signals, monitoring plans, and actions; triage signals; and
 * approve assessments/plans — from conversation instead of forms.
 *
 * Design contract:
 *   - EVERY function is tenant-scoped. `organizationId` is passed by the caller
 *     from trusted server context (JWT principal / AnA ToolContext) and written
 *     on every row + used in every WHERE. It is NEVER taken from model input.
 *   - The functions INFER the derived fields a form would otherwise ask for:
 *     risk score + criticality band (likelihood×impact), KRI status (vs amber/red
 *     + direction), QTL status + the secondary early-warning limit, and the
 *     monitoring-plan strategy (from the assessment's overall risk). Callers only
 *     supply the primitives a monitor actually knows.
 *   - `Exec` is any pg-like query runner (`pool` or a pooled client), so the same
 *     code runs behind the route (shared pool) and behind AnA (`getPool()`), and
 *     is unit-testable with a mock.
 */

import {
  scoreRisk,
  bandFromScore,
  kriStatus,
  qtlStatus,
  defaultPlanStrategy,
  type KriDirection,
} from './rbm-engine';

/** Minimal pg-compatible executor: `pool`, a pooled client, or a test double. */
export interface Exec {
  query(sql: string, args: unknown[]): Promise<{ rows: any[] }>;
}

const CTQ_CATEGORY = ['safety', 'efficacy', 'data_integrity', 'compliance', 'operational'] as const;
const SIGNAL_SOURCE = ['central_stat', 'kri', 'qtl', 'site_score', 'manual'] as const;
const SEVERITY = ['low', 'medium', 'high', 'critical'] as const;
const SIGNAL_STATUS = ['new', 'triaged', 'investigating', 'resolved', 'dismissed'] as const;
const ACTION_TYPE = ['issue', 'capa', 'site_visit', 'query', 'escalation'] as const;
const PRIORITY = ['low', 'medium', 'high'] as const;
const ACTION_STATUS = ['open', 'in_progress', 'done'] as const;

export type CtqCategory = (typeof CTQ_CATEGORY)[number];
export type SignalSeverity = (typeof SEVERITY)[number];

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Secondary (early-warning) QTL limit when the caller doesn't set one: 75% of
 *  the primary threshold — the upper end of the TransCelerate 50–75% band. */
export function inferSecondaryLimit(threshold: number | null | undefined): number | null {
  if (threshold == null || !Number.isFinite(threshold)) return null;
  return Math.round(threshold * 0.75 * 10000) / 10000;
}

// ── Risk assessment — Critical-to-Quality factors ────────────────────────────

export interface AddCtqInput {
  programId?: string | null;
  assessmentId?: number | null;
  category?: CtqCategory;
  ctqFactor: string;
  riskDescription?: string | null;
  likelihood: number;
  impact: number;
  detectability?: number | null;
  isCritical?: boolean;
  mitigation?: string | null;
}

/** Create a CtQ risk item. Infers risk_score from likelihood×impact and, when
 *  `isCritical` is omitted, infers criticality from the score band (high ⇒ true). */
export async function addCtqFactor(exec: Exec, organizationId: number, input: AddCtqInput) {
  const { score, band } = scoreRisk(input.likelihood, input.impact);
  const isCritical = input.isCritical ?? band === 'high';
  const { rows } = await exec.query(
    `INSERT INTO rbm_risk_items (
       organization_id, assessment_id, program_id, category, ctq_factor, risk_description,
       likelihood, impact, detectability, risk_score, is_critical, mitigation, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open') RETURNING *`,
    [
      organizationId, input.assessmentId ?? null, input.programId ?? null,
      input.category ?? 'operational', input.ctqFactor, input.riskDescription ?? null,
      input.likelihood, input.impact, input.detectability ?? null, score, isCritical,
      input.mitigation ?? null,
    ],
  );
  return { item: rows[0], inferred: { riskScore: score, band, isCritical } };
}

// ── Key Risk Indicators ──────────────────────────────────────────────────────

export interface DefineKriInput {
  programId?: string | null;
  assessmentId?: number | null;
  name: string;
  metricDefinition?: string | null;
  dataSource?: string;
  unit?: string | null;
  direction?: KriDirection;
  thresholdAmber?: number | null;
  thresholdRed?: number | null;
  currentValue?: number | null;
}

/** Create a KRI. Infers green/amber/red status from the current value vs the
 *  amber/red thresholds and the direction. */
export async function defineKri(exec: Exec, organizationId: number, input: DefineKriInput) {
  const dir: KriDirection = input.direction ?? 'higher_worse';
  const status = kriStatus(input.currentValue ?? null, input.thresholdAmber ?? null, input.thresholdRed ?? null, dir);
  const { rows } = await exec.query(
    `INSERT INTO rbm_kris (
       organization_id, program_id, assessment_id, name, metric_definition, data_source,
       unit, direction, threshold_amber, threshold_red, current_value, status, evaluated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, CASE WHEN $11 IS NULL THEN NULL ELSE NOW() END)
     RETURNING *`,
    [
      organizationId, input.programId ?? null, input.assessmentId ?? null, input.name,
      input.metricDefinition ?? null, input.dataSource ?? 'manual', input.unit ?? null, dir,
      input.thresholdAmber ?? null, input.thresholdRed ?? null, input.currentValue ?? null, status,
    ],
  );
  return { kri: rows[0], inferred: { status } };
}

export interface RecordKriReadingInput {
  kriId?: number | null;
  kriName?: string | null;
  programId?: string | null;
  value: number;
  observedAt?: string | null;
  note?: string | null;
}

/** Append a KRI reading and recompute the KRI's status. The KRI is resolved by
 *  id, or by (case-insensitive) name within the program when the caller only
 *  knows the indicator's name — so AnA can log "screen-failure rate is 34%"
 *  without an id. Returns `{ resolved:false }` when no matching KRI exists. */
export async function recordKriReading(exec: Exec, organizationId: number, input: RecordKriReadingInput) {
  let kri: any = null;
  if (input.kriId != null) {
    kri = (await exec.query(
      `SELECT id, direction, threshold_amber, threshold_red FROM rbm_kris
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [input.kriId, organizationId],
    )).rows[0] ?? null;
  } else if (input.kriName && input.programId) {
    kri = (await exec.query(
      `SELECT id, direction, threshold_amber, threshold_red FROM rbm_kris
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND LOWER(name) = LOWER($3) LIMIT 1`,
      [organizationId, input.programId, input.kriName],
    )).rows[0] ?? null;
  }
  if (!kri) return { resolved: false as const };

  const dir: KriDirection = (kri.direction ?? 'higher_worse') as KriDirection;
  const status = kriStatus(input.value, num(kri.threshold_amber), num(kri.threshold_red), dir);
  const ins = await exec.query(
    `INSERT INTO rbm_kri_values (organization_id, kri_id, value, status, observed_at, note)
     VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, NOW()), $6) RETURNING *`,
    [organizationId, kri.id, input.value, status, input.observedAt ?? null, input.note ?? null],
  );
  await exec.query(
    `UPDATE rbm_kris SET current_value = $1, status = $2, evaluated_at = NOW(), updated_at = NOW()
      WHERE id = $3 AND organization_id = $4`,
    [input.value, status, kri.id, organizationId],
  );
  return { resolved: true as const, reading: ins.rows[0], kriId: kri.id, inferred: { status } };
}

// ── Quality Tolerance Limits ─────────────────────────────────────────────────

export interface SetQtlInput {
  programId?: string | null;
  parameter: string;
  rationale?: string | null;
  threshold?: number | null;
  secondaryLimit?: number | null;
  currentValue?: number | null;
}

/** Create a QTL. Infers the secondary early-warning limit (75% of threshold)
 *  when omitted, and the within/approaching/breached status from the value. */
export async function setQtl(exec: Exec, organizationId: number, input: SetQtlInput) {
  const secondary = input.secondaryLimit ?? inferSecondaryLimit(input.threshold);
  const status = qtlStatus(input.currentValue ?? null, {
    threshold: input.threshold ?? null, secondaryLimit: secondary, direction: 'upper',
  });
  const { rows } = await exec.query(
    `INSERT INTO rbm_qtls (organization_id, program_id, parameter, rationale, threshold, secondary_limit, current_value, breached, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      organizationId, input.programId ?? null, input.parameter, input.rationale ?? null,
      input.threshold ?? null, secondary, input.currentValue ?? null, status === 'breached', status,
    ],
  );
  return { qtl: rows[0], inferred: { secondaryLimit: secondary, status } };
}

// ── Central-monitoring signals ───────────────────────────────────────────────

export interface RaiseSignalInput {
  programId?: string | null;
  siteId?: string | null;
  source?: (typeof SIGNAL_SOURCE)[number];
  signalType?: string | null;
  severity?: SignalSeverity;
  title: string;
  detail?: string | null;
  statistic?: Record<string, unknown> | null;
}

/** Raise a monitoring signal (defaults source=manual, severity=medium, status=new). */
export async function raiseSignal(exec: Exec, organizationId: number, input: RaiseSignalInput) {
  const { rows } = await exec.query(
    `INSERT INTO rbm_signals (organization_id, program_id, site_id, source, signal_type, severity, title, detail, statistic, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new') RETURNING *`,
    [
      organizationId, input.programId ?? null, input.siteId ?? null, input.source ?? 'manual',
      input.signalType ?? null, input.severity ?? 'medium', input.title, input.detail ?? null,
      JSON.stringify(input.statistic ?? {}),
    ],
  );
  return { signal: rows[0] };
}

export interface TriageSignalInput {
  signalId: number;
  status?: (typeof SIGNAL_STATUS)[number];
  severity?: SignalSeverity;
  resolutionNotes?: string | null;
  detail?: string | null;
}

/** Triage a signal (status / severity / notes). Returns null when not found in
 *  the tenant. */
export async function triageSignal(exec: Exec, organizationId: number, input: TriageSignalInput) {
  const set: string[] = [];
  const args: unknown[] = [];
  const add = (col: string, v: unknown) => { args.push(v); set.push(`${col} = $${args.length}`); };
  if (input.status !== undefined) add('status', input.status);
  if (input.severity !== undefined) add('severity', input.severity);
  if (input.resolutionNotes !== undefined) add('resolution_notes', input.resolutionNotes);
  if (input.detail !== undefined) add('detail', input.detail);
  if (set.length === 0) return { updated: false as const, reason: 'no_fields' };
  args.push(input.signalId, organizationId);
  const { rows } = await exec.query(
    `UPDATE rbm_signals SET ${set.join(', ')}, updated_at = NOW()
      WHERE id = $${args.length - 1} AND organization_id = $${args.length} AND deleted_at IS NULL
      RETURNING *`,
    args,
  );
  return rows[0] ? { updated: true as const, signal: rows[0] } : { updated: false as const, reason: 'not_found' };
}

// ── Monitoring plan + actions ────────────────────────────────────────────────

export interface DraftPlanInput {
  programId?: string | null;
  assessmentId?: number | null;
  title?: string;
  strategy?: 'centralized' | 'risk_based' | 'on_site' | 'hybrid';
}

/** Create a monitoring plan. When the strategy is omitted, infer it from the
 *  program's latest assessment overall risk (defaultPlanStrategy). */
export async function draftPlan(exec: Exec, organizationId: number, input: DraftPlanInput) {
  let strategy = input.strategy;
  let overall: string | null = null;
  if (!strategy && input.programId) {
    const a = (await exec.query(
      `SELECT overall_risk FROM rbm_risk_assessments
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 1`,
      [organizationId, input.programId],
    )).rows[0];
    overall = a?.overall_risk ?? null;
    if (overall === 'low' || overall === 'medium' || overall === 'high') {
      strategy = defaultPlanStrategy(overall);
    }
  }
  strategy = strategy ?? 'risk_based';
  const title = input.title ?? 'Risk-based monitoring plan';
  const { rows } = await exec.query(
    `INSERT INTO rbm_monitoring_plans (organization_id, program_id, assessment_id, title, strategy, status)
     VALUES ($1,$2,$3,$4,$5,'draft') RETURNING *`,
    [organizationId, input.programId ?? null, input.assessmentId ?? null, title, strategy],
  );
  return { plan: rows[0], inferred: { strategy, fromOverallRisk: overall } };
}

export interface AmendAssessmentResult {
  amended: boolean;
  reason?: 'not_found' | 'not_approved' | 'amendment_already_open';
  assessment?: any;
  items?: any[];
  /** The version this amendment was opened from. */
  supersedes?: number;
}

/**
 * Open a versioned amendment to an APPROVED risk assessment.
 *
 * An approved RACT is frozen: its e-signature attests to specific CtQ content,
 * so editing in place would leave the signature pointing at content the signer
 * never saw. But a study's risks genuinely change, so "frozen" cannot mean
 * "never revisable" — that would push people to work around the module rather
 * than in it.
 *
 * So an amendment is a NEW DRAFT version: the approved row and its items stay
 * exactly as signed and become the historical record, while the draft carries a
 * copy of the CtQ register that is free to edit and must be signed in its own
 * right before it governs anything. Nothing is mutated in place, which is what
 * makes the version chain an audit trail rather than a changelog.
 *
 * Refuses when there is already an open amendment: two concurrent drafts off
 * one approved version have no defined merge, and silently picking one would
 * discard the other's work.
 *
 * The caller owns the transaction.
 */
export async function amendAssessment(
  exec: Exec,
  organizationId: number,
  input: { assessmentId: number; reason: string; openedBy?: number | null },
): Promise<AmendAssessmentResult> {
  const current = (await exec.query(
    `SELECT * FROM rbm_risk_assessments
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [input.assessmentId, organizationId],
  )).rows[0];
  if (!current) return { amended: false, reason: 'not_found' };
  // Only an approved version can be amended. A draft is already editable, so
  // amending one would fork it for no reason.
  if (current.status !== 'active') return { amended: false, reason: 'not_approved' };

  const open = (await exec.query(
    `SELECT id FROM rbm_risk_assessments
      WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        AND status = 'draft' LIMIT 1`,
    [organizationId, current.program_id],
  )).rows[0];
  if (open) return { amended: false, reason: 'amendment_already_open' };

  const { rows: maxRows } = await exec.query(
    `SELECT COALESCE(MAX(version), 0) AS v FROM rbm_risk_assessments
      WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL`,
    [organizationId, current.program_id],
  );
  const nextVersion = Number(maxRows[0].v) + 1;

  // The new draft carries NO approval fields: it has not been signed, and
  // copying the previous signer forward would be forging one.
  const draft = (await exec.query(
    `INSERT INTO rbm_risk_assessments (
       organization_id, program_id, title, framework, overall_risk, status, version, metadata
     ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7) RETURNING *`,
    [
      organizationId, current.program_id, current.title, current.framework,
      current.overall_risk, nextVersion,
      JSON.stringify({
        amendmentOf: current.id,
        amendmentOfVersion: current.version,
        amendmentReason: input.reason,
        amendmentOpenedBy: input.openedBy ?? null,
      }),
    ],
  )).rows[0];

  // Copy the register forward so the amendment starts from the approved content
  // rather than a blank sheet. residual_score is recomputed by the engine on
  // edit; it is copied as-is here because nothing has changed yet.
  const items = (await exec.query(
    `INSERT INTO rbm_risk_items (
       organization_id, assessment_id, program_id, ref_code, category, ctq_factor,
       risk_description, likelihood, impact, detectability, risk_score, is_critical,
       mitigation, residual_likelihood, residual_impact, residual_score, status, assigned_to
     )
     SELECT organization_id, $1, program_id, ref_code, category, ctq_factor,
            risk_description, likelihood, impact, detectability, risk_score, is_critical,
            mitigation, residual_likelihood, residual_impact, residual_score, status, assigned_to
       FROM rbm_risk_items
      WHERE organization_id = $2 AND assessment_id = $3 AND deleted_at IS NULL
     RETURNING *`,
    [draft.id, organizationId, current.id],
  )).rows;

  return { amended: true, assessment: draft, items, supersedes: current.version };
}

export interface GeneratePlanResult {
  generated: boolean;
  /** Why nothing was generated, when `generated` is false. */
  reason?: 'no_assessment' | 'assessment_not_approved' | 'draft_already_open';
  plan?: any;
  actions?: any[];
  derivedFrom?: { assessmentId: number; overallRisk: string; criticalFactors: number; enhancedSites: number };
}

/**
 * Derive a monitoring plan from the program's governing risk assessment.
 *
 * ICH E6(R3) expects the monitoring approach to follow from the identified
 * risks, so nothing here is invented: the strategy comes from the assessment's
 * overall risk band (defaultPlanStrategy), and the opening actions come from
 * the assessment's own open critical CtQ factors — each linked back to its risk
 * item — plus the enhanced-tier sites the site-risk engine scored. With no
 * assessment there is nothing to derive from, and the caller is told so rather
 * than handed an empty plan that looks derived.
 *
 * Requires an APPROVED (active) assessment. A draft RACT has not been signed
 * for, and the plan-approval endpoint would happily activate a plan derived
 * from it — leaving an unsigned risk basis governing a live monitoring
 * commitment. Falling back to "the newest draft" fails open, so this fails
 * closed instead and tells the caller to approve the RACT first.
 *
 * The plan is created as a DRAFT: it becomes the active monitoring commitment
 * only through the governed, re-authenticated approval path.
 *
 * Unlike draftPlan() — which creates the plan shell alone — this is the full
 * derivation, and it is the single implementation behind both
 * POST /api/mdx/rbm-monitoring-plans/generate and the AnA plan tools.
 *
 * The caller owns the transaction: pass a pooled client inside BEGIN/COMMIT.
 */
export async function generatePlanFromAssessment(
  exec: Exec,
  organizationId: number,
  input: { programId: string; title?: string },
): Promise<GeneratePlanResult> {
  const anyAssessment = (await exec.query(
    `SELECT id, title, overall_risk, status FROM rbm_risk_assessments
      WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
      ORDER BY (status = 'active') DESC, updated_at DESC LIMIT 1`,
    [organizationId, input.programId],
  )).rows[0];
  if (!anyAssessment) return { generated: false, reason: 'no_assessment' };
  // Only an approved RACT may govern a plan — see the note above.
  if (anyAssessment.status !== 'active') return { generated: false, reason: 'assessment_not_approved' };
  const assessment = anyAssessment;

  // Scoped to THIS assessment's factors, not the program's. A program can hold
  // several assessment versions; gathering program-wide would let the plan
  // claim derivation from the governing RACT while seeding its actions from a
  // superseded or draft one.
  const critical = (await exec.query(
    `SELECT id, ctq_factor, risk_score FROM rbm_risk_items
      WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
        AND assessment_id = $3
        AND is_critical = true AND status IN ('open','mitigating')
      ORDER BY risk_score DESC NULLS LAST, id`,
    [organizationId, input.programId, anyAssessment.id],
  )).rows;
  const enhanced = (await exec.query(
    `SELECT site_number, site_name FROM rbm_site_risk_scores
      WHERE organization_id = $1 AND program_id = $2 AND monitoring_tier = 'enhanced'
      ORDER BY composite_risk DESC NULLS LAST`,
    [organizationId, input.programId],
  )).rows;

  const overall = (assessment.overall_risk === 'low' || assessment.overall_risk === 'high')
    ? assessment.overall_risk
    : 'medium';
  const strategy = defaultPlanStrategy(overall);

  // Generating lands a new plan VERSION, so it cannot silently sit alongside an
  // amendment someone else has open: two drafts off one study have no defined
  // merge, and picking one would discard the other's work.
  const openDraft = await openDraftPlan(exec, organizationId, input.programId);
  if (openDraft) return { generated: false, reason: 'draft_already_open' };
  const version = await nextPlanVersion(exec, organizationId, input.programId);

  const plan = (await exec.query(
    `INSERT INTO rbm_monitoring_plans (organization_id, program_id, assessment_id, title, strategy, status, version, metadata)
     VALUES ($1,$2,$3,$4,$5,'draft',$6,$7) RETURNING *`,
    [
      organizationId, input.programId, assessment.id,
      input.title ?? `Monitoring plan — ${assessment.title}`, strategy, version,
      JSON.stringify({
        generatedFrom: 'rbm_risk_assessment',
        assessmentId: assessment.id,
        overallRisk: overall,
        criticalFactors: critical.length,
        enhancedSites: enhanced.length,
      }),
    ],
  )).rows[0];

  const actions: any[] = [];
  // One action per open critical CtQ factor, linked to the risk item so the
  // plan board can show where each action came from. Priority follows the
  // engine's own banding of the factor's score.
  for (const it of critical) {
    const band = bandFromScore(num(it.risk_score) ?? 0);
    const priority = band === 'high' ? 'high' : band === 'medium' ? 'medium' : 'low';
    actions.push((await exec.query(
      `INSERT INTO rbm_monitoring_actions (organization_id, plan_id, risk_item_id, action_type, description, priority, due_date, status)
       VALUES ($1,$2,$3,'issue',$4,$5, CURRENT_DATE + INTERVAL '14 days','open') RETURNING *`,
      [organizationId, plan.id, it.id, `Confirm the monitoring control for: ${it.ctq_factor}`, priority],
    )).rows[0]);
  }
  // One oversight visit per enhanced-tier site — the tier is what drives visit
  // cadence under a risk-proportionate plan.
  for (const s of enhanced) {
    actions.push((await exec.query(
      `INSERT INTO rbm_monitoring_actions (organization_id, plan_id, action_type, description, priority, due_date, status)
       VALUES ($1,$2,'site_visit',$3,'high', CURRENT_DATE + INTERVAL '30 days','open') RETURNING *`,
      [organizationId, plan.id, `Enhanced-tier oversight visit — site ${s.site_number ?? '—'}${s.site_name ? ` (${s.site_name})` : ''}`],
    )).rows[0]);
  }

  return {
    generated: true,
    plan,
    actions,
    derivedFrom: {
      assessmentId: assessment.id,
      overallRisk: overall,
      criticalFactors: critical.length,
      enhancedSites: enhanced.length,
    },
  };
}

/**
 * The next monitoring-plan version for a study. Numbered across every version
 * of the plan, including archived ones, so a version number is never reused —
 * a reused number would make two different documents indistinguishable in the
 * audit trail.
 */
export async function nextPlanVersion(
  exec: Exec,
  organizationId: number,
  programId: string | null,
): Promise<number> {
  const { rows } = await exec.query(
    `SELECT COALESCE(MAX(version), 0) AS v FROM rbm_monitoring_plans
      WHERE organization_id = $1 AND program_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
    [organizationId, programId],
  );
  return Number(rows[0].v) + 1;
}

/** An open (draft) plan for the study, if any. */
async function openDraftPlan(exec: Exec, organizationId: number, programId: string | null) {
  const { rows } = await exec.query(
    `SELECT id, version FROM rbm_monitoring_plans
      WHERE organization_id = $1 AND program_id IS NOT DISTINCT FROM $2
        AND deleted_at IS NULL AND status = 'draft'
      ORDER BY version DESC LIMIT 1`,
    [organizationId, programId],
  );
  return rows[0] ?? null;
}

export interface AmendPlanResult {
  amended: boolean;
  reason?: 'not_found' | 'not_approved' | 'amendment_already_open';
  plan?: any;
  actions?: any[];
  /** The version this amendment was opened from. */
  supersedes?: number;
}

/**
 * Open a versioned amendment to an APPROVED monitoring plan.
 *
 * The same argument as amendAssessment, applied to the document that actually
 * directs monitoring activity. An active plan's signature attests to a specific
 * strategy and a specific set of actions; editing it in place would leave the
 * approver's name and timestamp attached to content they never saw. Monitoring
 * plans do genuinely change mid-study — that is the whole premise of adaptive,
 * risk-proportionate monitoring — so revision has to be supported, just not
 * silently.
 *
 * Unfinished actions are copied forward so the amendment starts from the
 * operational state, not a blank sheet, and each copy opens at `open`. Progress
 * is deliberately not carried: a copy is a new instruction issued under a new
 * plan version, and marking it `in_progress` would credit work to a plan that did
 * not exist when the work was done. Actions already `done` stay with the version
 * they were completed under, which is where the record of them belongs.
 *
 * The caller owns the transaction.
 */
export async function amendMonitoringPlan(
  exec: Exec,
  organizationId: number,
  input: { planId: number; reason: string; openedBy?: number | null },
): Promise<AmendPlanResult> {
  const current = (await exec.query(
    `SELECT * FROM rbm_monitoring_plans
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [input.planId, organizationId],
  )).rows[0];
  if (!current) return { amended: false, reason: 'not_found' };
  // A draft is already editable, so amending one would fork it for no reason.
  if (current.status !== 'active') return { amended: false, reason: 'not_approved' };

  const open = await openDraftPlan(exec, organizationId, current.program_id);
  if (open) return { amended: false, reason: 'amendment_already_open' };

  const version = await nextPlanVersion(exec, organizationId, current.program_id);

  // No approval fields: this version has not been signed, and copying the
  // previous signer forward would be forging a signature.
  const plan = (await exec.query(
    `INSERT INTO rbm_monitoring_plans (
       organization_id, program_id, assessment_id, title, strategy, status, version, metadata
     ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7) RETURNING *`,
    [
      organizationId, current.program_id, current.assessment_id, current.title,
      current.strategy, version,
      JSON.stringify({
        amendmentOf: current.id,
        amendmentOfVersion: current.version,
        amendmentReason: input.reason,
        amendmentOpenedBy: input.openedBy ?? null,
      }),
    ],
  )).rows[0];

  const actions = (await exec.query(
    `INSERT INTO rbm_monitoring_actions (
       organization_id, plan_id, risk_item_id, signal_id, action_type, description,
       priority, owner, due_date, status
     )
     SELECT organization_id, $1, risk_item_id, signal_id, action_type, description,
            priority, owner, due_date, 'open'
       FROM rbm_monitoring_actions
      WHERE organization_id = $2 AND plan_id = $3 AND status <> 'done'
     RETURNING *`,
    [plan.id, organizationId, current.id],
  )).rows;

  return { amended: true, plan, actions, supersedes: current.version };
}

export interface CreateActionInput {
  planId: number;
  riskItemId?: number | null;
  signalId?: number | null;
  actionType?: (typeof ACTION_TYPE)[number];
  description: string;
  priority?: (typeof PRIORITY)[number];
  owner?: number | null;
  dueDate?: string | null;
}

/** Create a monitoring action under a plan (verifying the plan is in-tenant).
 *  Returns null when the plan is not found in the tenant. */
export async function createAction(exec: Exec, organizationId: number, input: CreateActionInput) {
  const own = await exec.query(
    `SELECT 1 FROM rbm_monitoring_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [input.planId, organizationId],
  );
  if (own.rows.length === 0) return { created: false as const, reason: 'plan_not_found' };
  const { rows } = await exec.query(
    `INSERT INTO rbm_monitoring_actions (organization_id, plan_id, risk_item_id, signal_id, action_type, description, priority, owner, due_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') RETURNING *`,
    [
      organizationId, input.planId, input.riskItemId ?? null, input.signalId ?? null,
      input.actionType ?? 'issue', input.description, input.priority ?? 'medium',
      input.owner ?? null, input.dueDate ?? null,
    ],
  );
  return { created: true as const, action: rows[0] };
}

export interface UpdateActionInput {
  actionId: number;
  status?: (typeof ACTION_STATUS)[number];
  priority?: (typeof PRIORITY)[number];
  description?: string;
  actionType?: (typeof ACTION_TYPE)[number];
  owner?: number | null;
  dueDate?: string | null;
}

/** Update a monitoring action (status transition, reassignment, etc.). */
export async function updateAction(exec: Exec, organizationId: number, input: UpdateActionInput) {
  const col: Record<string, string> = {
    status: 'status', priority: 'priority', description: 'description',
    actionType: 'action_type', owner: 'owner', dueDate: 'due_date',
  };
  const set: string[] = [];
  const args: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (k === 'actionId' || v === undefined || !col[k]) continue;
    args.push(v); set.push(`${col[k]} = $${args.length}`);
  }
  if (set.length === 0) return { updated: false as const, reason: 'no_fields' };
  args.push(input.actionId, organizationId);
  const { rows } = await exec.query(
    `UPDATE rbm_monitoring_actions SET ${set.join(', ')}, updated_at = NOW()
      WHERE id = $${args.length - 1} AND organization_id = $${args.length}
      RETURNING *`,
    args,
  );
  return rows[0] ? { updated: true as const, action: rows[0] } : { updated: false as const, reason: 'not_found' };
}

// ── Governed approvals (21 CFR Part 11 — reason-for-change captured) ──────────

/** Approve + activate a risk assessment, recording the reason-for-change and the
 *  approving user (attribution). Returns null when not found in the tenant. */
export async function approveAssessment(
  exec: Exec,
  organizationId: number,
  userId: number | null,
  assessmentId: number,
  reason: string,
) {
  const { rows } = await exec.query(
    `UPDATE rbm_risk_assessments
        SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvalReason', $2::text)
      WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
      RETURNING *`,
    [userId, reason, assessmentId, organizationId],
  );
  return rows[0] ?? null;
}

/** Approve + activate a monitoring plan, recording the reason-for-change and the
 *  approving user. Returns null when not found in the tenant. */
export async function approvePlan(
  exec: Exec,
  organizationId: number,
  userId: number | null,
  planId: number,
  reason: string,
) {
  const { rows } = await exec.query(
    `UPDATE rbm_monitoring_plans
        SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('approvalReason', $2::text)
      WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
      RETURNING *`,
    [userId, reason, planId, organizationId],
  );
  return rows[0] ?? null;
}
