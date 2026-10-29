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
 */
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { projects, unifiedTasks } from '../../../shared/schema';
import type { RequestDb } from '../../db/requestDb';

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
   * ('review' for an approver, 'step N' for a later reviewer). It is outside
   * the overdue and due-soon triage, since its assignee cannot act (RR1a,
   * B11). Null for every other task.
   */
  waitingOn: string | null;
  approvalRequired: boolean;
  approvalStatus: string;
  criticalPath: boolean;
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
function routeWaitingOn(row: { status: string; reviewRouteId: string | null; reviewRole: string | null; reviewStep: number | null }): string | null {
  if (row.status !== 'blocked' || !row.reviewRouteId) return null;
  if (row.reviewRole === 'approver') return 'review';
  return row.reviewStep && row.reviewStep > 1 ? `step ${row.reviewStep - 1}` : 'an earlier step';
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
    .orderBy(sql`${unifiedTasks.dueDate} asc nulls last`, desc(unifiedTasks.createdAt))
    .limit(200);

  const soonCutoff = now + DUE_SOON_MS;
  const items: MyWorkItem[] = rows.map(({ task: row, projectName }) => {
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
      overdue: dueMs != null && dueMs < now,
      dueSoon: dueMs != null && dueMs >= now && dueMs <= soonCutoff,
      blocked: row.status === 'blocked' || (Array.isArray(row.blockedBy) && row.blockedBy.length > 0),
      waitingOn,
      approvalRequired: row.approvalRequired ?? false,
      approvalStatus: row.approvalStatus ?? 'not_started',
      criticalPath: row.criticalPath ?? false,
    };
  });

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
