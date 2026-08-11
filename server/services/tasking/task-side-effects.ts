/**
 * Task mutation side-effects — notifications, the completion cascade, and the
 * dependency-cycle guard. Shared by the task routes so every write path has
 * the same behaviour. All reads and writes are org-scoped.
 *
 * @module server/services/tasking/task-side-effects
 */
import { and, eq, ne, or, isNull, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import { unifiedTasks, taskDependencies } from '../../../shared/schema';
import { createNotification } from '../notifications/notification-service';

// ── Notifications ───────────────────────────────────────────────────────────
//
// Task events produce real notifications (assessment D13/D14) through the
// shared notification service (mdx_notifications). Fire-and-forget: a failed
// notification never fails the mutation it describes.

export function notifyTaskEvent(params: {
  organizationId: number;
  recipientUserId: number | null | undefined;
  category: 'task_assigned' | 'task_blocked' | 'task_completed' | 'task_update' | 'collaboration';
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  body?: string | null;
  taskId?: string;
}): void {
  const recipient = Number(params.recipientUserId);
  if (!Number.isFinite(recipient) || recipient <= 0) return;
  void createNotification({
    organizationId: params.organizationId,
    recipientUserId: recipient,
    category: params.category,
    severity: params.severity ?? 'info',
    title: params.title,
    body: params.body ?? null,
    resourceType: params.taskId ? 'unified_task' : null,
    resourceId: params.taskId ?? null,
    actionUrl: null,
    metadata: {},
  }).catch(err => {
    console.warn('[tasking] notification failed (non-fatal):', err?.message ?? err);
  });
}

// ── Completion cascade ──────────────────────────────────────────────────────
//
// Completing a task unblocks its dependents on every write path — the cascade
// previously lived only behind /api/regulatory/tasks/:id/status, so board
// moves left dependents blocked forever (assessment D12). Covers both linkage
// systems (the blockedBy[] arrays and the task_dependencies DAG).

export async function cascadeUnblockOnCompletion(
  organizationId: number,
  completedTaskId: string
): Promise<void> {
  // 1. blockedBy[] arrays — remove the completed task; wake fully-unblocked rows.
  const blockedRows = await db
    .select()
    .from(unifiedTasks)
    .where(
      and(
        eq(unifiedTasks.organizationId, organizationId),
        sql`${completedTaskId} = ANY(${unifiedTasks.blockedBy})`
      )
    );
  for (const row of blockedRows) {
    const remaining = (row.blockedBy ?? []).filter(id => id !== completedTaskId);
    await db
      .update(unifiedTasks)
      .set({
        blockedBy: remaining,
        ...(remaining.length === 0 && row.status === 'blocked'
          ? { status: 'in-progress' as string }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(unifiedTasks.taskId, row.taskId),
          eq(unifiedTasks.organizationId, organizationId)
        )
      );
    if (remaining.length === 0 && row.status === 'blocked') {
      notifyTaskEvent({
        organizationId,
        recipientUserId: row.assigneeId,
        category: 'task_update',
        title: `Unblocked: ${row.title}`,
        body: 'Every task blocking this one is complete — it is ready to work.',
        taskId: row.taskId,
      });
    }
  }

  // 2. task_dependencies DAG — wake blocked successors whose predecessors are
  //    now all complete. Successor rows are re-checked org-scoped before write.
  // Only BLOCKING edges gate a successor. A non-blocking edge (is_blocking
  // false — an informational "related to" link) must not hold a task blocked
  // once every real blocker is done; the write schema already distinguishes
  // them, so the read has to honour that. NULL reads as blocking (the column
  // defaults true and legacy rows predate it).
  const blockingEdge = or(isNull(taskDependencies.isBlocking), eq(taskDependencies.isBlocking, true));
  const successorEdges = await db
    .select({ successorTaskId: taskDependencies.successorTaskId })
    .from(taskDependencies)
    .where(and(eq(taskDependencies.predecessorTaskId, completedTaskId), blockingEdge));
  for (const edge of successorEdges) {
    const [successor] = await db
      .select()
      .from(unifiedTasks)
      .where(
        and(
          eq(unifiedTasks.taskId, edge.successorTaskId),
          eq(unifiedTasks.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!successor || successor.status !== 'blocked') continue;

    const predecessorEdges = await db
      .select({ predecessorTaskId: taskDependencies.predecessorTaskId })
      .from(taskDependencies)
      .where(and(eq(taskDependencies.successorTaskId, successor.taskId), blockingEdge));
    const predecessorIds = predecessorEdges
      .map(e => e.predecessorTaskId)
      .filter(id => id !== completedTaskId);
    let allDone = true;
    if (predecessorIds.length) {
      const open = await db
        .select({ taskId: unifiedTasks.taskId })
        .from(unifiedTasks)
        .where(
          and(
            eq(unifiedTasks.organizationId, organizationId),
            inArray(unifiedTasks.taskId, predecessorIds),
            ne(unifiedTasks.status, 'completed')
          )
        );
      allDone = open.length === 0;
    }
    if (allDone) {
      await db
        .update(unifiedTasks)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(
          and(
            eq(unifiedTasks.taskId, successor.taskId),
            eq(unifiedTasks.organizationId, organizationId)
          )
        );
      notifyTaskEvent({
        organizationId,
        recipientUserId: successor.assigneeId,
        category: 'task_update',
        title: `Unblocked: ${successor.title}`,
        body: 'All of its predecessor tasks are complete.',
        taskId: successor.taskId,
      });
    }
  }
}

// ── Dependency cycle guard ──────────────────────────────────────────────────
//
// The DAG had no acyclicity check (assessment D19): linking A→B and B→A was
// accepted, after which the critical-path walk relied on its visited-set to
// avoid spinning. Walk successors from the proposed edge's successor; if the
// predecessor is reachable, the edge closes a cycle. Bounded for safety.

export async function wouldCreateDependencyCycle(
  predecessorTaskId: string,
  successorTaskId: string
): Promise<boolean> {
  if (predecessorTaskId === successorTaskId) return true;
  const seen = new Set<string>([successorTaskId]);
  let frontier = [successorTaskId];
  let hops = 0;
  while (frontier.length && hops < 2000) {
    const edges = await db
      .select({ successorTaskId: taskDependencies.successorTaskId })
      .from(taskDependencies)
      .where(inArray(taskDependencies.predecessorTaskId, frontier));
    const next: string[] = [];
    for (const e of edges) {
      hops++;
      if (e.successorTaskId === predecessorTaskId) return true;
      if (!seen.has(e.successorTaskId)) {
        seen.add(e.successorTaskId);
        next.push(e.successorTaskId);
      }
    }
    frontier = next;
  }
  return false;
}
