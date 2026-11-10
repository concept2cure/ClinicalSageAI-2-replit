/**
 * ReviewActions — a management review's actions (ICH Q10 §2.6), opened from
 * its row. The actions live in the review's `outputs.actions`, so the list is
 * the row's own: nothing is read separately. Closing an action takes a closure
 * note and is the server's audited write
 * (POST /api/mdx/qms/management-reviews/:id/actions/:n/close).
 *
 * @module client/src/concept2cure/quality/ReviewActions
 */

import * as React from 'react';
import { C2CForm } from '../v2/C2CForm';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { EmptyState } from '../v2/dataConnect';
import { formatDate } from './data';
import { pill } from './qmsRegisterKit';
import { closeReviewAction, reviewActions, type ManagementReviewRow, type ReviewAction } from './qmsRecordData';

export function ReviewActions({ review, onChanged }: { review: ManagementReviewRow; onChanged: (confirmation?: string) => void }) {
  const actions = reviewActions(review);
  const [closing, setClosing] = React.useState<ReviewAction | null>(null);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const writing = React.useRef(false);

  const close = async (note: string) => {
    if (!closing || writing.current) return;
    if (note.length < GOVERNED_REASON_MIN) {
      setRefusal(`Not recorded — a closure note of at least ${GOVERNED_REASON_MIN} characters is required.`);
      return;
    }
    writing.current = true;
    setRefusal(null);
    try {
      await closeReviewAction(review.id, closing.n, note);
      // The confirmation is the register's toast (C3), not a line that unmounts with this detail.
      const done = `Action ${closing.n} was closed.`;
      setClosing(null);
      onChanged(done);
    } catch (err) {
      setRefusal(`Not recorded — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      writing.current = false;
    }
  };

  return (
    <>
      <div className="qcc-detail-head">
        <span className="qcc-detail-title">Action items</span>
      </div>
      {actions.length === 0 ? (
        <EmptyState title="No actions recorded for this review. Add one with Add action." />
      ) : (
        <table className="reg-tbl qcc-action-tbl" aria-label={`Action items of the ${review.period} management review`}>
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Action</th><th scope="col">Owner · due</th><th scope="col">State</th>
              <th scope="col"><span className="sr-only">Moves</span></th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.n}>
                <td className="mono">{a.n}</td>
                <td className="qms-title" title={a.closureNote ? `${a.description} — closed: ${a.closureNote}` : a.description}>{a.description}</td>
                <td>{[a.owner, a.dueDate ? `due ${formatDate(a.dueDate)}` : null, a.closedAt ? `closed ${formatDate(a.closedAt)}` : null].filter(Boolean).join(' · ') || '—'}</td>
                <td>{pill(a.state === 'closed' ? 'effective' : 'review', a.state === 'closed' ? 'Closed' : 'Open')}</td>
                <td>
                  <div className="qms-rowacts">
                    {a.state === 'open' && (
                      <button type="button" className="btn ghost small" aria-label={`Close action ${a.n}`}
                        onClick={() => { setRefusal(null); setClosing(a); }}>
                        Close
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {closing && (
        <C2CForm
          config={{
            eyebrow: `Management review ${review.period}`,
            title: `Close action ${closing.n}`,
            sub: closing.description,
            governed: 'The closure and its note are written to the audit trail under your name.',
            submitLabel: 'Close action',
            ...(refusal ? { notice: refusal } : {}),
            fields: [{ key: 'closureNote', label: 'How it was closed', type: 'textarea', rows: 3, required: true, desc: `At least ${GOVERNED_REASON_MIN} characters, recorded verbatim.` }],
          }}
          onCancel={() => setClosing(null)}
          onSubmit={(v) => void close(v.closureNote.trim())}
        />
      )}
    </>
  );
}
