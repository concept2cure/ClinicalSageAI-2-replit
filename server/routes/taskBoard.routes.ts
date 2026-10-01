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
 *   phase               -> lifecycle_phase column (20260727_unified_tasks_mdx_
 *                          metadata.sql; LIFECYCLE_PHASES domain in
 *                          shared/schema.ts); null when never set
 *
 * RLS (CI gate ci:requestdb-coverage): queries `unified_tasks` /
 * `task_dependencies` through the request-scoped Drizzle client
 * (requestDb(req)) so the tenant session vars set by requireTenantContext apply
 * on the same connection; also filters organizationId explicitly as
 * defense-in-depth for the RLS-not-yet-enforced window. An unprovisioned
 * `unified_tasks` (undefined_table / 42P01) is reported as an unread store.
 *
 * EVERY STORE (2026-10-01, row D2). The board read `unified_tasks` only, so the
 * schedule's and the Communication Center's tasks (`project_tasks`), agency
 * correspondence (`c2c_project_work_items`) and tracked filings
 * (`estar_submissions`) never reached it, and its Blocked count could not see a
 * task blocked anywhere else. It now also reads them through the platform's one
 * cross-store view (services/unified-work/unified-work-view.ts loadUnifiedWork,
 * completed work included for the Done column); it does not merge them itself.
 * Those cards are read-only here and carry the screen that owns them (`home`):
 * the board invents no write path into another store. A task AnA created lives
 * in both `project_tasks` and the board (its mirror carries
 * source_entity_type 'project_task'), and is shown once, as the editable board
 * card. `meta.partial` / `meta.unreadSources` name any store that could not be
 * read, so a short board is never mistaken for a complete one; that now
 * includes the board's own table, which used to read as an empty board.
 *
 * Style template: server/routes/pharmacovigilance-routes.ts /
 * pharmacovigilance-board.routes.ts (Router factory default export, org id from
 * tenant/user context, scoped logger, honest error shaping, { success, data }
 * envelope).
 *
 * @module routes/taskBoard.routes
 */

import { Router, Request, Response } from 'express';
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';

import { createScopedLogger } from '../utils/logger.js';
import { requestDb, type RequestDb } from '../db/requestDb';
import {
  loadUnifiedWork,
  type UnifiedWorkItem,
  type UnifiedWorkSourceTable,
  type UnifiedWorkStatus,
} from '../services/unified-work/unified-work-view';
import { getSecureOrgId } from '../utils/tenantContext';
import { unifiedTasks, taskDependencies, users, organizationUsers } from '../../shared/schema';

const logger = createScopedLogger('task-board-routes');

// ── Display-shape row type (mirrors TaskItem in task-board-data.ts) ─────────────

/**
 * One §11.50 manifestation as `task-signoff.ts` writes it into
 * `unified_tasks.approval_history`. Mirrored (not imported) because that module
 * is a server-side service and this is the wire contract; the shape is asserted
 * against it in the route's tests.
 */
interface SignatureManifestation {
  signedById: number | null;
  signedByName: string;
  meaning: string;
  reason: string;
  signedAt: string;
  method: string;
}

/** Defensive: approval_history is a `json` column, so anything could be in it on
 *  a row written before the current shape. Keep only well-formed entries rather
 *  than handing the UI something it will render as "undefined". */
function readManifestations(raw: unknown): SignatureManifestation[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    if (typeof e.signedAt !== 'string' || typeof e.meaning !== 'string') return [];
    return [{
      signedById: typeof e.signedById === 'number' ? e.signedById : null,
      signedByName: typeof e.signedByName === 'string' ? e.signedByName : 'Unknown signer',
      meaning: e.meaning,
      reason: typeof e.reason === 'string' ? e.reason : '',
      signedAt: e.signedAt,
      // Never a default factor: an entry that does not say how it was signed says so.
      method: typeof e.method === 'string' ? e.method : 'not recorded',
    }];
  });
}

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
  /** Real assigned-by user-id FK as a string; '' when unknown. Null on another
   *  store's card: that store records no assigner, and none is invented. */
  assignedBy: string | null;
  progress: number;
  /** 0-10 submission impact; null when never scored (not fabricated). */
  impactScore: number | null;
  criticalPath: boolean;
  regulatoryImpact: boolean;
  approvalRequired: boolean;
  approvalStatus: string;
  /**
   * The §11.50 signature manifestations recorded against this task, oldest
   * first. Shipped on the board read model because the sign-off ceremony was
   * write-only from the UI's point of view: PATCH stored the manifestation and
   * nothing could ever render it back, so a signature existed in the ledger
   * that no user could see. §11.50 requires the signed record to display the
   * signer's printed name, the date and time, and the meaning of the signature.
   * Empty array when the task has never been signed — never null, so the client
   * does not have to branch.
   */
  approvalHistory: SignatureManifestation[];
  dependsOn: string[];
  blocks: string[];
  comments: number;
  attachments: number;
  source: string;
  due: string;
  /**
   * Machine-readable due date (ISO 8601) or null. The humanised `due` string
   * above is kept for display compat, but clients must not parse it — it is
   * server-locale English and UTC-day based (assessment D21). Overdue logic
   * belongs on this field.
   */
  dueDateIso: string | null;
  /**
   * Real `lifecycle_phase` column (LIFECYCLE_PHASES domain, shared/schema.ts:
   * strategy … postmarket); null when the task has never been phased.
   */
  phase: string | null;
  blocked: boolean;
  estimatedHours: number | null;
  /**
   * True for work that lives in another store (schedule, correspondence,
   * filing). The board shows it and does not write it; `home` says where it is
   * changed. Absent on the board's own tasks.
   */
  readOnly?: boolean;
  /** The screen that owns a read-only card, and its project. */
  home?: { surface: 'project-home' | 'submission-center'; projectId: number | null };
  /** The owning store's own note (a blocker, a module, a catalogue key), when it has one. */
  detail?: string | null;
}

/** What the board says about its own read: which stores it could not read. */
interface BoardReadMeta {
  partial: boolean;
  unreadSources: UnifiedWorkSourceTable[];
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

/** The cross-store view's status, in the board's column vocabulary. */
const BOARD_STATUS: Record<UnifiedWorkStatus, string> = {
  open: 'pending',
  in_progress: 'in-progress',
  blocked: 'blocked',
  done: 'completed',
};

/** The screen that owns each store's work. */
const HOME: Record<Exclude<UnifiedWorkItem['source'], 'board'>, 'project-home' | 'submission-center'> = {
  schedule: 'project-home',
  review: 'project-home',
  correspondence: 'project-home',
  filing: 'submission-center',
};

/**
 * Another store's work as a read-only board card. Fields that store does not
 * record are empty, never invented: no assignee id, no progress, no approval,
 * no dependency edges, no impact score.
 */
export function otherStoreCard(item: UnifiedWorkItem): TaskBoardItem | null {
  if (item.source === 'board') return null;
  const status = BOARD_STATUS[item.status];
  const due = item.dueAt ? new Date(item.dueAt) : null;
  return {
    taskId: item.id,
    title: item.title,
    project: item.projectId != null ? String(item.projectId) : '',
    moduleType: '',
    taskType: '',
    status,
    priority: item.priority ?? '',
    assignee: '',
    assignedBy: null,
    progress: 0,
    impactScore: null,
    criticalPath: false,
    regulatoryImpact: false,
    approvalRequired: false,
    approvalStatus: 'not_started',
    approvalHistory: [],
    dependsOn: [],
    blocks: [],
    comments: 0,
    attachments: 0,
    source: item.source,
    due: humanizeDue(due, status),
    dueDateIso: item.dueAt,
    phase: null,
    blocked: item.status === 'blocked',
    estimatedHours: null,
    readOnly: true,
    home: { surface: HOME[item.source], projectId: item.projectId },
    detail: item.detail,
  };
}

/**
 * The other stores' cards for this board. Work the board already holds is left
 * out: the view's own `unified_tasks` read, and every `project_tasks` row whose
 * board mirror is on the board (AnA's create_task writes both).
 */
export function otherStoreCards(items: UnifiedWorkItem[], mirroredProjectTaskIds: ReadonlySet<string>): TaskBoardItem[] {
  const out: TaskBoardItem[] = [];
  for (const item of items) {
    if (item.source === 'schedule' && mirroredProjectTaskIds.has(item.nativeId)) continue;
    const card = otherStoreCard(item);
    if (card) out.push(card);
  }
  return out;
}

/**
 * The board's own store, `unified_tasks`, with its dependency edges: the cards
 * that keep their move and edit behaviour. Also returns the project_tasks ids
 * these cards mirror, so the other stores' read does not show them twice.
 * A missing table throws (42P01); the caller reports it as an unread store.
 */
async function readOwnBoard(
  db: RequestDb,
  organizationId: number,
): Promise<{ tasks: TaskBoardItem[]; mirrored: Set<string> }> {
  const mirrored = new Set<string>();
  // Soft-deleted (archived) rows never reach the board (D24).
  const rows = await db
    .select()
    .from(unifiedTasks)
    .where(
      and(eq(unifiedTasks.organizationId, organizationId), isNull(unifiedTasks.deletedAt))
    )
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
      approvalHistory: readManifestations(row.approvalHistory),
      dependsOn: dependsOnMap.get(row.taskId) ?? [],
      blocks: blocksMap.get(row.taskId) ?? [],
      comments: jsonArrayLength(row.comments),
      attachments: jsonArrayLength(row.attachments),
      source: mapSource(row.sourceEntityType),
      due: humanizeDue(row.dueDate, status),
      dueDateIso: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      phase: row.lifecyclePhase ?? null,
      blocked,
      estimatedHours: row.estimatedHours ?? null,
    };
  });

  // A task AnA created is also a project_tasks row; its mirror is this card.
  for (const row of rows) {
    if (row.sourceEntityType === 'project_task' && row.sourceEntityId != null) {
      mirrored.add(String(row.sourceEntityId));
    }
  }

  return { tasks, mirrored };
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
      const unreadSources: UnifiedWorkSourceTable[] = [];
      let tasks: TaskBoardItem[] = [];
      let mirroredProjectTaskIds = new Set<string>();

      // The board's own store: its cards keep their move and edit behaviour.
      try {
        ({ tasks, mirrored: mirroredProjectTaskIds } = await readOwnBoard(db, organizationId));
      } catch (error) {
        if (!isMissingTable(error)) throw error;
        logger.error('task board: unified_tasks unprovisioned — the board reports it unread', {
          err: error instanceof Error ? error.message : String(error),
        });
        unreadSources.push('unified_tasks');
      }

      // Every other store, through the one cross-store view. Its own read of
      // unified_tasks is the board's store above, so only the others count here.
      const view = await loadUnifiedWork({ organizationId, includeCompleted: true });
      for (const [table, outcome] of Object.entries(view.sources) as Array<[UnifiedWorkSourceTable, { ran: boolean }]>) {
        if (table !== 'unified_tasks' && !outcome.ran) unreadSources.push(table);
      }
      const cards = [...tasks, ...otherStoreCards(view.items, mirroredProjectTaskIds)];
      const meta: BoardReadMeta = { partial: unreadSources.length > 0, unreadSources };
      return res.json({ success: true, data: cards, total: cards.length, meta });
    } catch (error) {
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
 *  - phase                  — now backed by the real `lifecycle_phase` column
 *    (20260727_unified_tasks_mdx_metadata.sql); null only when never set.
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
