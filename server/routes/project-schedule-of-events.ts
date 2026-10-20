/**
 * Project Schedule of Events — REST API.
 *
 * The user-facing surface for AnA's regulatory-aware milestone schedule. Mounted
 * under /api/concept2cure so it shares the project URL space and JWT/tenant
 * gating with the rest of the project manager:
 *
 *   GET    /projects/:id/schedule-of-events            read plan + milestones + goals + revisions + health
 *   POST   /projects/:id/schedule-of-events/generate   (re)generate from type + goals + target
 *   POST   /projects/:id/schedule-of-events/amend       move/restatus a single milestone
 *   POST   /projects/:id/schedule-of-events/review      proactive health review (acts on findings)
 *   POST   /projects/:id/schedule-of-events/goals/reset re-baseline program goals
 *
 * Every handler requires current membership and canonical project sharing on the request executor.
 *
 * `:id` is the integer projects.id ('12' / 'proj_12') or a regulatory_programs
 * UUID, which requires one eligible project anchor on the server (see
 * requireOwnedProject). Nothing else is accepted.
 *
 * @module server/routes/project-schedule-of-events
 */

import { Router, type Request, type Response } from 'express';
import { requestDb, requestPgClient, type RequestSqlClient } from '../db/requestDb';
import { governedActorId } from '../middleware/orgMembership';
import { looksLikeProgramUuid, parseIntegerProjectId } from '../lib/project-id';
import { readCurrentProgramActor, requireCurrentProgramAccess, ProgramReadAccessError } from '../services/c2c/current-program-access';
import { canAccessReportProject } from '../services/report-os/project-access';
import { loadUnifiedWork } from '../services/unified-work/unified-work-view';
import { SchedulePreservationConflict } from '../services/projects/schedule-of-events/preservation';
import {
  getScheduleOfEvents,
  generateProjectSchedule,
  amendMilestone,
  resetProjectGoals,
  reviewScheduleHealth,
  type GeneratorGoal,
  type ScheduleExecutionContext,
} from '../services/projects/schedule-of-events';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('project-schedule-of-events');

// ── tenant / param helpers (mirror server/routes/concept2cure.ts) ────────────
function getOrganizationId(req: Request): number {
  const tenantContext = (req as any).tenantContext;
  const authoritative = tenantContext && Object.hasOwn(tenantContext, 'organizationId');
  const raw = authoritative ? tenantContext.organizationId : (req as any).tenantId;
  if (raw == null && !authoritative) throw new Error('Organization context required');
  const id = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) {
    throw new ProgramReadAccessError(403, 'PROJECT_ACTOR_REQUIRED', 'A valid current organization is required.');
  }
  return id;
}

function getProjectId(req: Request): number | null {
  const id = parseIntegerProjectId(req.params.id);
  return id !== null && id <= 2_147_483_647 ? id : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value.trim());
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseGoals(value: unknown): GeneratorGoal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((g: any) => ({
      title: String(g?.title ?? '').trim(),
      description: typeof g?.description === 'string' ? g.description : null,
      targetDate: typeof g?.target_date === 'string' ? g.target_date : g?.targetDate ?? null,
      priority: typeof g?.priority === 'string' ? g.priority : null,
      metric: typeof g?.metric === 'string' ? g.metric : null,
    }))
    .filter((g) => g.title);
}

interface OwnedScheduleProject {
  orgId: number;
  projectId: number;
  projectType: string | null;
  execution: ScheduleExecutionContext;
}

function accessUnavailable(): ProgramReadAccessError {
  return new ProgramReadAccessError(503, 'PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. No project data was supplied.');
}

function requireActorId(req: Request): number {
  const id = governedActorId(req);
  if (!id || !Number.isSafeInteger(id) || id > 2_147_483_647) {
    throw new ProgramReadAccessError(403, 'PROJECT_ACTOR_REQUIRED', 'A current organization actor is required.');
  }
  return id;
}

async function admittedProgramProject(executor: RequestSqlClient, orgId: number, actorUserId: number, programId: string): Promise<number> {
  const admitted = await requireCurrentProgramAccess(executor, { organizationId: orgId, userId: actorUserId, programId });
  if (admitted.actor.userId !== actorUserId || admitted.programId !== programId ||
      !Number.isSafeInteger(admitted.projectId) || admitted.projectId <= 0 || admitted.projectId > 2_147_483_647) {
    throw accessUnavailable();
  }
  return admitted.projectId;
}

async function admitRouteProject(executor: RequestSqlClient, orgId: number, actorUserId: number, numericId: number | null, programId: string | null): Promise<number> {
  try {
    const actor = await readCurrentProgramActor(executor, { organizationId: orgId, userId: actorUserId });
    if (actor.userId !== actorUserId) throw new ProgramReadAccessError(403, 'PROJECT_ACTOR_REQUIRED', 'The current project actor could not be verified.');
    const projectId = programId ? await admittedProgramProject(executor, orgId, actorUserId, programId) : numericId;
    if (projectId === null || !await canAccessReportProject(orgId, actor, projectId, executor)) {
      throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Current project access does not permit this operation.');
    }
    return projectId;
  } catch (error) {
    if (error instanceof ProgramReadAccessError) throw error;
    throw accessUnavailable();
  }
}

function projectTypeFromRow(row: Record<string, unknown>): string | null {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  return typeof metadata.submissionType === 'string' && metadata.submissionType
    ? metadata.submissionType : typeof row.type === 'string' ? row.type : null;
}

/** Resolve the exact project and current persisted sharing policy on the
 * caller-owned connection. Organization ownership alone grants no access. */
async function requireOwnedProject(req: Request, res: Response): Promise<OwnedScheduleProject | null> {
  const orgId = getOrganizationId(req);
  const numericId = getProjectId(req);
  const programId = looksLikeProgramUuid(req.params.id) ? String(req.params.id).trim().toLowerCase() : null;
  if (numericId === null && programId === null) {
    res.status(400).json({ error: 'Invalid project id' });
    return null;
  }
  const actorUserId = requireActorId(req);
  const executor = requestPgClient(req);
  const projectId = await admitRouteProject(executor, orgId, actorUserId, numericId, programId);
  const { rows } = await executor.query('SELECT type, metadata FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1', [projectId, orgId]);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  return { orgId, projectId, projectType: projectTypeFromRow(row), execution: { actorUserId, executor } };
}

function scheduleRouteError(res: Response, operation: string, error: unknown) {
  if (error instanceof ProgramReadAccessError) {
    if (error.code === 'PROJECT_ANCHOR_UNRESOLVED') {
      return res.status(error.status).json({ error: 'This program needs one verified project record before its schedule or tasks can be supplied.', code: 'PROGRAM_UNANCHORED' });
    }
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  return serverError(res, logger, operation, error);
}

// ── routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/.../projects/:id/unified-work
 *
 * One normalized view of everything outstanding on a project across the three
 * systems that track work independently: schedule-of-events tasks (project_tasks),
 * review + correspondence work items (c2c_project_work_items), and tracked
 * filings with their FDA review clock (estar_submissions). Read-only and
 * additive — it changes no system's writes. Blockers sort first, then soonest
 * due; `summary` gives the roll-up counts by status and by source.
 */
router.get('/projects/:id/unified-work', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId, execution } = owned;
    const view = await loadUnifiedWork({ organizationId: orgId, projectId }, requestDb(req));
    // This composed read has several source queries. Do not release earlier
    // private results after an observed revocation or changed program anchor.
    const current = await requireOwnedProject(req, res);
    if (!current) return;
    if (current.orgId !== orgId || current.projectId !== projectId || current.execution.actorUserId !== execution.actorUserId) throw accessUnavailable();
    return res.json(view);
  } catch (err: any) {
    return scheduleRouteError(res, 'loading unified work', err);
  }
});

router.get('/projects/:id/schedule-of-events', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId, execution } = owned;
    const view = await getScheduleOfEvents(orgId, projectId, execution);
    return res.json(view);
  } catch (err: any) {
    return scheduleRouteError(res, 'loading schedule of events', err);
  }
});

router.post('/projects/:id/schedule-of-events/generate', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId, execution } = owned;
    const body = req.body ?? {};
    // The gate already resolved the project inside the caller's org, so the
    // stored type comes from there rather than a second lookup.
    const projectType =
      (typeof body.project_type === 'string' && body.project_type.trim()) || owned.projectType;
    const view = await generateProjectSchedule({
      orgId,
      projectId,
      projectType,
      baselineDate: parseDate(body.baseline_date),
      targetDate: parseDate(body.target_date),
      goals: parseGoals(body.goals),
      reason: typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
      triggeredBy: 'user',
      createdByAna: false,
    }, execution);
    return res.json(view);
  } catch (err: any) {
    if (err instanceof SchedulePreservationConflict) {
      return res.status(409).json({ error: err.message, code: err.code });
    }
    return scheduleRouteError(res, 'generating schedule of events', err);
  }
});

router.post('/projects/:id/schedule-of-events/amend', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId, execution } = owned;
    const body = req.body ?? {};
    const milestoneKey = typeof body.milestone_key === 'string' ? body.milestone_key.trim() : '';
    if (!milestoneKey) return res.status(400).json({ error: 'milestone_key is required' });
    const result = await amendMilestone({
      orgId,
      projectId,
      milestoneKey,
      newTargetDate: parseDate(body.new_target_date),
      status: typeof body.status === 'string' ? (body.status as any) : undefined,
      progress: typeof body.progress === 'number' ? body.progress : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
      triggeredBy: 'user',
      createdByAna: false,
    }, execution);
    const view = await getScheduleOfEvents(orgId, projectId, execution);
    return res.json({ result, schedule: view });
  } catch (err: any) {
    return scheduleRouteError(res, 'saving amend', err);
  }
});

router.post('/projects/:id/schedule-of-events/review', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId, execution } = owned;
    const apply = req.body?.apply === undefined ? true : !!req.body.apply;
    const result = await reviewScheduleHealth({ orgId, projectId, apply, triggeredBy: 'user' }, execution);
    const view = await getScheduleOfEvents(orgId, projectId, execution);
    return res.json({ result, schedule: view });
  } catch (err: any) {
    return scheduleRouteError(res, 'saving review', err);
  }
});

router.post('/projects/:id/schedule-of-events/goals/reset', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId, execution } = owned;
    const body = req.body ?? {};
    const goals = parseGoals(body.goals);
    const rationale = typeof body.rationale === 'string' ? body.rationale.trim() : '';
    if (goals.length === 0 || !rationale) {
      return res.status(400).json({ error: 'goals and rationale are required' });
    }
    const result = await resetProjectGoals({ orgId, projectId, goals, rationale, triggeredBy: 'user', createdByAna: false }, execution);
    const view = await getScheduleOfEvents(orgId, projectId, execution);
    return res.json({ result, schedule: view });
  } catch (err: any) {
    return scheduleRouteError(res, 'saving reset', err);
  }
});

export default router;
