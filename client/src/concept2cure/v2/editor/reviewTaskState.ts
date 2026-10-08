/**
 * What a review task's review request says about it, as the document's Tasks
 * rail (ReviewTasksPanel.tsx) states it beside the task.
 *
 * A review task (unified_tasks, taskType 'review') and the review request it
 * was created with (authoring_reviews, one row per reviewer and document) are
 * two records. Since wave 2D the verdict completes the reviewer's open,
 * ungated review tasks on the document (authoring.router.ts
 * closeReviewTasksOnVerdict), and completing a task still records no verdict.
 *
 * A reviewer can be asked again after a verdict (wave 2D): their one request
 * row is pending again, with a new requested time. A closed task opened before
 * that time belongs to the earlier request and says so. Judged against the new
 * request, it read "completed, but no verdict is recorded" when a verdict had
 * closed it, and later named the new request's verdict as its own
 * (docs/evidence/D2-ONE-ANA/2026-10-08/ana-2d-review-loop-closes/).
 */
import type { AuthoringTaskRow, DocumentReviewsRead, StandingReview } from './ReviewTasksPanel';

/** How a review state reads. Text, never colour alone. */
const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  rejected: 'Declined',
};

export function reviewStatusLabel(status: string): string {
  return REVIEW_STATUS_LABEL[status] ?? (status ? status.replace(/_/g, ' ') : 'status not reported');
}

export const CLOSED_TASK = new Set(['completed', 'cancelled']);

/** What the review request says about one task, for the row to state. */
export type TaskReviewState =
  | { kind: 'none' }
  | { kind: 'reading' }
  | { kind: 'unread' }
  | { kind: 'pending'; reviewer: string }
  | { kind: 'recorded'; verdict: string }
  /** A closed task opened before the reviewer's current request: it belongs to an earlier one. */
  | { kind: 'earlier'; reviewer: string; askedOn: string; verdict: string | null };

/**
 * The earlier request a closed task belongs to, or null. Send for review
 * records the request and then creates the task, so a task of the current
 * request is never older than it. An unknown time is not "earlier".
 */
function earlierRequest(task: AuthoringTaskRow, row: StandingReview): TaskReviewState | null {
  const opened = Date.parse(task.createdAt ?? '');
  const asked = new Date(row.requestedAt ?? '');
  if (!CLOSED_TASK.has(task.status) || !(opened < asked.getTime())) return null;
  return {
    kind: 'earlier',
    reviewer: row.reviewer,
    askedOn: asked.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
    verdict: row.status === 'pending' ? null : reviewStatusLabel(row.status),
  };
}

/**
 * The review request behind a review task: the request naming its assignee on
 * this document. 'none' for a task that is not a review task, or a review task
 * no request names (a task-only assignment); completion then works as before.
 */
export function taskReviewState(task: AuthoringTaskRow, reviews: Pick<DocumentReviewsRead, 'state' | 'rows'>): TaskReviewState {
  if (task.taskType !== 'review' || task.assigneeId == null) return { kind: 'none' };
  if (reviews.state === 'error') return { kind: 'unread' };
  if (reviews.state !== 'ready') return { kind: 'reading' };
  const row = reviews.rows.find(r => r.reviewerId === String(task.assigneeId));
  if (!row) return { kind: 'none' };
  return earlierRequest(task, row)
    ?? (row.status === 'pending' ? { kind: 'pending', reviewer: row.reviewer } : { kind: 'recorded', verdict: reviewStatusLabel(row.status) });
}

/** What a pending review leaves for the task: nothing (the verdict completes it), or a signature. */
function afterTheVerdict(task: AuthoringTaskRow): string {
  return task.approvalRequired && task.approvalStatus !== 'approved'
    ? '. Once the verdict is recorded there, completing this task needs an electronic signature.'
    : '; recording the verdict there completes this task.';
}

/** The sentence a review task carries about its verdict, or null when there is nothing to say. */
export function reviewStateNote(task: AuthoringTaskRow, review: TaskReviewState): string | null {
  const closed = CLOSED_TASK.has(task.status);
  switch (review.kind) {
    case 'pending':
      return closed
        ? `This task is ${task.status}, but no verdict is recorded: ${review.reviewer}’s review is still pending on the Review board.`
        : `Completing this task does not record a verdict. ${review.reviewer}’s review is pending on the Review board${afterTheVerdict(task)}`;
    case 'recorded':
      return `Verdict recorded on the Review board: ${review.verdict}.`;
    case 'earlier':
      return `This task belongs to an earlier review request. ${review.reviewer} was asked again on ${review.askedOn}; ` +
        (review.verdict ? `the verdict on that request is recorded on the Review board: ${review.verdict}.` : 'that review is pending on the Review board.');
    case 'unread':
      return closed
        ? 'Whether a verdict is recorded on the Review board could not be read.'
        : 'Whether a verdict is recorded on the Review board could not be read, so this review task is not offered for completion. Refresh to read it again.';
    default:
      return null;
  }
}
