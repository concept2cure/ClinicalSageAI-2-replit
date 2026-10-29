/**
 * The naming acts on a Vault version's open review route (RR3 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.10, §2.12; findings M3, M6):
 *
 *   - ReassignDialog: the sender, or an administrator, gives a member's
 *     assignment that is not signed to another person. A sheet at a phone's
 *     width, offering the people the reassignment would admit for the
 *     member's role (the validator's own answers), saying why the others are
 *     not offered, and asking for the reason. The server validates again
 *     under the record's lock (POST …/review-route/reassign) and refuses in
 *     its own words.
 *   - The naming history (RouteHistory) moved to
 *     ../reviewRoute/RouteHistory.tsx in RR2, shared with the Quality
 *     register.
 *
 * Hand back is a reason-only act, so it is RouteActDialog's (VaultReviewRoute.tsx).
 */
import React, { useState } from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { PeoplePicker, ReasonField, reviewReasonProblem, type PickerOption } from '../editor/reviewFields';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { lifecyclePost } from './vaultLifecyclePost';
import { useRouteCandidates } from './vaultRouteCandidates';
import { nameOf, work } from '../reviewRoute/routeText';
import type { RouteMemberView } from '../reviewRoute/routeRound';
import { NotOfferedForRole } from '../reviewRoute/AddReviewer';

// ── Reassign (§2.10) ─────────────────────────────────────────────────────────

/** What Reassign is waiting for, in words; empty when it can be confirmed. */
export function reassignMissing(to: string | null, reason: string): string[] {
  const missing: string[] = [];
  if (!to) missing.push('Choose who takes it over.');
  const problem = reviewReasonProblem(reason);
  if (problem) missing.push(problem);
  return missing;
}

/**
 * Reassign one member's assignment: a sheet at a phone's width. It offers the
 * people the reassignment would admit for this member's role (the server's
 * validator, as the reassignment asks it), says why the others are not
 * offered, and asks for the reason. The server validates again under the
 * record's lock and refuses in its own words.
 */
export function ReassignDialog({ member, vaultId, canonicalId, title, onClose, onDone }: {
  member: RouteMemberView;
  vaultId: string;
  canonicalId: string;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const read = useRouteCandidates(vaultId, 'reassign');
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog(() => { if (!busy) onClose(); });
  const missing = reassignMissing(to, reason);
  const canConfirm = !busy && read.data !== null && missing.length === 0;
  const name = nameOf(member);
  const task = work(member.role);
  const run = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(canonicalId)}/review-route/reassign`,
        { taskId: member.taskId, assigneeId: Number(to), reason: reason.trim() }, 'The assignment was not reassigned.');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assignment was not reassigned.');
    } finally {
      setBusy(false);
    }
  };
  const options: PickerOption[] = (read.data?.candidates ?? []).filter((c) => c[member.role] === null).map((c) => ({ id: String(c.id), label: c.name }));
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
            {`The ${task} keeps its place on the route. ${name} is told it was reassigned and why, and the person you choose is asked to ${member.role === 'reviewer' ? 'review' : 'approve'} it. Both names and your reason are recorded on this version’s audit trail.`}
          </span></div>
          {read.loading ? <div className="de-desc" role="status">Reading who may take it over…</div> : null}
          {!read.loading && read.data === null ? (
            <div className="de-field">
              <div className="de-err" role="alert">Who may take it over could not be read, so no one can be chosen.</div>
              <button type="button" className="de-btn ghost" onClick={read.again}>Read it again</button>
            </div>
          ) : null}
          {read.data ? (
            <>
              <fieldset className="de-field" data-testid="vr-reassign-to">
                <legend className="de-label">{`New ${member.role}`}<span className="req">*</span></legend>
                <div className="de-desc">Only members the route would admit for this {task} are listed.</div>
                <PeoplePicker name="vr-reassign" multiple={false} searchLabel={`Find the new ${member.role}`} testIdPrefix="vr-reassign"
                  options={options} selected={to ? [to] : []} onChange={(ids) => setTo(ids[0] ?? null)} />
              </fieldset>
              <NotOfferedForRole candidates={read.data.candidates} role={member.role} />
            </>
          ) : null}
          <ReasonField id="vr-reassign-reason" label="Reason for reassigning"
            note={`Recorded on this version’s audit trail and given to ${name}. At least ${GOVERNED_REASON_MIN} characters.`}
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
