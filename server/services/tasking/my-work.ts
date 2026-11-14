/**
 * My work — what is assigned to the signed-in person right now, read from the
 * canonical task store: their open unified tasks in their organisation, split
 * into overdue / due-soon / open, plus the approvals awaiting them. Read by the
 * top bar's "Your work" and Home's "Your open items" (client OpenWork.tsx)
 * through GET /api/task-management/my-work.
 *
 * Moved from the route (routes/taskManagement.routes.ts) on 2026-10-25 so it
 * can be tested on real SQL, unchanged in what it selects, with one addition:
 * each item names its project. The D2 first-session journey
 * (CLIENT_JOURNEY_2026-10-25.md, decision 13) found Home listing "Prepare:
 * Target Product Profile · Plan" once per project with nothing to tell the
 * projects apart. The name is the project record's own (`projects.name`, the
 * title its Project home shows), joined only within the caller's organisation:
 * a task whose project is missing, or not this organisation's, says no name
 * rather than another tenant's. Tasks due the same day now come in a fixed
 * order, newest assignment first.
 *
 * P-131 (2026-11-13). Two changes. (1) The list comes in the order of need, the one rule every list of a person's
 * work uses (unified-work-view.ts compareByNeed): overdue, due within seven days, later, no date; within each
 * critical, urgent, high, medium, low; then the earlier date. Tasks equal on all of that keep the order above (newest
 * assignment first). (2) Work another store records as the person's is listed too, read through the one cross-store
 * view narrowed to them (loadUnifiedWork ownedBy): a schedule task assigned to them (project_tasks.assignee_id), a
 * letter or renewal they own (c2c_project_work_items.owner_id). Not listed twice: a schedule task whose board mirror
 * exists (the mirror is the board task), and the review threads and review tasks, which the tray reads from their own
 * store (/api/concept2cure/reviews/my-queue). Such an item is read-only here and names where it lives (`home`). If
 * one of those stores cannot be read, the read fails: a shorter list is never offered as everything.
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { projects, unifiedTasks } from '../../../shared/schema';
import type { RequestDb } from '../../db/requestDb';
import { compareByNeed, loadUnifiedWork, type UnifiedWorkItem } from '../unified-work/unified-work-view';

export interface MyWorkItem {
  taskId: string;
  title: string;
  projectId: number | null;
  /** The project's name in this organisation, or null when the task has none. */
  projectName: string | null;
  moduleType: string;
  taskType: string;
  status: string;
  priority: string;
  dueDate: string | null;
  overdue: boolean;
  dueSoon: boolean;
  blocked: boolean;
  /**
   * A review route member whose step is not open yet: what it waits on
   * ('review' for an approver, 'step N' for a later reviewer), or a member who
   * handed their assignment back ('the sender to reassign it', RR3). It is
   * outside the overdue and due-soon triage, since its assignee cannot act
   * (RR1a, B11). Null for every other task.
   */
  waitingOn: string | null;
  /**
   * 'reviewer' or 'approver' for a review route member, whose task is acted on
   * where its route is (the version in the Vault, through the Review board),
   * never on the Tasks board, which refuses it (RR1b). Null for every other task.
   */
  reviewRole: 'reviewer' | 'approver' | null;
  approvalRequired: boolean;
  approvalStatus: string;
  criticalPath: boolean;
  /**
   * Set only on work that lives in another store (P-131 item 6): which store, its own id and its project. Such an
   * item is changed where it lives, never from Tasks, which shows it read-only. Absent on a board task.
   */
  home?: { source: Exclude<UnifiedWorkItem['source'], 'board' | 'filing'>; nativeId: string; projectId: number | null };
}

export interface MyWork {
  items: MyWorkItem[];
  total: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  approvalsPending: number;
}

const OPEN_STATUSES = ['pending', 'in-progress', 'review', 'blocked'];
const DUE_SOON_MS = 48 * 60 * 60 * 1000;

/** What a blocked route member waits on, or null when it is not one. */
function routeWaitingOn(row: { status: string; reviewRouteId: string | null; reviewRole: string | null; reviewStep: number | null; routeActId: string | null }): string | null {
  if (row.status !== 'blocked' || !row.reviewRouteId) return null;
  // A hand-back is the only act an open route's member carries (a return closes the route).
  if (row.routeActId) return 'the sender to reassign it';
  if (row.reviewRole === 'approver') return 'review';
  return row.reviewStep && row.reviewStep > 1 ? `step ${row.reviewStep - 1}` : 'an earlier step';
}

/** A review route member's role, or null for every other task. */
function routeRoleOf(row: { reviewRouteId: string | null; reviewRole: string | null }): 'reviewer' | 'approver' | null {
  if (!row.reviewRouteId) return null;
  return row.reviewRole === 'reviewer' || row.reviewRole === 'approver' ? row.reviewRole : null;
}

/** A reader's word for the store an item lives in, shown where a board task shows its module. */
const STORE_LABEL: Record<NonNullable<MyWorkItem['home']>['source'], string> = {
  schedule: 'Schedule', correspondence: 'Correspondence', review: 'Project work',
};
/** The cross-store view's status, in the board's vocabulary (the one MyWorkItem.status speaks). */
const BOARD_STATUS = { open: 'pending', in_progress: 'in-progress', blocked: 'blocked', done: 'completed' } as const;
/** Listed by the tray from their own store (c2c/reviews.ts my-queue); their work items are projections of them. */
const LISTED_ELSEWHERE = ['review_thread', 'review_task'];

function dueFlags(dueMs: number | null, now: number) {
  return { overdue: dueMs != null && dueMs < now, dueSoon: dueMs != null && dueMs >= now && dueMs <= now + DUE_SOON_MS };
}

/**
 * The open work the other stores record as this person's, as my-work items. A store that could not be read fails
 * the read. Every query keeps the organisation predicate; the project names are this organisation's only.
 */
async function otherStoreWork(db: RequestDb, organizationId: number, actorUserId: number, now: number): Promise<MyWorkItem[]> {
  const view = await loadUnifiedWork({ organizationId, ownedBy: actorUserId, excludeWorkItemSourceTypes: LISTED_ELSEWHERE }, db);
  if (!view.sources.project_tasks.ran || !view.sources.c2c_project_work_items.ran) {
    throw new Error('my-work: the work recorded in another store could not be read');
  }
  const open = view.items.filter((i) => i.status !== 'done' && (i.source === 'schedule' || i.source === 'review' || i.source === 'correspondence'));
  const scheduleIds = open.flatMap((i) => (i.source === 'schedule' ? [i.nativeId] : []));
  // The same rule as the board's (taskBoard.routes.ts otherStoreCards): a schedule task with a board mirror is the mirror.
  const mirrored = scheduleIds.length ? new Set((await db.select({ id: unifiedTasks.sourceEntityId }).from(unifiedTasks).where(and(
    eq(unifiedTasks.organizationId, organizationId), eq(unifiedTasks.sourceEntityType, 'project_task'),
    inArray(unifiedTasks.sourceEntityId, scheduleIds), isNull(unifiedTasks.deletedAt),
  ))).map((r) => String(r.id))) : new Set<string>();
  const listed = open.filter((i) => !(i.source === 'schedule' && mirrored.has(i.nativeId)));
  const projectIds = [...new Set(listed.flatMap((i) => (i.projectId != null ? [i.projectId] : [])))];
  const names = new Map(projectIds.length ? (await db.select({ id: projects.id, name: projects.name }).from(projects)
    .where(and(eq(projects.organizationId, organizationId), inArray(projects.id, projectIds)))).map((p) => [p.id, p.name] as const) : []);
  return listed.map((i) => {
    const source = i.source as NonNullable<MyWorkItem['home']>['source'];
    return {
      taskId: i.id, title: i.title, projectId: i.projectId, projectName: (i.projectId != null ? names.get(i.projectId) : null) ?? null,
      moduleType: STORE_LABEL[source], taskType: '', status: BOARD_STATUS[i.status], priority: i.priority ?? '',
      dueDate: i.dueAt, ...dueFlags(i.dueAt ? Date.parse(i.dueAt) : null, now),
      blocked: i.status === 'blocked', waitingOn: null, reviewRole: null,
      approvalRequired: false, approvalStatus: 'not_started', criticalPath: false,
      home: { source, nativeId: i.nativeId, projectId: i.projectId },
    };
  });
}

export async function readMyWork(
  db: RequestDb,
  organizationId: number,
  actorUserId: number,
  now: number = Date.now(),
): Promise<MyWork> {
  const rows = await db
    .select({ task: unifiedTasks, projectName: projects.name })
    .from(unifiedTasks)
    .leftJoin(projects, and(eq(projects.id, unifiedTasks.projectId), eq(projects.organizationId, organizationId)))
    .where(
      and(
        eq(unifiedTasks.organizationId, organizationId),
        eq(unifiedTasks.assigneeId, actorUserId),
        inArray(unifiedTasks.status, OPEN_STATUSES),
        isNull(unifiedTasks.deletedAt)
      )
    )
    // Due first; on the same due date, the newest assignment first. Without the
    // second key the database chose, so same-day rows could swap between reads.
    // The order of need below keeps this order among tasks it ranks equal.
    .orderBy(sql`${unifiedTasks.dueDate} asc nulls last`, desc(unifiedTasks.createdAt), unifiedTasks.taskId)
    .limit(200);

  const own: MyWorkItem[] = rows.map(({ task: row, projectName }) => {
    const waitingOn = routeWaitingOn(row);
    const dueMs = waitingOn ? null : row.dueDate ? new Date(row.dueDate).getTime() : null;
    return {
      taskId: row.taskId,
      title: row.title,
      projectId: row.projectId ?? null,
      projectName: projectName ?? null,
      moduleType: row.moduleType,
      taskType: row.taskType ?? '',
      status: row.status,
      priority: row.priority,
      dueDate: row.dueDate ? new Date(row.dueDate).toISOString() : null,
      ...dueFlags(dueMs, now),
      blocked: row.status === 'blocked' || (Array.isArray(row.blockedBy) && row.blockedBy.length > 0),
      waitingOn,
      reviewRole: routeRoleOf(row),
      approvalRequired: row.approvalRequired ?? false,
      approvalStatus: row.approvalStatus ?? 'not_started',
      criticalPath: row.criticalPath ?? false,
    };
  });
  const others = await otherStoreWork(db, organizationId, actorUserId, now);
  // A waiting route member is outside the triage (its assignee cannot act), so it sorts as undated, as it counts.
  // The stable key keeps the read order among board tasks, and puts them before another store's on a full tie.
  const keyed = [
    ...own.map((item, i) => ({ item, need: { dueAt: item.waitingOn ? null : item.dueDate, priority: item.priority, key: `0:${String(i).padStart(4, '0')}` } })),
    ...others.map((item) => ({ item, need: { dueAt: item.dueDate, priority: item.priority, key: `1:${item.taskId}` } })),
  ];
  const items = keyed.sort((a, b) => compareByNeed(a.need, b.need, now)).map((k) => k.item);

  return {
    items,
    total: items.length,
    overdue: items.filter(i => i.overdue).length,
    dueSoon: items.filter(i => i.dueSoon).length,
    blocked: items.filter(i => i.blocked).length,
    approvalsPending: items.filter(
      // Mirrors the gate's own definition (task-signoff.ts): anything
      // approval-gated that is not yet approved still needs a signature.
      // Testing === 'pending' made this structurally zero — approval_status
      // is nullable with no default and no write path ever sets 'pending'
      // (only 'approved'), so the count never left 0.
      i => i.approvalRequired && i.approvalStatus !== 'approved'
    ).length,
  };
}
