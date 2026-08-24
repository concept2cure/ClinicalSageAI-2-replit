/**
 * Review & Approval -- kit app/Project.jsx `Review` ported.
 *
 * Registry id: `review`
 *
 * Review queue, threaded comments, reject-with-reason, delegate-step,
 * multi-step approval workflows.
 *
 * NOTE: this surface records review decisions locally. It does NOT apply a
 * 21 CFR §11.50 electronic signature — see ESignModal below. Binding signatures
 * are applied from the authoring workspace (server/routes/authoring.router.ts),
 * PIN-verified and sealed against a frozen document version.
 */
import React, { useState, useEffect, useRef } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import type { ReviewItem, ReviewComment, ReviewWorkflow } from '../fixtures/review-data';
import { STATUS_TONE, ESIGN_MEANINGS } from '../fixtures/review-data';
import { ReviewThreadsPane } from './ReviewThreads';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/** Sub-headline shared by the surface header and its honest empty/error states. */
const REVIEW_SUB = 'Review queue, threaded comments, reject-with-reason, delegate a step.';

/**
 * The render contract of GET /api/review/board (server/routes/review-board-routes.ts),
 * returned as { success, data }. useLiveData unwraps the success envelope, so the
 * hook's `.data` is this board object directly — real, org-scoped, no fixture.
 */
interface ReviewBoardData {
  queue: ReviewItem[];
  workflows: Record<string, ReviewWorkflow>;
  thread: ReviewComment[];
}

/* ── Inline helpers (kit shared bits) ── */

function PageHead({ eyebrow, title, sub, actions }: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="ph">
      <div>
        <div className="ph-eyebrow">{eyebrow}</div>
        <h1 className="ph-title">{title}</h1>
        {sub && <div className="ph-sub">{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8 }}>{actions}</div>}
    </div>
  );
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`rd-chip tone-${tone}`}>{children}</span>;
}

/* ── E-sign modal (21 CFR Part 11) ── */

function ESignModal({ onClose, item, onSigned }: {
  onClose: () => void;
  item: ReviewItem;
  /** Fires only after the server confirms the write, with what it recorded. */
  onSigned?: (result: { workflowStatus?: string; approvalStatus?: string }) => void;
}) {
  /**
   * This dialog does NOT apply an electronic signature, and no longer claims to.
   *
   * What it used to do: collect a password and a TOTP into component state, use
   * NEITHER, write `window.C2C_SIGNED` (read nowhere in the repository), make
   * zero network calls, attribute the signature to the hardcoded string
   * 'Jordan Chen' — a fixture identity from v2/fixtures/admin-data.ts — and tell
   * the user "Manifestation recorded per 21 CFR §11.50".
   *
   * Every part of that is a problem, and the credential fields are the worst of
   * them: a control that asks for a password and discards it teaches users to
   * type their password into things that do nothing, and is indistinguishable
   * from a harvesting UI. They are gone.
   *
   * A §11.50 signature manifestation has to record the signer's printed name,
   * the date and time of execution, and the meaning of the signing — bound to
   * the signed record. None of that can come from the browser's say-so. The real
   * implementation exists: server/routes/authoring.router.ts applies a
   * PIN-verified signature into `authoring_signatures`, bound to a frozen
   * document version. This surface is not wired to it.
   *
   * Until it is, the honest thing is a local review decision that says so.
   */
  const [meaning, setMeaning] = useState('APPROVER');
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  /* ── This used to be `onSigned ? onSigned() : onClose()` ───────────────────
     A reviewer picked a meaning of signature, clicked "Record decision", and
     the queue row flipped to "Review decision recorded" — in that browser tab,
     until the next refresh. No request was made. The approval step stayed
     pending forever and the next reviewer was never unblocked.

     It now POSTs the decision to the governed router, which completes the
     reviewer's approval row, advances the workflow to the next pending step (or
     completes it when this was the last), and records the act with its 21 CFR
     11.50 meaning in workflow_history. A rejection rejects the workflow and
     requires a reason — the next author has to act on something. */
  const recordDecision = async () => {
    if (busy) return;
    if (decision === 'reject' && reason.trim().length < 8) {
      setErr('A rejection needs a reason of at least 8 characters — it is what the author has to act on.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await apiRequest(
        'POST',
        '/api/review/workflows/' + encodeURIComponent(String(item?.id ?? '')) + '/decision',
        { decision, meaning, reason: reason.trim() || undefined },
      );
      const body = await res.json().catch(() => null);
      const payload = body as { success?: boolean; data?: { workflowStatus?: string; approvalStatus?: string } } | null;
      if (!res.ok || payload?.success !== true) {
        setErr(serverMessage(body) ?? 'The decision was not recorded (HTTP ' + res.status + '). Nothing changed.');
        return;
      }
      onSigned?.(payload.data ?? {});
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setErr(known && (e as Error).message ? (e as Error).message : 'Could not reach the review service. Nothing changed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="esign-bd" onClick={onClose}>
      <div className="esign-modal" onClick={(e) => e.stopPropagation()}>
        <div className="esign-h">
          <span className="ico">{I.lock}</span>
          <span className="t">Record review decision</span>
        </div>
        <div className="esign-b">
          {item && (
            <div className="esign-field" style={{ marginBottom: 4 }}>
              <label>Document</label>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.doc}</div>
            </div>
          )}
          <div className="esign-field">
            <label htmlFor="rv-decision">Decision</label>
            <select
              id="rv-decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as 'approve' | 'reject')}
            >
              <option value="approve">Approve this step</option>
              <option value="reject">Reject — send the document back</option>
            </select>
          </div>
          <div className="esign-field">
            <label htmlFor="rv-meaning">Meaning of signature</label>
            <select id="rv-meaning" value={meaning} onChange={(e) => setMeaning(e.target.value)}>
              {ESIGN_MEANINGS.map((m) => (
                <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div className="esign-field">
            <label htmlFor="rv-reason">
              {decision === 'reject' ? 'Reason (required)' : 'Note for the thread (optional)'}
            </label>
            <textarea
              id="rv-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={decision === 'reject'
                ? 'What has to change before this can be approved'
                : 'Anything the next reviewer should know'}
            />
          </div>
          {err && <div className="esign-err" role="alert">{err}</div>}
          <div className="esign-manifest">
            This records a review decision of <b>{meaning.replace(/_/g, ' ')}</b> against
            this workflow step: the step is completed, the workflow advances or
            closes, and the act is written to the review history with that meaning.
            It is <b>not</b> a 21 CFR §11.50 signature manifestation — no signer
            identity is re-verified here and nothing is sealed against a frozen
            document version. Apply a binding signature from the authoring
            workspace, where it is PIN-verified and sealed.
          </div>
        </div>
        <div className="esign-f">
          <button className="btn ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={recordDecision}
            disabled={busy || (decision === 'reject' && reason.trim().length < 8)}
          >
            {I.shieldCheck} {busy ? 'Recording…' : decision === 'reject' ? 'Record rejection' : 'Record approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Approve & sign button ── */

function ApproveSign({ item, onApproved }: {
  item: ReviewItem;
  onApproved?: (result: { workflowStatus?: string; approvalStatus?: string }) => void;
}) {
  const [open, setOpen] = useState(false);

  /* The "Review decision recorded" chip used to be a local `done` flag set on
     a click that wrote nothing. It is now driven by the row's state, which
     comes back from the board after the decision is written — so the chip is a
     statement about the record rather than about this tab. */
  if (item.state === 'approved' || item.state === 'rejected') {
    return (
      <span
        className={'rd-chip tone-' + (item.state === 'approved' ? 'ok' : 'err')}
        style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}
      >
        {I.shieldCheck} Review decision recorded — {item.state}
      </span>
    );
  }

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>{I.shieldCheck} Record review decision</button>
      {open && (
        <ESignModal
          item={item}
          onClose={() => setOpen(false)}
          onSigned={(result) => {
            setOpen(false);
            onApproved?.(result);
          }}
        />
      )}
    </>
  );
}

/* ════ Review & Approval surface ════ */

export function Review({ onAsk, onNav }: SurfaceViewProps) {
  /* `useAuth` used to be read here for one purpose: attributing comments this
     surface appended to its OWN local thread. Nothing is appended locally any
     more — every comment, delegation and decision is written and then re-read —
     so the author on screen is the author the SERVER recorded, which is the
     only one that can be trusted. The hook is gone with the code that needed
     it. */

  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [sel, setSel] = useState('');
  const [thread, setThread] = useState<ReviewComment[]>([]);
  const [reply, setReply] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [delegating, setDelegating] = useState(false);
  const [delTo, setDelTo] = useState('');
  const [delReason, setDelReason] = useState('');
  // Change-request write state. `requesting` guards a double submit; `requestErr`
  // is what makes a failure visible instead of the dialog silently staying open.
  const [requesting, setRequesting] = useState(false);
  const [requestErr, setRequestErr] = useState('');
  const [toast, fireToast] = useToast();
  /** The queue column — "Open the queue" scrolls to it and focuses the row it selected. */
  const queueRef = useRef<HTMLDivElement>(null);

  // Live, org-scoped review board — GET /api/review/board → { success, data }.
  // useLiveData unwraps the success envelope, so `board` is the render contract
  // itself ({ queue, workflows, thread }). There is no fixture: a tenant with
  // nothing in review renders an honest empty board, and a failed load renders
  // an honest error — never a fabricated queue behind a "sample" pill.
  /* Bumped after every confirmed write so the board is RE-READ. Each of the
     writes below used to end in `setThread`/`setQueue` and stop there, which is
     how a review comment could exist on screen and nowhere else. Re-reading is
     what makes the surface show the record rather than a memory of what was
     clicked. */
  const [boardEpoch, setBoardEpoch] = useState(0);
  const boardState = useLiveData<ReviewBoardData>('/api/review/board', [
    '/api/review/board',
    boardEpoch,
  ]);
  const board = boardState.data;
  const workflows: Record<string, ReviewWorkflow> = board?.workflows ?? {};

  // Seed the editable queue + thread from the real board exactly once, the first
  // time it resolves — so later in-session edits (reply, resolve, delegate) are
  // never clobbered by the effect re-running.
  const seededRef = useRef(-1);
  useEffect(() => {
    if (seededRef.current === boardEpoch || boardState.loading || !board) return;
    seededRef.current = boardEpoch;
    const q = (board.queue ?? []).map((r) => ({ ...r }));
    setQueue(q);
    setSel((prev) => (q.some((r) => r.id === prev) ? prev : q[0] ? q[0].id : prev));
    setThread((board.thread ?? []).map((c) => ({ ...c })));
  }, [boardState.loading, board, boardEpoch]);

  /** Re-read the board from the server after a confirmed write. */
  const refreshBoard = () => setBoardEpoch((e) => e + 1);

  useEffect(() => {
    try {
      const r = queue.find((x) => x.id === sel);
      if ((window as any).C2C && r) {
        (window as any).C2C.setContext({
          entityType: 'review',
          entityId: r.id,
          entityLabel: (r.prog ? r.prog + ' · ' : '') + r.doc,
        });
      }
    } catch (_e) { /* noop */ }
  }, [sel, queue]);

  // ── The three honest states, before any row is dereferenced. No fixture ──
  if (boardState.loading && queue.length === 0) {
    return (
      <div className="page-inner">
        <PageHead eyebrow="Project · review" title="Review & approval" sub={REVIEW_SUB} />
        <EmptyState title="Loading the review board…" icon={I.clock} />
      </div>
    );
  }
  if (boardState.error && queue.length === 0) {
    return (
      <div className="page-inner">
        <PageHead eyebrow="Project · review" title="Review & approval" sub={REVIEW_SUB} />
        <EmptyState
          tone="error"
          title="Couldn't load the review board"
          hint={boardState.error}
          icon={I.alertTriangle}
        />
      </div>
    );
  }
  if (queue.length === 0) {
    return (
      <div className="page-inner">
        <PageHead eyebrow="Project · review" title="Review & approval" sub={REVIEW_SUB} />
        <EmptyState
          title="Nothing is in review"
          hint="When a document for your organization enters an approval workflow, it appears here with its queue, threaded comments and multi-step sign-off."
          icon={I.shieldCheck}
        />
        {/* Threads can exist even when no document is on the approval board. */}
        <ReviewThreadsPane onNotice={fireToast} />
        <C2CToast msg={toast} />
      </div>
    );
  }

  const item = queue.find((r) => r.id === sel) || queue[0];
  const wf: ReviewWorkflow | null = workflows[item.id] || null;
  const curStep = wf ? wf.steps.find((s) => s.status === 'current') : null;

  const openEditor = () => {
    onNav('document-authoring');
  };

  /**
   * Request changes — POST /api/review/workflows/:workflowId/change-request.
   *
   * This used to set local state, append a local thread entry, and fire the
   * toast "Changes requested · author notified". Nothing was written and nobody
   * was notified; the disclosure directly under the textarea said so, which made
   * the toast a claim the surface itself contradicted.
   *
   * `item.id` IS the document_workflows id the route takes — the board is built
   * from that table (server/routes/review-board-routes.ts). The route derives
   * the document from the workflow server-side, so the change request cannot be
   * pointed at a document the reviewer is not reviewing.
   *
   * The row is moved and the thread entry added ONLY after the write returns.
   * The approval step stays pending, which is what the server does and what the
   * copy now says: `approval_status` has no "changes requested" member, and
   * writing 'rejected' would terminate the workflow the reviewer is trying to
   * keep alive.
   */
  const doReject = async () => {
    const text = reason.trim();
    if (!text || requesting) return;
    setRequesting(true);
    setRequestErr('');
    try {
      const res = await apiRequest(
        'POST',
        '/api/review/workflows/' + encodeURIComponent(item.id) + '/change-request',
        { reason: text },
      );
      const body = await res.json().catch(() => null);
      const payload = body as { success?: boolean; error?: string } | null;
      if (!res.ok || !payload || payload.success !== true) {
        // `payload.error` was read first, so an envelope of the shape
        // { error: 'WORKFLOW_NOT_PENDING', message: '<a real sentence>' } put the
        // enum token in the banner. serverMessage prefers the sentence and
        // refuses codes and infrastructure text; the domain fallback stays
        // because it names the action that did not happen.
        setRequestErr(
          serverMessage(body) ?? 'Could not record the change request (HTTP ' + res.status + ').',
        );
        return;
      }
      setRejecting(false);
      setReason('');
      refreshBoard();
      fireToast('Change request recorded on the document');
    } catch (e) {
      // Only ApiRequestError carries a message that has already been reduced to
      // safe copy. Any other throw is the browser's own — "Failed to fetch" —
      // which this used to render verbatim.
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setRequestErr(
        known && (e as Error).message ? (e as Error).message : 'Could not reach the review service.',
      );
    } finally {
      setRequesting(false);
    }
  };

  /**
   * Delegate this step — POST /api/review/workflows/:workflowId/delegate.
   *
   * This used to push one line into local thread state and toast "Approval
   * delegated to <name>". Nobody was delegated to, the step stayed assigned to
   * the delegator, and the line vanished on reload. The route REPLACES the
   * step's assignment (a delegation that leaves the delegator assigned has not
   * delegated anything) and records who and why.
   */
  const doDelegate = async () => {
    const to = delTo.trim();
    const why = delReason.trim();
    if (!to || requesting) return;
    if (why.length < 8) {
      setRequestErr('A delegation needs a reason of at least 8 characters.');
      return;
    }
    setRequesting(true);
    setRequestErr('');
    try {
      const res = await apiRequest(
        'POST',
        '/api/review/workflows/' + encodeURIComponent(item.id) + '/delegate',
        { to, reason: why },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || (body as { success?: boolean } | null)?.success !== true) {
        setRequestErr(serverMessage(body) ?? 'The step was not delegated (HTTP ' + res.status + '). Nothing changed.');
        return;
      }
      setDelegating(false);
      setDelTo('');
      setDelReason('');
      refreshBoard();
      fireToast('"' + (curStep ? curStep.name : 'This approval') + '" is now assigned to ' + to + '.');
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setRequestErr(known && (e as Error).message ? (e as Error).message : 'Could not reach the review service. Nothing changed.');
    } finally {
      setRequesting(false);
    }
  };

  /**
   * Resolve a review comment — PATCH /api/review/comments/:id/resolve.
   * Was `setThread(... state: 'resolved')`: the comment was open again for
   * everyone, including the same reviewer, after a reload.
   */
  const resolveCmt = async (id: string) => {
    const prev = thread;
    setThread((t) => t.map((c) => (c.id === id ? { ...c, state: 'resolved' } : c)));
    try {
      const res = await apiRequest('PATCH', '/api/review/comments/' + encodeURIComponent(id) + '/resolve', { resolved: true });
      const body = await res.json().catch(() => null);
      if (!res.ok || (body as { success?: boolean } | null)?.success !== true) {
        setThread(prev); // the record did not change, so neither does the thread
        fireToast(serverMessage(body) ?? 'The comment was not resolved (HTTP ' + res.status + '). It is still open.', 'error');
      }
    } catch (e) {
      setThread(prev);
      fireToast('The comment was not resolved — ' + (e instanceof Error ? e.message : String(e)) + '. It is still open.', 'error');
    }
  };

  /**
   * Post a review comment — POST /api/review/workflows/:workflowId/comments.
   * Was `setThread([...t, …])` and nothing else: the comment was never saved,
   * never seen by anyone else, and gone on refresh.
   */
  const postReply = async () => {
    const text = reply.trim();
    if (!text || requesting) return;
    setRequesting(true);
    try {
      const res = await apiRequest(
        'POST',
        '/api/review/workflows/' + encodeURIComponent(item.id) + '/comments',
        { content: text },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || (body as { success?: boolean } | null)?.success !== true) {
        fireToast(serverMessage(body) ?? 'The comment was not posted (HTTP ' + res.status + '). Nothing was saved.', 'error');
        return;
      }
      setReply('');
      refreshBoard();
    } catch (e) {
      fireToast('The comment was not posted — ' + (e instanceof Error ? e.message : String(e)) + '. Nothing was saved.', 'error');
    } finally {
      setRequesting(false);
    }
  };

  const openCmts = thread.filter((c) => c.state === 'open').length;

  /* ---- AnswerLead derivation ---- */
  const signSteps = queue.filter((r) => {
    const w = workflows[r.id];
    const cs = w && w.steps.find((s) => s.status === 'current');
    return cs && cs.requiredActions.includes('sign');
  });
  const dueToday = queue.filter((r) => r.due === 'Today').length;

  return (
    <div className="page-inner">
      <PageHead
        eyebrow="Project · review"
        title="Review & approval"
        sub={REVIEW_SUB}
        actions={
          <button className="btn ghost" onClick={() => onAsk('Summarize open review comments')}>
            {I.sparkles} Ask AnA
          </button>
        }
      />

      <AnswerLead
        tone={signSteps.length ? 'urgent' : 'calm'}
        eyebrow="What is waiting on your approval right now"
        headline={
          signSteps.length
            ? <><b>{signSteps.length}</b> document{signSteps.length === 1 ? '' : 's'} {signSteps.length === 1 ? 'is' : 'are'} at your <b>sign-off step</b> and {signSteps.length === 1 ? 'needs' : 'need'} your sign-off{dueToday ? <> — <b>{dueToday}</b> due today</> : null}.</>
            : <>Nothing is blocked on your signature — <b>{queue.filter((r) => r.state !== 'approved').length}</b> document{queue.filter((r) => r.state !== 'approved').length === 1 ? '' : 's'} still moving through review.</>
        }
        body={<>Each document runs its governed workflow template; you approve, request changes with a reason, or delegate a step. Decisions recorded here are not electronic signatures — apply a binding signature from the authoring workspace.</>}
        reassure="I'll surface exactly which step you own and pre-read the document so your sign-off is one informed click."
        action={
          signSteps.length
            ? { label: 'Review ' + signSteps[0].doc, onClick: () => setSel(signSteps[0].id) }
            /* Was `onClick: () => {}` — the most prominent button on the
               screen, doing nothing at all. It now selects the first document
               still moving through review and brings the queue into view; when
               everything is approved it says so instead of pretending there is
               a queue to open. */
            : queue.some((r) => r.state !== 'approved')
              ? {
                  label: 'Open the queue',
                  onClick: () => {
                    const next = queue.find((r) => r.state !== 'approved');
                    if (next) setSel(next.id);
                    setRejecting(false);
                    queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    queueRef.current?.querySelector<HTMLButtonElement>('.lrow[data-on]')?.focus();
                  },
                }
              /* Every document is approved. There is no queue to open, so no
                 button is offered — the headline already says so, and a button
                 that reports a state is not a button. */
              : undefined
        }
        secondary="Or work the queue below."
      />

      <div className="split">
        <div className="split-list" ref={queueRef}>
          {queue.map((r) => (
            <button key={r.id} className="lrow" data-on={sel === r.id || undefined} onClick={() => { setSel(r.id); setRejecting(false); }}>
              <div className="lrow-top">
                <span className="mono">{r.prog}</span>
                <Pill tone={STATUS_TONE[r.state] || 'warn'}>{r.state}</Pill>
              </div>
              <div className="lrow-title">{r.doc}</div>
              <div className="lrow-meta"><span>{r.reviewer} · {r.role}</span></div>
              <div className="lrow-foot">
                <span className="gates"><span className="g warn">{r.comments} cmt</span></span>
                <span className="lrow-due" style={{ color: `var(--${r.tone === 'err' ? 'error' : r.tone === 'warn' ? 'warning' : 'text-400'})` }}>{r.due}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="split-detail">
          <div className="dt-head">
            <div>
              <div className="dt-eyebrow">{item.prog} · {item.role}</div>
              <h3 className="dt-title">{item.doc}</h3>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {item.state === 'approved'
                ? <span className="rd-chip tone-ok" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}>{I.shieldCheck} Review decision recorded</span>
                : item.state === 'changes-requested'
                  ? <span className="rd-chip tone-warn" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}>{I.alertTriangle} Changes requested</span>
                  : <>
                    <button className="btn ghost" onClick={() => { setDelegating((v) => !v); setRejecting(false); }}>{I.user} Delegate...</button>
                    <button className="btn ghost" onClick={() => { setRejecting((v) => !v); setDelegating(false); }}>{I.close} Request changes...</button>
                    <ApproveSign
                      item={item}
                      onApproved={(result) => {
                        refreshBoard();
                        fireToast(
                          result.approvalStatus === 'rejected'
                            ? 'Rejection recorded — the workflow is closed and the author has your reason.'
                            : result.workflowStatus === 'completed'
                              ? 'Approval recorded — that was the last step, so the review is complete.'
                              : 'Approval recorded — the workflow has moved to the next step.',
                          result.approvalStatus === 'rejected' ? 'error' : 'ok',
                        );
                      }}
                    />
                  </>
              }
            </div>
          </div>

          {rejecting && (
            <div className="rv-reject">
              <textarea
                className="rv-reject-ta"
                placeholder="State the specific change required..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              {/* WIRED — POST /api/review/workflows/:workflowId/change-request.
                  It is still NOT wired to POST /api/approval-workflows/:id/reject,
                  which is real and mounted but calls processApproval({ action:
                  'reject' }) and TERMINATES the workflow. Nor to the concept2cure
                  reviews/submit route, which does have an explicit
                  'request_changes' decision but addresses an artifact inside a
                  project — a different id space from the document_workflows /
                  unified_documents ids this board is built from.

                  The note below states the two things that are true and would
                  otherwise be assumed away: the approval step stays pending
                  (approval_status is an enum of pending|approved|rejected — there
                  is no changes-requested member, and 'rejected' would end the
                  workflow), and there is still no notification. */}
              <div className="rv-reject-note">
                Recorded as a comment on the document and in the workflow history.
                Your approval step stays pending — it is a request to revise, not a
                decision. The author is not notified automatically.
              </div>
              {requestErr && (
                <div className="rv-reject-note" role="alert" style={{ color: 'var(--danger, #b42318)' }}>
                  Not recorded — {requestErr}
                </div>
              )}
              <div className="rv-reject-row">
                <button className="btn ghost" disabled={requesting} onClick={() => { setRejecting(false); setReason(''); setRequestErr(''); }}>Cancel</button>
                <button className="btn primary" disabled={!reason.trim() || requesting} onClick={() => { void doReject(); }}>
                  {I.close} {requesting ? 'Recording…' : requestErr ? 'Retry' : 'Request changes'}
                </button>
              </div>
            </div>
          )}

          {delegating && (
            <div className="rv-reject">
              <input
                className="rv-reject-ta"
                style={{ minHeight: 0 }}
                placeholder="Delegate this step to (name or role)..."
                value={delTo}
                onChange={(e) => setDelTo(e.target.value)}
                autoFocus
              />
              <textarea
                className="rv-reject-ta"
                placeholder="Reason for delegation (recorded on the workflow)..."
                value={delReason}
                onChange={(e) => setDelReason(e.target.value)}
              />
              {requestErr && (
                <div className="rv-reject-note" role="alert" style={{ color: 'var(--danger, #b42318)' }}>
                  Not delegated — {requestErr}
                </div>
              )}
              <div className="rv-reject-row">
                <button className="btn ghost" onClick={() => { setDelegating(false); setDelTo(''); setDelReason(''); setRequestErr(''); }}>Cancel</button>
                <button
                  className="btn primary"
                  disabled={requesting || !delTo.trim() || delReason.trim().length < 8}
                  title={delReason.trim().length < 8 ? 'A reason of at least 8 characters is recorded with the delegation' : undefined}
                  onClick={doDelegate}
                >
                  {I.user} {requesting ? 'Delegating…' : 'Delegate approval'}
                </button>
              </div>
            </div>
          )}

          {wf && (
            <div className="rv-wf">
              <div className="rv-wf-h">
                <span className="rv-wf-l">{I.gitBranch} {wf.template}</span>
                <span className="rv-wf-tid mono">{wf.templateId}</span>
              </div>
              <div className="rv-wf-steps">
                {wf.steps.map((s, i) => (
                  <div key={s.id} className="rv-wf-step" data-status={s.status}>
                    <span className="rv-wf-dot">{s.status === 'approved' ? I.check : (i + 1)}</span>
                    <div className="rv-wf-body">
                      <div className="rv-wf-nm">
                        {s.name}
                        <span className={'rv-wf-tag tone-' + (s.status === 'approved' ? 'ok' : s.status === 'current' ? 'warn' : 'idle')}>
                          {s.status === 'approved' ? 'Approved' : s.status === 'current' ? 'Awaiting' : 'Pending'}
                        </span>
                      </div>
                      <div className="rv-wf-meta mono">
                        {s.approverType}: {s.approver} · {s.requiredActions.join(' + ')}{s.at ? ' · ' + s.at : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* The document under review */}
          <div className="rv-doc">
            <div className="rv-doc-h">
              <span className="rv-doc-l">{I.fileText} Document under review</span>
              <div className="rv-doc-acts">
                {item.conf != null && (
                  <span className="rv-conf" data-tone={item.conf >= 0.85 ? 'ok' : item.conf >= 0.7 ? 'warn' : 'err'} title="AnA confidence">
                    {Math.round(item.conf * 100)}% confidence
                  </span>
                )}
                <button className="btn ghost" style={{ height: 28 }} onClick={openEditor}>{I.externalLink} Open in editor</button>
              </div>
            </div>
            <div className="rv-doc-page">
              <div className="rv-doc-sec">{item.doc}</div>
              <p className="rv-doc-text">{item.passage}</p>
              <div className="rv-doc-prov">{I.lock} {item.prov}</div>
            </div>
          </div>

          <div className="esign-banner">
            <span className="ico">{I.lock}</span> Decisions recorded on this surface are not electronic signatures. A binding 21 CFR §11.50 signature is applied from the authoring workspace, where it is PIN-verified and sealed against a frozen document version.
          </div>

          <div className="dr-seclbl" style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Comments</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>{openCmts} open</span>
          </div>

          <div className="thread">
            {thread.map((c) => (
              <div key={c.id} className="cmt" data-ai={c.ai || undefined} data-resolved={c.state === 'resolved' || undefined}>
                <div className="cmt-meta">
                  <span className="cmt-av">{c.ai ? '*' : c.author.split(' ').map((x) => x[0]).join('')}</span>
                  <b>{c.author}</b>
                  <span className="cmt-role">{c.role}</span>
                  <span className="cmt-when">· {c.when}</span>
                  <Pill tone={c.state === 'resolved' ? 'ok' : 'warn'}>{c.state}</Pill>
                </div>
                <div className="cmt-body">{c.body}</div>
                {c.state === 'open' && (
                  <div className="cmt-actions">
                    <button className="btn ghost" style={{ height: 26 }} onClick={() => resolveCmt(c.id)}>Resolve</button>
                    {c.ai && <button className="btn ghost" style={{ height: 26 }} onClick={openEditor}>Apply in editor</button>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rv-reply">
            <input
              className="rv-reply-in"
              placeholder="Add a comment..."
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); postReply(); } }}
            />
            <button className="btn ghost" disabled={!reply.trim()} onClick={postReply}>{I.send} Comment</button>
          </div>
        </div>
      </div>

      {/* Real, persisted review threads (Phase-13 backend) — assigned to the
          signed-in reviewer, with reply / request-changes / resolve in place. */}
      <ReviewThreadsPane onNotice={fireToast} />

      <C2CToast msg={toast} />
    </div>
  );
}
