/**
 * The register's Periodic review panel, and the signed act that records a
 * review (gap 5.2; docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md).
 *
 * Each row opens the document to read, as before. An effective document also
 * offers Record review: the reviewer says whether the version in force
 * remains current, with the next review date, or needs a revision, then signs
 * with meaning `review` in the shared EsignModal. The review changes nothing
 * on the document: its next review date is part of what its approval signed
 * (server/services/qms/periodic-review.ts), so the review is the signature,
 * and each row says when the version in force was last reviewed, by whom, and
 * what was decided.
 *
 * A document under revision offers no review: the revision's approval sets
 * its next one. The server refuses anyone without signing authority, as it
 * does the approval.
 *
 * @module client/src/concept2cure/quality/PeriodicReview
 */
import * as React from 'react';
import { I } from '../v2/icons';
import { ErrorState } from '../v2/dataConnect';
import { EsignModal, type EsignSigner } from '../_shared/components/EsignModal';
import { DialogPanel } from './ControlledDocumentDialogs';
import { formatDate, type PeriodicReviewSummary, type ReviewDueRow } from './data';
import { postQmsPeriodicReview, type QmsPeriodicReviewDecision } from './qmsApproval';

const DAY_MS = 86_400_000;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);

/** "Reviewed 22 Oct 2026 by J. Smith: remains current" — the last signed review of the version in force. */
export function lastReviewText(review: PeriodicReviewSummary): string {
  const by = review.reviewerName ? ` by ${review.reviewerName}` : '';
  const decided = review.outcome === 'current' ? 'remains current' : 'revision required';
  return `v${review.version} reviewed ${formatDate(review.reviewedAt)}${by}: ${decided}`;
}

/** Whether a row can take a review now: only a document whose version in force is not being revised. */
export const canRecordReview = (row: ReviewDueRow) => row.status === 'effective' && !row.underRevision;

export function PeriodicReviewPanel({ rows, unread, failed, error, retry, overdueCount, canOpen, onOpen, onRecord }: {
  rows: ReviewDueRow[];
  unread: boolean;
  failed: boolean;
  error: string | null | undefined;
  retry: () => void;
  overdueCount: number;
  canOpen: (documentId: number) => boolean;
  onOpen: (documentId: number) => void;
  onRecord: (row: ReviewDueRow) => void;
}) {
  return (
    <section className="qms-sec">
      <div className="qms-sec-head">
        <h2>Periodic review</h2>
        {!unread && <span className="meta">{overdueCount} overdue · {rows.length} within 120 days</span>}
      </div>
      <div className="qms-review">
        {failed && <ErrorState title="Periodic review dates could not be read" message={error} retry={retry} testId="sop-review-failed" />}
        {unread && !failed && <div className="qms-empty" role="status">Loading review dates…</div>}
        {!unread && rows.length === 0 && <div className="qms-empty">No documents due for review.</div>}
        {rows.map((r) => (
          <div key={r.id} className="qms-review-row" data-overdue={r.overdue || undefined} data-testid="qms-review-row">
            <button
              className="qms-review-open"
              aria-label={`Open ${r.docNumber} ${r.title} for its periodic review (${r.overdue ? 'overdue' : `due ${formatDate(r.nextReviewDate)}`})`}
              title="Open the document to read it before you record its review."
              disabled={!canOpen(r.id)}
              onClick={() => onOpen(r.id)}
            >
              <span className="qms-review-num mono">{r.docNumber}</span>
              <span className="qms-review-title" title={r.title}>{r.title}</span>
              <span className="qms-review-when">
                {r.overdue ? <span className="qms-flag-txt">{I.flag} Overdue</span> : formatDate(r.nextReviewDate)}
              </span>
            </button>
            {canRecordReview(r) && (
              <button
                className="qms-chip"
                aria-label={`Record review: ${r.docNumber} ${r.title}`}
                title="Record the review with your electronic signature. The document and its approval are not changed."
                onClick={() => onRecord(r)}
              >
                {I.check} Record review
              </button>
            )}
            {(r.lastReview || r.underRevision) && (
              <span className="qms-review-last">
                {r.lastReview ? lastReviewText(r.lastReview) : null}
                {r.lastReview && r.underRevision ? ' · ' : null}
                {r.underRevision ? 'Revision open: its approval sets the next review.' : null}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Step one: what the reviewer decided. Nothing is sent until the signature. */
function ReviewDecision({ row, onClose, onContinue }: {
  row: ReviewDueRow; onClose: () => void; onContinue: (decision: QmsPeriodicReviewDecision) => void;
}) {
  const [outcome, setOutcome] = React.useState<QmsPeriodicReviewDecision['outcome']>('current');
  const [date, setDate] = React.useState('');
  const earliest = isoDay(1);
  const latest = isoDay(5 * 365);
  const dateValid = date >= earliest && date <= latest;
  const ready = outcome === 'revision-required' || dateValid;
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onContinue(outcome === 'current' ? { outcome, nextReviewDate: date } : { outcome });
  };
  return (
    <DialogPanel title="Record periodic review" onClose={onClose} busy={false}>
      <p>
        {row.docNumber} {row.title}, v{row.version}: the version in force. Your review is an electronic signature.
        It does not change the document, its approved text or its approval.
      </p>
      <form onSubmit={submit}>
        <fieldset className="qms-dialog-choice">
          <legend>Outcome</legend>
          <label>
            <input type="radio" name="qms-review-outcome" value="current" checked={outcome === 'current'} onChange={() => setOutcome('current')} />
            Remains current
          </label>
          <label>
            <input type="radio" name="qms-review-outcome" value="revision-required" checked={outcome === 'revision-required'}
              onChange={() => setOutcome('revision-required')} />
            Revision required
          </label>
        </fieldset>
        {outcome === 'current' ? (
          <>
            <label>Next periodic review
              <input type="date" value={date} min={earliest} max={latest} required onChange={(event) => setDate(event.target.value)} />
            </label>
            <p className="qms-dialog-hint">After today, and within five years. The register lists the document as due from this date.</p>
          </>
        ) : (
          <p className="qms-dialog-hint">
            The document stays due{row.nextReviewDate ? ` from ${formatDate(row.nextReviewDate)}` : ''}. Open a revision with Revise in
            the register; its approval sets the next review.
          </p>
        )}
        <div className="qms-dialog-actions">
          <button type="button" className="qms-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="qms-btn primary" disabled={!ready}>Continue to sign</button>
        </div>
      </form>
    </DialogPanel>
  );
}

/** Record a review: the decision, then the signature. `onRecorded` runs once the server has committed it. */
export function RecordPeriodicReview({ row, signer, onClose, onRecorded }: {
  row: ReviewDueRow; signer: EsignSigner | undefined; onClose: () => void; onRecorded: () => void;
}) {
  const [decision, setDecision] = React.useState<QmsPeriodicReviewDecision | null>(null);
  if (!decision) return <ReviewDecision row={row} onClose={onClose} onContinue={setDecision} />;
  const attests = decision.outcome === 'current'
    ? `You attest that v${row.version} remains current. Next periodic review: ${formatDate(decision.nextReviewDate)}. The document and its approval are not changed.`
    : `You attest that v${row.version} needs a revision. It stays due for review until a revised version is approved.`;
  return (
    <EsignModal
      open
      action="Record periodic review"
      target={`${row.docNumber} ${row.title} (v${row.version})`}
      targetMeta={attests}
      defaultMeaning="review"
      meanings={['review']}
      signer={signer}
      onClose={onClose}
      onSign={async (input) => {
        const manifest = await postQmsPeriodicReview(row.id, decision, input);
        onRecorded();
        return manifest;
      }}
    />
  );
}
