/**
 * Tasking bridge — research compliance + sponsored programs → central unified_tasks
 *
 * Best-effort: domains call this AFTER their governed commit to create a deadline/
 * review task in the existing central tasking system (unified_tasks), under the
 * `ResearchCompliance` module type. Never throws into the caller — task creation
 * is non-critical and must not fail a governed mutation.
 *
 * @module server/services/research-compliance/tasking-bridge
 */

import unifiedTaskService from '../unifiedTaskService';

export interface DeadlineTaskInput {
  organizationId: number;
  title: string;
  sourceEntityType: string; // e.g. 'grant_milestone', 'lifecycle_obligation'
  sourceEntityId: string | number;
  dueDate?: string | null; // YYYY-MM-DD
  projectId?: number | null;
  taskType?: string; // 'milestone' | 'review' | 'deliverable' | ...
  regulatoryImpact?: boolean;
}

/** Create a deadline/review task in unified_tasks. Best-effort; returns the taskId or null. */
export async function emitDeadlineTask(input: DeadlineTaskInput): Promise<string | null> {
  try {
    const task = await unifiedTaskService.createUnifiedTask({
      moduleType: 'ResearchCompliance',
      title: input.title,
      taskType: input.taskType ?? 'milestone',
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: String(input.sourceEntityId),
      organizationId: input.organizationId,
      projectId: input.projectId ?? undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      priority: 'medium',
    });
    return (task as any)?.taskId ?? null;
  } catch {
    // Tasking is best-effort — a missing unified_tasks table or transient error
    // must never fail the governed mutation that triggered it.
    return null;
  }
}
