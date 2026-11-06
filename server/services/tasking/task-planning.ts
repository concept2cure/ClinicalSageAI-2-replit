/**
 * Task planning helpers — the project critical path (longest-duration DFS over
 * the dependency DAG) and workload-balanced assignee selection. Extracted from
 * taskManagement.routes.ts (repo-health line gate) — behaviour unchanged; both
 * are org-scoped.
 *
 * @module server/services/tasking/task-planning
 */
import { and, eq, or, inArray, isNull, count, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { stableStringify } from '../../../shared/canonical-json';
import type { ProjectTeamGoal, ProjectTeamMonitor } from '../../../shared/ana/turn-timeline';
import type { ObjectivesRecord } from '../c2c/charter-objectives';
import { db } from '../../db';
import type { RequestSqlClient } from '../../db/requestDb';
import {
  unifiedTasks,
  taskDependencies,
  users,
  organizationUsers,
} from '../../../shared/schema';

export interface StrictProjectTask {
  taskId: string; status: string; estimatedHours: number | null; updatedAt: string | null;
}
export interface StrictProjectDependency {
  predecessorTaskId: string; successorTaskId: string; type: string; lagHours: number | null; status: string;
}
export interface StrictProjectTaskGraph {
  state: 'measured' | 'empty' | 'not_assessed';
  tasks: StrictProjectTask[]; dependencies: StrictProjectDependency[];
  total: number; completed: number; percentage: number | null;
  criticalPath: string[] | null; recordedDurationHours: number | null;
  missingDurationTaskIds: string[]; cyclicOrBlockedTaskIds: string[]; problems: string[];
}

export interface ProjectObjectiveReference {
  charterId: number; sectionKey: 'objectives'; version: number; contentHash: string;
}
export interface MonitorRead<T> { state: 'available' | 'unavailable'; value: T | null; digest: string }

/** Pure objective/work projections and canonical heads; they do not grant readiness or mutate a project. */
export function monitorBasis(basis: Record<string,MonitorRead<unknown>>): Record<string,{state:'available'|'unavailable';digest:string}> {
  return Object.fromEntries(Object.entries(basis).map(([key,value]) => [key,{state:value.state,digest:value.digest}]));
}
export function monitorState(unavailable: boolean, basisCurrent: boolean, goal: ProjectTeamGoal|null): ProjectTeamMonitor['state'] {
  if (unavailable) return 'unavailable';
  return basisCurrent && goal !== null ? 'current' : 'stale';
}
export function monitorReference(goal: ProjectTeamGoal|null): ProjectObjectiveReference|null {
  return goal?.source ? {charterId:goal.source.charterId,sectionKey:'objectives',version:goal.version,contentHash:goal.source.contentHash} : null;
}
export function monitorWork(graph: StrictProjectTaskGraph|null): ProjectTeamMonitor['work'] {
  return {total:graph?.total ?? 0,completed:graph?.completed ?? 0,percentage:graph?.percentage ?? null};
}
export function monitorGateStates(source: string, documents: MonitorRead<{pending:boolean}>, filing: string): ProjectTeamMonitor['gates'] {
  return {source:source === 'available' ? 'not_assessed' : 'unavailable',
    document:documents.state === 'available' ? documents.value?.pending ? 'blocked' : 'not_assessed' : 'unavailable',
    filing:filing === 'available' ? 'not_assessed' : 'unavailable'};
}

export function monitorGoal(record: ObjectivesRecord | null): ProjectTeamGoal | null {
  const current = record?.current;
  if (!current || !record?.charterId || !/^[a-f0-9]{64}$/.test(current.contentHash) || !current.content.objective.trim() || current.content.objective.length > 4000) return null;
  return { alias: `g-${current.contentHash.slice(0,12)}`,label: 'Project objective',version: current.version,summary: current.content.objective.slice(0,600),
    truncated: current.content.objective.length > 600,source: {charterId: record.charterId,sectionKey: 'objectives',version: current.version,
      contentHash: current.contentHash,status: current.status,locked: current.locked} };
}

export function monitorBlockers(input: {programId: string|null; goal: ProjectTeamGoal|null; graph: StrictProjectTaskGraph|null;
  source: string; documents: string; filing: string}): string[] {
  const blockers = ['SCIENTIFIC_SOURCE_VERIFICATION_NOT_ASSESSED','DOCUMENT_RELEASE_NOT_ASSESSED','LIVE_DISPATCH_ASSESSMENT_REQUIRED'];
  if (!input.programId) blockers.push('PROJECT_PROGRAM_UNANCHORED');
  if (!input.goal) blockers.push('PROJECT_OBJECTIVE_REQUIRED');
  if (!input.graph) blockers.push('PROJECT_WORK_UNAVAILABLE');
  else blockers.push(...input.graph.problems);
  if ([input.source,input.documents,input.filing].includes('unavailable')) blockers.push('PROJECT_GATE_SOURCE_UNAVAILABLE');
  return [...new Set(blockers)].sort();
}

export function monitorHash(value: unknown): string { return createHash('sha256').update(stableStringify(value)).digest('hex'); }

/** A strict projection for orchestration; the older UI estimate remains a separate legacy caller. */
export async function loadStrictProjectTaskGraph(client: RequestSqlClient, scope: { organizationId: number; projectId: number }): Promise<StrictProjectTaskGraph> {
  if (![scope.organizationId,scope.projectId].every(id => Number.isSafeInteger(id) && id > 0)) throw new Error('An exact project task scope is required.');
  const tasks = await client.query(`SELECT task_id,status,estimated_hours,updated_at FROM unified_tasks
    WHERE organization_id=$1 AND project_id=$2 AND deleted_at IS NULL ORDER BY task_id LIMIT 501`, [scope.organizationId,scope.projectId]);
  const dependencies = await client.query(`SELECT d.predecessor_task_id,d.successor_task_id,d.dependency_type,d.lag_time,d.status
    FROM task_dependencies d JOIN unified_tasks p ON p.task_id=d.predecessor_task_id
    JOIN unified_tasks s ON s.task_id=d.successor_task_id WHERE p.organization_id=$1 AND s.organization_id=$1
    AND p.project_id=$2 AND s.project_id=$2 AND p.deleted_at IS NULL AND s.deleted_at IS NULL
    AND (d.organization_id=$1 OR d.organization_id IS NULL) ORDER BY d.predecessor_task_id,d.successor_task_id,d.id LIMIT 1001`, [scope.organizationId,scope.projectId]);
  const graph = projectTaskGraphFromRows(tasks.rows,dependencies.rows);
  const scopeCheck = await client.query(`SELECT EXISTS(SELECT 1 FROM task_dependencies d
    JOIN unified_tasks own ON (own.task_id=d.predecessor_task_id OR own.task_id=d.successor_task_id)
    WHERE own.organization_id=$1 AND own.project_id=$2 AND own.deleted_at IS NULL
    AND (d.organization_id=$1 OR d.organization_id IS NULL) AND NOT EXISTS(
      SELECT 1 FROM unified_tasks p JOIN unified_tasks s ON s.task_id=d.successor_task_id
      WHERE p.task_id=d.predecessor_task_id AND p.organization_id=$1 AND s.organization_id=$1
      AND p.project_id=$2 AND s.project_id=$2 AND p.deleted_at IS NULL AND s.deleted_at IS NULL)) AS invalid`,[scope.organizationId,scope.projectId]);
  if (scopeCheck.rows[0]?.invalid !== false) {
    graph.state='not_assessed'; graph.criticalPath=null; graph.recordedDurationHours=null; graph.problems.push('TASK_DEPENDENCY_SCOPE_UNVERIFIED');
  }
  return graph;
}

export function projectTaskGraphFromRows(taskRows: Array<Record<string, unknown>>, dependencyRows: Array<Record<string, unknown>>): StrictProjectTaskGraph {
  const tasks = taskRows.map(strictTask);
  const dependencies = dependencyRows.map(strictDependency);
  const ids = new Set(tasks.map(task => task.taskId));
  const problems: string[] = [];
  if (tasks.length > 500 || dependencies.length > 1000) problems.push('TASK_GRAPH_LIMIT');
  if (ids.size !== tasks.length || dependencies.some(edge => !ids.has(edge.predecessorTaskId) || !ids.has(edge.successorTaskId))) problems.push('TASK_GRAPH_IDENTITY_UNVERIFIED');
  if (tasks.some(task => !['pending','in-progress','review','completed','blocked','cancelled'].includes(task.status))) problems.push('TASK_STATUS_UNSUPPORTED');
  const live = dependencies.filter(edge => edge.status !== 'satisfied');
  if (live.some(edge => edge.type !== 'finish-to-start' || edge.lagHours === null || edge.status !== 'active')) problems.push('DEPENDENCY_TIMING_NOT_ASSESSED');
  const missingDurationTaskIds = tasks.filter(task => task.estimatedHours === null).map(task => task.taskId);
  if (missingDurationTaskIds.length) problems.push('TASK_DURATION_NOT_RECORDED');
  const path = strictLongestPath(tasks,live);
  if (path.unresolved.length) problems.push('DEPENDENCY_CYCLE_OR_BLOCKED');
  const completed = tasks.filter(task => task.status === 'completed').length;
  return { state: problems.length ? 'not_assessed' : tasks.length ? 'measured' : 'empty', tasks,dependencies,
    total: tasks.length,completed,percentage: tasks.length ? Math.round(completed/tasks.length*100) : null,
    criticalPath: problems.length ? null : path.path,recordedDurationHours: problems.length ? null : path.hours,
    missingDurationTaskIds,cyclicOrBlockedTaskIds: path.unresolved,problems };
}

function strictTask(row: Record<string, unknown>): StrictProjectTask {
  if (typeof row.task_id !== 'string' || !row.task_id) throw new Error('The task graph identity could not be read.');
  const hours = row.estimated_hours;
  const updated = row.updated_at == null ? null : new Date(String(row.updated_at)).toISOString();
  return { taskId: row.task_id,status: String(row.status),estimatedHours: typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : null,updatedAt: updated };
}

function strictDependency(row: Record<string, unknown>): StrictProjectDependency {
  if (typeof row.predecessor_task_id !== 'string' || typeof row.successor_task_id !== 'string') throw new Error('The task dependency identity could not be read.');
  return { predecessorTaskId: row.predecessor_task_id,successorTaskId: row.successor_task_id,type: String(row.dependency_type),
    lagHours: typeof row.lag_time === 'number' && Number.isFinite(row.lag_time) ? row.lag_time : null,status: String(row.status) };
}

function strictLongestPath(tasks: StrictProjectTask[], edges: StrictProjectDependency[]) {
  const byId = new Map(tasks.map(task => [task.taskId,task]));
  const incoming = new Map(tasks.map(task => [task.taskId,0]));
  for (const edge of edges) incoming.set(edge.successorTaskId,(incoming.get(edge.successorTaskId) ?? 0)+1);
  const queue = tasks.filter(task => incoming.get(task.taskId) === 0).map(task => task.taskId).sort();
  const distances = new Map<string,number>(); const paths = new Map<string,string[]>();
  const visited = new Set<string>();
  while (queue.length) visitTaskPath(queue,edges,{byId,incoming,distances,paths,visited});
  const ranked = [...distances].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0]));
  const winner = ranked[0];
  return { path: winner ? paths.get(winner[0]) ?? [] : [],hours: winner?.[1] ?? 0,
    unresolved: tasks.filter(task => !visited.has(task.taskId)).map(task => task.taskId) };
}

function visitTaskPath(queue: string[], edges: StrictProjectDependency[], graph: {
  byId: Map<string,StrictProjectTask>; incoming: Map<string,number>; distances: Map<string,number>;
  paths: Map<string,string[]>; visited: Set<string>;
}): void {
  const id = queue.shift()!; const task = graph.byId.get(id);
  if (!task) return;
  graph.visited.add(id);
  if (!graph.distances.has(id)) { graph.distances.set(id,task.estimatedHours ?? 0); graph.paths.set(id,[id]); }
  for (const edge of edges.filter(item => item.predecessorTaskId === id)) {
    const next = graph.byId.get(edge.successorTaskId); if (!next) continue;
    const distance = graph.distances.get(id)! + (edge.lagHours ?? 0) + (next.estimatedHours ?? 0);
    if (!graph.distances.has(next.taskId) || distance > graph.distances.get(next.taskId)!) {
      graph.distances.set(next.taskId,distance); graph.paths.set(next.taskId,[...graph.paths.get(id)!,next.taskId]);
    }
    const remaining = (graph.incoming.get(next.taskId) ?? 0)-1; graph.incoming.set(next.taskId,remaining);
    if (remaining === 0) { queue.push(next.taskId); queue.sort(); }
  }
}

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
export async function getOptimalAssignee(organizationId: number, _taskData: any,
  options?: { executor: RequestSqlClient; eligibleUserIds: readonly number[] }) {
  if (options) {
    if (!options.eligibleUserIds.length) return null;
    // The assignment engine has admitted these current accounts. This read is
    // enlisted; a failed workload read must not look like an empty roster.
    const { rows } = await options.executor.query(`SELECT u.id,u.name,u.email,count(t.id)::int AS "activeTaskCount",
      coalesce(sum(coalesce(t.estimated_hours,8)) FILTER (WHERE t.id IS NOT NULL),0) AS "totalHours"
      FROM users u LEFT JOIN unified_tasks t ON t.assignee_id=u.id AND t.organization_id=$1
        AND t.status IN ('pending','in-progress') AND t.deleted_at IS NULL
      WHERE u.id=ANY($2::int[]) AND u.status='active' GROUP BY u.id,u.name,u.email`, [organizationId, [...options.eligibleUserIds]]);
    return lowestWorkload(rows.map(row => ({ id: Number(row.id), name: row.name as string | null,
      email: row.email as string | null, activeTaskCount: Number(row.activeTaskCount), totalHours: Number(row.totalHours) })));
  }
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
    return lowestWorkload(workloadQuery);
  } catch (error) {
    console.error('Error finding optimal assignee:', error);
    return null;
  }
}

function lowestWorkload<T extends { id: number; totalHours: unknown }>(rows: T[]): T | undefined {
  return rows.sort((a, b) => Number(a.totalHours || 0) - Number(b.totalHours || 0) || a.id - b.id)[0];
}

