/**
 * Task Board — org-scoped unifiedTasks read-model.
 *
 * Backs the ui-v2 "Task board" surface
 * (client/src/concept2cure/v2/surfaces/TaskBoard.tsx; fixture
 * fixtures/task-board-data.ts -> TB_TASKS: TaskItem[]).
 *
 * The surface renders the org-wide `unifiedTasks` board (canonical store,
 * shared/schema.ts -> unifiedTasks). Today the client reads its rows from the
 * in-browser window.C2C collab store (falling back to the TB_TASKS fixture);
 * this endpoint returns the SAME display shape populated from the real,
 * org-scoped `unified_tasks` table so the board can render live GA data. See
 * the clientWireHint in the accompanying spec for how the surface consumes it.
 *
 * Data model -> display-shape mapping (every TB_TASKS field is accounted for;
 * fields with no real source are returned as documented nulls or omitted —
 * NEVER fabricated; see HONESTY NOTES at the bottom):
 *
 *   taskId, title, moduleType, status, priority, progress, criticalPath,
 *   regulatoryImpact, approvalRequired, estimatedHours -> direct columns
 *   taskType            -> column (null -> '')
 *   approvalStatus      -> column (null -> 'not_started', the fixture default;
 *                          also prevents the detail panel's .replace() crash)
 *   impactScore         -> column (real, nullable -> null when never scored)
 *   project             -> String(projectId) FK (null -> '')
 *   assignee            -> String(assigneeId) FK (null -> '')
 *   assignedBy          -> String(assignedBy) FK (null -> '')
 *   comments,attachments-> length of the JSON array columns (0 when absent)
 *   dependsOn           -> predecessors from task_dependencies (the DAG the
 *                          surface names), scoped to this org's task ids
 *   blocks              -> successors from task_dependencies, same scoping
 *   due                 -> humanised from dueDate + status ('done' | 'today' |
 *                          'in N days' | 'overdue N days' | '')
 *   blocked             -> status === 'blocked' || blockedBy[] non-empty
 *   source              -> best-effort reflection of sourceEntityType (see note)
 *   phase               -> GAP: no column; always null
 *
 * RLS (CI gate ci:requestdb-coverage): queries `unified_tasks` /
 * `task_dependencies` through the request-scoped Drizzle client
 * (requestDb(req)) so the tenant session vars set by requireTenantContext apply
 * on the same connection; also filters organizationId explicitly as
 * defense-in-depth for the RLS-not-yet-enforced window. Fails closed to an
 * empty board if the table is unprovisioned (undefined_table / 42P01).
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * pharmacovigilance-board.routes.ts (Router factory default export, org id from
 * tenant/user context, scoped logger, honest error shaping, { success, data }
 * envelope).
 *
 * @module routes/taskBoard.routes
 */

import { Router, Request, Response } from 'express';
import { and, asc, eq, inArray, or } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger.js';
import { requestDb } from '../db/requestDb';
import { getSecureOrgId } from '../utils/tenantContext';
import {
  unifiedTasks, taskDependencies, taskRegulatoryLinks, users, organizationUsers,
} from '../../shared/schema';
import {
  isLifecyclePhase, LIFECYCLE_PHASE_LABEL, describeBlocking,
  type TaskRegulatoryLinkView,
} from '../../shared/regulatory/mdx-lifecycle';

const logger = createScopedLogger('task-board-routes');

// ── Display-shape row type (mirrors TaskItem in task-board-data.ts) ─────────────

interface TaskBoardItem {
  taskId: string;
  title: string;
  /** Real project FK as a string; '' when the task is not attached to a project. */
  project: string;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  /** Real assignee user-id FK as a string; '' when unassigned. */
  assignee: string;
  /** Real assigned-by user-id FK as a string; '' when unknown. */
  assignedBy: string;
  progress: number;
  /** 0-10 submission impact; null when never scored (not fabricated). */
  impactScore: number | null;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
  approvalStatus: string;
  dependsOn: string[];
  blocks: string[];
  comments: number;
  attachments: number;
  source: string;
  due: string;
  /**
   * Where this task sits in the regulatory lifecycle, from
   * unified_tasks.lifecycle_phase. Null means NOT YET CLASSIFIED — every task
   * predating the column is in that state, deliberately not backfilled, because
   * assigning a phase nobody chose would render a manufactured breakdown.
   */
  phase: string | null;
  /** Display label for `phase`; null whenever phase is. */
  lifecyclePhaseLabel: string | null;
  /** mdx | biopharma | pdev, denormalized from the resolved project context. */
  vertical: string | null;
  /** internal | client_visible | client_action_required | authority_ready. */
  clientVisibility: string;
  /** What this task supports or blocks. Empty when nothing is declared — the
   *  board does not infer links from module_type. */
  regulatoryLinks: TaskRegulatoryLinkView[];
  /** One line naming what this task blocks, or null when it blocks nothing. */
  blocking: string | null;
  blocked: boolean;
  estimatedHours: number | null;
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

/** Length of a JSON-array column (comments/attachments); 0 for null/object. */
function jsonArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Humanise a due date into the vocabulary the surface's `/overdue/` test and
 * labels expect. Completed tasks read 'done'; a missing due date reads '' (the
 * surface treats that as "no deadline") — never a fabricated date.
 */
function humanizeDue(dueDate: Date | null, status: string): string {
  if (status === 'completed') return 'done';
  if (!dueDate) return '';
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return '';
  const now = new Date();
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfDue = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const diffDays = Math.round((startOfDue - startOfToday) / 86_400_000);
  if (diffDays === 0) return 'today';
  if (diffDays > 0) return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  const overdue = -diffDays;
  return `overdue ${overdue} day${overdue === 1 ? '' : 's'}`;
}

/**
 * Best-effort provenance for the surface's "Task sources" strip, reflected from
 * the real `source_entity_type` column. unified_tasks IS the canonical store, so
 * a row with no recorded origin is truthfully 'unified'. The fixture's other
 * origins (section/pyramid/wbs/module) live in SEPARATE stores (projectTasks,
 * project_tasks, crossModuleTaskLinks, the in-memory pyramid) that this endpoint
 * does not query — so most live rows report 'unified' or 'template'. This maps a
 * real column, it does not invent: unmapped values fall through to 'unified'.
 */
function mapSource(sourceEntityType: string | null): string {
  if (!sourceEntityType) return 'unified';
  const s = sourceEntityType.toLowerCase();
  if (s.includes('template')) return 'template';
  if (s.includes('section')) return 'section';
  if (s.includes('module')) return 'module';
  if (s.includes('wbs')) return 'wbs';
  if (s.includes('pyramid')) return 'pyramid';
  return 'unified';
}

/** Postgres "relation does not exist" — fail closed to an empty board. */
function isMissingTable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '42P01'
  );
}

// ── Router factory ──────────────────────────────────────────────────────────────

export default function createTaskBoardRoutes(): Router {
  const router = Router();

  /**
   * GET /api/task-management/board
   * The org-wide unifiedTasks board in the TB_TASKS display shape.
   * Response: { success: true, data: TaskBoardItem[], total: number }
   */
  router.get('/board', async (req: Request, res: Response) => {
    // Org id is derived from the verified JWT (never client-supplied headers).
    const orgRaw = getSecureOrgId(req);
    const organizationId = orgRaw != null ? Number(orgRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    try {
      const db = requestDb(req);

      const rows = await db
        .select()
        .from(unifiedTasks)
        .where(eq(unifiedTasks.organizationId, organizationId))
        .orderBy(asc(unifiedTasks.dueDate));

      const taskIds = rows.map(row => row.taskId);
      const orgTaskIds = new Set(taskIds);

      // Dependency DAG (task_dependencies carries no org column; scope by the
      // org's own task ids on BOTH endpoints so no foreign-org id can leak in).
      const deps = taskIds.length
        ? await db
            .select({
              predecessorTaskId: taskDependencies.predecessorTaskId,
              successorTaskId: taskDependencies.successorTaskId,
            })
            .from(taskDependencies)
            .where(
              or(
                inArray(taskDependencies.predecessorTaskId, taskIds),
                inArray(taskDependencies.successorTaskId, taskIds),
              ),
            )
        : [];

      // What each task supports or blocks. Queried defensively in its own
      // try/catch: an older database can carry unified_tasks without the MDX link
      // table, and a missing table must degrade to "no links" rather than blanking
      // the whole board.
      const linkMap = new Map<string, TaskRegulatoryLinkView[]>();
      if (taskIds.length > 0) {
        try {
          const linkRows = await db
            .select()
            .from(taskRegulatoryLinks)
            .where(and(
              eq(taskRegulatoryLinks.organizationId, organizationId),
              inArray(taskRegulatoryLinks.taskId, taskIds),
            ));
          for (const l of linkRows) {
            const arr = linkMap.get(l.taskId) ?? [];
            arr.push({
              entityType: l.entityType as TaskRegulatoryLinkView['entityType'],
              entityId: l.entityId,
              entityLabel: l.entityLabel,
              relationship: l.relationship as TaskRegulatoryLinkView['relationship'],
              market: l.market,
              pathway: l.pathway,
              filingType: l.filingType,
              filingSection: l.filingSection,
            });
            linkMap.set(l.taskId, arr);
          }
        } catch (err) {
          if (!isMissingTable(err)) throw err;
        }
      }

      const dependsOnMap = new Map<string, string[]>();
      const blocksMap = new Map<string, string[]>();
      for (const dep of deps) {
        if (!orgTaskIds.has(dep.predecessorTaskId) || !orgTaskIds.has(dep.successorTaskId)) {
          continue;
        }
        // A finish-to-start edge (predecessor -> successor): the successor
        // dependsOn the predecessor; the predecessor blocks the successor.
        const dependsOn = dependsOnMap.get(dep.successorTaskId) ?? [];
        dependsOn.push(dep.predecessorTaskId);
        dependsOnMap.set(dep.successorTaskId, dependsOn);

        const blocks = blocksMap.get(dep.predecessorTaskId) ?? [];
        blocks.push(dep.successorTaskId);
        blocksMap.set(dep.predecessorTaskId, blocks);
      }

      const tasks: TaskBoardItem[] = rows.map(row => {
        const status = row.status;
        const blocked =
          status === 'blocked' || (Array.isArray(row.blockedBy) && row.blockedBy.length > 0);
        return {
          taskId: row.taskId,
          title: row.title,
          project: row.projectId != null ? String(row.projectId) : '',
          moduleType: row.moduleType,
          taskType: row.taskType ?? '',
          status,
          priority: row.priority,
          assignee: row.assigneeId != null ? String(row.assigneeId) : '',
          assignedBy: row.assignedBy != null ? String(row.assignedBy) : '',
          progress: row.progress ?? 0,
          impactScore: row.impactScore ?? null,
          criticalPath: row.criticalPath ?? false,
          regulatoryImpact: row.regulatoryImpact ?? false,
          approvalRequired: row.approvalRequired ?? false,
          approvalStatus: row.approvalStatus ?? 'not_started',
          dependsOn: dependsOnMap.get(row.taskId) ?? [],
          blocks: blocksMap.get(row.taskId) ?? [],
          comments: jsonArrayLength(row.comments),
          attachments: jsonArrayLength(row.attachments),
          source: mapSource(row.sourceEntityType),
          due: humanizeDue(row.dueDate, status),
          // Real now. Still null for a task nobody has classified — that is an
          // honest "not yet classified", not a gap in the model.
          phase: isLifecyclePhase(row.lifecyclePhase) ? row.lifecyclePhase : null,
          lifecyclePhaseLabel: isLifecyclePhase(row.lifecyclePhase)
            ? LIFECYCLE_PHASE_LABEL[row.lifecyclePhase]
            : null,
          vertical: row.industryVertical ?? null,
          clientVisibility: row.clientVisibility ?? 'internal',
          regulatoryLinks: linkMap.get(row.taskId) ?? [],
          // The one-line "why this matters" a card needs, or null when this task
          // blocks nothing — an empty string would render as missing data.
          blocking: describeBlocking(linkMap.get(row.taskId) ?? []),
          blocked,
          estimatedHours: row.estimatedHours ?? null,
        };
      });

      return res.json({ success: true, data: tasks, total: tasks.length });
    } catch (error) {
      if (isMissingTable(error)) {
        logger.error('task board: unified_tasks unprovisioned — returning empty board', {
          err: error instanceof Error ? error.message : String(error),
        });
        return res.json({ success: true, data: [], total: 0 });
      }
      logger.error('task board error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to build task board' });
    }
  });

  /**
   * GET /api/task-management/assignees
   * The org's assignable members ({ id, name }) for the create form's assignee
   * picker. Scoped exactly like getOptimalAssignee (users ⨝ organization_users
   * on organizationId), so no cross-org user can appear. Real rows only; fails
   * closed to an empty roster when the store is unprovisioned.
   * Response: { success: true, data: { id: string; name: string }[], total }
   */
  router.get('/assignees', async (req: Request, res: Response) => {
    const orgRaw = getSecureOrgId(req);
    const organizationId = orgRaw != null ? Number(orgRaw) : NaN;
    if (!Number.isFinite(organizationId) || organizationId <= 0) {
      return res.status(400).json({ success: false, error: 'Organization context required' });
    }

    try {
      const db = requestDb(req);
      const rows = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .innerJoin(organizationUsers, eq(organizationUsers.userId, users.id))
        .where(eq(organizationUsers.organizationId, organizationId))
        .orderBy(asc(users.name));

      const data = rows.map(row => ({
        id: String(row.id),
        name: row.name || (row.email ? row.email.split('@')[0] : 'User'),
      }));
      return res.json({ success: true, data, total: data.length });
    } catch (error) {
      if (isMissingTable(error)) {
        logger.error('task assignees: users/organization_users unprovisioned — empty roster', {
          err: error instanceof Error ? error.message : String(error),
        });
        return res.json({ success: true, data: [], total: 0 });
      }
      logger.error('task assignees error', {
        err: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ success: false, error: 'Failed to load assignees' });
    }
  });

  return router;
}

/*
 * ── HONESTY NOTES (gaps returned as documented nulls / omissions, never faked) ──
 *  - phase                   — REAL as of MDX-TASK-01: unified_tasks.lifecycle_phase.
 *    Still null for a task nobody has classified, which is an honest "not yet
 *    classified" rather than a missing column. Tasks predating the column are all
 *    in that state; they were deliberately not backfilled, because assigning a
 *    phase nobody chose would render a lifecycle breakdown that is manufactured.
 *  - regulatoryLinks         — REAL, from task_regulatory_links. Empty for a task
 *    with no declared links; the board does not infer them from module_type.
 *  - impactScore: null      — when the row was never scored (real nullable column).
 *  - project/assignee/assignedBy: real numeric FKs stringified; the surface's
 *    TB_PROJECTS / TB_TEAM fixtures map their own slugs/codes, so names+avatars
 *    require a real roster/projects list on the client (see clientWireHint).
 *  - source: reflects sourceEntityType only; cross-store provenance
 *    (section/pyramid/wbs/module) is NOT reconciled here (forensic Gap 1).
 *  - blockedReason / assignmentType: omitted — not stored. The card falls back
 *    to the literal 'Blocked'; assignmentType is unused by the board.
 *  - This is a pure read: no c2c_ana_actions audit entry (matches the surface's
 *    own "audit not wired" disclosure). All writes remain on taskManagement.routes.
 */
