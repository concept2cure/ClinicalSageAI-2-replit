/**
 * One open task per source record, in the one task store (unified_tasks).
 *
 * A governed act says which task its record should have open now. This closes
 * the record's open task and writes that one, or leaves the open task when it
 * already records the same thing. The due-date sweep (jobs/taskDueSweep.ts)
 * reminds the assignee, with the notice `metadata.remindDaysBefore` asks for,
 * and once more when it is overdue. No scheduler of its own.
 *
 * Written best effort after the governed act commits: a task that did not land
 * is logged, and never undoes the act. Used by a controlled document's periodic
 * review (services/qms/periodic-review-task.ts), a CAPA's target close and its
 * action items' due dates (services/capa-mdr/capa-tasks.ts), and training on a
 * controlled document, one task per person (services/qms/training-task.ts),
 * which reconciles every key under one prefix at once.
 *
 * @module server/services/tasking/source-task
 */
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import * as schema from '../../../shared/schema';
import unifiedTaskService, { type UnifiedTaskInput } from '../unifiedTaskService';
import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('source-task');
const CLOSED = ['completed', 'cancelled'];

export type SourceTaskOutcome = 'scheduled' | 'unchanged' | 'closed' | 'failed';

/** The task a record should have open now, without the keys the record supplies. */
export type SourceTaskNext = Omit<UnifiedTaskInput, 'organizationId' | 'sourceEntityType' | 'sourceEntityId'>;

export interface ReplaceSourceTask {
  organizationId: number;
  sourceEntityType: string;
  sourceEntityId: string;
  /** Null closes the open task and writes none. */
  next: SourceTaskNext | null;
  /** True when an open task's metadata already records what `next` would. */
  same: (metadata: Record<string, unknown>) => boolean;
  /** How the open task ends: done by this act, or withdrawn with its record. */
  closeAs: 'completed' | 'cancelled';
  /** Who did the act: closes the open task, and is the new task's creator unless `next` names one. */
  actorId: number;
}

/** The task one key should have open now, and how to tell an open task already records it. */
export interface DesiredSourceTask {
  next: SourceTaskNext;
  same: (metadata: Record<string, unknown>) => boolean;
}

export interface ReconcileSourceTasks {
  organizationId: number;
  sourceEntityType: string;
  /** The keys this act speaks for: one, or every key that starts with the prefix (matched literally, no wildcards). */
  match: { exact: string } | { prefix: string };
  /** Every key in `match` that should have a task open; an open task under any other key is closed. */
  desired: ReadonlyMap<string, DesiredSourceTask>;
  /** How an open task that is no longer desired ends. */
  closeAs: (sourceEntityId: string) => 'completed' | 'cancelled';
  actorId: number;
}

export interface ReconcileSourceTasksResult {
  kept: number;
  closed: number;
  written: Array<{ sourceEntityId: string; taskId: string }>;
  /** True when a read or write failed part way: what is counted above happened, the rest did not. */
  failed: boolean;
}

type OpenSourceTask = { taskId: string; status: unknown; metadata: unknown; sourceEntityId: string | null };

/** The open tasks under `match`, by key: one SELECT, the prefix matched literally and checked again on each row read. */
async function readOpenTasks(input: ReconcileSourceTasks, inScope: (id: string) => boolean): Promise<Map<string, OpenSourceTask[]>> {
  const { match } = input;
  const key = 'exact' in match
    ? eq(schema.unifiedTasks.sourceEntityId, match.exact)
    : sql`left(${schema.unifiedTasks.sourceEntityId}, ${match.prefix.length}) = ${match.prefix}`;
  const openTasks: OpenSourceTask[] = await db
    .select({ taskId: schema.unifiedTasks.taskId, status: schema.unifiedTasks.status, metadata: schema.unifiedTasks.metadata,
      sourceEntityId: schema.unifiedTasks.sourceEntityId })
    .from(schema.unifiedTasks)
    .where(and(
      eq(schema.unifiedTasks.organizationId, input.organizationId),
      eq(schema.unifiedTasks.sourceEntityType, input.sourceEntityType),
      key,
      notInArray(schema.unifiedTasks.status, CLOSED),
      isNull(schema.unifiedTasks.deletedAt),
    ));
  const byKey = new Map<string, OpenSourceTask[]>();
  for (const task of openTasks) {
    const id = 'exact' in match ? match.exact : String(task.sourceEntityId);
    if (inScope(id)) byKey.set(id, [...(byKey.get(id) ?? []), task]);
  }
  return byKey;
}

/** One key: keep its open task when it records the same thing; otherwise close what is open and write what is wanted. */
async function reconcileKey(input: ReconcileSourceTasks, id: string, open: OpenSourceTask[], result: ReconcileSourceTasksResult): Promise<void> {
  const { organizationId, sourceEntityType } = input;
  const wanted = input.desired.get(id);
  if (wanted && open.length === 1 && wanted.same((open[0].metadata ?? {}) as Record<string, unknown>)) { result.kept += 1; return; }
  for (const task of open) {
    await unifiedTaskService.updateTaskStatus(task.taskId, input.closeAs(id), input.actorId,
      { organizationId, expectedStatus: String(task.status) });
    result.closed += 1;
  }
  if (!wanted) return;
  const task = await unifiedTaskService.createUnifiedTask({ createdById: input.actorId, ...wanted.next, organizationId, sourceEntityType, sourceEntityId: id });
  result.written.push({ sourceEntityId: id, taskId: String(task.taskId) });
}

/**
 * Make the open tasks under `match` exactly `desired`: an open task that records
 * the same thing is kept, any other is closed, and a missing one is written.
 * One SELECT of the open tasks. Never throws.
 */
export async function reconcileSourceTasks(input: ReconcileSourceTasks): Promise<ReconcileSourceTasksResult> {
  const { organizationId, sourceEntityType, match } = input;
  const result: ReconcileSourceTasksResult = { kept: 0, closed: 0, written: [], failed: false };
  try {
    const inScope = (id: string) => ('exact' in match ? id === match.exact : id.startsWith(match.prefix));
    const byKey = await readOpenTasks(input, inScope);
    for (const id of new Set([...byKey.keys(), ...[...input.desired.keys()].filter(inScope)])) {
      await reconcileKey(input, id, byKey.get(id) ?? [], result);
    }
  } catch (err) {
    result.failed = true;
    log.warn('The tasks could not all be written; the governed act stands', {
      organizationId, sourceEntityType, match, err: err instanceof Error ? err.message : String(err),
    });
  }
  return result;
}

/** Close the record's open task and, when `next` is given, write it. Never throws. */
export async function replaceSourceTask(input: ReplaceSourceTask): Promise<SourceTaskOutcome> {
  const { sourceEntityId, next } = input;
  const result = await reconcileSourceTasks({
    organizationId: input.organizationId,
    sourceEntityType: input.sourceEntityType,
    match: { exact: sourceEntityId },
    desired: new Map(next ? [[sourceEntityId, { next, same: input.same }]] : []),
    closeAs: () => input.closeAs,
    actorId: input.actorId,
  });
  if (result.failed) return 'failed';
  if (!next) return 'closed';
  return result.written.length ? 'scheduled' : 'unchanged';
}
