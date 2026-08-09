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
import { unifiedTasks, users } from '../../../shared/schema';

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
}

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

  const teamProductivity = await db
    .select({
      name: users.name,
      totalTasks: count(unifiedTasks.id),
      completedTasks: sql<number>`count(*) filter (where ${unifiedTasks.status} = 'completed')`,
      avgCompletion: avg(unifiedTasks.completionPercentage),
    })
    .from(unifiedTasks)
    .innerJoin(users, eq(unifiedTasks.assigneeId, users.id))
    .where(baseCondition)
    .groupBy(users.id, users.name)
    .orderBy(sql`count(*) filter (where ${unifiedTasks.status} = 'completed') desc`)
    .limit(10);

  return {
    taskStats: taskStats as TaskAnalytics['taskStats'],
    tasksByModule: tasksByModule as TaskAnalytics['tasksByModule'],
    tasksByPriority: tasksByPriority as TaskAnalytics['tasksByPriority'],
    overdueTasks: overdueTasks?.count ?? 0,
    teamProductivity: teamProductivity as TaskAnalytics['teamProductivity'],
  };
}
