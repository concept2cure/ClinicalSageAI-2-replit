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
  qtlRangeError,
  defaultPlanStrategy,
  type KriDirection,
  type QtlDirection,
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
  /** Which way the limit bites. Defaults to `upper` — the historical behaviour. */
  direction?: QtlDirection;
  /** two_sided only: the lower bound and its early-warning limit. */
  thresholdLower?: number | null;
  secondaryLimitLower?: number | null;
}

/** Create a QTL. Infers the secondary early-warning limit (75% of threshold)
 *  when omitted — for an UPPER limit only: 75% of a lower bound would sit on
 *  the breached side of it — and the within/approaching/breached status from
 *  the value, evaluated in the limit's own direction. Throws on a two-sided
 *  limit that is not a usable range rather than storing one that can never
 *  evaluate. */
export async function setQtl(exec: Exec, organizationId: number, input: SetQtlInput) {
  const direction: QtlDirection = input.direction ?? 'upper';
  const rangeErr = qtlRangeError({ direction, threshold: input.threshold, thresholdLower: input.thresholdLower });
  if (rangeErr) throw new Error(rangeErr);
  const secondary = input.secondaryLimit
    ?? (direction === 'upper' ? inferSecondaryLimit(input.threshold) : null);
  const status = qtlStatus(input.currentValue ?? null, {
    threshold: input.threshold ?? null,
    secondaryLimit: secondary,
    direction,
    thresholdLower: input.thresholdLower ?? null,
    secondaryLimitLower: input.secondaryLimitLower ?? null,
  });
  const { rows } = await exec.query(
    `INSERT INTO rbm_qtls (organization_id, program_id, parameter, rationale, threshold, secondary_limit,
       direction, threshold_lower, secondary_limit_lower, current_value, breached, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      organizationId, input.programId ?? null, input.parameter, input.rationale ?? null,
      input.threshold ?? null, secondary, direction, input.thresholdLower ?? null,
      input.secondaryLimitLower ?? null, input.currentValue ?? null, status === 'breached', status,
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
  // A new plan is a new VERSION in the study's chain. Two drafts off one study
  // have no defined merge, so an open draft is reported, not duplicated.
  const programId = input.programId ?? null;
  const open = await openDraftPlan(exec, organizationId, programId);
  if (open) {
    return {
      plan: null,
      refused: 'draft_already_open' as const,
      message: `A draft monitoring plan (v${open.version}, id ${open.id}) is already open for this study — edit or approve it instead of drafting another.`,
      inferred: { strategy, fromOverallRisk: overall },
    };
  }
  const version = await nextPlanVersion(exec, organizationId, programId);
  const { rows } = await exec.query(
    `INSERT INTO rbm_monitoring_plans (organization_id, program_id, assessment_id, title, strategy, status, version)
     VALUES ($1,$2,$3,$4,$5,'draft',$6) RETURNING *`,
    [organizationId, programId, input.assessmentId ?? null, title, strategy, version],
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
  input: { programId: string; title?: string; createdBy?: number | null },
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
    /* created_by is the author of record for the Part 11 two-person rule. */
    `INSERT INTO rbm_monitoring_plans (organization_id, program_id, assessment_id, title, strategy, status, version, metadata, created_by)
     VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8) RETURNING *`,
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
      input.createdBy ?? null,
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
 * The next monitoring-plan version for a study. Numbered across EVERY version
 * of the plan on file — archived and soft-deleted ones included — so a version
 * number is never reused: a reused number would make two different signed
 * documents indistinguishable in the audit trail.
 */
export async function nextPlanVersion(
  exec: Exec,
  organizationId: number,
  programId: string | null,
): Promise<number> {
  const { rows } = await exec.query(
    `SELECT COALESCE(MAX(version), 0) AS v FROM rbm_monitoring_plans
      WHERE organization_id = $1 AND program_id IS NOT DISTINCT FROM $2`,
    [organizationId, programId],
  );
  return Number(rows[0]?.v ?? 0) + 1;
}

/** An open (draft) plan version for the study, if any. */
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
  /** The version this amendment was opened from. */
  supersedes?: number;
}

/**
 * Open a versioned amendment to an APPROVED monitoring plan.
 *
 * The same argument as amendAssessment, applied to the document that actually
 * directs monitoring activity. An active plan's e-signature attests to a
 * specific strategy and a specific set of actions; editing it in place would
 * leave the approver's name and timestamp attached to content they never saw.
 * Monitoring plans genuinely change mid-study — that is the premise of
 * risk-proportionate monitoring — so revision is supported, just not silently.
 *
 * Monitoring actions are NOT copied. They are execution records — issues,
 * CAPAs, visits, queries, escalations raised while the study runs under its
 * approved plan (ICH E6(R3)) — not part of the signed plan content. They stay
 * logged against the plan in force, and the draft governs nothing until it is
 * approved; approvePlan then moves the unfinished ones onto the new version.
 * (Until 2026-10 this copied unfinished actions into the draft, reset to
 * `open`; that duplicated live work onto a version that governed nothing.)
 *
 * The new version carries NO approval fields — copying the previous signer
 * forward would forge a signature — and records the amender as its author
 * (created_by) so the two-person rule applies to its approval.
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

  const open = await openDraftPlan(exec, organizationId, current.program_id ?? null);
  if (open) return { amended: false, reason: 'amendment_already_open' };

  const version = await nextPlanVersion(exec, organizationId, current.program_id ?? null);

  const plan = (await exec.query(
    `INSERT INTO rbm_monitoring_plans (
       organization_id, program_id, assessment_id, title, strategy, status, version, metadata, created_by
     ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8) RETURNING *`,
    [
      organizationId, current.program_id ?? null, current.assessment_id ?? null, current.title,
      current.strategy, version,
      JSON.stringify({
        amendmentOf: current.id,
        amendmentOfVersion: current.version,
        amendmentReason: input.reason,
        amendmentOpenedBy: input.openedBy ?? null,
      }),
      input.openedBy ?? null,
    ],
  )).rows[0];

  return { amended: true, plan, supersedes: current.version };
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

/** The plan in force for a study: its active (approved) version. Null for a
 *  plan with no study (program_id NULL) — such plans are never superseded by
 *  approvePlan, so there is no "plan in force" to compare against. */
async function planInForce(exec: Exec, organizationId: number, programId: string | null) {
  if (programId == null) return null;
  const { rows } = await exec.query(
    `SELECT id, version FROM rbm_monitoring_plans
      WHERE organization_id = $1 AND program_id = $2
        AND deleted_at IS NULL AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [organizationId, programId],
  );
  return rows[0] ?? null;
}

/**
 * The plan new monitoring actions are logged against, from a study's plan
 * versions: the active version if there is one, else a draft (the study's
 * first plan, before approval), else null. An open amendment draft is never
 * it — it governs nothing until approved. Pure, so the board and the tests
 * share createAction's rule.
 */
export function governingPlanId(
  plans: ReadonlyArray<{ id: number; status: string | null; version?: number | null }>,
): number | null {
  const byVersion = [...plans].sort((x, y) => (y.version ?? 0) - (x.version ?? 0));
  const active = byVersion.find(p => p.status === 'active');
  if (active) return active.id;
  const draft = byVersion.find(p => p.status === 'draft');
  return draft ? draft.id : null;
}

export type CreateActionResult =
  | { created: true; action: any }
  | { created: false; reason: 'plan_not_found' }
  | {
      created: false;
      reason: 'plan_superseded' | 'amendment_not_in_force';
      planStatus: string;
      /** The plan in force for the study — where the action belongs — or null. */
      governingPlanId: number | null;
      message: string;
    };

/**
 * Create a monitoring action, logged against the plan in force.
 *
 * Monitoring actions are execution records raised while a study runs under its
 * approved plan (ICH E6(R3)); they are not part of the signed plan content,
 * which stays locked (PATCH 409, /amend). So an action is accepted on:
 *   - the ACTIVE plan (the plan in force), or
 *   - a DRAFT that is the study's first plan, before any version is approved.
 * It is refused (409) on:
 *   - an ARCHIVED version → `plan_superseded`, naming the plan in force;
 *   - a draft AMENDMENT while an active plan exists → `amendment_not_in_force`:
 *     the draft governs nothing until approved, and approvePlan moves the open
 *     actions onto it at that point.
 * Both refusals return `governingPlanId` so a caller can retry on the right
 * plan. This is the one implementation behind POST /rbm-monitoring-actions,
 * POST /rbm-signals/:id/investigate and the AnA tool.
 */
export async function createAction(
  exec: Exec,
  organizationId: number,
  input: CreateActionInput,
): Promise<CreateActionResult> {
  const own = await exec.query(
    `SELECT id, status, version, program_id FROM rbm_monitoring_plans WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [input.planId, organizationId],
  );
  if (own.rows.length === 0) return { created: false, reason: 'plan_not_found' };
  const plan = own.rows[0];
  const status = String(plan.status);

  if (status !== 'active') {
    const inForce = await planInForce(exec, organizationId, plan.program_id ?? null);
    const governing = inForce ? Number(inForce.id) : null;
    const inForceLabel = inForce
      ? `plan ${inForce.id}${inForce.version != null ? ` (v${inForce.version})` : ''}`
      : null;
    if (status !== 'draft') {
      return {
        created: false,
        reason: 'plan_superseded',
        planStatus: status,
        governingPlanId: governing,
        message: inForceLabel
          ? `Monitoring plan ${input.planId} is ${status}. Actions are logged against the plan in force, ${inForceLabel}.`
          : `Monitoring plan ${input.planId} is ${status}, and this study has no approved plan in force to log the action against.`,
      };
    }
    if (inForce && governing !== Number(plan.id)) {
      return {
        created: false,
        reason: 'amendment_not_in_force',
        planStatus: status,
        governingPlanId: governing,
        message: `Monitoring plan ${input.planId} is an amendment that is not yet approved. `
          + `Actions are logged against the plan in force, ${inForceLabel}, and move to the amendment when it is approved.`,
      };
    }
  }

  const { rows } = await exec.query(
    `INSERT INTO rbm_monitoring_actions (organization_id, plan_id, risk_item_id, signal_id, action_type, description, priority, owner, due_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open') RETURNING *`,
    [
      organizationId, input.planId, input.riskItemId ?? null, input.signalId ?? null,
      input.actionType ?? 'issue', input.description, input.priority ?? 'medium',
      input.owner ?? null, input.dueDate ?? null,
    ],
  );
  return { created: true, action: rows[0] };
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
 *  approving user (attribution). Returns null when not found in the tenant.
 *
 *  `userId` is `number`, not `number | null`, and that is the point. Both
 *  writers of this table reach it here, and this one accepted null and wrote
 *  `approved_by = NULL` — an activated governing risk basis with no identified
 *  approver, which 21 CFR 11.10(e) and 11.50 exist to make impossible. The HTTP
 *  route never sent null (it 401s first), but the AnA tool path passed
 *  `ctx?.userId ?? null` straight through, so the one route with NO signature
 *  check was also the one that could leave the approver blank.
 *
 *  Narrowing the type rather than throwing puts it on the compiler: a caller
 *  that cannot name the approver cannot reach the UPDATE. The runtime guard
 *  below covers callers that are not typechecked. */
export async function approveAssessment(
  exec: Exec,
  organizationId: number,
  userId: number,
  assessmentId: number,
  reason: string,
  /* `authorKnown: false` means the row predates created_by, so the two-person
     rule could not be applied to it. The signed record says so rather than
     staying silent: an inspector can then tell an approval that WAS checked
     against its author from one where no author was ever recorded. The caller
     is the only thing that knows this, because it reads the row under the same
     transaction as the UPDATE. */
  opts: { authorKnown?: boolean } = {},
) {
  if (userId == null) {
    throw new Error('A risk-assessment approval requires an identified approver (21 CFR 11.10(e)).');
  }
  const { rows } = await exec.query(
    `UPDATE rbm_risk_assessments
        SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb)
                       || jsonb_build_object('approvalReason', $2::text)
                       || jsonb_build_object('twoPersonRule', $5::text)
      WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
      RETURNING *`,
    [
      userId,
      reason,
      assessmentId,
      organizationId,
      opts.authorKnown === false ? 'not_applicable_no_author_recorded' : 'enforced',
    ],
  );
  if (rows.length === 0) return null;

  /* Approving a version supersedes the one it replaces, so a program never has
     two assessments claiming to be the governing risk basis at once.
     ──
     This lived ONLY in the HTTP route, which kept its own copy of the UPDATE
     above. The AnA tool path came through here instead and archived nothing, so
     approving a v2 through AnA left v1 active beside it. Readers resolve the
     governing basis with `ORDER BY (status = 'active') DESC, updated_at DESC
     LIMIT 1` (see currentAssessment below), which does not error on two — it
     silently picks the more recently touched one. A monitoring plan generated
     after that could be built from either.
     ──
     The archived row and its items are left otherwise untouched: that is the
     signed record. Atomicity comes from the caller's `exec` — the route passes
     its transaction client, so activate+archive still commit or roll back
     together. */
  if (rows[0].program_id) {
    await exec.query(
      `UPDATE rbm_risk_assessments SET status = 'archived', updated_at = NOW()
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND id <> $3 AND status = 'active'`,
      [organizationId, rows[0].program_id, assessmentId],
    );
  }
  return rows[0];
}

/** Approve + activate a monitoring plan, recording the reason-for-change and the
 *  approving user. Returns null when not found in the tenant. */
export async function approvePlan(
  exec: Exec,
  organizationId: number,
  userId: number,
  planId: number,
  reason: string,
  /* See approveAssessment — same contract. */
  opts: { authorKnown?: boolean } = {},
) {
  /* Same rule as approveAssessment above — see its header. */
  if (userId == null) {
    throw new Error('A monitoring-plan approval requires an identified approver (21 CFR 11.10(e)).');
  }
  const { rows } = await exec.query(
    `UPDATE rbm_monitoring_plans
        SET status = 'active', approved_by = $1, approved_at = NOW(), updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb)
                       || jsonb_build_object('approvalReason', $2::text)
                       || jsonb_build_object('twoPersonRule', $5::text)
      WHERE id = $3 AND organization_id = $4 AND deleted_at IS NULL
      RETURNING *`,
    [
      userId,
      reason,
      planId,
      organizationId,
      opts.authorKnown === false ? 'not_applicable_no_author_recorded' : 'enforced',
    ],
  );
  if (rows.length === 0) return null;
  /* Approving a version supersedes the one it replaces, so a study never has
     two plans claiming to direct monitoring at once. Atomic with the UPDATE
     above only when the caller passes its transaction client — the route does.
     The archived row's content is untouched: that is the signed record.

     Its UNFINISHED actions move to the new version in the same executor.
     Actions are execution records under the plan in force, not signed plan
     content, so open work follows the plan that now governs it; each moved row
     records where it came from (carriedFromPlanId / carriedFromVersion).
     Completed actions stay with the archived version as its history. */
  if (rows[0].program_id) {
    const archived = await exec.query(
      `UPDATE rbm_monitoring_plans SET status = 'archived', updated_at = NOW()
        WHERE organization_id = $1 AND program_id = $2 AND deleted_at IS NULL
          AND id <> $3 AND status = 'active'
        RETURNING id, version`,
      [organizationId, rows[0].program_id, planId],
    );
    for (const old of archived.rows ?? []) {
      await exec.query(
        `UPDATE rbm_monitoring_actions
            SET plan_id = $1, updated_at = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb)
                           || jsonb_build_object('carriedFromPlanId', $3::int, 'carriedFromVersion', $4::int)
          WHERE organization_id = $2 AND plan_id = $3 AND status <> 'done'`,
        [planId, organizationId, old.id, old.version ?? null],
      );
    }
  }
  return rows[0];
}
