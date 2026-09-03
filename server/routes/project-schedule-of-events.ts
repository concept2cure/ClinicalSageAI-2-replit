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
 * Every handler is org- and project-scoped for tenant isolation.
 *
 * @module server/routes/project-schedule-of-events
 */

import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { loadUnifiedWork } from '../services/unified-work/unified-work-view';
import {
  getScheduleOfEvents,
  generateProjectSchedule,
  amendMilestone,
  resetProjectGoals,
  reviewScheduleHealth,
  type GeneratorGoal,
} from '../services/projects/schedule-of-events';
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('project-schedule-of-events');

// ── tenant / param helpers (mirror server/routes/concept2cure.ts) ────────────
function getOrganizationId(req: Request): number {
  const ctx = (req as any).tenantContext;
  if (ctx?.organizationId != null) {
    const orgId = typeof ctx.organizationId === 'number' ? ctx.organizationId : parseInt(String(ctx.organizationId), 10);
    if (!Number.isNaN(orgId)) return orgId;
  }
  const tid = (req as any).tenantId;
  if (tid != null) {
    const n = typeof tid === 'number' ? tid : parseInt(String(tid), 10);
    if (!Number.isNaN(n)) return n;
  }
  throw new Error('Organization context required');
}

/**
 * Strictly parse the numeric project id ('12' or 'proj_12').
 *
 * MUST fail closed on anything else. The previous `parseInt(raw.replace(…))`
 * truncated arbitrary idents to their leading digits, so a regulatory_programs
 * UUID like '7abb…' — the id-space the v2 surfaces hold — silently resolved to
 * project 7 and served ANOTHER project's schedule inside the same org. A
 * non-numeric ident is a 400, never a prefix-guessed project.
 */
function getProjectId(req: Request): number | null {
  const raw = req.params.id;
  if (typeof raw !== 'string') return null;
  const m = /^(?:proj_)?(\d+)$/.exec(raw.trim());
  return m ? parseInt(m[1], 10) : null;
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

/**
 * Look up a project WITHIN the caller's organization.
 *
 * This used to be `resolveProjectType`, returning `string | null` — which
 * conflated two entirely different answers:
 *
 *   - "that project is not yours" (or does not exist), and
 *   - "it is yours, and it has no submission type set".
 *
 * Only one caller used it, and it treated both as "no type known" and carried
 * on. So POST /projects/:id/schedule-of-events/generate would proceed for a
 * project in ANOTHER organization, reaching an upsert whose ON CONFLICT arbiter
 * was org-blind. Distinguishing the two cases is what makes an ownership gate
 * expressible at all, so the return type now carries the distinction.
 *
 * Errors are rethrown rather than swallowed into `null`. The previous
 * `catch { return null }` turned a transient database failure into "no type",
 * and under the gate below would turn it into a 404 — reporting "your project
 * does not exist" because a query timed out.
 */
type ProjectLookup = { found: false } | { found: true; projectType: string | null };

async function findProjectInOrg(orgId: number, projectId: number): Promise<ProjectLookup> {
  const { rows } = await pool.query(
    `SELECT type, metadata FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [projectId, orgId],
  );
  const r = rows[0];
  if (!r) return { found: false };
  const md = r.metadata && typeof r.metadata === 'object' ? r.metadata : {};
  return { found: true, projectType: (md.submissionType as string) || r.type || null };
}

/**
 * Ownership gate for every handler in this router.
 *
 * Resolves the project id and confirms it belongs to the caller's organization,
 * writing the response and returning null when it does not. A cross-tenant
 * request and a genuinely absent project both get the same 404 — the response
 * must not reveal that project 42 exists but belongs to somebody else.
 *
 * The service layer scopes its own reads by organization_id, so a cross-tenant
 * GET already returned an empty schedule rather than the victim's. This gate
 * exists for the mutating handlers, and to keep the composite FK added in
 * 20260728_schedule_of_events_org_scoped_uniqueness.sql from surfacing as a 500
 * with constraint text in the body.
 */
async function requireOwnedProject(
  req: Request,
  res: Response,
): Promise<{ orgId: number; projectId: number; projectType: string | null } | null> {
  const orgId = getOrganizationId(req);
  const projectId = getProjectId(req);
  if (projectId == null) {
    res.status(400).json({ error: 'Invalid project id' });
    return null;
  }
  const project = await findProjectInOrg(orgId, projectId);
  if (!project.found) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  return { orgId, projectId, projectType: project.projectType };
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
    const { orgId, projectId } = owned;
    const view = await loadUnifiedWork({ organizationId: orgId, projectId });
    return res.json(view);
  } catch (err: any) {
    return serverError(res, logger, 'loading unified work', err);
  }
});

router.get('/projects/:id/schedule-of-events', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId } = owned;
    const view = await getScheduleOfEvents(orgId, projectId);
    return res.json(view);
  } catch (err: any) {
    return serverError(res, logger, 'loading schedule of events', err);
  }
});

router.post('/projects/:id/schedule-of-events/generate', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId } = owned;
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
      triggeredBy: 'user',
      createdByAna: false,
    });
    return res.json(view);
  } catch (err: any) {
    return serverError(res, logger, 'generating schedule of events', err);
  }
});

router.post('/projects/:id/schedule-of-events/amend', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId } = owned;
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
    });
    const view = await getScheduleOfEvents(orgId, projectId);
    return res.json({ result, schedule: view });
  } catch (err: any) {
    return serverError(res, logger, 'saving amend', err);
  }
});

router.post('/projects/:id/schedule-of-events/review', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId } = owned;
    const apply = req.body?.apply === undefined ? true : !!req.body.apply;
    const result = await reviewScheduleHealth({ orgId, projectId, apply, triggeredBy: 'user' });
    const view = await getScheduleOfEvents(orgId, projectId);
    return res.json({ result, schedule: view });
  } catch (err: any) {
    return serverError(res, logger, 'saving review', err);
  }
});

router.post('/projects/:id/schedule-of-events/goals/reset', async (req: Request, res: Response) => {
  try {
    const owned = await requireOwnedProject(req, res);
    if (!owned) return;
    const { orgId, projectId } = owned;
    const body = req.body ?? {};
    const goals = parseGoals(body.goals);
    const rationale = typeof body.rationale === 'string' ? body.rationale.trim() : '';
    if (goals.length === 0 || !rationale) {
      return res.status(400).json({ error: 'goals and rationale are required' });
    }
    const result = await resetProjectGoals({ orgId, projectId, goals, rationale, triggeredBy: 'user', createdByAna: false });
    const view = await getScheduleOfEvents(orgId, projectId);
    return res.json({ result, schedule: view });
  } catch (err: any) {
    return serverError(res, logger, 'saving reset', err);
  }
});

export default router;
