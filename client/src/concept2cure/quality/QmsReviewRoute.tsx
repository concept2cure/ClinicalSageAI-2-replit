/**
 * The review route on a QMS controlled document, in the register (RR4 of
 * docs/design/REVIEW_ROUTING_2026-10-23.md, §2.7–§2.12; NEW-4 and D-Q).
 *
 *   - QmsRouteForm: Send for review names one QMS approver (required) and any
 *     reviewers (optional), each from a searchable list of the members the
 *     send would admit (GET …/route-candidates, validateRouteMember's own
 *     answers: a QMS approver is a designated one), the due dates (the end of
 *     each day in the sender's time zone, which it names) and the reason.
 *     Send stays disabled, and says why, until all of it is given. A sheet at
 *     a phone's width. Built from the RR1b form components
 *     (v2/editor/reviewFields.tsx), not a copy of them.
 *   - QmsRoutePanel: every named member, one per line, in the Vault round's
 *     words (memberLine, routeHeadline, RouteHistory); and, for the reader,
 *     what the route lets them do: sign the review, approve, return for
 *     revision, hand back, withdraw, reassign, remind. A route that could not
 *     be read says so, never "no reviewers".
 *
 * Nothing here decides who may sign: the route and its verified signatures
 * do, on the server, which refuses anyone else before the credential.
 *
 * @module client/src/concept2cure/quality/QmsReviewRoute
 */
import React, { useState } from 'react';
import { I } from '../v2/icons';
import { useDialog } from '../v2/useDialog';
import { useLiveData } from '../v2/dataConnect';
import { DueDateField, PeoplePicker, ReasonField, reviewReasonProblem, type PickerOption } from '../v2/editor/reviewFields';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { EsignModal, type EsignSigner } from '../_shared/components/EsignModal';
import { memberLine, routeHeadline } from '../v2/surfaces/VaultReviewRoute';
import { RouteHistory } from '../v2/surfaces/VaultRouteReassign';
import { isRouteCandidates, type RouteCandidatesShape, type RouteCandidateView } from '../v2/surfaces/vaultRouteCandidates';
import { nameOf, utc } from '../v2/surfaces/vaultRouteText';
import {
  myTurn, postQmsReviewSignature, postQmsRouteAct, qmsRouteFormMissing, reassignQmsMember, remindQmsMember, resendQmsRoute,
  sendQmsForReview, type QmsRouteAct, type QmsRouteFormInput, type QmsRouteView, type RouteMemberView,
} from './qmsReviewRoute';

export interface QmsRouteDoc { id: number; docNumber: string; title: string; version: string }
const label = (d: QmsRouteDoc) => `${d.docNumber} ${d.title} v${d.version}`;
const today = () => new Date().toISOString().slice(0, 10);

/** Who may be named on this document, read when the form opens; an unread list offers no one, and says so. */
function useQmsCandidates(id: number, purpose: 'send' | 'reassign') {
  const [epoch, setEpoch] = useState(0);
  const read = useLiveData<RouteCandidatesShape>(
    purpose === 'reassign' ? `/api/mdx/qms/documents/${id}/route-candidates?for=reassign` : `/api/mdx/qms/documents/${id}/route-candidates`,
    [id, purpose, epoch], isRouteCandidates);
  return { loading: read.loading, data: read.loading ? null : read.data, again: () => setEpoch((n) => n + 1) };
}

/**
 * The approver list also shows, disabled with the validator's reason, the
 * members who may review but not approve (not one of the organization's QMS
 * approvers, or a reviewer of this content), so the sender sees why someone
 * with the Approver role is not offered.
 */
function approverOptions(candidates: RouteCandidateView[], reviewers: string[]): PickerOption[] {
  const refused = candidates.filter((c) => c.approver !== null && c.reviewer === null)
    .map((c) => ({ id: String(c.id), label: c.name, note: c.approver!.message, disabled: true }));
  return [...optionsFor(candidates, 'approver', reviewers, 'Chosen as a reviewer.'), ...refused];
}

function optionsFor(candidates: RouteCandidateView[], role: 'reviewer' | 'approver', takenElsewhere: string[], elsewhere: string): PickerOption[] {
  return candidates.filter((c) => c[role] === null).map((c) => {
    const id = String(c.id);
    return takenElsewhere.includes(id) ? { id, label: c.name, note: elsewhere, disabled: true } : { id, label: c.name };
  });
}

/** The members offered in neither role, each with the validator's reason. */
function NotOffered({ candidates }: { candidates: RouteCandidateView[] }) {
  const out = candidates.filter((c) => c.reviewer !== null && c.approver !== null);
  if (out.length === 0) return null;
  return (
    <details className="de-field" data-testid="qms-route-not-offered">
      <summary className="de-desc">{out.length === 1 ? 'One member is not offered' : `${out.length} members are not offered`}, and why</summary>
      <ul className="vr-members">{out.map((c) => <li key={c.id} className="vr-member de-desc">{c.approver!.message}</li>)}</ul>
    </details>
  );
}

/** A governed sheet: the shell every dialog here shares (useDialog, a bottom sheet at a phone's width). */
function Sheet({ title, sub, testId, busy, onClose, children, footer }: {
  title: string; sub: string; testId: string; busy: boolean; onClose: () => void; children: React.ReactNode; footer: React.ReactNode;
}) {
  const ref = useDialog(() => { if (!busy) onClose(); });
  return (
    <div className="de-bd de-sheet" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} data-testid={testId}>
        <div className="de-h">
          <div>
            <div className="de-h-eye">Review route</div>
            <div className="de-h-t" id={`${testId}-title`}>{title}</div>
            <div className="de-h-s">{sub}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
        </div>
        <div className="de-body">{children}</div>
        <div className="de-f">{footer}</div>
      </div>
    </div>
  );
}

/** Send for review (or name reviewers on a document already in review): one QMS approver, optional reviewers, dates and a reason. */
export function QmsRouteForm({ doc, mode, onClose, onSent }: { doc: QmsRouteDoc; mode: 'send' | 'resend'; onClose: () => void; onSent: () => void }) {
  const read = useQmsCandidates(doc.id, 'send');
  const [f, setF] = useState<QmsRouteFormInput>({ reviewers: [], approver: null, reviewDue: '', approvalDue: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<QmsRouteFormInput>) => setF((x) => ({ ...x, ...patch }));
  const missing = qmsRouteFormMissing(f);
  const canSend = !busy && read.data !== null && missing.length === 0;
  const action = mode === 'send' ? 'Send for review' : 'Name reviewers';
  const send = async () => {
    if (!canSend) return;
    setBusy(true); setError(null);
    try {
      await (mode === 'send' ? sendQmsForReview : resendQmsRoute)(doc.id, f);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The document was not sent for review.');
    } finally { setBusy(false); }
  };
  const c = read.data?.candidates ?? [];
  return (
    <Sheet title={action} testId="qms-route-form" busy={busy} onClose={onClose}
      sub={`${label(doc)}. The route covers this version's controlled text as it is now; the QMS approver's signature makes it effective once every reviewer named has signed.`}
      footer={<>
        <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="de-btn primary" onClick={() => void send()} disabled={!canSend}
          aria-describedby={missing.length ? 'qms-route-note' : undefined} data-testid="qms-route-send">{busy ? 'Sending…' : action}</button>
      </>}>
      {read.loading ? <div className="de-desc" role="status">Reading who may review and approve this document…</div> : null}
      {!read.loading && read.data === null ? (
        <div className="de-field">
          <div className="de-err" role="alert">Who may review and approve this document could not be read, so no one can be chosen.</div>
          <button type="button" className="de-btn ghost" onClick={read.again}>Read it again</button>
        </div>
      ) : null}
      {read.data ? <>
        <fieldset className="de-field" data-testid="qms-route-approver">
          <legend className="de-label">QMS approver<span className="req">*</span></legend>
          <div className="de-desc">One of this organization's QMS approvers. Their signature makes the document effective.</div>
          <PeoplePicker name="qms-route-approver" multiple={false} searchLabel="Find the QMS approver" testIdPrefix="qms-approver"
            options={approverOptions(c, f.reviewers)} selected={f.approver ? [f.approver] : []}
            onChange={(ids) => set({ approver: ids[0] ?? null })} />
        </fieldset>
        <fieldset className="de-field" data-testid="qms-route-reviewers">
          <legend className="de-label">Reviewers <span className="de-desc">(optional)</span></legend>
          <div className="de-desc">Each reviewer named signs the review before the approval.</div>
          <PeoplePicker name="qms-route-reviewers" multiple searchLabel="Find a reviewer" testIdPrefix="qms-reviewer"
            options={optionsFor(c, 'reviewer', f.approver ? [f.approver] : [], 'Chosen as the QMS approver.')} selected={f.reviewers}
            onChange={(ids) => set({ reviewers: ids })} />
        </fieldset>
        <NotOffered candidates={c} />
        <div className="vr-due">
          {f.reviewers.length > 0 ? <DueDateField id="qms-review-due" label="Reviews due" value={f.reviewDue} onChange={(v) => set({ reviewDue: v })}
            required min={today()} testId="qms-review-due" /> : null}
          <DueDateField id="qms-approval-due" label="Approval due" value={f.approvalDue} onChange={(v) => set({ approvalDue: v })}
            required min={f.reviewDue || today()} testId="qms-approval-due" />
        </div>
        <div className="de-desc" data-testid="qms-route-zone">Each date is the end of that day in {read.data.timeZone}, your notification time zone.</div>
        <ReasonField id="qms-route-reason" label="Reason for sending" value={f.reason} onChange={(v) => set({ reason: v })}
          note={`Recorded on this document's audit trail with who you named. At least ${GOVERNED_REASON_MIN} characters.`}
          placeholder="e.g. Ready for QA review before the site rollout." testId="qms-route-reason" />
        {missing.length > 0 ? <div className="de-desc" id="qms-route-note" data-testid="qms-route-note">{missing.join(' ')}</div> : null}
      </> : null}
      {error ? <div className="de-err" role="alert" data-testid="qms-route-error">{error}</div> : null}
    </Sheet>
  );
}

const ACT_TEXT: Record<QmsRouteAct, { label: string; reason: string; meaning: string }> = {
  return: { label: 'Return for revision', reason: 'Reason for returning it',
    meaning: 'The document goes back to draft, the route closes, every member who has not signed is told, and so is its sender. Signatures already given stay on the record.' },
  withdraw: { label: 'Withdraw the route', reason: 'Reason for withdrawing',
    meaning: 'The route closes and every member who has not signed is told. The document stays under review, and nothing is signed on it until a new route is named.' },
  'hand-back': { label: 'Hand back', reason: 'Why you cannot do it',
    meaning: 'Your assignment goes back to the person who sent this route, who is told and reassigns it. You stay named, and sign nothing on it, until they do.' },
};

function ActDialog({ act, doc, onClose, onDone }: { act: QmsRouteAct; doc: QmsRouteDoc; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = reviewReasonProblem(reason);
  const t = ACT_TEXT[act];
  const run = async () => {
    if (problem || busy) return;
    setBusy(true); setError(null);
    try { await postQmsRouteAct(act, doc.id, reason); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nothing was changed.'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title={t.label} sub={label(doc)} testId={`qms-act-${act}`} busy={busy} onClose={onClose}
      footer={<>
        <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="de-btn primary" onClick={() => void run()} disabled={problem !== null || busy} data-testid="qms-act-confirm">{busy ? 'Recording…' : t.label}</button>
      </>}>
      <div className="de-gov"><span className="ico">{I.lock}</span><span className="de-gov-t">{t.meaning}</span></div>
      <ReasonField id="qms-act-reason" label={t.reason} value={reason} onChange={setReason} testId="qms-act-reason"
        note={`Recorded on this document's audit trail and given to the people on the route. At least ${GOVERNED_REASON_MIN} characters.`} />
      {problem ? <div className="de-desc">{problem}</div> : null}
      {error ? <div className="de-err" role="alert" data-testid="qms-act-error">{error}</div> : null}
    </Sheet>
  );
}

function ReassignDialog({ doc, member, onClose, onDone }: { doc: QmsRouteDoc; member: RouteMemberView; onClose: () => void; onDone: () => void }) {
  const read = useQmsCandidates(doc.id, 'reassign');
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = reviewReasonProblem(reason);
  const ready = !busy && to !== null && problem === null;
  const run = async () => {
    if (!ready) return;
    setBusy(true); setError(null);
    try { await reassignQmsMember(doc.id, member.taskId, Number(to), reason); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Nothing was changed.'); }
    finally { setBusy(false); }
  };
  const options = optionsFor(read.data?.candidates ?? [], member.role, [], '');
  return (
    <Sheet title={`Reassign ${nameOf(member)}'s ${member.role === 'reviewer' ? 'review' : 'approval'}`} sub={label(doc)} testId="qms-route-reassign"
      busy={busy} onClose={onClose}
      footer={<>
        <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="de-btn primary" onClick={() => void run()} disabled={!ready} data-testid="qms-reassign-confirm">{busy ? 'Reassigning…' : 'Reassign'}</button>
      </>}>
      {read.loading ? <div className="de-desc" role="status">Reading who may take this assignment…</div> : null}
      {!read.loading && read.data === null ? <div className="de-err" role="alert">Who may take this assignment could not be read, so no one can be chosen.</div> : null}
      {read.data ? <fieldset className="de-field">
        <legend className="de-label">Give it to<span className="req">*</span></legend>
        <PeoplePicker name="qms-reassign-to" multiple={false} searchLabel="Find a person" testIdPrefix="qms-reassign" options={options}
          selected={to ? [to] : []} onChange={(ids) => setTo(ids[0] ?? null)} />
      </fieldset> : null}
      <ReasonField id="qms-reassign-reason" label="Reason for reassigning" value={reason} onChange={setReason} testId="qms-reassign-reason"
        note={`Recorded on this document's audit trail; both people are told. At least ${GOVERNED_REASON_MIN} characters.`} />
      {error ? <div className="de-err" role="alert" data-testid="qms-reassign-error">{error}</div> : null}
    </Sheet>
  );
}

type Open = { kind: 'act'; act: QmsRouteAct } | { kind: 'reassign'; member: RouteMemberView } | { kind: 'sign' } | { kind: 'resend' } | null;

/** What the reader may do on this route, in the order offered. */
function readerActs(view: QmsRouteView, meId: number | null, admin: boolean) {
  const live = view.kind === 'live' ? view.round : null;
  const sender = live !== null && meId !== null && live.route.senderId === meId;
  const turn = myTurn(view, meId);
  const mine = live?.members.find((m) => m.userId === meId && m.outcome === 'pending') ?? null;
  return {
    sign: turn?.role === 'reviewer',
    approve: turn?.role === 'approver',
    returnIt: live !== null && (sender || turn !== null),
    handBack: mine !== null,
    withdraw: live !== null && (sender || admin),
    reassign: live !== null && (sender || admin),
    remind: sender,
    resend: view.kind === 'withdrawn' || view.kind === 'legacy',
  };
}

/** The document's round, and what the route lets the reader do. A sheet. */
export function QmsRoutePanel({ doc, view, meId, admin, signer, onClose, onChanged, onApprove }: {
  doc: QmsRouteDoc; view: QmsRouteView; meId: number | null; admin: boolean; signer: EsignSigner | undefined;
  onClose: () => void; onChanged: () => void; onApprove: () => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [note, setNote] = useState<string | null>(null);
  const can = readerActs(view, meId, admin);
  const done = () => { setOpen(null); onChanged(); };
  const round = view.kind === 'live' || view.kind === 'withdrawn' || view.kind === 'closed' ? view.round : null;
  return (
    <>
      <Sheet title="Review route" sub={label(doc)} testId="qms-route-panel" busy={false} onClose={onClose}
        footer={<button className="de-btn ghost" onClick={onClose}>Close</button>}>
        {view.kind === 'unread' ? <div className="de-err" role="alert">Reviewers could not be read. Reload the register to see who is named; nothing here means nobody is.</div> : null}
        {view.kind === 'legacy' ? <div className="de-desc" data-testid="qms-route-legacy">Sent for review before review routes: not assigned to one person. Any QMS approver who is not its author may approve it, until someone names reviewers.</div> : null}
        {round ? <span className="vr-round" data-testid="qms-route-round">
          <span className="vr-round-h" data-testid="qms-route-headline">{routeHeadline(round, meId)}</span>
          <span className="vr-round-m">{`Review route ${round.route.round} · sent by ${round.route.senderId === meId ? 'you' : round.route.senderName} · ${utc(round.route.createdAt)}`}</span>
          <ul className="vr-members" aria-label="Named on this review route">
            {round.members.map((m) => (
              <li key={m.taskId} className="vr-member" data-testid={`qms-route-member-${m.userId}`}>
                <span>{memberLine(m, round)}</span>
                {can.remind && round.route.status === 'open' && m.stepOpen && m.outcome === 'pending' ? (
                  <button type="button" className="sp-ask" aria-label={`Remind ${nameOf(m)}`} onClick={() => void remindQmsMember(m, label(doc)).then(setNote)}>Remind</button>
                ) : null}
                {can.reassign && (m.outcome === 'pending' || m.outcome === 'handed back') ? (
                  <button type="button" className="sp-ask" aria-label={`Reassign ${nameOf(m)}`} onClick={() => setOpen({ kind: 'reassign', member: m })}>Reassign</button>
                ) : null}
              </li>
            ))}
          </ul>
          <RouteHistory history={round.history} />
        </span> : null}
        {note ? <div className="de-desc" role="status">{note}</div> : null}
        <div className="qms-route-acts">
          {can.sign ? <button className="de-btn primary" data-testid="qms-route-sign" onClick={() => setOpen({ kind: 'sign' })}>{I.check} Sign the review</button> : null}
          {can.approve ? <button className="de-btn primary" data-testid="qms-route-approve" onClick={onApprove}>{I.check} Approve</button> : null}
          {can.returnIt ? <button className="de-btn ghost" data-testid="qms-route-return" onClick={() => setOpen({ kind: 'act', act: 'return' })}>Return for revision</button> : null}
          {can.handBack ? <button className="de-btn ghost" data-testid="qms-route-hand-back" onClick={() => setOpen({ kind: 'act', act: 'hand-back' })}>Hand back</button> : null}
          {can.withdraw ? <button className="de-btn ghost" data-testid="qms-route-withdraw" onClick={() => setOpen({ kind: 'act', act: 'withdraw' })}>Withdraw the route</button> : null}
          {can.resend ? <button className="de-btn ghost" data-testid="qms-route-resend" onClick={() => setOpen({ kind: 'resend' })}>Name reviewers</button> : null}
        </div>
      </Sheet>
      {open?.kind === 'act' ? <ActDialog act={open.act} doc={doc} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.kind === 'reassign' ? <ReassignDialog doc={doc} member={open.member} onClose={() => setOpen(null)} onDone={done} /> : null}
      {open?.kind === 'resend' ? <QmsRouteForm doc={doc} mode="resend" onClose={() => setOpen(null)} onSent={done} /> : null}
      {open?.kind === 'sign' ? (
        <EsignModal open action="Sign the review" target={label(doc)} signer={signer}
          targetMeta="Your signature records that you reviewed this version's controlled text as it is now. The approval follows once every reviewer named has signed."
          defaultMeaning="review" meanings={['review']} onClose={() => setOpen(null)}
          onSign={async (input) => { const manifest = await postQmsReviewSignature(doc.id, input); onChanged(); return manifest; }} />
      ) : null}
    </>
  );
}
