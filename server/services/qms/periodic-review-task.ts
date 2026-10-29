/**
 * A controlled document's next periodic review, as a task for its owner
 * (gap 5.2, second half; docs/design/QMS_PERIODIC_REVIEW_REMINDERS_2026-10-29.md).
 *
 * One open task per document in the one task store (unified_tasks, module
 * Quality), keyed `qms-document:<id>`, assigned to the document's author and
 * due when the version in force is next due. It carries `remindDaysBefore`, so
 * the due-date sweep (jobs/taskDueSweep.ts) gives 30 days' notice rather than
 * two, and once more when it is overdue. No scheduler of its own.
 *
 * Written best effort after the governed act commits, as the research
 * compliance tasking bridge is: a reminder that did not land is logged, and
 * never undoes an approval, a review signature or a retirement.
 *   - approval of a version: its review is due on the date the approval signed;
 *   - a signed review that finds it current: the date the reviewer set;
 *   - "revision required": a task to revise, due when the document is due;
 *   - retirement: the open task is cancelled.
 * The open task is closed (completed, or cancelled on retirement) before the
 * next is written; the same version, date and kind again changes nothing.
 *
 * @module server/services/qms/periodic-review-task
 */
import { replaceSourceTask, type SourceTaskOutcome } from '../tasking/source-task';
import type { QmsDocumentRow } from './document-approval-signature';

export const PERIODIC_REVIEW_TASK_SOURCE = 'qms_periodic_review';
/** Notice the owner gets before the date (taskDueSweep reads it). */
export const PERIODIC_REVIEW_REMIND_DAYS = 30;

export type PeriodicReviewTaskKind = 'review' | 'revise';
export type PeriodicReviewTaskOutcome = SourceTaskOutcome;

export interface SchedulePeriodicReviewTask {
  organizationId: number;
  /** The version in force (or the one being retired), as the governed act left it. */
  document: Pick<QmsDocumentRow, 'id' | 'doc_number' | 'title' | 'version' | 'author_id'>;
  /** When it is due (YYYY-MM-DD); null writes no new task. */
  due: string | null;
  kind: PeriodicReviewTaskKind;
  /** How the open task ends: done by this act, or withdrawn with the document. */
  closeAs: 'completed' | 'cancelled';
  createdById: number;
}

const sourceId = (documentId: number) => `qms-document:${documentId}`;

function titleOf(kind: PeriodicReviewTaskKind, doc: SchedulePeriodicReviewTask['document']): string {
  return kind === 'review'
    ? `Periodic review: ${doc.doc_number} v${doc.version}`
    : `Revise ${doc.doc_number} v${doc.version}: its periodic review found a revision required`;
}

function descriptionOf(kind: PeriodicReviewTaskKind, doc: SchedulePeriodicReviewTask['document'], due: string): string {
  return kind === 'review'
    ? `${doc.doc_number} ${doc.title} v${doc.version} is due for its periodic review on ${due}. Record the review in Quality, `
      + 'Controlled documents (Record review): it is an electronic signature and does not change the document.'
    : `${doc.doc_number} ${doc.title} v${doc.version} was found to need revision at its periodic review, and stays due on ${due}. `
      + 'Open a revision with Revise in the register; approving the revision sets the next review date.';
}

/**
 * Close the document's open review task and, when a date is given, write the
 * next (services/tasking/source-task.ts). Never throws: the governed act it
 * follows has committed.
 */
export function schedulePeriodicReviewTask(input: SchedulePeriodicReviewTask): Promise<PeriodicReviewTaskOutcome> {
  const { organizationId, document: doc, due, kind } = input;
  return replaceSourceTask({
    organizationId,
    sourceEntityType: PERIODIC_REVIEW_TASK_SOURCE,
    sourceEntityId: sourceId(Number(doc.id)),
    same: (meta) => meta.version === String(doc.version) && meta.nextReviewDue === due && meta.kind === kind,
    closeAs: input.closeAs,
    actorId: input.createdById,
    next: !due ? null : {
      moduleType: 'Quality',
      title: titleOf(kind, doc),
      description: descriptionOf(kind, doc, due),
      category: 'periodic-review',
      taskType: kind === 'review' ? 'review' : 'action',
      ...(doc.author_id ? { assigneeId: Number(doc.author_id) } : {}),
      priority: 'medium',
      dueDate: new Date(`${due}T00:00:00Z`),
      tags: ['qms', 'periodic-review'],
      metadata: { documentId: Number(doc.id), version: String(doc.version), nextReviewDue: due, kind,
        remindDaysBefore: PERIODIC_REVIEW_REMIND_DAYS },
    },
  });
}
