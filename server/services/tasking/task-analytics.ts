/**
 * Task analytics — the board's read-model aggregations.
 *
 * Extracted from taskManagement.routes.ts, which sits against the repo-health
 * 1500-line gate; this is pure read aggregation with no coupling to the
 * mutation paths, so it moves cleanly. Same precedent as task-planning.ts.
 *
 * Every query is org-scoped and excludes archived (soft-deleted) rows.
 *
 * @module server/services/tasking/task-analytics
 */
import { and, eq, ne, lt, isNull, sql, count, avg } from 'drizzle-orm';
import { db } from '../../db';
import { unifiedTasks } from '../../../shared/schema';
import { actorLabel, resolveActorNames } from '../tenant/actor-names';

export interface TaskAnalytics {
  taskStats: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    blockedTasks: number;
    pendingTasks: number;
    avgCompletion: string | null;
  };
  tasksByModule: Array<{ moduleType: string | null; count: number }>;
  tasksByPriority: Array<{ priority: string | null; count: number }>;
  overdueTasks: number;
  teamProductivity: Array<{
    name: string | null;
    totalTasks: number;
    completedTasks: number;
    avgCompletion: string | null;
  }>;
  /**
   * How many people hold assigned work, whatever `teamProductivity` lists.
   *
   * `teamProductivity` is bounded (see TEAM_PRODUCTIVITY_CAP), and a bounded
   * list that does not say so is a silent cap: a reader of ten rows on a board
   * with thirty assignees has no way to know the other twenty exist. A caller
   * compares this against `teamProductivity.length` and says what it is
   * showing.
   */
  teamProductivityTotal: number;
  /**
   * Assigned to nobody.
   *
   * `teamProductivity` groups by `assignee_id` and necessarily excludes rows
   * that have none, so until this bucket existed the per-assignee totals
   * simply did not add up to `taskStats.totalTasks` and nothing said where the
   * difference went. Unassigned work is the work most likely to be missed, so
   * dropping it out of the aggregation that gets read as "the team's load" is
   * the wrong direction to be wrong in. Always present — `totalTasks: 0` means
   * measured and none, which is a different fact from absent.
   */
  unassigned: {
    totalTasks: number;
    completedTasks: number;
    avgCompletion: string | null;
  };
}

/**
 * The most assignee rows `teamProductivity` returns.
 *
 * It was 10, with no total beside it, so the eleventh-busiest person and
 * everyone below them was absent from a figure presented as the team's. The
 * bound is kept — one row per assignee is unbounded in principle, and a
 * response is not the place to discover that an organisation has ten thousand
 * members — but raised far above any real roster and reported through
 * `teamProductivityTotal`, so a caller can always tell a complete list from a
 * truncated one.
 */
export const TEAM_PRODUCTIVITY_CAP = 500;

/**
 * Aggregate the org's task board, optionally narrowed to one project.
 * `organizationId` must already be the verified JWT org, never request input.
 */
export async function loadTaskAnalytics(
  organizationId: number,
  projectId?: number | null
): Promise<TaskAnalytics> {
  const baseCondition = projectId
    ? and(
        eq(unifiedTasks.organizationId, organizationId),
        eq(unifiedTasks.projectId, projectId),
        isNull(unifiedTasks.deletedAt)
      )
    : and(eq(unifiedTasks.organizationId, organizationId), isNull(unifiedTasks.deletedAt));

  const [taskStats] = await db
    .select({
      totalTasks: count(unifiedTasks.id),
      completedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'completed')`,
      inProgressTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'in-progress')`,
      blockedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'blocked')`,
      pendingTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'pending')`,
      avgCompletion: avg(unifiedTasks.completionPercentage),
    })
    .from(unifiedTasks)
    .where(baseCondition);

  const tasksByModule = await db
    .select({ moduleType: unifiedTasks.moduleType, count: count(unifiedTasks.id) })
    .from(unifiedTasks)
    .where(baseCondition)
    .groupBy(unifiedTasks.moduleType);

  const tasksByPriority = await db
    .select({ priority: unifiedTasks.priority, count: count(unifiedTasks.id) })
    .from(unifiedTasks)
    .where(baseCondition)
    .groupBy(unifiedTasks.priority);

  const [overdueTasks] = await db
    .select({ count: count(unifiedTasks.id) })
    .from(unifiedTasks)
    .where(and(baseCondition, lt(unifiedTasks.dueDate, new Date()), ne(unifiedTasks.status, 'completed')));

  // Grouped by the assignee id and named through public.actor_name, not an
  // inner join on users: since users took row-level security (D3, 2026-09-28)
  // that join dropped everyone who had left, and their work with them
  // (tenant/actor-names.ts; docs/evidence/D3/2026-09-29-actor-names/).
  const byAssignee = await db
    .select({
      assigneeId: unifiedTasks.assigneeId,
      totalTasks: count(unifiedTasks.id),
      completedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'completed')`,
      avgCompletion: avg(unifiedTasks.completionPercentage),
    })
    .from(unifiedTasks)
    .where(and(baseCondition, sql`${unifiedTasks.assigneeId} IS NOT NULL`))
    .groupBy(unifiedTasks.assigneeId)
    // The id is the tiebreaker. Two people with the same completed count came
    // back in whatever order the plan produced, so the row that fell off the
    // bound could differ between two identical requests.
    .orderBy(
      sql`count(*) filter (where ${unifiedTasks.status} = 'completed') desc`,
      sql`${unifiedTasks.assigneeId} asc`,
    )
    .limit(TEAM_PRODUCTIVITY_CAP);
  // Counted in SQL rather than from the rows above, which the bound truncates.
  const [assigneeCount] = await db
    .select({ n: sql<number>`count(distinct ${unifiedTasks.assigneeId})::int` })
    .from(unifiedTasks)
    .where(and(baseCondition, sql`${unifiedTasks.assigneeId} IS NOT NULL`));
  // The complement of the predicate above, so the two partition the board.
  const [unassigned] = await db
    .select({
      totalTasks: count(unifiedTasks.id),
      completedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'completed')`,
      avgCompletion: avg(unifiedTasks.completionPercentage),
    })
    .from(unifiedTasks)
    .where(and(baseCondition, isNull(unifiedTasks.assigneeId)));
  const assignees = await resolveActorNames(byAssignee.map(r => r.assigneeId));
  const teamProductivity = byAssignee.map(({ assigneeId, ...rest }) => ({
    name: actorLabel(assignees, assigneeId),
    ...rest,
  }));

  return {
    taskStats: taskStats as TaskAnalytics['taskStats'],
    tasksByModule: tasksByModule as TaskAnalytics['tasksByModule'],
    tasksByPriority: tasksByPriority as TaskAnalytics['tasksByPriority'],
    overdueTasks: overdueTasks?.count ?? 0,
    teamProductivity: teamProductivity as TaskAnalytics['teamProductivity'],
    teamProductivityTotal: Number(assigneeCount?.n ?? 0),
    unassigned: {
      totalTasks: Number(unassigned?.totalTasks ?? 0),
      completedTasks: Number(unassigned?.completedTasks ?? 0),
      avgCompletion: unassigned?.avgCompletion ?? null,
    },
  };
}
