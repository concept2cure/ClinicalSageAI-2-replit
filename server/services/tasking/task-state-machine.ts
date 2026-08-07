/**
 * Task status state machine.
 *
 * `unified_tasks.status` was free text: any string was accepted, statuses the
 * board has no column for could be minted, and completed → pending was one
 * PATCH away with no record of intent (assessment D4/D5/D23). The domain and
 * its legal transitions are explicit here and shared by every mutation path.
 * Same-status writes (progress-only updates) always pass; completed →
 * in-progress/review is a deliberate, audited reopen.
 *
 * @module server/services/tasking/task-state-machine
 */

export const TASK_STATUSES = [
  'pending',
  'in-progress',
  'review',
  'completed',
  'blocked',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in-progress', 'review', 'blocked', 'cancelled'],
  'in-progress': ['pending', 'review', 'completed', 'blocked', 'cancelled'],
  review: ['in-progress', 'completed', 'blocked', 'cancelled'],
  completed: ['review', 'in-progress'], // audited reopen only
  blocked: ['pending', 'in-progress', 'review', 'cancelled'],
  cancelled: ['pending'],
};

export function isLegalTransition(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = TASK_TRANSITIONS[from as TaskStatus];
  // An unknown stored status (legacy row) may move to any known status so old
  // rows can be repaired through the UI rather than being stuck forever.
  if (!allowed) return (TASK_STATUSES as readonly string[]).includes(to);
  return allowed.includes(to as TaskStatus);
}
