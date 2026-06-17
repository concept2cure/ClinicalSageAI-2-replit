/**
 * Schedule-of-Events service — persistence + AnA operations.
 *
 * The genuinely-new AnA layer on top of the platform's existing project
 * milestone/task tables:
 *
 *   - Plan header        → project_schedule_of_events (basis, framework,
 *                          confidence, baseline/target, AnA narrative).
 *   - Visual milestones  → REUSE project_workflow_stages, tagged with
 *                          metadata.source = 'ana_schedule_of_events'. No second
 *                          milestone store.
 *   - Goals              → project_schedule_goals (tracked + re-baselined).
 *   - Revisions          → project_schedule_revisions (append-only audit).
 *   - Proactive tasks    → REUSE project_tasks, tagged the same way.
 *   - Alerts             → REUSE the notification service.
 *
 * Raw SQL via the shared pool (mirrors notification-service): every statement
 * is explicitly org- and project-scoped for tenant isolation.
 *
 * @module server/services/projects/schedule-of-events/service
 */

import { pool } from '../../../db';
import { createNotification } from '../../notifications/notification-service';
import { generateSchedule, type GeneratorGoal } from './generator';
import {
  assessScheduleHealth,
  type ScheduleHealth,
  type ScheduleStatus,
} from './health';

const SCHEDULE_SOURCE = 'ana_schedule_of_events';

// ─────────────────────────────────────────────────────────────────────────────
// View shapes (what the API / AnA tools return)
// ─────────────────────────────────────────────────────────────────────────────

export interface SchedulePlanView {
  id: number;
  status: string;
  projectType: string | null;
  regulatoryFramework: string | null;
  basisSummary: string | null;
  anaSummary: string | null;
  confidence: string | null;
  version: number;
  baselineDate: string | null;
  targetDate: string | null;
  generatedByAna: boolean;
  lastReviewedByAnaAt: string | null;
  lastAmendedAt: string | null;
  updatedAt: string | null;
}

export interface ScheduleMilestoneView {
  id: number;
  key: string;
  title: string;
  description: string | null;
  category: string;
  status: ScheduleStatus;
  baselineDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  progress: number;
  isCritical: boolean;
  regulatoryBasis: string | null;
  ownerRole: string | null;
  dependsOn: string[];
  sortOrder: number;
  anaRationale: string | null;
  slipDays: number | null;
}

export interface ScheduleGoalView {
  id: number;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: string;
  priority: string;
  metric: string | null;
  currentContext: string | null;
  anaRationale: string | null;
  lastResetByAnaAt: string | null;
}

export interface ScheduleRevisionView {
  id: number;
  revisionType: string;
  summary: string;
  detail: unknown;
  triggeredBy: string | null;
  createdByAna: boolean;
  createdAt: string;
}

export interface ScheduleOfEventsView {
  plan: SchedulePlanView | null;
  milestones: ScheduleMilestoneView[];
  goals: ScheduleGoalView[];
  revisions: ScheduleRevisionView[];
  health: ScheduleHealth;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function toIso(d: unknown): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toDate(d: unknown): Date | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(String(d));
  return Number.isFinite(date.getTime()) ? date : null;
}

function asObject(v: unknown): Record<string, any> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, any>;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Map the richer schedule status onto the platform-standard stage status column. */
function toColumnStatus(s: ScheduleStatus): string {
  switch (s) {
    case 'completed':
      return 'completed';
    case 'in_progress':
    case 'at_risk':
      return 'in-progress';
    case 'slipped':
    case 'blocked':
      return 'blocked';
    default:
      return 'pending';
  }
}

function isMissingTable(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === '42P01'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loaders
// ─────────────────────────────────────────────────────────────────────────────

async function loadPlan(orgId: number, projectId: number): Promise<SchedulePlanView | null> {
  const { rows } = await pool.query(
    `SELECT * FROM project_schedule_of_events
      WHERE organization_id = $1 AND project_id = $2
      LIMIT 1`,
    [orgId, projectId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    status: r.status,
    projectType: r.project_type,
    regulatoryFramework: r.regulatory_framework,
    basisSummary: r.basis_summary,
    anaSummary: r.ana_summary,
    confidence: r.confidence,
    version: r.version,
    baselineDate: toIso(r.baseline_date),
    targetDate: toIso(r.target_date),
    generatedByAna: r.generated_by_ana,
    lastReviewedByAnaAt: toIso(r.last_reviewed_by_ana_at),
    lastAmendedAt: toIso(r.last_amended_at),
    updatedAt: toIso(r.updated_at),
  };
}

interface MilestoneRow {
  id: number;
  name: string;
  description: string | null;
  order: number;
  status: string;
  start_date: Date | null;
  due_date: Date | null;
  metadata: unknown;
}

function milestoneFromRow(r: MilestoneRow, now: Date): ScheduleMilestoneView {
  const md = asObject(r.metadata);
  const status: ScheduleStatus = (md.scheduleStatus as ScheduleStatus) || 'not_started';
  const target = toDate(r.due_date);
  let slipDays: number | null = null;
  if (status !== 'completed' && target && target.getTime() < now.getTime()) {
    slipDays = Math.round((now.getTime() - target.getTime()) / DAY_MS);
  }
  return {
    id: r.id,
    key: String(md.key ?? `m${r.id}`),
    title: r.name,
    description: r.description,
    category: String(md.category ?? 'regulatory'),
    status,
    baselineDate: md.baselineDate ? toIso(md.baselineDate) : toIso(r.start_date),
    targetDate: toIso(r.due_date),
    completedAt: md.completedAt ? toIso(md.completedAt) : null,
    progress: typeof md.progress === 'number' ? md.progress : 0,
    isCritical: !!md.isCritical,
    regulatoryBasis: md.regulatoryBasis ?? null,
    ownerRole: md.ownerRole ?? null,
    dependsOn: Array.isArray(md.dependsOn) ? md.dependsOn.map(String) : [],
    sortOrder: r.order ?? 0,
    anaRationale: md.anaRationale ?? null,
    slipDays,
  };
}

async function loadMilestoneRows(orgId: number, projectId: number): Promise<MilestoneRow[]> {
  const { rows } = await pool.query<MilestoneRow>(
    `SELECT id, name, description, "order", status, start_date, due_date, metadata
       FROM project_workflow_stages
      WHERE organization_id = $1 AND project_id = $2
        AND metadata->>'source' = $3
      ORDER BY "order" ASC, id ASC`,
    [orgId, projectId, SCHEDULE_SOURCE],
  );
  return rows;
}

async function loadGoals(orgId: number, projectId: number): Promise<ScheduleGoalView[]> {
  const { rows } = await pool.query(
    `SELECT * FROM project_schedule_goals
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
               created_at ASC`,
    [orgId, projectId],
  );
  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    targetDate: toIso(r.target_date),
    status: r.status,
    priority: r.priority,
    metric: r.metric,
    currentContext: r.current_context,
    anaRationale: r.ana_rationale,
    lastResetByAnaAt: toIso(r.last_reset_by_ana_at),
  }));
}

async function loadRevisions(
  orgId: number,
  projectId: number,
  limit = 25,
): Promise<ScheduleRevisionView[]> {
  const { rows } = await pool.query(
    `SELECT * FROM project_schedule_revisions
      WHERE organization_id = $1 AND project_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [orgId, projectId, limit],
  );
  return rows.map((r: any) => ({
    id: r.id,
    revisionType: r.revision_type,
    summary: r.summary,
    detail: r.detail,
    triggeredBy: r.triggered_by,
    createdByAna: r.created_by_ana,
    createdAt: toIso(r.created_at) ?? new Date().toISOString(),
  }));
}

function healthFromMilestones(milestones: ScheduleMilestoneView[], now: Date): ScheduleHealth {
  return assessScheduleHealth(
    milestones.map((m) => ({
      key: m.key,
      title: m.title,
      status: m.status,
      targetDate: m.targetDate ? new Date(m.targetDate) : null,
      isCritical: m.isCritical,
      progress: m.progress,
    })),
    { now },
  );
}

async function recordRevision(params: {
  orgId: number;
  projectId: number;
  scheduleId: number;
  revisionType: string;
  summary: string;
  detail?: unknown;
  triggeredBy?: string;
  createdByAna?: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO project_schedule_revisions
       (organization_id, project_id, schedule_id, revision_type, summary, detail, triggered_by, created_by_ana)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.orgId,
      params.projectId,
      params.scheduleId,
      params.revisionType,
      params.summary,
      JSON.stringify(params.detail ?? {}),
      params.triggeredBy ?? 'ana_proactive',
      params.createdByAna ?? true,
    ],
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public read
// ─────────────────────────────────────────────────────────────────────────────

export async function getScheduleOfEvents(
  orgId: number,
  projectId: number,
): Promise<ScheduleOfEventsView> {
  const now = new Date();
  try {
    const [plan, milestoneRows, goals, revisions] = await Promise.all([
      loadPlan(orgId, projectId),
      loadMilestoneRows(orgId, projectId),
      loadGoals(orgId, projectId),
      loadRevisions(orgId, projectId),
    ]);
    const milestones = milestoneRows.map((r) => milestoneFromRow(r, now));
    return { plan, milestones, goals, revisions, health: healthFromMilestones(milestones, now) };
  } catch (err) {
    if (isMissingTable(err)) {
      return { plan: null, milestones: [], goals: [], revisions: [], health: healthFromMilestones([], now) };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate (AnA builds / regenerates the schedule)
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateScheduleParams {
  orgId: number;
  projectId: number;
  projectType: string | null | undefined;
  baselineDate?: Date | null;
  targetDate?: Date | null;
  goals?: GeneratorGoal[];
  triggeredBy?: string;
  createdByAna?: boolean;
}

export async function generateProjectSchedule(
  params: GenerateScheduleParams,
): Promise<ScheduleOfEventsView> {
  const { orgId, projectId } = params;
  const gen = generateSchedule({
    projectType: params.projectType,
    baselineDate: params.baselineDate ?? null,
    targetDate: params.targetDate ?? null,
    goals: params.goals,
  });

  // 1. Upsert the plan header (one per project).
  const { rows: planRows } = await pool.query(
    `INSERT INTO project_schedule_of_events
       (organization_id, project_id, status, project_type, regulatory_framework, goals,
        basis_summary, ana_summary, confidence, version, baseline_date, target_date,
        generated_by_ana, last_reviewed_by_ana_at, updated_at)
     VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8, 1, $9, $10, $11, now(), now())
     ON CONFLICT (project_id) DO UPDATE SET
        status = 'active',
        project_type = EXCLUDED.project_type,
        regulatory_framework = EXCLUDED.regulatory_framework,
        goals = EXCLUDED.goals,
        basis_summary = EXCLUDED.basis_summary,
        ana_summary = EXCLUDED.ana_summary,
        confidence = EXCLUDED.confidence,
        version = project_schedule_of_events.version + 1,
        baseline_date = EXCLUDED.baseline_date,
        target_date = EXCLUDED.target_date,
        generated_by_ana = EXCLUDED.generated_by_ana,
        last_reviewed_by_ana_at = now(),
        updated_at = now()
     RETURNING id, version`,
    [
      orgId,
      projectId,
      gen.projectType,
      gen.framework,
      JSON.stringify(params.goals ?? []),
      gen.basisSummary,
      gen.basisSummary,
      gen.confidence,
      gen.baselineDate,
      gen.targetDate,
      params.createdByAna ?? true,
    ],
  );
  const scheduleId: number = planRows[0].id;

  // 2. Replace existing schedule milestones (stored as workflow stages).
  await pool.query(
    `DELETE FROM project_workflow_stages
      WHERE organization_id = $1 AND project_id = $2 AND metadata->>'source' = $3`,
    [orgId, projectId, SCHEDULE_SOURCE],
  );

  for (const m of gen.milestones) {
    const metadata = {
      source: SCHEDULE_SOURCE,
      scheduleId,
      key: m.key,
      category: m.category,
      isCritical: m.isCritical,
      regulatoryBasis: m.regulatoryBasis ?? null,
      ownerRole: m.ownerRole ?? null,
      dependsOn: m.dependsOn,
      anaRationale: m.anaRationale,
      baselineDate: m.baselineDate.toISOString(),
      scheduleStatus: 'not_started' as ScheduleStatus,
      progress: 0,
    };
    await pool.query(
      `INSERT INTO project_workflow_stages
         (organization_id, project_id, name, description, "order", status,
          start_date, due_date, auto_advance, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, false, $8, now(), now())`,
      [
        orgId,
        projectId,
        m.title,
        m.description ?? null,
        m.sortOrder,
        m.baselineDate,
        m.targetDate,
        JSON.stringify(metadata),
      ],
    );
  }

  // 3. If goals were provided as part of generation, install them as the goal set.
  if (params.goals && params.goals.length > 0) {
    await replaceGoals({
      orgId,
      projectId,
      scheduleId,
      goals: params.goals,
      rationale: 'Goals set as part of schedule generation.',
      triggeredBy: params.triggeredBy,
      createdByAna: params.createdByAna,
      recordRevisionEntry: false,
    });
  }

  // 4. Audit.
  await recordRevision({
    orgId,
    projectId,
    scheduleId,
    revisionType: 'generated',
    summary: `Generated ${gen.milestones.length}-milestone ${gen.framework} schedule for ${gen.projectType}.`,
    detail: { basisSummary: gen.basisSummary, confidence: gen.confidence, milestoneCount: gen.milestones.length },
    triggeredBy: params.triggeredBy ?? 'ana_user',
    createdByAna: params.createdByAna,
  });

  return getScheduleOfEvents(orgId, projectId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Amend a single milestone
// ─────────────────────────────────────────────────────────────────────────────

export interface AmendMilestoneParams {
  orgId: number;
  projectId: number;
  milestoneKey: string;
  newTargetDate?: Date | null;
  status?: ScheduleStatus;
  progress?: number;
  note?: string;
  triggeredBy?: string;
  createdByAna?: boolean;
}

export async function amendMilestone(
  params: AmendMilestoneParams,
): Promise<{ ok: boolean; message: string }> {
  const { orgId, projectId, milestoneKey } = params;
  const { rows } = await pool.query<MilestoneRow & { metadata: any }>(
    `SELECT id, name, description, "order", status, start_date, due_date, metadata
       FROM project_workflow_stages
      WHERE organization_id = $1 AND project_id = $2
        AND metadata->>'source' = $3 AND metadata->>'key' = $4
      LIMIT 1`,
    [orgId, projectId, SCHEDULE_SOURCE, milestoneKey],
  );
  const row = rows[0];
  if (!row) return { ok: false, message: `No schedule milestone with key "${milestoneKey}".` };

  const md = asObject(row.metadata);
  const nextStatus: ScheduleStatus = params.status ?? (md.scheduleStatus as ScheduleStatus) ?? 'not_started';
  md.scheduleStatus = nextStatus;
  if (typeof params.progress === 'number') md.progress = Math.max(0, Math.min(100, params.progress));
  if (nextStatus === 'completed') md.completedAt = new Date().toISOString();
  if (params.note) md.lastAmendNote = params.note;

  const newDue = params.newTargetDate ?? toDate(row.due_date);
  await pool.query(
    `UPDATE project_workflow_stages
        SET due_date = $1, status = $2, metadata = $3, updated_at = now()
      WHERE id = $4 AND organization_id = $5`,
    [newDue, toColumnStatus(nextStatus), JSON.stringify(md), row.id, orgId],
  );

  const plan = await loadPlan(orgId, projectId);
  if (plan) {
    await pool.query(
      `UPDATE project_schedule_of_events SET last_amended_at = now(), updated_at = now()
        WHERE id = $1 AND organization_id = $2`,
      [plan.id, orgId],
    );
    await recordRevision({
      orgId,
      projectId,
      scheduleId: plan.id,
      revisionType: 'amended',
      summary: `Amended milestone "${row.name}"${params.newTargetDate ? ` → ${params.newTargetDate.toISOString().slice(0, 10)}` : ''}${params.status ? ` (status: ${params.status})` : ''}.`,
      detail: {
        milestoneKey,
        newTargetDate: params.newTargetDate?.toISOString() ?? null,
        status: params.status ?? null,
        note: params.note ?? null,
      },
      triggeredBy: params.triggeredBy ?? 'ana_user',
      createdByAna: params.createdByAna,
    });
  }
  return { ok: true, message: `Milestone "${row.name}" updated.` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Goals — set / reset
// ─────────────────────────────────────────────────────────────────────────────

interface ReplaceGoalsParams {
  orgId: number;
  projectId: number;
  scheduleId: number | null;
  goals: GeneratorGoal[];
  rationale: string;
  triggeredBy?: string;
  createdByAna?: boolean;
  recordRevisionEntry?: boolean;
}

async function replaceGoals(params: ReplaceGoalsParams): Promise<void> {
  const { orgId, projectId } = params;
  // Retire the current active goals (kept for history as 'revised').
  await pool.query(
    `UPDATE project_schedule_goals
        SET status = 'revised', updated_at = now()
      WHERE organization_id = $1 AND project_id = $2
        AND status NOT IN ('achieved', 'dropped', 'revised')`,
    [orgId, projectId],
  );
  for (const g of params.goals) {
    await pool.query(
      `INSERT INTO project_schedule_goals
         (organization_id, project_id, schedule_id, title, description, target_date,
          status, priority, metric, current_context, last_reset_by_ana_at, ana_rationale, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, now(), $10, now())`,
      [
        orgId,
        projectId,
        params.scheduleId,
        g.title,
        g.description ?? null,
        g.targetDate ? new Date(g.targetDate) : null,
        g.priority ?? 'medium',
        g.metric ?? null,
        params.rationale,
        params.rationale,
      ],
    );
  }
  if (params.recordRevisionEntry !== false && params.scheduleId) {
    await recordRevision({
      orgId,
      projectId,
      scheduleId: params.scheduleId,
      revisionType: 'goal_reset',
      summary: `Reset program goals (${params.goals.length}). ${params.rationale}`,
      detail: { goals: params.goals, rationale: params.rationale },
      triggeredBy: params.triggeredBy ?? 'ana_user',
      createdByAna: params.createdByAna,
    });
  }
}

export interface ResetGoalsParams {
  orgId: number;
  projectId: number;
  goals: GeneratorGoal[];
  rationale: string;
  triggeredBy?: string;
  createdByAna?: boolean;
}

export async function resetProjectGoals(
  params: ResetGoalsParams,
): Promise<{ ok: boolean; message: string }> {
  const plan = await loadPlan(params.orgId, params.projectId);
  await replaceGoals({
    orgId: params.orgId,
    projectId: params.projectId,
    scheduleId: plan?.id ?? null,
    goals: params.goals,
    rationale: params.rationale,
    triggeredBy: params.triggeredBy,
    createdByAna: params.createdByAna,
    recordRevisionEntry: true,
  });
  if (plan) {
    await pool.query(
      `UPDATE project_schedule_of_events
          SET ana_summary = $1, updated_at = now()
        WHERE id = $2 AND organization_id = $3`,
      [`Goals re-baselined: ${params.rationale}`, plan.id, params.orgId],
    );
  }
  // Surface the reset as an in-app alert.
  void createNotification({
    organizationId: params.orgId,
    category: 'schedule_goal_reset',
    severity: 'info',
    title: 'AnA re-baselined your program goals',
    body: params.rationale,
    resourceType: 'project',
    resourceId: String(params.projectId),
    actionUrl: `/projects/proj_${params.projectId}`,
  }).catch(() => {});
  return { ok: true, message: `Reset ${params.goals.length} goal(s).` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Proactive health review (the heart of "stay on top of it")
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthReviewResult {
  ok: boolean;
  scheduleId: number | null;
  health: ScheduleHealth;
  applied: boolean;
  tasksCreated: number;
  alertsCreated: number;
  message: string;
}

async function hasOpenScheduleTask(
  orgId: number,
  projectId: number,
  milestoneKey: string,
  kind: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM project_tasks
      WHERE organization_id = $1 AND project_id = $2
        AND metadata->>'source' = $3
        AND metadata->>'milestoneKey' = $4
        AND metadata->>'kind' = $5
        AND status <> 'done'
      LIMIT 1`,
    [orgId, projectId, SCHEDULE_SOURCE, milestoneKey, kind],
  );
  return rows.length > 0;
}

async function createScheduleTask(params: {
  orgId: number;
  projectId: number;
  milestoneKey: string;
  kind: 'recover_slip' | 'mitigate_risk';
  title: string;
  description: string;
  priority: string;
  dueDate: Date | null;
}): Promise<boolean> {
  if (await hasOpenScheduleTask(params.orgId, params.projectId, params.milestoneKey, params.kind)) {
    return false;
  }
  await pool.query(
    `INSERT INTO project_tasks
       (organization_id, project_id, name, description, status, priority, module_type, due_date, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'todo', $5, 'Schedule', $6, $7, now(), now())`,
    [
      params.orgId,
      params.projectId,
      params.title,
      params.description,
      params.priority,
      params.dueDate,
      JSON.stringify({ source: SCHEDULE_SOURCE, milestoneKey: params.milestoneKey, kind: params.kind, createdByAna: true }),
    ],
  );
  return true;
}

/**
 * Assess schedule health and (when apply=true) act on it proactively:
 * update milestone statuses, open recovery/mitigation tasks, fire alerts,
 * flag at-risk goals, refresh AnA's narrative, and audit the review.
 */
export async function reviewScheduleHealth(params: {
  orgId: number;
  projectId: number;
  apply?: boolean;
  triggeredBy?: string;
}): Promise<HealthReviewResult> {
  const { orgId, projectId } = params;
  const apply = params.apply ?? true;
  const now = new Date();

  const plan = await loadPlan(orgId, projectId);
  const milestoneRows = await loadMilestoneRows(orgId, projectId);
  const milestones = milestoneRows.map((r) => milestoneFromRow(r, now));
  const health = healthFromMilestones(milestones, now);

  if (!plan || milestones.length === 0) {
    return {
      ok: false,
      scheduleId: plan?.id ?? null,
      health,
      applied: false,
      tasksCreated: 0,
      alertsCreated: 0,
      message: 'No schedule of events to review.',
    };
  }

  let tasksCreated = 0;
  let alertsCreated = 0;

  if (apply) {
    const rowByKey = new Map(milestoneRows.map((r) => [String(asObject(r.metadata).key ?? `m${r.id}`), r]));

    for (const result of health.milestones) {
      const row = rowByKey.get(result.key);
      if (!row) continue;
      const md = asObject(row.metadata);
      const prevNotified: string | undefined = md.lastNotifiedStatus;

      if (result.changed) {
        md.scheduleStatus = result.nextStatus;
        if (result.slipDays != null) md.slipDays = result.slipDays;
        await pool.query(
          `UPDATE project_workflow_stages
              SET status = $1, metadata = $2, updated_at = now()
            WHERE id = $3 AND organization_id = $4`,
          [toColumnStatus(result.nextStatus), JSON.stringify({ ...md }), row.id, orgId],
        );
      }

      // Proactive task + alert on first transition into a problem state.
      const dueDate = toDate(row.due_date);
      if (result.nextStatus === 'slipped' && prevNotified !== 'slipped') {
        const created = await createScheduleTask({
          orgId,
          projectId,
          milestoneKey: result.key,
          kind: 'recover_slip',
          title: `Recover slipped milestone: ${result.title}`,
          description: result.reason + (result.isCritical ? ' This milestone is on the critical path.' : ''),
          priority: result.isCritical ? 'urgent' : 'high',
          dueDate,
        });
        if (created) tasksCreated++;
        await createNotification({
          organizationId: orgId,
          category: 'schedule_milestone_slip',
          severity: result.isCritical ? 'critical' : 'warning',
          title: `Milestone slipped: ${result.title}`,
          body: result.reason,
          resourceType: 'project',
          resourceId: String(projectId),
          actionUrl: `/projects/proj_${projectId}`,
        }).then(() => { alertsCreated++; }).catch(() => {});
        md.lastNotifiedStatus = 'slipped';
        await pool.query(
          `UPDATE project_workflow_stages SET metadata = $1 WHERE id = $2 AND organization_id = $3`,
          [JSON.stringify(md), row.id, orgId],
        );
      } else if (result.nextStatus === 'at_risk' && prevNotified !== 'at_risk' && prevNotified !== 'slipped') {
        const created = await createScheduleTask({
          orgId,
          projectId,
          milestoneKey: result.key,
          kind: 'mitigate_risk',
          title: `Mitigate at-risk milestone: ${result.title}`,
          description: result.reason,
          priority: result.isCritical ? 'high' : 'medium',
          dueDate,
        });
        if (created) tasksCreated++;
        await createNotification({
          organizationId: orgId,
          category: 'schedule_milestone_at_risk',
          severity: 'warning',
          title: `Milestone at risk: ${result.title}`,
          body: result.reason,
          resourceType: 'project',
          resourceId: String(projectId),
          actionUrl: `/projects/proj_${projectId}`,
        }).then(() => { alertsCreated++; }).catch(() => {});
        md.lastNotifiedStatus = 'at_risk';
        await pool.query(
          `UPDATE project_workflow_stages SET metadata = $1 WHERE id = $2 AND organization_id = $3`,
          [JSON.stringify(md), row.id, orgId],
        );
      }
    }

    // Flag goals whose target dates have passed without being achieved.
    const goals = await loadGoals(orgId, projectId);
    for (const g of goals) {
      if (g.status === 'active' && g.targetDate && new Date(g.targetDate).getTime() < now.getTime()) {
        await pool.query(
          `UPDATE project_schedule_goals
              SET status = 'at_risk', current_context = $1, updated_at = now()
            WHERE id = $2 AND organization_id = $3`,
          [`Target date passed (${g.targetDate.slice(0, 10)}) without completion — AnA flagged this goal for re-baselining.`, g.id, orgId],
        );
      }
    }

    const narrative = buildAnaNarrative(health);
    await pool.query(
      `UPDATE project_schedule_of_events
          SET ana_summary = $1, last_reviewed_by_ana_at = now(), updated_at = now()
        WHERE id = $2 AND organization_id = $3`,
      [narrative, plan.id, orgId],
    );

    await recordRevision({
      orgId,
      projectId,
      scheduleId: plan.id,
      revisionType: 'health_review',
      summary: `Proactive review — ${health.summary}`,
      detail: { health, tasksCreated, alertsCreated },
      triggeredBy: params.triggeredBy ?? 'scheduler',
      createdByAna: true,
    });
  }

  return {
    ok: true,
    scheduleId: plan.id,
    health,
    applied: apply,
    tasksCreated,
    alertsCreated,
    message: apply
      ? `Reviewed schedule: ${health.summary} Opened ${tasksCreated} task(s), ${alertsCreated} alert(s).`
      : health.summary,
  };
}

function buildAnaNarrative(health: ScheduleHealth): string {
  const verdict =
    health.overallStatus === 'on_track'
      ? 'Your program is on track.'
      : health.overallStatus === 'at_risk'
        ? 'Your program needs attention.'
        : 'Your program is off track — critical milestones have slipped.';
  return `${verdict} ${health.summary} Last reviewed ${new Date(health.assessedAt).toISOString().slice(0, 16).replace('T', ' ')}Z by AnA.`;
}

/** Active schedule plans across all tenants — used by the proactive sweep. */
export async function listActiveSchedulePlans(): Promise<
  Array<{ scheduleId: number; orgId: number; projectId: number }>
> {
  const { rows } = await pool.query(
    `SELECT id, organization_id, project_id FROM project_schedule_of_events WHERE status = 'active'`,
  );
  return rows.map((r: any) => ({ scheduleId: r.id, orgId: r.organization_id, projectId: r.project_id }));
}
