/**
 * The register's Periodic review panel, and the signed act that records a
 * review (gap 5.2; docs/design/QMS_PERIODIC_REVIEW_SIGNED_2026-10-22.md).
 *
 * Each row opens the document to read, as before. An effective document also
 * offers Record review, here and on its register row (so a document whose next
 * review is beyond this panel's window can still be reviewed again): the
 * reviewer says whether the version in force remains current, with the next
 * review date, or requires revision, then signs with meaning `review` in the
 * shared EsignModal. The review changes nothing on the document: its next
 * review date is part of what its approval signed
 * (server/services/qms/periodic-review.ts), so the review is the signature.
 * The last review (who, when in UTC, the outcome, and the reason when a
 * revision is required) is shown on the panel row and the register row.
 *
 * A document under revision offers no review: approving the revision sets the
 * next one. The server refuses anyone without signing authority, as it does
 * the approval, and a version whose approval no longer stands.
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

export const PERIODIC_REVIEW_HEADING_ID = 'qms-periodic-review-heading';

/** The reviewer's own calendar day, `offsetDays` from today: the picker's bounds are local, not UTC. */
function localDay(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "2026-10-22 09:12 UTC": signature times are shown as recorded, in UTC (§11.50(a)(2)). */
function utcMinute(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso) ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : iso;
}

/** "v1.0 reviewed 2026-10-22 09:12 UTC by R. Reviewer: remains current" — the last signed review of the version in force. */
export function lastReviewText(review: PeriodicReviewSummary): string {
  const by = review.reviewerName ? `by ${review.reviewerName}` : `by a reviewer not recorded (signature ${review.signatureId})`;
  const decided = review.outcome === 'current' ? 'remains current' : 'requires revision';
  return `v${review.version} reviewed ${utcMinute(review.reviewedAt)} ${by}: ${decided}`;
}

/** The last review, with its reason when a revision is required: that reason is what needs revising. */
export function lastReviewLine(review: PeriodicReviewSummary): string {
  const reason = review.outcome === 'revision-required' && review.reason ? ` Reason: ${review.reason}` : '';
  return `${lastReviewText(review)}.${reason}`;
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
  onRecord: (row: ReviewDueRow, trigger: HTMLElement) => void;
}) {
  return (
    <section className="qms-sec" data-periodic-review-panel="">
      <div className="qms-sec-head">
        <h2 id={PERIODIC_REVIEW_HEADING_ID} tabIndex={-1}>Periodic review</h2>
        {!unread && <span className="meta">{overdueCount} overdue · {rows.length - overdueCount} due within 120 days</span>}
      </div>
      <div className="qms-review" role="list" aria-labelledby={PERIODIC_REVIEW_HEADING_ID}>
        {failed && <ErrorState title="Periodic review dates could not be read" message={error} retry={retry} testId="sop-review-failed" />}
        {unread && !failed && <div className="qms-empty" role="status">Loading review dates…</div>}
        {!unread && rows.length === 0 && <div className="qms-empty">No documents due for review.</div>}
        {rows.map((r) => <ReviewRow key={r.id} row={r} canOpen={canOpen(r.id)} onOpen={onOpen} onRecord={onRecord} />)}
      </div>
    </section>
  );
}

function ReviewRow({ row: r, canOpen, onOpen, onRecord }: {
  row: ReviewDueRow; canOpen: boolean; onOpen: (documentId: number) => void; onRecord: (row: ReviewDueRow, trigger: HTMLElement) => void;
}) {
  const lastId = `qms-review-last-${r.id}`;
  const described = r.lastReview || r.underRevision ? lastId : undefined;
  return (
    <div className="qms-review-row" role="listitem" data-overdue={r.overdue || undefined} data-testid="qms-review-row">
      <button
        className="qms-review-open"
        aria-label={`Open ${r.docNumber} ${r.title} for its periodic review (${r.overdue ? `overdue since ${formatDate(r.nextReviewDate)}` : `due ${formatDate(r.nextReviewDate)}`})`}
        aria-describedby={described}
        title="Open the document to read it."
        disabled={!canOpen}
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
          aria-describedby={described}
          title="Record the review with your electronic signature. The document and its approval are not changed."
          onClick={(event) => onRecord(r, event.currentTarget)}
        >
          {I.check} Record review
        </button>
      )}
      {described && (
        <span className="qms-review-last" id={lastId}>
          {r.lastReview ? lastReviewLine(r.lastReview) : null}
          {r.lastReview && r.underRevision ? ' ' : null}
          {r.underRevision ? 'Revision open. Approving the revision sets the next review date.' : null}
        </span>
      )}
    </div>
  );
}

/** Step one: what the reviewer decided. Nothing is sent until the signature. */
function ReviewDecision({ row, onClose, onContinue }: {
  row: ReviewDueRow; onClose: () => void; onContinue: (decision: QmsPeriodicReviewDecision) => void;
}) {
  const [outcome, setOutcome] = React.useState<QmsPeriodicReviewDecision['outcome']>('current');
  const [date, setDate] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);
  const earliest = localDay(1);
  const latest = localDay(5 * 365);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (outcome === 'revision-required') { onContinue({ outcome }); return; }
    if (date >= earliest && date <= latest) { onContinue({ outcome, nextReviewDate: date }); return; }
    setError(date ? `Enter a next review date from ${earliest} to ${latest}.` : 'Enter the next review date.');
    dateRef.current?.focus();
  };
  return (
    <DialogPanel title="Record periodic review" onClose={onClose} busy={false}>
      <p>
        {row.docNumber} {row.title}. You are reviewing v{row.version}, the version in force. You sign the review in the
        next step. It does not change the document or its approval.
      </p>
      <form onSubmit={submit} noValidate>
        <fieldset className="qms-dialog-choice">
          <legend>Review outcome</legend>
          <label>
            <input type="radio" name="qms-review-outcome" value="current" checked={outcome === 'current'} onChange={() => setOutcome('current')} />
            Remains current
          </label>
          <label>
            <input type="radio" name="qms-review-outcome" value="revision-required" checked={outcome === 'revision-required'}
              onChange={() => { setOutcome('revision-required'); setError(null); }} />
            Revision required
          </label>
        </fieldset>
        {outcome === 'current' ? (
          <>
            <label>Next periodic review
              <input ref={dateRef} type="date" value={date} min={earliest} max={latest} required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'qms-review-date-hint qms-review-date-error' : 'qms-review-date-hint'}
                onChange={(event) => { setDate(event.target.value); setError(null); }} />
            </label>
            <p className="qms-dialog-hint" id="qms-review-date-hint">
              Enter a date after today and within five years. The register lists the document as due from this date.
            </p>
            {error && <div role="alert" id="qms-review-date-error">{error}</div>}
          </>
        ) : (
          <p className="qms-dialog-hint">
            The document keeps the review date its approval set{row.signedReviewDate ? ` (${formatDate(row.signedReviewDate)})` : ''}.
            Recording this does not open a revision; open one with Revise in the register. Approving the revision sets the next
            review date.
          </p>
        )}
        <div className="qms-dialog-actions">
          <button type="button" className="qms-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="qms-btn primary">Continue to sign</button>
        </div>
      </form>
    </DialogPanel>
  );
}

function attestationOf(row: ReviewDueRow, decision: QmsPeriodicReviewDecision) {
  if (decision.outcome === 'current') {
    return {
      meta: `You attest that v${row.version} remains current. Next periodic review: ${formatDate(decision.nextReviewDate)}. The document and its approval are not changed.`,
      rows: [{ label: 'Version', value: `v${row.version}` }, { label: 'Outcome', value: 'Remains current' },
        { label: 'Next periodic review', value: formatDate(decision.nextReviewDate) }],
    };
  }
  return {
    meta: `You attest that v${row.version} requires revision. The document, its approval and its review date are not changed. Approving a revision sets the next review date.`,
    rows: [{ label: 'Version', value: `v${row.version}` }, { label: 'Outcome', value: 'Revision required' }],
  };
}

/**
 * Record a review: the decision, then the signature. `onRecorded` runs once
 * the server has committed it; `onRefused` when the server refused it as the
 * document now stands (it is under revision, or no longer effective), so the
 * register is read again rather than offering the same refused review.
 */
export function RecordPeriodicReview({ row, signer, onClose, onRecorded, onRefused }: {
  row: ReviewDueRow; signer: EsignSigner | undefined; onClose: () => void; onRecorded: () => void; onRefused: () => void;
}) {
  const [decision, setDecision] = React.useState<QmsPeriodicReviewDecision | null>(null);
  if (!decision) return <ReviewDecision row={row} onClose={onClose} onContinue={setDecision} />;
  const attested = attestationOf(row, decision);
  return (
    <EsignModal
      open
      action="Record periodic review"
      target={`${row.docNumber} ${row.title} (v${row.version})`}
      targetMeta={attested.meta}
      signedRows={attested.rows}
      defaultMeaning="review"
      meanings={['review']}
      signer={signer}
      onClose={onClose}
      onSign={async (input) => {
        try {
          const manifest = await postQmsPeriodicReview(row.id, decision, input);
          onRecorded();
          return manifest;
        } catch (err) {
          if ((err as { status?: unknown } | null)?.status === 409) onRefused();
          throw err;
        }
      }}
    />
  );
}

/**
 * Who is being reviewed, and where focus goes when the review closes: back to
 * the control that opened it, or, once a review from the panel is recorded
 * (its row may leave the panel as the register refreshes), to the panel's
 * heading. Run after every unmount of the commit, so the dialogs' own focus
 * restoration cannot override it.
 */
export function useRecordPeriodicReview() {
  const [row, setRow] = React.useState<ReviewDueRow | null>(null);
  const focusAfter = React.useRef<{ trigger: HTMLElement | null; recorded: boolean } | null>(null);
  React.useEffect(() => {
    if (row || !focusAfter.current) return;
    const { trigger, recorded } = focusAfter.current;
    focusAfter.current = null;
    const inPanel = !!trigger?.closest('[data-periodic-review-panel]');
    const target = trigger?.isConnected && !(recorded && inPanel) ? trigger : document.getElementById(PERIODIC_REVIEW_HEADING_ID);
    target?.focus();
  }, [row]);
  return {
    row,
    start: (next: ReviewDueRow, trigger: HTMLElement) => { focusAfter.current = { trigger, recorded: false }; setRow(next); },
    close: () => setRow(null),
    recorded: () => { if (focusAfter.current) focusAfter.current.recorded = true; },
  };
}
