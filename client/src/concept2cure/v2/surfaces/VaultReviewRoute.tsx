/**
 * The review route on a Vault version: who is named, what each has done, and
 * the form that names them (RR1b of docs/design/REVIEW_ROUTING_2026-10-23.md,
 * §2.6, §2.10–§2.13). The server half is RR1a's: the route header and its
 * member rows (server/services/review/review-route.ts), read with the versions
 * as `lifecycle.round` (vault-lifecycle.ts).
 *
 *   - RouteRoundPanel: every named member, one per line, with the printed
 *     name, the role, the outcome and, for a signature, its meaning and UTC
 *     time; "You signed at …; waiting for B"; an approver as "Approved (1 of 1
 *     required)"; returned and withdrawn routes with who and why. A route that
 *     could not be read says "Reviewers could not be read", never "no
 *     reviewers". The sender reminds a member whose turn it is, through the
 *     task's existing notify route.
 *   - RouteForm: named reviewers and approvers (RR2: one or more, and the
 *     reviewers at the same time or one after another, each step with its own
 *     due date, ordered by Earlier and Later buttons), each from a searchable list
 *     of the members the send would admit (GET …/route-candidates/:vaultId,
 *     validateRouteMember's own answers), the review and approval due dates
 *     (the end of each day in the sender's time zone, which it names) and the
 *     reason. Send stays disabled, and says why, until all of them are given.
 *     At a phone's width it is a sheet.
 *   - RouteActDialog: Withdraw, Return for revision and (RR3) Hand back, each
 *     with a reason.
 *   - RR2: the sender, or an administrator, adds a reviewer to the open route
 *     (AddReviewerSheet, v2/reviewRoute/AddReviewer.tsx), until an approver
 *     has signed.
 *   - RR3: the sender, or an administrator, reassigns a member who has not
 *     signed (ReassignDialog: a sheet with the people the reassignment would
 *     admit, …/route-candidates/:vaultId?for=reassign, and a reason); a
 *     member hands their own assignment back; the round shows the naming
 *     history by printed name (RouteHistory).
 *
 * Nothing here decides who may sign: the route and its verified signatures do,
 * on the server, which refuses anyone else before the credential.
 */
import React, { useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { DueDateField, PeoplePicker, ReasonField, reviewReasonProblem, type PickerOption } from '../editor/reviewFields';
import { routeShapeBody, routeShapeMissing, withReason, type RouteShapeInput } from '../reviewRoute/routeShape';
import { RouteOrderFields } from '../reviewRoute/RouteOrderFields';
import { AddReviewerSheet } from '../reviewRoute/AddReviewer';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { lifecyclePost } from './vaultLifecyclePost';
import { useRouteCandidates } from './vaultRouteCandidates';
import type { RouteCandidateView } from '../reviewRoute/routeCandidates';
import { nameOf, utc } from '../reviewRoute/routeText';
import { mayAddReviewer, memberLine, routeHeadline, waitingApprovers, type RouteMemberView, type RouteRoundView } from '../reviewRoute/routeRound';
import { RouteHistory } from '../reviewRoute/RouteHistory';
import { ReassignDialog } from './VaultRouteReassign';

/** What the version's route means for what it offers. */
export type RouteView =
  | { kind: 'unread' }
  | { kind: 'none' }
  /** In review with no route (it entered review before the cutover, §2.13). */
  | { kind: 'legacy' }
  | { kind: 'live'; round: RouteRoundView }
  /** In review on a withdrawn route: nothing is signed until a new one is sent. */
  | { kind: 'withdrawn'; round: RouteRoundView }
  /** A route that ended (returned, withdrawn out of review, complete). */
  | { kind: 'closed'; round: RouteRoundView };

export function routeView(lc: { stage?: string; round?: RouteRoundView | null; roundUnread?: boolean } | null | undefined): RouteView {
  if (lc?.roundUnread) return { kind: 'unread' };
  const inReview = lc?.stage === 'in_review';
  const round = lc?.round ?? null;
  if (!round) return inReview ? { kind: 'legacy' } : { kind: 'none' };
  if (round.route.status === 'open') return { kind: 'live', round };
  if (inReview) return round.route.status === 'withdrawn' ? { kind: 'withdrawn', round } : { kind: 'legacy' };
  return { kind: 'closed', round };
}

/** Remind one member whose turn it is, through the task's own notify route (it writes nothing on the task). */
async function remind(m: RouteMemberView, title: string): Promise<string> {
  const what = m.role === 'reviewer' ? 'your review' : 'your approval';
  const message = `A reminder: ${what} of ${title} is waiting${m.dueDate ? `, due ${utc(m.dueDate)}` : ''}. Open it in the Vault to sign.`;
  try {
    const res = await apiRequest('POST', `/api/tasks/tasks/${encodeURIComponent(m.taskId)}/notify`, { message });
    const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (!res.ok || body?.success !== true) return `${nameOf(m)} was not reminded. ${redactInternals(serverMessage(body), 'No reason was returned.')}`;
    return `${nameOf(m)} was reminded.`;
  } catch (e) {
    if (e instanceof ApiRequestError) return `${nameOf(m)} was not reminded. ${redactInternals(serverMessage(e.payload), e.message)}`;
    return `The connection dropped, so it is not known whether ${nameOf(m)} was reminded.`;
  }
}

/** What reassignment needs from the version it is on (the current one). */
export interface RouteReassignContext {
  vaultId: string;
  canonicalId: string;
  /** The reader is an organization administrator (the server decides; this only offers it). */
  admin: boolean;
  onChanged: () => void;
}

/** A member whose assignment may change hands: not signed, not returned, on an open route. */
const reassignable = (m: RouteMemberView, round: RouteRoundView) =>
  round.route.status === 'open' && (m.outcome === 'pending' || m.outcome === 'handed back');

/** Add a reviewer (RR2): offered to the sender or an administrator on an open route until an approver has signed. */
function AddReviewerControl({ round, title, reassign }: { round: RouteRoundView; title: string; reassign: RouteReassignContext }) {
  const [adding, setAdding] = useState(false);
  if (!mayAddReviewer(round)) return null;
  return (
    <>
      <button type="button" className="sp-ask" onClick={() => setAdding(true)} data-testid="vr-add-reviewer">Add a reviewer</button>
      {adding ? (
        <AddReviewerSheet idPrefix="vr-add" testId="vault-route-add" title={title}
          candidatesUrl={`/api/regulatory/documents/route-candidates/${encodeURIComponent(reassign.vaultId)}?for=add`}
          sequential={round.route.order === 'sequential'} waitingApprovers={waitingApprovers(round)} audit="this version’s audit trail"
          post={(body) => lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(reassign.canonicalId)}/review-route/members`, body, 'The reviewer was not added.')}
          onClose={() => setAdding(false)} onDone={() => { setAdding(false); reassign.onChanged(); }} />
      ) : null}
    </>
  );
}

/** Every named member and what each has done; the sender reminds whoever's turn it is, and the sender or an administrator reassigns or adds a reviewer. */
export function RouteRoundPanel({ view, meId, title, canRemind, reassign }: {
  view: RouteView;
  meId: number | null;
  /** The version, in words, for a reminder. */
  title: string;
  /** Reminders are offered on the current version, to its sender. */
  canRemind: boolean;
  /** Reassignment is offered on the current version, to its sender or an administrator (RR3). */
  reassign?: RouteReassignContext;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reassigning, setReassigning] = useState<RouteMemberView | null>(null);
  if (view.kind === 'unread') {
    return (
      <span className="vr-round" data-testid="vault-route-round">
        <span className="vd-dr-err" role="alert">Reviewers could not be read. Reload the Vault to see who is named; nothing here means nobody is.</span>
      </span>
    );
  }
  if (view.kind === 'none' || view.kind === 'legacy') return null;
  const { round } = view;
  const sender = meId !== null && round.route.senderId === meId;
  const mayReassign = Boolean(reassign) && (sender || Boolean(reassign?.admin));
  const ask = async (m: RouteMemberView) => {
    setBusy(m.taskId);
    setNote(await remind(m, title));
    setBusy(null);
  };
  return (
    <span className="vr-round" data-testid="vault-route-round">
      <span className="vr-round-h" data-testid="vault-route-headline">{routeHeadline(round, meId)}</span>
      <span className="vr-round-m">
        {`Review route ${round.route.round} · sent by ${sender ? 'you' : round.route.senderName} · ${utc(round.route.createdAt)}`}
      </span>
      <ul className="vr-members" aria-label="Named on this review route">
        {round.members.map((m) => (
          <li key={m.taskId} className="vr-member" data-testid={`vault-route-member-${m.userId}`}>
            <span>{memberLine(m, round)}</span>
            {canRemind && sender && round.route.status === 'open' && m.stepOpen && m.outcome === 'pending' ? (
              <button type="button" className="sp-ask" disabled={busy !== null} onClick={() => void ask(m)} aria-label={`Remind ${nameOf(m)}`}>
                {busy === m.taskId ? 'Reminding…' : 'Remind'}
              </button>
            ) : null}
            {mayReassign && reassignable(m, round) ? (
              <button type="button" className="sp-ask" onClick={() => setReassigning(m)} aria-label={`Reassign ${nameOf(m)}`}>
                Reassign
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {note ? <span className="vr-round-m" role="status">{note}</span> : null}
      {mayReassign && reassign ? <AddReviewerControl round={round} title={title} reassign={reassign} /> : null}
      <RouteHistory history={round.history} />
      {reassigning && reassign ? (
        <ReassignDialog member={reassigning} vaultId={reassign.vaultId} canonicalId={reassign.canonicalId} title={title}
          onClose={() => setReassigning(null)} onDone={() => { setReassigning(null); reassign.onChanged(); }} />
      ) : null}
    </span>
  );
}

// ── Who may be named: the server's answer (review-route-candidates.ts) ───────

/** Who the sender may name in a role, and who they may not, with the server's reason. */
function optionsFor(candidates: RouteCandidateView[], role: 'reviewer' | 'approver', takenElsewhere: string[], elsewhere: string): PickerOption[] {
  return candidates
    .filter((c) => c[role] === null)
    .map((c) => {
      const id = String(c.id);
      return takenElsewhere.includes(id) ? { id, label: c.name, note: elsewhere, disabled: true } : { id, label: c.name };
    });
}

/** The members not offered in either role, each with why (the validator's sentence). */
function NotOffered({ candidates }: { candidates: RouteCandidateView[] }) {
  const out = candidates.filter((c) => c.reviewer !== null && c.approver !== null);
  if (out.length === 0) return null;
  return (
    <details className="de-field" data-testid="route-not-offered">
      <summary className="de-desc">{out.length === 1 ? 'One member is not offered' : `${out.length} members are not offered`}, and why</summary>
      <ul className="vr-members">
        {out.map((c) => <li key={c.id} className="vr-member de-desc">{c.reviewer!.message}</li>)}
      </ul>
    </details>
  );
}

export type RouteFormMode = 'send' | 'resend' | 'name';

export interface RouteFormInput extends RouteShapeInput {
  reason: string;
}

/** What Send is waiting for, in words; empty when the form can be sent. */
export function routeFormMissing(f: RouteFormInput): string[] {
  return withReason(routeShapeMissing(f, { reviewersOptional: false, approverMissing: 'Choose the approver.' }), f.reason);
}

/** The body the route acts take (RR2: one or more approvers, reviewers at the same time or one after another). */
export function routeBody(f: RouteFormInput): { reason: string; route: Record<string, unknown> } {
  return { reason: f.reason.trim(), route: routeShapeBody(f) };
}

/** Send: start the version's record (or find it) and move it into review on the named route; or (re-)name a route on a record in review. */
async function submitRoute(mode: RouteFormMode, vaultId: string, canonicalId: string | null, f: RouteFormInput): Promise<void> {
  const failed = 'The version was not sent for review.';
  const body = routeBody(f);
  if (mode !== 'send' && canonicalId) {
    await lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(canonicalId)}/review-route`, body, failed);
    return;
  }
  const started = await lifecyclePost(
    '/api/regulatory/documents',
    { sources: { vault_documents: { nativeId: vaultId, role: 'artifact' } } },
    failed,
  );
  await lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(String(started.canonicalId))}/advance`, { to: 'in_review', ...body }, failed);
}

const FORM_TITLE: Record<RouteFormMode, string> = { send: 'Send for review', resend: 'Send again', name: 'Name reviewers' };
const today = () => new Date().toISOString().slice(0, 10);

/** The form's fields, once who may be named has been read. */
function RouteFields({ candidates, zone, f, set }: {
  candidates: RouteCandidateView[];
  zone: string;
  f: RouteFormInput;
  set: (patch: Partial<RouteFormInput>) => void;
}) {
  const names = new Map(candidates.map((c) => [String(c.id), c.name]));
  return (
    <>
      <fieldset className="de-field" data-testid="vr-reviewers">
        <legend className="de-label">Reviewers<span className="req">*</span></legend>
        <div className="de-desc">Each named reviewer signs the review of this version. Only members the route would admit are listed.</div>
        <PeoplePicker name="vr-reviewers" multiple searchLabel="Find a reviewer" testIdPrefix="vr-reviewer"
          options={optionsFor(candidates, 'reviewer', f.approvers, 'Chosen as an approver.')}
          selected={f.reviewers} onChange={(ids) => set({ reviewers: ids })} />
      </fieldset>
      <RouteOrderFields idPrefix="vr" f={f} nameOf={(id) => names.get(id) ?? `Account #${id}`} set={set} today={today()} />
      <fieldset className="de-field" data-testid="vr-approver">
        <legend className="de-label">Approvers<span className="req">*</span></legend>
        <div className="de-desc">Every approver named signs once every reviewer has; the last signature approves the version.</div>
        <PeoplePicker name="vr-approver" multiple searchLabel="Find an approver" testIdPrefix="vr-approver"
          options={optionsFor(candidates, 'approver', f.reviewers, 'Chosen as a reviewer.')}
          selected={f.approvers} onChange={(ids) => set({ approvers: ids })} />
      </fieldset>
      <NotOffered candidates={candidates} />
      <div className="vr-due">
        <DueDateField id="vr-approval-due" label="Approval due" value={f.approvalDue} onChange={(v) => set({ approvalDue: v })}
          required min={today()} testId="vr-approval-due" />
      </div>
      <div className="de-desc" data-testid="vr-zone">Each date is the end of that day in {zone}, your notification time zone.</div>
      <ReasonField id="vr-reason" label="Reason for sending" value={f.reason} onChange={(v) => set({ reason: v })}
        note={`Recorded on this version’s audit trail with who you named. At least ${GOVERNED_REASON_MIN} characters.`}
        placeholder="e.g. Ready for medical and QA review before the pre-IND package." testId="vr-reason" />
    </>
  );
}

/** The route form: named reviewers (in order, one after another), approvers, due dates and a reason. A sheet at a phone's width. */
export function RouteForm({ mode, vaultId, canonicalId, title, versionLabel, hashPrefix, onClose, onSent }: {
  mode: RouteFormMode;
  vaultId: string;
  canonicalId: string | null;
  title: string;
  versionLabel: string;
  hashPrefix: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const read = useRouteCandidates(vaultId);
  const [f, setF] = useState<RouteFormInput>({ reviewers: [], approvers: [], order: 'parallel', reviewDue: '', stepDue: [], approvalDue: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog(() => { if (!busy) onClose(); });
  const set = (patch: Partial<RouteFormInput>) => setF((x) => ({ ...x, ...patch }));
  const missing = routeFormMissing(f);
  const canSend = !busy && read.data !== null && missing.length === 0;
  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    try {
      await submitRoute(mode, vaultId, canonicalId, f);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The version was not sent for review.');
    } finally {
      setBusy(false);
    }
  };
  const covers = `${title} ${versionLabel}`.trim() + `. The review covers this version’s stored file as it is now${hashPrefix ? ` (SHA-256 ${hashPrefix}…)` : ''}.` +
    (mode === 'send' ? ' Because you start its review record, a different person reviews and approves it.' : '');
  return (
    <div className="de-bd de-sheet" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="vr-form-title" data-testid="vault-route-form">
        <div className="de-h">
          <div>
            <div className="de-h-eye">Review route</div>
            <div className="de-h-t" id="vr-form-title">{FORM_TITLE[mode]}</div>
            <div className="de-h-s">{covers}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
        </div>
        <div className="de-body">
          {read.loading ? <div className="de-desc" role="status">Reading who may review and approve this version…</div> : null}
          {!read.loading && read.data === null ? (
            <div className="de-field">
              <div className="de-err" role="alert">Who may review and approve this version could not be read, so no one can be chosen.</div>
              <button type="button" className="de-btn ghost" onClick={read.again}>Read it again</button>
            </div>
          ) : null}
          {read.data ? <RouteFields candidates={read.data.candidates} zone={read.data.timeZone} f={f} set={set} /> : null}
          {read.data && missing.length > 0 ? <div className="de-desc" id="vr-send-note" data-testid="vr-send-note">{missing.join(' ')}</div> : null}
          {error ? <div className="de-err" role="alert" data-testid="vr-error">{error}</div> : null}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="de-btn primary" onClick={() => void send()} disabled={!canSend}
            aria-describedby={missing.length ? 'vr-send-note' : undefined} data-testid="vr-send">
            {busy ? 'Sending…' : FORM_TITLE[mode]}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Withdraw, Return for revision, Hand back ─────────────────────────────────

export type RouteAct = 'withdraw' | 'return' | 'hand-back';

const ACT_TEXT: Record<RouteAct, { label: string; reasonLabel: string; failed: string }> = {
  withdraw: { label: 'Withdraw the route', reasonLabel: 'Reason for withdrawing', failed: 'The route was not withdrawn.' },
  return: { label: 'Return for revision', reasonLabel: 'Reason for returning it', failed: 'The version was not returned.' },
  'hand-back': { label: 'Hand back', reasonLabel: 'Why you cannot do it', failed: 'Your assignment was not handed back.' },
};

/** What each act does, said before it is confirmed. */
export function routeActMeaning(act: RouteAct, reviewComplete: boolean): string {
  if (act === 'hand-back') {
    return 'Your assignment goes back to the person who sent this route. The sender is told and reassigns it. You stay named, and sign nothing on it, until they do.';
  }
  if (act === 'return') {
    return 'The version goes back to Not sent for review, the route closes, every member who has not signed is told, and so is its sender. Signatures already given stay on the record.';
  }
  return reviewComplete
    ? 'The review is complete, so withdrawing sends the version back to Not sent for review: a new route and a new review are needed. Signatures already given stay on the record.'
    : 'The route closes and every member who has not signed is told. The version stays in review, and nothing is signed on it until a new route is sent.';
}

/**
 * Withdraw, Return for revision or Hand back, each a governed act with the
 * actor's reason. RR5: another subject (an Authoring document) gives its own
 * act (`post`) and where it is recorded (`audit`); the Vault's are the default.
 */
export function RouteActDialog({ act, canonicalId, title, reviewComplete, onClose, onDone, post, audit = 'this version’s audit trail' }: {
  act: RouteAct;
  canonicalId: string;
  title: string;
  reviewComplete: boolean;
  onClose: () => void;
  onDone: () => void;
  post?: (body: { reason: string }) => Promise<unknown>;
  audit?: string;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog(() => { if (!busy) onClose(); });
  const problem = reviewReasonProblem(reason);
  const { label, reasonLabel, failed } = ACT_TEXT[act];
  const run = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (post) await post({ reason: reason.trim() });
      else await lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(canonicalId)}/review-route/${act}`, { reason: reason.trim() }, failed);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="de-bd de-sheet" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="de" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="vr-act-title" data-testid={`vault-route-${act}`}>
        <div className="de-h">
          <div>
            <div className="de-h-eye">Review route</div>
            <div className="de-h-t" id="vr-act-title">{label}</div>
            <div className="de-h-s">{title}</div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={busy}>{I.close}</button>
        </div>
        <div className="de-body">
          <div className="de-gov"><span className="ico">{I.lock}</span><span className="de-gov-t">{routeActMeaning(act, reviewComplete)}</span></div>
          <ReasonField id="vr-act-reason" label={reasonLabel}
            note={`Recorded on ${audit} and given to the people on the route. At least ${GOVERNED_REASON_MIN} characters.`}
            value={reason} onChange={setReason} testId="vr-act-reason" />
          {problem ? <div className="de-desc" id="vr-act-note">{problem}</div> : null}
          {error ? <div className="de-err" role="alert" data-testid="vr-act-error">{error}</div> : null}
        </div>
        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="de-btn primary" onClick={() => void run()} disabled={problem !== null || busy}
            aria-describedby={problem ? 'vr-act-note' : undefined} data-testid="vr-act-confirm">
            {busy ? 'Recording…' : label}
          </button>
        </div>
      </div>
    </div>
  );
}
