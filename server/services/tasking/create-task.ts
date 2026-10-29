/**
 * One task row and its `task.create` ledger row, on the caller's transaction.
 *
 * Extracted from POST /api/tasks/tasks (routes/taskManagement.routes.ts), which
 * now calls it, so the review route (server/services/review/review-route.ts)
 * writes its member rows through the same insert and the same lineage instead
 * of a second copy (docs/design/REVIEW_ROUTING_2026-10-23.md §2.3, RR1a).
 *
 * The route columns are not in `values`' type: a generic caller cannot name
 * them. Only `route` sets them, and only review-route.ts passes it, on a
 * transaction that has set the route-writer setting — without it the database
 * refuses the insert (unified_tasks_route_rows_guard).
 *
 * @module server/services/tasking/create-task
 */
import { unifiedTasks } from '../../../shared/schema';
import { auditTaskActionInTx } from './task-audit';
import type { DrizzleRunner } from '../../db/drizzle-queryable';

type RouteColumn = 'reviewRouteId' | 'reviewRole' | 'reviewStep' | 'routeSignatureId' | 'routeActId';
type InsertTask = typeof unifiedTasks.$inferInsert;

/** The Drizzle handle a task write runs on: a transaction. */
export interface TaskInsertRunner extends DrizzleRunner {
  insert: (table: typeof unifiedTasks) => {
    values: (v: InsertTask) => { returning: () => Promise<Array<typeof unifiedTasks.$inferSelect>> };
  };
}

export interface CreateTaskInTxInput {
  organizationId: number;
  actorUserId: number;
  taskId: string;
  values: Omit<InsertTask, 'taskId' | 'organizationId' | 'createdById' | RouteColumn>;
  /** The `task.create` row's payload. */
  auditPayload: Record<string, unknown>;
  /** The reason the person stated, or none (recorded as null, never invented). */
  reason?: string;
  /** What happened, in the system's words. */
  summary?: string;
  /** Route membership. Passed only by server/services/review/review-route.ts. */
  route?: { reviewRouteId: string; reviewRole: 'reviewer' | 'approver'; reviewStep: number };
}

export async function createTaskInTx(
  tx: TaskInsertRunner,
  input: CreateTaskInTxInput,
): Promise<typeof unifiedTasks.$inferSelect> {
  const [row] = await tx
    .insert(unifiedTasks)
    .values({
      ...input.values,
      taskId: input.taskId,
      organizationId: input.organizationId,
      createdById: input.actorUserId,
      ...(input.route
        ? {
            reviewRouteId: input.route.reviewRouteId,
            reviewRole: input.route.reviewRole,
            reviewStep: input.route.reviewStep,
          }
        : {}),
    })
    .returning();
  await auditTaskActionInTx(tx, {
    orgId: input.organizationId,
    userId: input.actorUserId,
    command: 'task.create',
    taskId: input.taskId,
    payload: input.auditPayload,
    reason: input.reason,
    ...(input.summary ? { summary: input.summary } : {}),
  });
  return row;
}
