/**
 * Reassign one member's assignment on an open review route (RR3 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.10; findings M3, M6): a sheet at
 * a phone's width. It offers the people the reassignment would admit for the
 * member's role (the subject's candidates read, asked `?for=reassign`, which is
 * the server's one validator), says why the others are not offered, and asks
 * for the reason. The server validates again under the subject's lock and
 * refuses in its own words.
 *
 * Moved out of v2/surfaces/VaultRouteReassign.tsx in RR5 so the Vault version
 * and the Authoring document (AuthoringReviewRound.tsx) reassign through one
 * sheet; the subject gives its candidates read, its act and where the act is
 * recorded. Its test ids are the ones the Vault's tests have always used.
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { useLiveData } from '../dataConnect';
import { PeoplePicker, ReasonField, reviewReasonProblem, type PickerOption } from '../editor/reviewFields';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { isRouteCandidates, type RouteCandidatesShape } from './routeCandidates';
import { nameOf, work } from './routeText';
import type { RouteMemberView } from './routeRound';
import { NotOfferedForRole } from './AddReviewer';

/** What Reassign is waiting for, in words; empty when it can be confirmed. */
export function reassignMissing(to: string | null, reason: string): string[] {
  const missing: string[] = [];
  if (!to) missing.push('Choose who takes it over.');
  const problem = reviewReasonProblem(reason);
  if (problem) missing.push(problem);
  return missing;
}

/** Who may take the assignment over, read when the sheet opens; an unread list offers no one, and says so. */
function useCandidates(url: string) {
  const [epoch, setEpoch] = useState(0);
  const live = useLiveData<RouteCandidatesShape>(url, [url, epoch], isRouteCandidates);
  return { loading: live.loading, data: live.loading ? null : live.data, again: () => setEpoch((n) => n + 1) };
}

export function RouteReassignSheet({ member, title, candidatesUrl, audit, post, onClose, onDone }: {
  member: RouteMemberView;
  title: string;
  /** The subject's candidates read, asked as a reassignment (`?for=reassign`). */
  candidatesUrl: string;
  /** Where the act is recorded, in words ("this version’s audit trail"). */
  audit: string;
  post: (body: { taskId: string; assigneeId: number; reason: string }) => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const live = useCandidates(candidatesUrl);
  const data = live.data;
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog(() => { if (!busy) onClose(); });
  const missing = reassignMissing(to, reason);
  const canConfirm = !busy && data !== null && missing.length === 0;
  const name = nameOf(member);
  const task = work(member.role);
  const run = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await post({ taskId: member.taskId, assigneeId: Number(to), reason: reason.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assignment was not reassigned.');
    } finally {
      setBusy(false);
    }
  };
  const options: PickerOption[] = (data?.candidates ?? []).filter((c) => c[member.role] === null).map((c) => ({ id: String(c.id), label: c.name }));
  return (
    <div className="de-bd de-sheet" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="vr-reassign-title" data-testid="vault-route-reassign">
        <div className="de-h">
          <div>
            <div className="de-h-eye">Review route</div>
            <div className="de-h-t" id="vr-reassign-title">{`Reassign ${name}’s ${task}`}</div>
            <div className="de-h-s">{title}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
        </div>
        <div className="de-body">
          <div className="de-gov"><span className="ico">{I.lock}</span><span className="de-gov-t">
            {`The ${task} keeps its place on the route. ${name} is told it was reassigned and why, and the person you choose is asked to ${member.role === 'reviewer' ? 'review' : 'approve'} it. Both names and your reason are recorded on ${audit}.`}
          </span></div>
          {live.loading ? <div className="de-desc" role="status">Reading who may take it over…</div> : null}
          {!live.loading && data === null ? (
            <div className="de-field">
              <div className="de-err" role="alert">Who may take it over could not be read, so no one can be chosen.</div>
              <button type="button" className="de-btn ghost" onClick={live.again}>Read it again</button>
            </div>
          ) : null}
          {data ? (
            <>
              <fieldset className="de-field" data-testid="vr-reassign-to">
                <legend className="de-label">{`New ${member.role}`}<span className="req">*</span></legend>
                <div className="de-desc">Only members the route would admit for this {task} are listed.</div>
                <PeoplePicker name="vr-reassign" multiple={false} searchLabel={`Find the new ${member.role}`} testIdPrefix="vr-reassign"
                  options={options} selected={to ? [to] : []} onChange={(ids) => setTo(ids[0] ?? null)} />
              </fieldset>
              <NotOfferedForRole candidates={data.candidates} role={member.role} />
            </>
          ) : null}
          <ReasonField id="vr-reassign-reason" label="Reason for reassigning"
            note={`Recorded on ${audit} and given to ${name}. At least ${GOVERNED_REASON_MIN} characters.`}
            value={reason} onChange={setReason} testId="vr-reassign-reason" />
          {missing.length > 0 ? <div className="de-desc" id="vr-reassign-note" data-testid="vr-reassign-note">{missing.join(' ')}</div> : null}
          {error ? <div className="de-err" role="alert" data-testid="vr-reassign-error">{error}</div> : null}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="de-btn primary" onClick={() => void run()} disabled={!canConfirm}
            aria-describedby={missing.length ? 'vr-reassign-note' : undefined} data-testid="vr-reassign-confirm">
            {busy ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}
