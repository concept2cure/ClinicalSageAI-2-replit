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
 * review (services/qms/periodic-review-task.ts) and by a CAPA's target close and
 * its action items' due dates (services/capa-mdr/capa-tasks.ts).
 *
 * @module server/services/tasking/source-task
 */
import { and, eq, isNull, notInArray } from 'drizzle-orm';
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

/** Close the record's open task and, when `next` is given, write it. Never throws. */
export async function replaceSourceTask(input: ReplaceSourceTask): Promise<SourceTaskOutcome> {
  const { organizationId, sourceEntityType, sourceEntityId, next } = input;
  try {
    const openTasks = await db
      .select({ taskId: schema.unifiedTasks.taskId, status: schema.unifiedTasks.status, metadata: schema.unifiedTasks.metadata })
      .from(schema.unifiedTasks)
      .where(and(
        eq(schema.unifiedTasks.organizationId, organizationId),
        eq(schema.unifiedTasks.sourceEntityType, sourceEntityType),
        eq(schema.unifiedTasks.sourceEntityId, sourceEntityId),
        notInArray(schema.unifiedTasks.status, CLOSED),
        isNull(schema.unifiedTasks.deletedAt),
      ));
    if (next && openTasks.length === 1 && input.same((openTasks[0].metadata ?? {}) as Record<string, unknown>)) return 'unchanged';
    for (const task of openTasks) {
      await unifiedTaskService.updateTaskStatus(task.taskId, input.closeAs, input.actorId,
        { organizationId, expectedStatus: String(task.status) });
    }
    if (!next) return 'closed';
    await unifiedTaskService.createUnifiedTask({ createdById: input.actorId, ...next, organizationId, sourceEntityType, sourceEntityId });
    return 'scheduled';
  } catch (err) {
    log.warn('The task could not be written; the governed act stands', {
      organizationId, sourceEntityType, sourceEntityId, err: err instanceof Error ? err.message : String(err),
    });
    return 'failed';
  }
}
