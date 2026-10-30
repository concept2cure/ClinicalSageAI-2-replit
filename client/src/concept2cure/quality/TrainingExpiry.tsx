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
import { ErrorState } from '../v2/dataConnect';
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

export function TrainingExpiry() {
  const st = useTrainingExpiring(TRAINING_EXPIRY_DAYS);
  return <section className="qms-sec" data-testid="training-expiry">
    <div className="qms-sec-head">
      <h2>Training lapsed or lapsing soon</h2>
      <span className="meta">Lapsed, or lapsing in the next {TRAINING_EXPIRY_DAYS} days · active organization roster</span>
    </div>
    <div className="qms-train">
      {st.failed && <ErrorState title="Training expiry could not be read" message={st.error} retry={st.refresh} testId="training-expiry-failed" />}
      {!st.failed && st.rows === null && <div className="qms-empty" role="status">Reading training expiry…</div>}
      {st.rows?.length === 0 && <div className="qms-empty">No one's training has lapsed, and none lapses in the next {TRAINING_EXPIRY_DAYS} days.</div>}
      {st.rows?.map((r) => (
        <div className="qms-train-row" key={`${r.userId}:${r.documentId}`}>
          <span className="qms-train-doc">{r.userName ?? `User #${r.userId}`}</span>
          <span className="qms-train-when">
            {r.docNumber} {r.title} · v{r.documentVersion} · {lapseText(r)}
          </span>
        </div>
      ))}
    </div>
  </section>;
}
