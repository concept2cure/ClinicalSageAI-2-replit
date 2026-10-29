/**
 * Add a reviewer to an open review route (RR2 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.10), for any subject: the Vault's
 * round (v2/surfaces/VaultReviewRoute.tsx) and the register's
 * (quality/QmsReviewRoute.tsx) open this one sheet.
 *
 * The sender, or an administrator, picks one of the people the addition would
 * admit. The read is the subject's candidates with `?for=add`: the server's
 * validator, asked as the addition asks it. The sheet says why the others are
 * not offered, asks for a due date and a reason, and posts them. The server
 * validates again under the subject's lock and refuses in its own words. The
 * approvers are blocked again until the new reviewer has signed, and the sheet
 * says so before it is confirmed.
 *
 * NotOfferedForRole (who is not offered for one role, and why) moved here from
 * VaultRouteReassign.tsx unchanged; the reassign sheet and this one both use it.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { useLiveData } from '../dataConnect';
import { DueDateField, PeoplePicker, ReasonField, reviewReasonProblem } from '../editor/reviewFields';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { isRouteCandidates, type RouteCandidatesShape, type RouteCandidateView } from './routeCandidates';
import { list } from './routeText';

/** The members not offered for this role, each with the validator's sentence. */
export function NotOfferedForRole({ candidates, role, testId = 'vr-reassign-not-offered' }: { candidates: RouteCandidateView[]; role: 'reviewer' | 'approver'; testId?: string }) {
  const out = candidates.filter((c) => c[role] !== null);
  if (out.length === 0) return null;
  return (
    <details className="de-field" data-testid={testId}>
      <summary className="de-desc">{out.length === 1 ? 'One member is not offered' : `${out.length} members are not offered`}, and why</summary>
      <ul className="vr-members">
        {out.map((c) => <li key={c.id} className="vr-member de-desc">{c[role]!.message}</li>)}
      </ul>
    </details>
  );
}

/** What Add is waiting for, in words; empty when it can be confirmed. */
export function addReviewerMissing(to: string | null, due: string, reason: string): string[] {
  const missing: string[] = [];
  if (!to) missing.push('Choose who reviews.');
  if (!due) missing.push('Give the date their review is due.');
  const problem = reviewReasonProblem(reason);
  if (problem) missing.push(problem);
  return missing;
}

const today = () => new Date().toISOString().slice(0, 10);

/** What adding does, said before it is confirmed. */
function addMeaning(sequential: boolean, waiting: string[], audit: string): string {
  const one = waiting.length === 1;
  const waits = waiting.length
    ? `${list(waiting)} ${one ? 'waits' : 'wait'} again until the new reviewer has signed, and ${one ? 'is' : 'are'} told why.`
    : 'The approval waits for their review too.';
  return `The person you choose reviews ${sequential ? 'after the last step, once it has signed' : 'beside the others'}. ${waits} Who you added, and your reason, are recorded on ${audit}.`;
}

/** Who may be added: the read, an unread list that offers no one, or the picker. */
function AddCandidates({ idPrefix, loading, data, to, setTo, again }: {
  idPrefix: string; loading: boolean; data: RouteCandidatesShape | null; to: string | null; setTo: (id: string | null) => void; again: () => void;
}) {
  if (loading) return <div className="de-desc" role="status">Reading who may review it…</div>;
  if (data === null) {
    return (
      <div className="de-field">
        <div className="de-err" role="alert">Who may review it could not be read, so no one can be chosen.</div>
        <button type="button" className="de-btn ghost" onClick={again}>Read it again</button>
      </div>
    );
  }
  const options = data.candidates.filter((c) => c.reviewer === null).map((c) => ({ id: String(c.id), label: c.name }));
  return (
    <>
      <fieldset className="de-field" data-testid={`${idPrefix}-to`}>
        <legend className="de-label">New reviewer<span className="req">*</span></legend>
        <div className="de-desc">Only members the route would admit as a reviewer are listed.</div>
        <PeoplePicker name={`${idPrefix}-to`} multiple={false} searchLabel="Find the new reviewer" testIdPrefix={idPrefix}
          options={options} selected={to ? [to] : []} onChange={(ids) => setTo(ids[0] ?? null)} />
      </fieldset>
      <NotOfferedForRole candidates={data.candidates} role="reviewer" testId={`${idPrefix}-not-offered`} />
    </>
  );
}

export function AddReviewerSheet({ idPrefix, testId, title, candidatesUrl, sequential, waitingApprovers, audit, post, onClose, onDone }: {
  /** The test-id stem of the sheet's controls ("vr-add", "qms-add"). */
  idPrefix: string;
  testId: string;
  title: string;
  /** The subject's candidates read, asked as an addition (`?for=add`). */
  candidatesUrl: string;
  /** One after another: the new reviewer is the last step. */
  sequential: boolean;
  /** The approvers whose turn had come, who wait again. */
  waitingApprovers: string[];
  /** Where the act is recorded, in words ("this version’s audit trail"). */
  audit: string;
  post: (body: { assigneeId: number; dueDate: string; reason: string }) => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [epoch, setEpoch] = useState(0);
  const read = useLiveData<RouteCandidatesShape>(candidatesUrl, [candidatesUrl, epoch], isRouteCandidates);
  const data = read.loading ? null : read.data;
  const [to, setTo] = useState<string | null>(null);
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog(() => { if (!busy) onClose(); });
  const missing = addReviewerMissing(to, due, reason);
  const canConfirm = !busy && data !== null && missing.length === 0;
  const run = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await post({ assigneeId: Number(to), dueDate: due, reason: reason.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The reviewer was not added.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="de-bd de-sheet" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${idPrefix}-title`} data-testid={testId}>
        <div className="de-h">
          <div>
            <div className="de-h-eye">Review route</div>
            <div className="de-h-t" id={`${idPrefix}-title`}>Add a reviewer</div>
            <div className="de-h-s">{title}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
        </div>
        <div className="de-body">
          <div className="de-gov"><span className="ico">{I.lock}</span><span className="de-gov-t">
            {addMeaning(sequential, waitingApprovers, audit)}
          </span></div>
          <AddCandidates idPrefix={idPrefix} loading={read.loading} data={data} to={to} setTo={setTo} again={() => setEpoch((n) => n + 1)} />
          <div className="vr-due">
            <DueDateField id={`${idPrefix}-due`} label="Review due" value={due} onChange={setDue} required min={today()} testId={`${idPrefix}-due`}
              note="The end of that day in the time zone of the person who sent the route; on or before the approval's date." />
          </div>
          <ReasonField id={`${idPrefix}-reason`} label="Reason for adding them"
            note={`Recorded on ${audit} and given to the people it affects. At least ${GOVERNED_REASON_MIN} characters.`}
            value={reason} onChange={setReason} testId={`${idPrefix}-reason`} />
          {missing.length > 0 ? <div className="de-desc" id={`${idPrefix}-note`} data-testid={`${idPrefix}-note`}>{missing.join(' ')}</div> : null}
          {error ? <div className="de-err" role="alert" data-testid={`${idPrefix}-error`}>{error}</div> : null}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="de-btn primary" onClick={() => void run()} disabled={!canConfirm}
            aria-describedby={missing.length ? `${idPrefix}-note` : undefined} data-testid={`${idPrefix}-confirm`}>
            {busy ? 'Adding…' : 'Add the reviewer'}
          </button>
        </div>
      </div>
    </div>
  );
}
