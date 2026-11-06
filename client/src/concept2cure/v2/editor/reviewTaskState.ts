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
import type { AuthoringReviewStanding } from '@shared/authoring/peer-review';
import type { EsigMeaning } from '../../hooks/useEsignature';
import { useLiveData } from '../dataConnect';

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

/** A legacy or unknown binding never makes a recorded verdict current. */
export function reviewStandingOf(status: string, standing: unknown): AuthoringReviewStanding {
  if (status === 'pending') return 'pending';
  if (standing === 'current' && ['approved', 'rejected', 'changes_requested'].includes(status)) return 'current';
  return standing === 'stale' ? 'stale' : 'unbound';
}

export function reviewBindingNote(standing: 'stale' | 'unbound'): string {
  return standing === 'stale'
    ? 'The saved document has changed since that decision; a current review is needed.'
    : 'Its saved-content binding is unavailable; a current review is needed.';
}

export const CLOSED_TASK = new Set(['completed', 'cancelled']);

/** What the review request says about one task, for the row to state. */
export type TaskReviewState =
  | { kind: 'none' }
  | { kind: 'reading' }
  | { kind: 'unread' }
  | { kind: 'pending'; reviewer: string }
  | { kind: 'recorded'; verdict: string }
  | { kind: 'historical'; verdict: string; standing: 'stale' | 'unbound'; comments: string | null }
  /** A closed task opened before the reviewer's current request: it belongs to an earlier one. */
  | { kind: 'earlier'; reviewer: string; askedOn: string; verdict: string | null; standing: AuthoringReviewStanding; comments: string | null };

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
    standing: reviewStandingOf(row.status, row.standing),
    comments: row.comments,
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
  const earlier = earlierRequest(task, row);
  if (earlier) return earlier;
  const standing = reviewStandingOf(row.status, row.standing);
  if (standing === 'pending') return { kind: 'pending', reviewer: row.reviewer };
  if (standing === 'current') return { kind: 'recorded', verdict: reviewStatusLabel(row.status) };
  return { kind: 'historical', verdict: reviewStatusLabel(row.status), standing, comments: row.comments };
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
    case 'historical':
      return `Earlier verdict recorded on the Review board: ${review.verdict}. ${reviewBindingNote(review.standing)}` +
        (review.comments ? ` Recorded reason: ${review.comments}` : '') +
        (closed ? ' This task keeps its recorded history.' : ' Record the current verdict on the Review board before completing this task.');
    case 'earlier':
      return `This task belongs to an earlier review request. ${review.reviewer} was asked again on ${review.askedOn}; ` +
        (review.verdict ? `the verdict on that request is recorded on the Review board: ${review.verdict}.` : 'that review is pending on the Review board.') +
        (review.standing === 'stale' || review.standing === 'unbound' ? ` ${reviewBindingNote(review.standing)}` : '') +
        (review.comments ? ` Recorded reason: ${review.comments}` : '');
    case 'unread':
      return closed
        ? 'Whether a verdict is recorded on the Review board could not be read.'
        : 'Whether a verdict is recorded on the Review board could not be read, so this review task is not offered for completion. Refresh to read it again.';
    default:
      return null;
  }
}

/* ── The CSR release gate, read before a password is asked (B7, demo walk 2026-11-05) ──────────────────────────
   E-sign on the CSR took the approver's reason and password, and only then did the server refuse with 409
   CSR_SCIENTIFIC_REVIEW_REQUIRED. A CSR is frozen, or signed as author or approver, only over a current
   scientific-review receipt (authoring.router.ts → assertWorkflowImportRelease → csr-scientific-review.ts); the
   review signature takes another path. The document's reviews read (GET …/reviews, this panel's) carries the
   server's own CSR rule (reviewContext.csrScientificReviewRequired) and each verdict's standing. With the rule set
   and no current approval, the editor says so first, with the step to take. The server stays the authority: a read
   that is not a reading, or an approval whose receipt the server refuses, is decided there as before. */
const CSR_GATED_MEANINGS: ReadonlySet<EsigMeaning> = new Set(['authorship', 'approval']);
export const CSR_REVIEW_FIRST =
  'This CSR is frozen, or signed as author or approver, only after its scientific review: a reviewer approves this ' +
  'saved version with each reported result mapped to its table cell. Send it for review, then sign once it is approved.';
/** The same refusal, as the editor bar shows it beside the disabled control: one line. The full sentence stays the
 * control's title and the signing dialog's refusal (the bar had wrapped it into a paragraph between Freeze and E-sign). */
export const CSR_REVIEW_FIRST_NOTE = 'Needs its scientific review first';

/** The sentence the gate will refuse with; null when it will not, or when the body is not a reading of this document's reviews. */
export function csrReviewFirst(body: unknown, docId: string): string | null {
  const read = body as { success?: unknown; reviews?: unknown; reviewContext?: { csrScientificReviewRequired?: unknown } } | null;
  if (read?.success !== true || read.reviewContext?.csrScientificReviewRequired !== true || !Array.isArray(read.reviews)) return null;
  const rows = read.reviews as Array<Record<string, unknown> | null>;
  if (rows.some((r) => !r || String(r.doc_id ?? '') !== docId)) return null;
  const approved = rows.some((r) => r!.review_status === 'approved' && reviewStandingOf('approved', r!.standing) === 'current');
  return approved ? null : CSR_REVIEW_FIRST;
}

/** Freeze's and E-sign's refusals, the server's first; and the refusal for each E-sign meaning, for the dialog. */
export function useCsrSigningGate(docId: string, revision: string, offered: ReadonlyArray<EsigMeaning>,
  server: { freeze?: string | null; esign?: string | null }) {
  const read = useLiveData<unknown>(`/api/authoring/documents/${encodeURIComponent(docId)}/reviews`, [docId, revision]);
  const refusal = read.loading || read.error ? null : csrReviewFirst(read.data, docId);
  return {
    freeze: server.freeze || refusal,
    /** E-sign itself is refused when every meaning it offers is gated (a creator signs authorship alone). */
    esign: server.esign || (refusal && offered.every((m) => CSR_GATED_MEANINGS.has(m)) ? refusal : null),
    forMeaning: (m: EsigMeaning): string | null => server.esign || (refusal && CSR_GATED_MEANINGS.has(m) ? refusal : null),
  };
}
