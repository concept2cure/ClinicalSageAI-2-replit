/**
 * Who must train, and by when: each person assigned whose read-and-understood training
 * is overdue, due within the window, or lapses or lapsed on a document in force
 * (G10, docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md; slice 5 of
 * docs/design/QMS_TRAINING_ASSIGNMENT_2026-10-29.md §3.6 added overdue and due).
 *
 * Reads GET /api/mdx/qms/training/expiring, which applies coverage's own rule
 * for a current receipt (server/services/qms/training-compliance.ts). A failed
 * read is shown as a failure, never as "no one".
 *
 * @module client/src/concept2cure/quality/TrainingExpiry
 */
import * as React from 'react';
import { EmptyState, ErrorState } from '../v2/dataConnect';
import { formatDate } from './data';
import { useTrainingExpiring, type TrainingExpiryRow, type TrainingLapseRow, type TrainingOutstandingRow } from './hooks';

/** The window the Quality register shows training lapsing within. */
export const TRAINING_EXPIRY_DAYS = 60;

/** "lapsed on …" for a lapse, "lapses on … (in n days)" for one to come. */
export function lapseText(r: Pick<TrainingLapseRow, 'expiresAt' | 'daysLeft' | 'lapsed'>): string {
  const on = formatDate(r.expiresAt);
  if (r.lapsed) return `lapsed ${on}`;
  return r.daysLeft <= 0 ? `lapses ${on} (today)` : `lapses ${on} (in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'})`;
}

/** "overdue since …", or "due … (in n days)"; someone assigned after the version took effect is due 14 days after. */
export function dueText(r: Pick<TrainingOutstandingRow, 'kind' | 'dueDate' | 'daysLeft' | 'lateAssignment'>): string {
  const on = formatDate(r.dueDate);
  const late = r.lateAssignment ? ', 14 days after they were assigned' : '';
  if (r.kind === 'overdue') return `overdue since ${on}${late}`;
  return `due ${on} (in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'})${late}`;
}

/** The row's day, said as its kind says it. */
const whenText = (r: TrainingExpiryRow) => (r.kind === 'lapsing' ? lapseText(r) : dueText(r));

/** What the coverage read said about assignment: its counts, still reading, or null when it was not read. */
export type ExpiryAssignment = { assigned: number; noActiveAssignees: number } | 'reading' | null;

/**
 * The all-clear is said only of training that exists (C2, finding 112): "no one's training lapses" of an organization
 * where no document is assigned is only vacuously true. A document whose assignees have all left is assigned, to
 * nobody active, and is said so, as the coverage figure says it (review C2-2). While the coverage read is in flight
 * nothing is claimed; when it was not read, no all-clear is given.
 */
function nothingLapsing(assignment: ExpiryAssignment | undefined, own: boolean): string | null {
  if (assignment === 'reading') return null;
  if (assignment == null) return 'Whether anyone is assigned to train could not be read, so no all-clear is given.';
  if (assignment.assigned === 0) {
    return assignment.noActiveAssignees > 0 ? 'No one assigned to train is an active member.' : 'No document is assigned for training yet.';
  }
  return own ? `You have no training overdue, due or lapsing in the next ${TRAINING_EXPIRY_DAYS} days.`
    : `No one assigned has training overdue, due or lapsing in the next ${TRAINING_EXPIRY_DAYS} days.`;
}

export function TrainingExpiry({ assignment }: { assignment?: ExpiryAssignment }) {
  const st = useTrainingExpiring(TRAINING_EXPIRY_DAYS);
  const own = st.scope === 'own';
  /* An all-clear only over what was assessed (Quality review, 2026-11-10): not over documents whose text cannot be read,
     nor past the document cap; and a member who sees only their own rows is told about their own. */
  const unassessedLine = st.unassessed > 0
    ? `${st.unassessed === 1 ? '1 assigned document was' : `${st.unassessed} assigned documents were`} not assessed: their released text cannot be read.` : null;
  const clear = unassessedLine || st.documentsCapped ? null : nothingLapsing(assignment, own);
  return <section className="pj-sec" aria-labelledby="qms-expiry-h" data-testid="training-expiry">
    <div className="pj-sec-h">
      <h2 id="qms-expiry-h">Training overdue, due or lapsing</h2>
      <span className="sec-sub">{own ? 'Your training: overdue' : 'Overdue'}, or due or lapsing in the next {TRAINING_EXPIRY_DAYS} days{own ? '' : ', for the people assigned to train'}</span>
    </div>
    <div className="qms-train">
      {st.failed && <ErrorState title="Training expiry could not be read" message={st.error} retry={st.refresh} read={st.failure} readWhat="the training expiry list" testId="training-expiry-failed" />}
      {!st.failed && st.rows === null && <EmptyState title="Reading training expiry…" busy />}
      {st.rows?.length === 0 && !unassessedLine && !st.documentsCapped && (clear === null ? <EmptyState title="Reading who is assigned to train…" busy /> : <EmptyState title={clear} />)}
      {st.rows?.map((r) => (
        <div className="qms-train-row" key={`${r.kind}:${r.userId}:${r.documentId}`} data-testid="training-expiry-row">
          <span className="qms-train-doc" title={r.userName ? undefined : `User ${r.userId}`}>
            {r.userName ?? 'A member whose name is not on record'}
            {r.kind === 'overdue' && <> <span className="rd-chip tone-err">Overdue</span></>}
          </span>
          <span className="qms-train-when">
            {r.docNumber} {r.title} · v{r.documentVersion} · {whenText(r)}
          </span>
        </div>
      ))}
      {st.rows && unassessedLine && <p className="sec-sub" data-testid="training-expiry-unassessed">{unassessedLine}</p>}
      {st.rows && st.documentsCapped && <p className="sec-sub" data-testid="training-expiry-capped">Only the first 200 trainable documents were read.</p>}
      {st.rows && st.truncated && (
        <p className="sec-sub" data-testid="training-expiry-truncated">The first 500 rows: there are more than the list shows.</p>
      )}
    </div>
  </section>;
}
