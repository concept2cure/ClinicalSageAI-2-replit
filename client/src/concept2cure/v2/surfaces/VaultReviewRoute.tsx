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
 *   - RouteForm: named reviewers and one approver, each from a searchable list
 *     of the members the send would admit (GET …/route-candidates/:vaultId,
 *     validateRouteMember's own answers), the review and approval due dates
 *     (the end of each day in the sender's time zone, which it names) and the
 *     reason. Send stays disabled, and says why, until all of them are given.
 *     At a phone's width it is a sheet.
 *   - RouteActDialog: Withdraw and Return for revision, each with a reason.
 *
 * Nothing here decides who may sign: the route and its verified signatures do,
 * on the server, which refuses anyone else before the credential.
 */
import React, { useState } from 'react';
import { apiRequest, ApiRequestError, redactInternals, serverMessage } from '@/lib/queryClient';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import { useLiveData, type ShapeGuard } from '../dataConnect';
import { DueDateField, PeoplePicker, ReasonField, reviewReasonProblem, type PickerOption } from '../editor/reviewFields';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { lifecyclePost } from './vaultLifecyclePost';

// ── The round, as the server reads it (RouteRound, review-route-standing.ts) ──

export interface RouteSignatureView { id: number; printedName: string | null; meaning: string; signedAt: string }
export interface RouteMemberView {
  taskId: string;
  userId: number;
  role: 'reviewer' | 'approver';
  step: number;
  printedName: string | null;
  outcome: 'pending' | 'signed' | 'returned' | 'handed back';
  stepOpen: boolean;
  dueDate: string | null;
  signature: RouteSignatureView | null;
  actId: string | null;
}
export interface RouteHeaderView {
  id: string;
  round: number;
  senderId: number;
  senderName: string;
  status: 'open' | 'withdrawn' | 'returned' | 'complete';
  statusReason: string | null;
  statusBy: number | null;
  statusAt: string | null;
  reviewDueAt: string | null;
  approvalDueAt: string;
  createdAt: string;
}
export interface RouteRoundView {
  route: RouteHeaderView;
  members: RouteMemberView[];
  reviewComplete: boolean;
  approvalComplete: boolean;
}

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

// ── What the round says ──────────────────────────────────────────────────────

const utc = (iso: string | null | undefined): string => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 19).replace('T', ' ')} UTC` : 'time not recorded';
};
const utcClock = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(11, 16)} UTC`;
};
const nameOf = (m: RouteMemberView) => m.printedName ?? `Account #${m.userId}`;
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** Who closed a route, by the names the route holds; an administrator otherwise. */
function closedBy(round: RouteRoundView): string {
  const by = round.route.statusBy;
  if (by === round.route.senderId) return round.route.senderName;
  const member = round.members.find((m) => m.userId === by);
  return member ? nameOf(member) : 'an administrator';
}

/** The members whose turn it is and who have not signed. */
export const holders = (round: RouteRoundView) => round.members.filter((m) => m.stepOpen && m.outcome === 'pending');

/** One member's line: name, role, and what they have done, with the signature's meaning and UTC time. */
export function memberLine(m: RouteMemberView, round: RouteRoundView): string {
  const role = m.role === 'reviewer' ? 'reviewer' : 'approver';
  if (m.outcome === 'signed' && m.signature) {
    const approvers = round.members.filter((x) => x.role === 'approver');
    const what = m.role === 'approver'
      ? `Approved (${approvers.filter((x) => x.outcome === 'signed').length} of ${approvers.length} required)`
      : 'Reviewed';
    return `${m.signature.printedName ?? nameOf(m)} · ${role} · ${what} · meaning: ${m.signature.meaning.toLowerCase()} · ${utc(m.signature.signedAt)}`;
  }
  if (m.outcome === 'returned') return `${nameOf(m)} · ${role} · Returned it for revision`;
  if (round.route.status !== 'open') return `${nameOf(m)} · ${role} · Did not sign`;
  const due = m.dueDate ? ` · due ${utc(m.dueDate)}` : '';
  if (!m.stepOpen) return `${nameOf(m)} · ${role} · Waits for the review${due}`;
  return `${nameOf(m)} · ${role} · Waiting for their ${m.role === 'reviewer' ? 'review' : 'approval'}${due}`;
}

/** The round in one sentence, for the person reading it. */
export function routeHeadline(round: RouteRoundView, meId: number | null): string {
  const r = round.route;
  if (r.status === 'returned') return `Returned by ${closedBy(round)}: ${r.statusReason ?? 'no reason recorded'}`;
  if (r.status === 'withdrawn') return `Withdrawn by ${closedBy(round)} on ${utc(r.statusAt)}: ${r.statusReason ?? 'no reason recorded'}`;
  if (r.status === 'complete') return 'Approved: every named reviewer and the approver signed.';
  const waiting = holders(round);
  const mine = round.members.find((m) => m.userId === meId);
  if (mine && waiting.includes(mine)) return mine.role === 'reviewer' ? 'Your turn: sign the review.' : 'Your turn: approve.';
  const others = list(waiting.filter((m) => m.userId !== meId).map(nameOf));
  if (mine?.outcome === 'signed' && mine.signature) return `You signed at ${utcClock(mine.signature.signedAt)}; waiting for ${others || 'the next step'}.`;
  return others ? `Waiting for ${others}.` : 'Waiting for the next step.';
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

/** Every named member and what each has done; the sender reminds whoever's turn it is. */
export function RouteRoundPanel({ view, meId, title, canRemind }: {
  view: RouteView;
  meId: number | null;
  /** The version, in words, for a reminder. */
  title: string;
  /** Reminders are offered on the current version, to its sender. */
  canRemind: boolean;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
          </li>
        ))}
      </ul>
      {note ? <span className="vr-round-m" role="status">{note}</span> : null}
    </span>
  );
}

// ── Who may be named: the server's answer (review-route-candidates.ts) ───────

interface CandidateRefusal { code: string; message: string }
export interface RouteCandidateView { id: number; name: string; reviewer: CandidateRefusal | null; approver: CandidateRefusal | null }
export interface RouteCandidatesShape { timeZone: string; canonicalId: string | null; candidates: RouteCandidateView[] }

const isRefusal = (v: unknown) => v === null || (!!v && typeof (v as CandidateRefusal).code === 'string' && typeof (v as CandidateRefusal).message === 'string');
export const isRouteCandidates: ShapeGuard<RouteCandidatesShape> = (v): v is RouteCandidatesShape => {
  const o = v as RouteCandidatesShape | null;
  return !!o && typeof o.timeZone === 'string' && Array.isArray(o.candidates) && o.candidates.every((c) =>
    !!c && Number.isSafeInteger(c.id) && typeof c.name === 'string' && isRefusal(c.reviewer) && isRefusal(c.approver));
};

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

export interface RouteFormInput {
  reviewers: string[];
  approver: string | null;
  reviewDue: string;
  approvalDue: string;
  reason: string;
}

/** What Send is waiting for, in words; empty when the form can be sent. */
export function routeFormMissing(f: RouteFormInput): string[] {
  const missing: string[] = [];
  if (f.reviewers.length === 0) missing.push('Choose at least one reviewer.');
  if (!f.approver) missing.push('Choose the approver.');
  if (!f.reviewDue) missing.push('Give the date the reviews are due.');
  if (!f.approvalDue) missing.push('Give the date the approval is due.');
  if (f.reviewDue && f.approvalDue && f.approvalDue < f.reviewDue) missing.push('The approval is due on or after the reviews.');
  const reason = reviewReasonProblem(f.reason);
  if (reason) missing.push(reason);
  return missing;
}

/** The body the route acts take: one approver, parallel reviewers (RR1a's shape; RR2 adds more). */
export function routeBody(f: RouteFormInput): { reason: string; route: Record<string, unknown> } {
  return {
    reason: f.reason.trim(),
    route: {
      reviewers: f.reviewers.map(Number),
      approvers: f.approver ? [Number(f.approver)] : [],
      order: 'parallel',
      reviewDueDate: f.reviewDue,
      approvalDueDate: f.approvalDue,
    },
  };
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
  return (
    <>
      <fieldset className="de-field" data-testid="vr-reviewers">
        <legend className="de-label">Reviewers<span className="req">*</span></legend>
        <div className="de-desc">Each named reviewer signs the review of this version. Only members the route would admit are listed.</div>
        <PeoplePicker name="vr-reviewers" multiple searchLabel="Find a reviewer" testIdPrefix="vr-reviewer"
          options={optionsFor(candidates, 'reviewer', f.approver ? [f.approver] : [], 'Chosen as the approver.')}
          selected={f.reviewers} onChange={(ids) => set({ reviewers: ids })} />
      </fieldset>
      <fieldset className="de-field" data-testid="vr-approver">
        <legend className="de-label">Approver<span className="req">*</span></legend>
        <div className="de-desc">The approver signs once every reviewer has; their signature approves the version.</div>
        <PeoplePicker name="vr-approver" multiple={false} searchLabel="Find the approver" testIdPrefix="vr-approver"
          options={optionsFor(candidates, 'approver', f.reviewers, 'Chosen as a reviewer.')}
          selected={f.approver ? [f.approver] : []} onChange={(ids) => set({ approver: ids[0] ?? null })} />
      </fieldset>
      <NotOffered candidates={candidates} />
      <div className="vr-due">
        <DueDateField id="vr-review-due" label="Reviews due" value={f.reviewDue} onChange={(v) => set({ reviewDue: v })}
          required min={today()} testId="vr-review-due" />
        <DueDateField id="vr-approval-due" label="Approval due" value={f.approvalDue} onChange={(v) => set({ approvalDue: v })}
          required min={f.reviewDue || today()} testId="vr-approval-due" />
      </div>
      <div className="de-desc" data-testid="vr-zone">Each date is the end of that day in {zone}, your notification time zone.</div>
      <ReasonField id="vr-reason" label="Reason for sending" value={f.reason} onChange={(v) => set({ reason: v })}
        note={`Recorded on this version’s audit trail with who you named. At least ${GOVERNED_REASON_MIN} characters.`}
        placeholder="e.g. Ready for medical and QA review before the pre-IND package." testId="vr-reason" />
    </>
  );
}

/** Who may be named, read when the form opens; an unread list offers no one, and says so. */
function useRouteCandidates(vaultId: string) {
  const [epoch, setEpoch] = useState(0);
  const read = useLiveData<RouteCandidatesShape>(
    `/api/regulatory/documents/route-candidates/${encodeURIComponent(vaultId)}`, [vaultId, epoch], isRouteCandidates);
  return { loading: read.loading, data: read.loading ? null : read.data, again: () => setEpoch((n) => n + 1) };
}

/** The route form: named reviewers, one approver, two due dates and a reason. A sheet at a phone's width. */
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
  const [f, setF] = useState<RouteFormInput>({ reviewers: [], approver: null, reviewDue: '', approvalDue: '', reason: '' });
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

// ── Withdraw and Return for revision ─────────────────────────────────────────

export type RouteAct = 'withdraw' | 'return';

/** What each act does, said before it is confirmed. */
export function routeActMeaning(act: RouteAct, reviewComplete: boolean): string {
  if (act === 'return') {
    return 'The version goes back to Not sent for review, the route closes, every member who has not signed is told, and so is its sender. Signatures already given stay on the record.';
  }
  return reviewComplete
    ? 'The review is complete, so withdrawing sends the version back to Not sent for review: a new route and a new review are needed. Signatures already given stay on the record.'
    : 'The route closes and every member who has not signed is told. The version stays in review, and nothing is signed on it until a new route is sent.';
}

/** Withdraw or Return for revision, each a governed act with the actor's reason. */
export function RouteActDialog({ act, canonicalId, title, reviewComplete, onClose, onDone }: {
  act: RouteAct;
  canonicalId: string;
  title: string;
  reviewComplete: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useDialog(() => { if (!busy) onClose(); });
  const problem = reviewReasonProblem(reason);
  const label = act === 'withdraw' ? 'Withdraw the route' : 'Return for revision';
  const run = async () => {
    if (problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await lifecyclePost(`/api/regulatory/documents/${encodeURIComponent(canonicalId)}/review-route/${act}`, { reason: reason.trim() },
        act === 'withdraw' ? 'The route was not withdrawn.' : 'The version was not returned.');
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
          <ReasonField id="vr-act-reason" label={act === 'withdraw' ? 'Reason for withdrawing' : 'Reason for returning it'}
            note={`Recorded on this version’s audit trail and given to the people on the route. At least ${GOVERNED_REASON_MIN} characters.`}
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
