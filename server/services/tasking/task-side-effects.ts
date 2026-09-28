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
import type { AuditTaskActionParams } from './task-audit';

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
// systems (the blockedBy[] arrays and the task_dependencies DAG). An archived
// dependent is out of its reach, as on every other task write: a Part 11
// tombstone is never re-written, and never ledgered as having moved.
//
// Two modes, two entry points over one walk. With no transaction (the AnA
// command executor), cascadeUnblockOnCompletion runs on `db` after the caller's
// write and records nothing. Given the completion's own transaction
// (PATCH /api/tasks/tasks/:id and /api/regulatory/tasks/:id/status),
// cascadeUnblockOnCompletionInTx runs every read and UPDATE on it, and hands
// back one ledger row per dependent whose record it changed — a status move or
// only a blockedBy[] rewrite — and the notifications, for the caller to write
// after the completion's own row and to send after COMMIT. The completion, the
// unblocking and their ledger rows are one fact, and a failure anywhere rolls
// all of it back.

/** A notification held back until the caller's transaction has committed. */
export type TaskEventNotice = Parameters<typeof notifyTaskEvent>[0];

/** The Drizzle surface the cascade uses; a `db.transaction` handle has it. */
type CascadeRunner = Pick<typeof db, 'select' | 'update' | 'execute'>;

export interface CascadeInTransaction {
  /** The completion's transaction: every read and UPDATE goes on it. */
  tx: CascadeRunner;
  /** Who completed the predecessor — each change is recorded against them. */
  actorUserId: number;
}

/** What the cascade changed on the caller's transaction. */
export interface CascadeResult {
  /** One row per dependent it changed. Write them with auditTaskActionInTx on
   *  the same transaction, AFTER the completion's own row: the trail shows the
   *  cause before its effects, and every row lock precedes the chain lock. */
  ledger: AuditTaskActionParams[];
  /** To send once the transaction has committed. */
  notices: TaskEventNotice[];
}

/** A dependent's record once the predecessor is complete (see nextStateOf). */
type DependentNextState = { status: string; blockedBy?: { from: string[]; to: string[] }; unblocked?: string };

/** Called once per dependent whose row the cascade's UPDATE actually changed. */
type OnDependentChanged = (row: typeof unifiedTasks.$inferSelect, next: DependentNextState) => void;

/** Unblock `completedTaskId`'s dependents on `db`, with no ledger rows; notifications go at once. */
export async function cascadeUnblockOnCompletion(organizationId: number, completedTaskId: string): Promise<void> {
  await unblockDependents(db, organizationId, completedTaskId, false, (row, next) => {
    if (next.unblocked) notifyTaskEvent(unblockedNotice(organizationId, row, next.unblocked));
  });
}

/**
 * Unblock `completedTaskId`'s dependents on the completion's own transaction,
 * locking them, and hand back their ledger rows and held-back notifications.
 */
export async function cascadeUnblockOnCompletionInTx(
  organizationId: number,
  completedTaskId: string,
  inTx: CascadeInTransaction
): Promise<CascadeResult> {
  const out: CascadeResult = { ledger: [], notices: [] };
  await unblockDependents(inTx.tx, organizationId, completedTaskId, true, (row, next) => {
    out.ledger.push({
      orgId: organizationId,
      userId: inTx.actorUserId,
      command: 'task.transition',
      taskId: row.taskId,
      payload: {
        from: row.status,
        to: next.status,
        ...(next.blockedBy ? { blockedBy: next.blockedBy } : {}),
        cause: 'predecessor-completed',
        predecessor: completedTaskId,
      },
      reason: next.unblocked
        ? `Unblocked: predecessor ${completedTaskId} completed`
        : `Blocker ${completedTaskId} completed; removed from this task's blockers`,
    });
    if (next.unblocked) out.notices.push(unblockedNotice(organizationId, row, next.unblocked));
  });
  return out;
}

/** The "Unblocked" notification for a dependent whose status moved. */
function unblockedNotice(
  organizationId: number,
  row: typeof unifiedTasks.$inferSelect,
  body: string
): TaskEventNotice {
  return {
    organizationId,
    recipientUserId: row.assigneeId,
    category: 'task_update',
    title: `Unblocked: ${row.title}`,
    body,
    taskId: row.taskId,
  };
}

/**
 * The walk both entry points share: find every dependent, read them (and, with
 * `lock`, lock them) in task-id order, UPDATE each one whose record changes, and
 * hand each changed row to `onChanged` before moving to the next.
 */
async function unblockDependents(
  run: CascadeRunner,
  organizationId: number,
  completedTaskId: string,
  lock: boolean,
  onChanged: OnDependentChanged
): Promise<void> {
  const live = and(eq(unifiedTasks.organizationId, organizationId), isNull(unifiedTasks.deletedAt));
  // Only BLOCKING edges gate a successor. A non-blocking edge (is_blocking
  // false — an informational "related to" link) must not hold a task blocked
  // once every real blocker is done; the write schema already distinguishes
  // them, so the read has to honour that. NULL reads as blocking (the column
  // defaults true and legacy rows predate it).
  const blockingEdge = or(isNull(taskDependencies.isBlocking), eq(taskDependencies.isBlocking, true));

  // 1. Every dependent, from both linkage systems. Only ids here: the rows are
  //    read (and, in a transaction, locked) together below.
  const listed = await run
    .select({ taskId: unifiedTasks.taskId })
    .from(unifiedTasks)
    .where(and(live, sql`${completedTaskId} = ANY(${unifiedTasks.blockedBy})`));
  const successorEdges = await run
    .select({ successorTaskId: taskDependencies.successorTaskId })
    .from(taskDependencies)
    .where(and(eq(taskDependencies.predecessorTaskId, completedTaskId), blockingEdge));
  const successors = new Set(successorEdges.map(e => e.successorTaskId));
  const ids = [...new Set([...listed.map(r => r.taskId), ...successors])];
  if (!ids.length) return;

  // 2. One read, in task-id order. In a transaction it locks them all in that
  //    order: two completions sharing dependents through different linkage
  //    systems then queue on the first shared row instead of each holding one
  //    the other waits for (a deadlock). Successor rows are org-scoped here.
  const dependentsQuery = run
    .select()
    .from(unifiedTasks)
    .where(and(live, inArray(unifiedTasks.taskId, ids)))
    .orderBy(unifiedTasks.taskId);
  const dependents = await (lock ? dependentsQuery.for('no key update') : dependentsQuery);

  for (const row of dependents) {
    const next = await nextStateOf(row, completedTaskId, successors.has(row.taskId), () =>
      otherPredecessorsDone(run, organizationId, row.taskId, completedTaskId, blockingEdge)
    );
    if (!next) continue;

    const [changed] = await run
      .update(unifiedTasks)
      .set({
        ...(next.blockedBy ? { blockedBy: next.blockedBy.to } : {}),
        ...(next.status !== row.status ? { status: next.status } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(unifiedTasks.taskId, row.taskId), live))
      .returning({ taskId: unifiedTasks.taskId });
    // Nothing matched (archived under an unlocked read): nothing to record.
    if (!changed) continue;

    onChanged(row, next);
  }
}

/**
 * A dependent's record once `completedTaskId` is complete, or null when nothing
 * about it changes. `unblocked` is the notification body when its status moved.
 */
async function nextStateOf(
  row: { status: string; blockedBy: string[] | null },
  completedTaskId: string,
  isSuccessor: boolean,
  otherPredecessorsAreDone: () => Promise<boolean>
): Promise<DependentNextState | null> {
  const before = row.blockedBy ?? [];
  const blockedBy = before.includes(completedTaskId)
    ? { from: before, to: before.filter(id => id !== completedTaskId) }
    : undefined;
  // blockedBy[]: a blocked row with nothing left in it is ready to work.
  if (blockedBy && blockedBy.to.length === 0 && row.status === 'blocked') {
    return { status: 'in-progress', blockedBy, unblocked: 'Every task blocking this one is complete — it is ready to work.' };
  }
  // DAG: a blocked successor whose blocking predecessors are all complete.
  if (isSuccessor && row.status === 'blocked' && (await otherPredecessorsAreDone())) {
    return { status: 'pending', blockedBy, unblocked: 'All of its predecessor tasks are complete.' };
  }
  return blockedBy ? { status: row.status, blockedBy } : null;
}

/** Whether every OTHER blocking predecessor of `successorTaskId` is complete. */
async function otherPredecessorsDone(
  run: CascadeRunner,
  organizationId: number,
  successorTaskId: string,
  completedTaskId: string,
  blockingEdge: ReturnType<typeof or>
): Promise<boolean> {
  const predecessorEdges = await run
    .select({ predecessorTaskId: taskDependencies.predecessorTaskId })
    .from(taskDependencies)
    .where(and(eq(taskDependencies.successorTaskId, successorTaskId), blockingEdge));
  const predecessorIds = predecessorEdges
    .map(e => e.predecessorTaskId)
    .filter(id => id !== completedTaskId);
  if (!predecessorIds.length) return true;
  const open = await run
    .select({ taskId: unifiedTasks.taskId })
    .from(unifiedTasks)
    .where(
      and(
        eq(unifiedTasks.organizationId, organizationId),
        inArray(unifiedTasks.taskId, predecessorIds),
        ne(unifiedTasks.status, 'completed')
      )
    );
  return open.length === 0;
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
