/**
 * Task planning helpers — the project critical path (longest-duration DFS over
 * the dependency DAG) and workload-balanced assignee selection. Extracted from
 * taskManagement.routes.ts (repo-health line gate) — behaviour unchanged; both
 * are org-scoped.
 *
 * @module server/services/tasking/task-planning
 */
import { and, eq, or, inArray, isNull, count, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  unifiedTasks,
  taskDependencies,
  users,
  organizationUsers,
} from '../../../shared/schema';

// Helper function to calculate critical path
export async function calculateCriticalPath(projectId: number, organizationId: number) {
  try {
    // Get all tasks and dependencies for the project
    const tasks = await db
      .select()
      .from(unifiedTasks)
      .where(
        and(
          eq(unifiedTasks.organizationId, organizationId),
          eq(unifiedTasks.projectId, projectId),
          isNull(unifiedTasks.deletedAt)
        )
      );

    const taskIds = tasks.map((t) => t.taskId);
    const dependencies = taskIds.length
      ? await db
          .select()
          .from(taskDependencies)
          .where(
            or(
              inArray(taskDependencies.predecessorTaskId, taskIds),
              inArray(taskDependencies.successorTaskId, taskIds)
            )
          )
      : [];

    // Build adjacency list
    const graph: Record<string, { task: any; successors: string[]; duration: number }> = {};
    tasks.forEach((task: any) => {
      const duration = task.estimatedHours || 8; // Default 8 hours
      graph[task.taskId] = {
        task,
        successors: [],
        duration,
      };
    });

    dependencies.forEach((dep: any) => {
      if (graph[dep.predecessorTaskId]) {
        graph[dep.predecessorTaskId].successors.push(dep.successorTaskId);
      }
    });

    // Topological sort with longest path calculation
    const visited = new Set<string>();
    const criticalPath: string[] = [];
    let maxDuration = 0;

    function dfs(nodeId: string, path: string[], totalDuration: number) {
      if (!graph[nodeId]) return;

      visited.add(nodeId);
      const node = graph[nodeId];
      const currentDuration = totalDuration + node.duration;

      if (node.successors.length === 0) {
        if (currentDuration > maxDuration) {
          maxDuration = currentDuration;
          criticalPath.length = 0;
          criticalPath.push(...path, nodeId);
        }
        return;
      }

      node.successors.forEach(successor => {
        if (!visited.has(successor)) {
          dfs(successor, [...path, nodeId], currentDuration);
        }
      });
    }

    // Find all root nodes (no predecessors)
    const rootNodes = tasks.filter(
      (task: any) => !dependencies.some((dep: any) => dep.successorTaskId === task.taskId)
    );

    rootNodes.forEach((root: any) => {
      visited.clear();
      dfs(root.taskId, [], 0);
    });

    return {
      criticalPath,
      totalDuration: maxDuration,
      tasks: criticalPath.map(taskId => graph[taskId]?.task),
    };
  } catch (error) {
    console.error('Error calculating critical path:', error);
    throw error;
  }
}

// Helper function for workload balancing
export async function getOptimalAssignee(organizationId: number, _taskData: any) {
  try {
    // Get all users in the organization and their current active workload.
    // Users belong to an org via organizationUsers; the left join to
    // unifiedTasks only counts active (pending/in-progress) assignments.
    const workloadQuery = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        activeTaskCount: count(unifiedTasks.id),
        totalHours: sql<number>`coalesce(sum(coalesce(${unifiedTasks.estimatedHours}, 8)), 0)`,
      })
      .from(users)
      .innerJoin(organizationUsers, eq(organizationUsers.userId, users.id))
      .leftJoin(
        unifiedTasks,
        and(
          eq(unifiedTasks.assigneeId, users.id),
          inArray(unifiedTasks.status, ['pending', 'in-progress']),
          isNull(unifiedTasks.deletedAt)
        )
      )
      .where(eq(organizationUsers.organizationId, organizationId))
      .groupBy(users.id, users.name, users.email);

    // Sort by workload (ascending)
    const sortedByWorkload = workloadQuery.sort((a, b) => {
      const aHours = Number(a.totalHours || 0);
      const bHours = Number(b.totalHours || 0);
      return aHours - bHours;
    });

    // Return user with lowest workload
    return sortedByWorkload[0];
  } catch (error) {
    console.error('Error finding optimal assignee:', error);
    return null;
  }
}

