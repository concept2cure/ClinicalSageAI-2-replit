/**
 * Who must train again soon: each active member whose current read-and-understood
 * training on a document in force lapses within the window, on what, and by when
 * (G10, docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md).
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
import { useTrainingExpiring, type TrainingExpiryRow } from './hooks';

/** The window the Quality register shows training lapsing within. */
export const TRAINING_EXPIRY_DAYS = 60;

/** "lapsed on …" for a lapse, "lapses on … (in n days)" for one to come. */
export function lapseText(r: Pick<TrainingExpiryRow, 'expiresAt' | 'daysLeft' | 'lapsed'>): string {
  const on = formatDate(r.expiresAt);
  if (r.lapsed) return `lapsed ${on}`;
  return r.daysLeft <= 0 ? `lapses ${on} (today)` : `lapses ${on} (in ${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'})`;
}

/** What the coverage read said about assignment: its counts, still reading, or null when it was not read. */
export type ExpiryAssignment = { assigned: number; noActiveAssignees: number } | 'reading' | null;

/**
 * The all-clear is said only of training that exists (C2, finding 112): "no one's training lapses" of an organization
 * where no document is assigned is only vacuously true. A document whose assignees have all left is assigned, to
 * nobody active, and is said so, as the coverage figure says it (review C2-2). While the coverage read is in flight
 * nothing is claimed; when it was not read, no all-clear is given.
 */
function nothingLapsing(assignment: ExpiryAssignment | undefined): string | null {
  if (assignment === 'reading') return null;
  if (assignment == null) return 'Whether anyone is assigned to train could not be read, so no all-clear is given.';
  if (assignment.assigned === 0) {
    return assignment.noActiveAssignees > 0 ? 'No one assigned to train is an active member.' : 'No document is assigned for training yet.';
  }
  return `No one's training has lapsed, and none lapses in the next ${TRAINING_EXPIRY_DAYS} days.`;
}

export function TrainingExpiry({ assignment }: { assignment?: ExpiryAssignment }) {
  const clear = nothingLapsing(assignment);
  const st = useTrainingExpiring(TRAINING_EXPIRY_DAYS);
  return <section className="pj-sec" aria-labelledby="qms-expiry-h" data-testid="training-expiry">
    <div className="pj-sec-h">
      <h2 id="qms-expiry-h">Training lapsed or lapsing soon</h2>
      <span className="sec-sub">Lapsed, or lapsing in the next {TRAINING_EXPIRY_DAYS} days, across the active organization roster</span>
    </div>
    <div className="qms-train">
      {st.failed && <ErrorState title="Training expiry could not be read" message={st.error} retry={st.refresh} read={st.failure} readWhat="the training expiry list" testId="training-expiry-failed" />}
      {!st.failed && st.rows === null && <EmptyState title="Reading training expiry…" busy />}
      {st.rows?.length === 0 && (clear === null ? <EmptyState title="Reading who is assigned to train…" busy /> : <EmptyState title={clear} />)}
      {st.rows?.map((r) => (
        <div className="qms-train-row" key={`${r.userId}:${r.documentId}`}>
          <span className="qms-train-doc" title={r.userName ? undefined : `User ${r.userId}`}>{r.userName ?? 'A member whose name is not on record'}</span>
          <span className="qms-train-when">
            {r.docNumber} {r.title} · v{r.documentVersion} · {lapseText(r)}
          </span>
        </div>
      ))}
    </div>
  </section>;
}
