/**
 * Review & Approval -- kit app/Project.jsx `Review` ported.
 *
 * Registry id: `review`
 *
 * Review queue over the AUTHORING review store, threaded comments, approve /
 * request changes with a reason / decline, the document's approval chain.
 *
 * ── One store (VSR-001 F-6, decided 2026-09-21) ──────────────────────────────
 * The queue is GET /api/review/board, a read model over the tables the
 * Authoring launch app writes through: review requests and verdicts
 * (POST /api/authoring/documents/:id/request-review, POST .../review), the
 * approval chain (POST /api/authoring/docs/:id/submit, advanced by the §11.50
 * signature route), and comments. Every act recorded here is one of the
 * authoring workflow's OWN transitions, called directly:
 *   approve / request changes / decline → POST /api/authoring/documents/:id/review
 *   comment                             → POST /api/authoring/sections/:sectionId/comment
 *   resolve                             → PATCH /api/authoring/comments/:commentId
 * There is no delegate: the authoring workflow has no such transition (a
 * reviewer is added with request-review), and this board invents no state.
 *
 * NOTE: this surface records review verdicts. It does NOT apply a 21 CFR §11.50
 * electronic signature — see DecisionModal below. Binding signatures are applied
 * from the authoring workspace (server/routes/authoring.router.ts), re-verified
 * and sealed against a frozen document version.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';
import { notifySurfaceActionReady, useSurfaceActionHandlers } from '../surfaceActions';
import { apiRequest, serverMessage } from '@/lib/queryClient';
import { AnswerLead } from '../AnswerLead';
import type { SurfaceViewProps } from '../surfaceViews';
import { useDialog } from '../useDialog';
import type { ReviewItem, ReviewComment, ReviewWorkflow } from '../fixtures/review-data';
import { STATUS_TONE } from '../fixtures/review-data';
import { assessmentStateFor, hasAnswer } from '../assessmentState';
import { readShellProject } from '../shellProject';
import { ReviewThreadsPane } from './ReviewThreads';
import '../styles/project-home-v2.css';
import { C2CToast, useToast } from '../toast';

/** Sub-headline shared by the surface header and its honest empty/error states. */
const REVIEW_SUB = 'Reviews requested in Authoring: approve, request changes with a reason, or decline.';

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

type Scope = 'all' | 'mine' | 'requested';
const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: 'mine', label: 'Awaiting my review' },
  { id: 'requested', label: 'Requested by me' },
  { id: 'all', label: 'All open' },
];

/** The authoring verdicts POST /documents/:id/review takes. */
type Verdict = 'approved' | 'changes_requested' | 'rejected';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REVIEW_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  rejected: 'Declined',
};

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

/** Scope + program switch, rendered above the queue and in the empty state. */
function ScopeBar({ scope, onScope, program, onlyProgram, onOnlyProgram }: {
  scope: Scope;
  onScope: (s: Scope) => void;
  program: { id: string; title: string } | null;
  onlyProgram: boolean;
  onOnlyProgram: (v: boolean) => void;
}) {
  const on = { fontWeight: 600, background: 'var(--bg-050)' } as const;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 12 }}>
      {SCOPES.map((s) => (
        <button
          key={s.id}
          className="btn ghost"
          aria-pressed={scope === s.id}
          data-on={scope === s.id || undefined}
          style={scope === s.id ? on : undefined}
          onClick={() => onScope(s.id)}
        >
          {s.label}
        </button>
      ))}
      {program && (
        <button
          className="btn ghost"
          aria-pressed={onlyProgram}
          data-on={onlyProgram || undefined}
          style={{ marginLeft: 'auto', ...(onlyProgram ? on : {}) }}
          onClick={() => onOnlyProgram(!onlyProgram)}
          title={onlyProgram ? 'Showing this program only' : 'Show this program only'}
        >
          {I.gitBranch} {onlyProgram ? 'Only ' : 'All programs · '}{program.title}
        </button>
      )}
    </div>
  );
}

/* ── Review-decision modal ── */

function DecisionModal({ onClose, item, onRecorded }: {
  onClose: () => void;
  item: ReviewItem;
  /** Fires only after the server confirms the write, with the verdict it recorded. */
  onRecorded?: (verdict: Verdict) => void;
}) {
  /**
   * This dialog does NOT apply an electronic signature, and does not claim to.
   *
   * It records the reviewer's VERDICT through the authoring workflow's own
   * transition — POST /api/authoring/documents/:id/review — the same row the
   * author's review panel and GET /documents/:id/reviews read. It used to POST
   * to a board-only route that wrote a second store nobody else read.
   *
   * A §11.50 signature manifestation has to record the signer's printed name,
   * the date and time of execution, and the meaning of the signing — bound to
   * the signed record. None of that happens here. The real implementation
   * exists: server/routes/authoring.router.ts applies a re-verified signature
   * bound to a frozen document version, from the authoring workspace.
   */
  const [decision, setDecision] = useState<Verdict>('approved');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const needsReason = decision !== 'approved';
  const reasonOk = !needsReason || reason.trim().length >= 8;

  const record = async () => {
    if (busy) return;
    if (!reasonOk) {
      setErr('A change request or a rejection needs a reason of at least 8 characters — it is what the author has to act on.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await apiRequest(
        'POST',
        '/api/authoring/documents/' + encodeURIComponent(String(item?.id ?? '')) + '/review',
        { review_status: decision, review_comments: reason.trim() || undefined },
      );
      const body = await res.json().catch(() => null);
      const payload = body as { success?: boolean } | null;
      if (!res.ok || payload?.success !== true) {
        setErr(serverMessage(body) ?? 'The decision was not recorded (HTTP ' + res.status + '). Nothing changed.');
        return;
      }
      onRecorded?.(decision);
    } catch (e) {
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setErr(known && (e as Error).message ? (e as Error).message : 'Could not reach the authoring service. Nothing changed.');
    } finally {
      setBusy(false);
    }
  };

  /* Escape, focus-on-open and focus-return: a governed decision dialog must
     have a way out for a keyboard user and announce that it opened. */
  const dialogRef = useDialog(onClose);

  const submitLabel =
    decision === 'approved' ? 'Record approval'
    : decision === 'changes_requested' ? 'Record change request'
    : 'Record rejection';

  return (
    <div className="esign-bd" onClick={onClose}>
      <div
        className="esign-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Record review decision"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
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
              onChange={(e) => setDecision(e.target.value as Verdict)}
            >
              <option value="approved">Approve</option>
              <option value="changes_requested">Request changes — send it back with a reason</option>
              <option value="rejected">Decline — reject this document</option>
            </select>
          </div>
          <div className="esign-field">
            <label htmlFor="rv-reason">
              {needsReason ? 'Reason (required)' : 'Note for the thread (optional)'}
            </label>
            <textarea
              id="rv-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={needsReason
                ? 'What has to change before this can be approved'
                : 'Anything the author or the next reviewer should know'}
            />
          </div>
          {err && <div className="esign-err" role="alert">{err}</div>}
          <div className="esign-manifest">
            This records your review verdict — <b>{REVIEW_STATUS_LABEL[decision]}</b> — on
            the document in the authoring workflow, where the author and the other
            reviewers see it. It is <b>not</b> a 21 CFR §11.50 signature manifestation —
            no signer identity is re-verified here and nothing is sealed against a
            frozen document version. Apply a binding signature from the authoring
            workspace, where the signer's password is re-verified and the signature sealed.
          </div>
        </div>
        <div className="esign-f">
          <button className="btn ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn primary"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={record}
            disabled={busy || !reasonOk}
          >
            {I.shieldCheck} {busy ? 'Recording…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Record-decision button ── */

function RecordDecision({ item, onRecorded }: {
  item: ReviewItem;
  onRecorded?: (verdict: Verdict) => void;
}) {
  const [open, setOpen] = useState(false);

  /* The chip is driven by the caller's OWN review row as the board returned it
     after the write — a statement about the record, not about this tab. */
  if (item.myReviewStatus && item.myReviewStatus !== 'pending') {
    const tone = item.myReviewStatus === 'approved' ? 'ok' : item.myReviewStatus === 'rejected' ? 'err' : 'warn';
    return (
      <span
        className={'rd-chip tone-' + tone}
        style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}
      >
        {I.shieldCheck} Your decision recorded — {REVIEW_STATUS_LABEL[item.myReviewStatus] ?? item.myReviewStatus}
      </span>
    );
  }

  return (
    <>
      <button className="btn primary" onClick={() => setOpen(true)}>{I.shieldCheck} Record review decision</button>
      {open && (
        <DecisionModal
          item={item}
          onClose={() => setOpen(false)}
          onRecorded={(verdict) => {
            setOpen(false);
            onRecorded?.(verdict);
          }}
        />
      )}
    </>
  );
}

/* ════ Review & Approval surface ════ */

export function Review({ onAsk, onNav }: SurfaceViewProps) {
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [sel, setSel] = useState('');
  /* The row whose thread the board should carry. Set only by an explicit
     selection (a click, "Open the queue", AnA's select-document) — never by the
     seeding effect below — so a board load does not re-request itself. */
  const [threadFor, setThreadFor] = useState('');
  const [thread, setThread] = useState<ReviewComment[]>([]);
  const [reply, setReply] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  // Write state. `requesting` guards a double submit; `requestErr` is what makes
  // a failure visible instead of the form silently staying open.
  const [requesting, setRequesting] = useState(false);
  const [requestErr, setRequestErr] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [onlyProgram, setOnlyProgram] = useState(false);
  const [toast, fireToast] = useToast();
  /** The queue column — "Open the queue" scrolls to it and focuses the row it selected. */
  const queueRef = useRef<HTMLDivElement>(null);

  /* The program the shell has open, when it is a regulatory program (UUID).
     A program-less shell, or a numeric project id, offers no program filter
     rather than a filter that could never match. */
  const program = useMemo(() => {
    const p = readShellProject();
    if (!p || !UUID_RE.test(String(p.id))) return null;
    return { id: String(p.id), title: p.title || p.code || p.product || String(p.id) };
  }, []);

  // Live, org-scoped review board — GET /api/review/board → { success, data }.
  // useLiveData unwraps the success envelope, so `board` is the render contract
  // itself ({ queue, workflows, thread }). There is no fixture: a tenant with
  // nothing in review renders an honest empty board, and a failed load renders
  // an honest error — never a fabricated queue behind a "sample" pill.
  //
  // The scope is explicit in the URL so the server never guesses it; the
  // selected item is passed so its thread is the one that comes back; and
  // `boardEpoch` is bumped after every confirmed write so the board is RE-READ.
  // Re-reading is what makes the surface show the record rather than a memory
  // of what was clicked.
  const [boardEpoch, setBoardEpoch] = useState(0);
  const boardUrl =
    '/api/review/board?scope=' + scope +
    (onlyProgram && program ? '&programId=' + encodeURIComponent(program.id) : '') +
    (threadFor ? '&itemId=' + encodeURIComponent(threadFor) : '');
  const boardState = useLiveData<ReviewBoardData>(boardUrl, [boardUrl, boardEpoch]);
  const board = boardState.data;
  const workflows: Record<string, ReviewWorkflow> = board?.workflows ?? {};

  // Seed the queue + thread from every board that resolves: nothing is edited
  // locally any more (every act is written and then re-read), so the record is
  // always the newest board.
  useEffect(() => {
    if (boardState.loading || !board) return;
    const q = (board.queue ?? []).map((r) => ({ ...r }));
    setQueue(q);
    setSel((prev) => (q.some((r) => r.id === prev) ? prev : q[0] ? q[0].id : ''));
    setThread((board.thread ?? []).map((c) => ({ ...c })));
  }, [boardState.loading, board]);

  /** Re-read the board from the server after a confirmed write. */
  const refreshBoard = () => setBoardEpoch((e) => e + 1);

  /** Select a row: the detail pane AND the thread the next board read carries. */
  const selectRow = (id: string) => {
    setSel(id);
    setThreadFor(id);
    setRejecting(false);
    setRequestErr('');
  };

  const changeScope = (s: Scope) => {
    setScope(s);
    setRejecting(false);
    setRequestErr('');
  };

  /* Jump to the next document still awaiting a decision — ONE path shared by
     the AnswerLead's "Open the queue" button and AnA's review.open-queue
     action, so the two can never drift. */
  const openQueue = (): ReviewItem | null => {
    const next = queue.find((r) => r.state !== 'approved') ?? null;
    if (next) selectRow(next.id);
    else setRejecting(false);
    try {
      queueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      queueRef.current?.querySelector<HTMLButtonElement>('.lrow[data-on]')?.focus();
    } catch { /* no scrollIntoView here — the row is still selected */ }
    return next;
  };

  /* ── AnA's hands on this screen — the surface-action bus ──────────────────
     Registered under 'review' (identity-mapped nav target). View selection
     ONLY: recording a verdict, requesting changes, commenting and resolving
     stay governed human acts, untouched by this registration. Both handlers
     refuse — with the real reason — while a form holding a person's
     in-progress justification is open. */
  const reviewBusyGuard = (): { ok: false; reason: string } | null => {
    if (requesting) return { ok: false, reason: 'A review write is in flight — wait for it to finish.' };
    if (rejecting) return { ok: false, reason: 'The request-changes form is open — close it first.' };
    return null;
  };
  useSurfaceActionHandlers('review', {
    'review.select-document': (params) => {
      const guarded = reviewBusyGuard();
      if (guarded) return guarded;
      const wanted = (params.document ?? '').trim();
      if (!wanted) return { ok: false, reason: 'No document named.' };
      if (boardState.error && queue.length === 0)
        return { ok: false, reason: 'The review board could not be read.' };
      if (boardState.loading && queue.length === 0)
        return { ok: false, reason: 'The review board is still loading.', retry: true };
      if (queue.length === 0)
        return {
          ok: false,
          reason: Array.isArray(board?.queue)
            ? 'Nothing is in review.'
            : 'The review board could not be read.',
        };
      const lower = wanted.toLowerCase();
      const exact = queue.find((r) => r.id === wanted || r.doc.toLowerCase() === lower);
      const contains = exact ? [] : queue.filter((r) => r.doc.toLowerCase().includes(lower));
      const match = exact ?? (contains.length === 1 ? contains[0] : null);
      if (!match) {
        return {
          ok: false,
          reason:
            contains.length > 1
              ? `"${params.document}" matches ${contains.length} documents — name one exactly.`
              : `No document named "${params.document}" in the review queue.`,
        };
      }
      selectRow(match.id);
      return { ok: true, detail: `Selected ${match.doc}` };
    },
    'review.open-queue': () => {
      const guarded = reviewBusyGuard();
      if (guarded) return guarded;
      if (boardState.error && queue.length === 0)
        return { ok: false, reason: 'The review board could not be read.' };
      if (boardState.loading && queue.length === 0)
        return { ok: false, reason: 'The review board is still loading.', retry: true };
      if (queue.length === 0)
        return {
          ok: false,
          reason: Array.isArray(board?.queue)
            ? 'Nothing is in review.'
            : 'The review board could not be read.',
        };
      if (!queue.some((r) => r.state !== 'approved'))
        return { ok: false, reason: 'Every document in the queue is already approved.' };
      const next = openQueue();
      return { ok: true, detail: next ? `Opened the queue at ${next.doc}` : 'Opened the queue' };
    },
  });
  /* The ready signal for the retry contract above. */
  useEffect(() => {
    if (!boardState.loading) notifySurfaceActionReady('review');
  }, [boardState.loading]);

  /* The approval-board slice of AnA's screen context. NOT published here:
     ReviewThreadsPane (always mounted by this surface) is the ONE 'review'
     publisher. The board facts travel to the pane as a prop. A FAILED read
     ships the failure. */
  const boardContext = useMemo(() => {
    if (boardState.loading && queue.length === 0) {
      return { state: 'loading' as const };
    }
    if (boardState.error && queue.length === 0) {
      return { state: 'error' as const };
    }
    const awaiting = queue.filter((r) => r.state !== 'approved').length;
    const selected = queue.find((r) => r.id === sel);
    return {
      state: 'ready' as const,
      queueCount: queue.length,
      awaitingDecision: awaiting,
      selectedDoc: selected?.doc ?? null,
      selectedState: selected?.state ?? null,
    };
  }, [boardState.loading, boardState.error, queue, sel]);

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
    } catch { /* noop */ }
  }, [sel, queue]);

  const scopeBar = (
    <ScopeBar scope={scope} onScope={changeScope} program={program} onlyProgram={onlyProgram} onOnlyProgram={setOnlyProgram} />
  );

  // ── The three honest states, before any row is dereferenced. No fixture ──
  if (boardState.loading && queue.length === 0) {
    return (
      <div className="page-inner">
        <PageHead eyebrow="Project · review" title="Review & approval" sub={REVIEW_SUB} />
        {scopeBar}
        <EmptyState title="Loading the review board…" icon={I.clock} />
      </div>
    );
  }
  if (boardState.error && queue.length === 0) {
    return (
      <div className="page-inner">
        <PageHead eyebrow="Project · review" title="Review & approval" sub={REVIEW_SUB} />
        {scopeBar}
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
    /* "Nothing is in review" is a CLAIM. The board's own queue array is the
       positive evidence that the board was read: a real board with nothing on
       it comes back as `queue: []`. No array means nothing was read, and the
       honest copy says that instead of reassuring. */
    const boardRead = Array.isArray(board?.queue);
    const emptyTitle =
      scope === 'mine' ? 'Nothing awaits your review'
      : scope === 'requested' ? 'You have not requested a review'
      : 'Nothing is in review';
    const emptyHint =
      scope === 'mine'
        ? 'When a colleague requests your review on a document in Authoring, or a document reaches your sign-off step, it appears here.'
        : scope === 'requested'
          ? 'Reviews you request from the authoring workspace appear here with each reviewer’s verdict.'
          : 'When a review is requested on a document in Authoring, or a document is submitted for sign-off, it appears here with its reviewers, approval chain and comments.';
    return (
      <div className="page-inner">
        <PageHead eyebrow="Project · review" title="Review & approval" sub={REVIEW_SUB} />
        {scopeBar}
        {boardRead ? (
          <EmptyState title={emptyTitle} hint={emptyHint} icon={I.shieldCheck} />
        ) : (
          <EmptyState
            tone="error"
            title="The review board did not load"
            hint="The request came back without a board, so this screen cannot tell you whether anything is awaiting review. Try again, and treat the queue as unread until it loads."
            icon={I.alertTriangle}
            retry={refreshBoard}
          />
        )}
        {/* Threads can exist even when no document is on the approval board. */}
        <ReviewThreadsPane onNotice={fireToast} board={boardContext} />
        <C2CToast msg={toast} />
      </div>
    );
  }

  const item = queue.find((r) => r.id === sel) || queue[0];
  const wf: ReviewWorkflow | null = workflows[item.id] || null;

  const openEditor = () => {
    onNav('document-authoring');
  };

  /**
   * Request changes — the authoring verdict `changes_requested`, through
   * POST /api/authoring/documents/:id/review with the reason as the review
   * comment. `item.id` IS the authoring document id the route takes.
   *
   * The row is moved and the thread entry added ONLY after the write returns
   * and the board is re-read.
   */
  const doRequestChanges = async () => {
    const text = reason.trim();
    if (!text || requesting) return;
    if (text.length < 8) {
      setRequestErr('A change request needs a reason of at least 8 characters — it is what the author has to act on.');
      return;
    }
    setRequesting(true);
    setRequestErr('');
    try {
      const res = await apiRequest(
        'POST',
        '/api/authoring/documents/' + encodeURIComponent(item.id) + '/review',
        { review_status: 'changes_requested', review_comments: text },
      );
      const body = await res.json().catch(() => null);
      const payload = body as { success?: boolean } | null;
      if (!res.ok || !payload || payload.success !== true) {
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
      const known = (e as { name?: unknown })?.name === 'ApiRequestError';
      setRequestErr(
        known && (e as Error).message ? (e as Error).message : 'Could not reach the authoring service.',
      );
    } finally {
      setRequesting(false);
    }
  };

  /**
   * Resolve a review comment — PATCH /api/authoring/comments/:id {status}.
   * Optimistic on screen, reverted when the record did not change.
   */
  const resolveCmt = async (id: string) => {
    const prev = thread;
    setThread((t) => t.map((c) => (c.id === id ? { ...c, state: 'resolved' } : c)));
    try {
      const res = await apiRequest('PATCH', '/api/authoring/comments/' + encodeURIComponent(id), { status: 'resolved' });
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
   * Post a review comment — POST /api/authoring/sections/:sectionId/comment.
   * Authoring comments are anchored to a section; a board-level comment goes
   * on the document's first section. A document with no section yet cannot
   * take one, and the box says so rather than posting nowhere.
   */
  const postReply = async () => {
    const text = reply.trim();
    if (!text || requesting) return;
    if (!item.firstSectionId) {
      fireToast('This document has no section yet, so a comment has nothing to attach to.', 'error');
      return;
    }
    setRequesting(true);
    try {
      const res = await apiRequest(
        'POST',
        '/api/authoring/sections/' + encodeURIComponent(item.firstSectionId) + '/comment',
        { body: text, doc_id: item.id },
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
  /* "0 open" is a claim that nothing on this document is outstanding. The board
     carrying a thread ARRAY is the positive evidence the comments were read. */
  const threadState = assessmentStateFor(boardState, {
    scopeExists: true,
    findingCount: openCmts,
    assessmentRan: Array.isArray(board?.thread),
  });

  /* ---- AnswerLead derivation ----
     Ownership is decided SERVER-SIDE per row, from the authoring store:
     `awaitingMyReview` (a pending review request names the caller) and
     `atMySignOff` (the current approval step's approver is the caller). The
     claim "nothing is waiting on you" is only spoken over a board that came
     back with a queue array; a failed or empty re-read withdraws it. */
  const awaitingMe = queue.filter((r) => r.awaitingMyReview === true);
  const signMe = queue.filter((r) => r.atMySignOff === true);
  const stillMoving = queue.filter((r) => r.state !== 'approved').length;

  const signState = assessmentStateFor(boardState, {
    scopeExists: queue.length > 0,
    findingCount: awaitingMe.length + signMe.length,
    assessmentRan: Array.isArray(board?.queue),
  });
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const signHeadline =
    signState === 'loading'
      ? <>Reading the review queue…</>
      : signState === 'unreadable'
        ? <>The review queue could not be re-read. The queue below is the last board that loaded, and nothing here tells you whether a review is waiting on you.</>
        : signState === 'not-assessed'
          ? <>No review queue came back, so this screen cannot say whether a review is waiting on you. The queue below is the last board that loaded.</>
          : signState === 'assessed-with-findings'
            ? (
              awaitingMe.length > 0
                ? <><b>{awaitingMe.length}</b> {awaitingMe.length === 1 ? 'document awaits' : 'documents await'} your review{signMe.length > 0 ? <>, and <b>{n(signMe.length, 'is', 'are')}</b> at your sign-off step — sign from the authoring workspace</> : null}.</>
                : <><b>{signMe.length}</b> {signMe.length === 1 ? 'document is' : 'documents are'} at your <b>sign-off step</b> — sign from the authoring workspace.</>
            )
            : <>Nothing is waiting on you — <b>{stillMoving}</b> document{stillMoving === 1 ? '' : 's'} still moving through review.</>;
  const first = awaitingMe[0] ?? signMe[0];
  const signAction =
    signState === 'assessed-with-findings' && first
      ? { label: 'Review ' + first.doc, onClick: () => selectRow(first.id) }
      : hasAnswer(signState) && stillMoving > 0
        ? { label: 'Open the queue', onClick: () => { openQueue(); } }
        : undefined;

  const ownership = (r: ReviewItem): string =>
    r.awaitingMyReview ? 'Awaiting your review'
    : r.atMySignOff ? 'At your sign-off'
    : r.requestedByMe ? 'Requested by you'
    : '';

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
        tone={signState === 'assessed-with-findings' ? 'urgent' : 'calm'}
        eyebrow="What is waiting on your review right now"
        headline={signHeadline}
        body={<>Each document carries the reviews requested in Authoring and its approval chain; you approve, request changes with a reason, or decline. Verdicts recorded here are not electronic signatures — apply a binding signature from the authoring workspace.</>}
        reassure={
          hasAnswer(signState) && signState !== 'not-assessed'
            ? "I'll surface exactly which review you own and pre-read the document so your verdict is one informed click."
            : undefined
        }
        action={signAction}
        secondary="Or work the queue below."
      />

      {scopeBar}

      <div className="split">
        <div className="split-list" ref={queueRef}>
          {queue.map((r) => (
            <button key={r.id} className="lrow" data-on={sel === r.id || undefined} onClick={() => selectRow(r.id)}>
              <div className="lrow-top">
                <span className="mono">{r.prog ?? r.module ?? ''}</span>
                <Pill tone={STATUS_TONE[r.state] || 'warn'}>{r.state}</Pill>
              </div>
              <div className="lrow-title">{r.doc}</div>
              <div className="lrow-meta"><span>{r.reviewer}{r.role ? ' · ' + r.role : ''}</span></div>
              <div className="lrow-foot">
                <span className="gates"><span className="g warn">{r.comments} cmt</span></span>
                <span className="lrow-due" style={{ color: r.mine ? 'var(--warning)' : 'var(--text-400)' }}>{ownership(r)}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="split-detail">
          <div className="dt-head">
            <div>
              <div className="dt-eyebrow">{item.prog ?? item.module ?? ''}{item.role ? ' · ' + item.role : ''}</div>
              <h3 className="dt-title">{item.doc}</h3>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {item.awaitingMyReview
                ? <>
                    <button className="btn ghost" onClick={() => { setRejecting((v) => !v); setRequestErr(''); }}>{I.close} Request changes...</button>
                    <RecordDecision
                      item={item}
                      onRecorded={(verdict) => {
                        refreshBoard();
                        fireToast(
                          verdict === 'rejected'
                            ? 'Rejection recorded — the author has your reason.'
                            : verdict === 'changes_requested'
                              ? 'Change request recorded — the author has your reason.'
                              : 'Approval recorded on the document.',
                          verdict === 'rejected' ? 'error' : 'ok',
                        );
                      }}
                    />
                  </>
                : item.myReviewStatus && item.myReviewStatus !== 'pending'
                  ? <RecordDecision item={item} />
                  : item.atMySignOff
                    ? <button className="btn primary" onClick={openEditor}>{I.lock} Sign in the authoring workspace</button>
                    : item.state === 'approved'
                      ? <span className="rd-chip tone-ok" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}>{I.shieldCheck} Approved</span>
                      : item.state === 'changes-requested'
                        ? <span className="rd-chip tone-warn" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}>{I.alertTriangle} Changes requested</span>
                        : item.state === 'rejected'
                          ? <span className="rd-chip tone-err" style={{ height: 32, display: 'inline-flex', alignItems: 'center', padding: '0 12px' }}>{I.close} Declined</span>
                          : null
              }
            </div>
          </div>

          {rejecting && (
            <div className="rv-reject">
              <textarea
                className="rv-reject-ta"
                aria-label="Reason for requesting changes"
                placeholder="State the specific change required..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
              {/* WIRED — the authoring verdict `changes_requested` on
                  POST /api/authoring/documents/:id/review: the same row the
                  author's review panel reads. The author is not notified
                  automatically. */}
              <div className="rv-reject-note">
                Recorded as your verdict on the document in the authoring workflow,
                with this reason. The author is not notified automatically.
              </div>
              {requestErr && (
                <div className="rv-reject-note" role="alert" style={{ color: 'var(--error)' }}>
                  Not recorded — {requestErr}
                </div>
              )}
              <div className="rv-reject-row">
                <button className="btn ghost" disabled={requesting} onClick={() => { setRejecting(false); setReason(''); setRequestErr(''); }}>Cancel</button>
                <button className="btn primary" disabled={!reason.trim() || requesting} onClick={() => { void doRequestChanges(); }}>
                  {I.close} {requesting ? 'Recording…' : requestErr ? 'Retry' : 'Request changes'}
                </button>
              </div>
            </div>
          )}

          {/* The review requests on this document — who was asked, by whom,
              and what each has said. Same rows the author's review panel reads. */}
          <div className="rv-wf">
            <div className="rv-wf-h">
              <span className="rv-wf-l">{I.user} Review requests</span>
              {/* A board row served before this read model carried the
                  document's status (or by a server that could not read it)
                  has none. Rendering nothing there is honest; crashing the
                  surface on it blanked the whole board. */}
              {item.docStatus && (
                <span className="rv-wf-tid mono">{item.docStatus.toLowerCase().replace(/_/g, ' ')}</span>
              )}
            </div>
            <div className="rv-wf-steps">
              {(item.reviews ?? []).length === 0 && (
                <div className="rv-wf-step" data-status="pending">
                  <div className="rv-wf-body">
                    <div className="rv-wf-nm">No review requested yet</div>
                    <div className="rv-wf-meta mono">The document was submitted for sign-off without a named reviewer.</div>
                  </div>
                </div>
              )}
              {(item.reviews ?? []).map((rv, i) => (
                <div key={rv.id} className="rv-wf-step" data-status={rv.status === 'approved' ? 'approved' : rv.status === 'pending' ? 'current' : 'pending'}>
                  <span className="rv-wf-dot">{rv.status === 'approved' ? I.check : (i + 1)}</span>
                  <div className="rv-wf-body">
                    <div className="rv-wf-nm">
                      {rv.reviewer}
                      <span className={'rv-wf-tag tone-' + (rv.status === 'approved' ? 'ok' : rv.status === 'pending' ? 'warn' : rv.status === 'rejected' ? 'err' : 'warn')}>
                        {REVIEW_STATUS_LABEL[rv.status] ?? rv.status}
                      </span>
                    </div>
                    <div className="rv-wf-meta mono">
                      {rv.requestedBy ? 'requested by ' + rv.requestedBy : 'requested'}
                      {rv.reviewedAt ? ' · decided ' + new Date(rv.reviewedAt).toLocaleDateString() : ''}
                      {rv.comments ? ' · ' + rv.comments : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The approval chain — authoring_workflow_steps for the current
              submission. Absent when the author has not submitted for sign-off:
              that is a fact about the document (same read as the queue), not an
              unread chain. */}
          {!wf && (
            <div className="esign-banner">
              <span className="ico">{I.gitBranch}</span> Not yet submitted for sign-off. The approval chain appears here once the author submits the document from the authoring workspace.
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
                        <span className={'rv-wf-tag tone-' + (s.status === 'approved' ? 'ok' : s.status === 'current' ? 'warn' : s.status === 'rejected' ? 'err' : 'idle')}>
                          {s.status === 'approved' ? 'Signed' : s.status === 'current' ? 'Awaiting signature' : s.status === 'rejected' ? 'Rejected' : 'Pending'}
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
              <p className="rv-doc-text">{item.passage || 'No section content yet.'}</p>
              {item.prov && <div className="rv-doc-prov">{I.lock} {item.prov}</div>}
            </div>
          </div>

          <div className="esign-banner">
            <span className="ico">{I.lock}</span> Decisions recorded on this surface are not electronic signatures. A binding 21 CFR §11.50 signature is applied from the authoring workspace, where the signer's password is re-verified and the signature is sealed against a frozen document version.
          </div>

          <div className="dr-seclbl" style={{ padding: '0 0 8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Comments</span>
            <span style={{ color: 'var(--text-400)', fontWeight: 400 }}>
              {threadState === 'assessed-with-findings'
                ? openCmts + ' open'
                : threadState === 'loading'
                  ? 'reading the thread…'
                  : threadState === 'unreadable'
                    ? 'thread not re-read'
                    : threadState === 'not-assessed'
                      ? 'thread not read'
                      : '0 open'}
            </span>
          </div>

          <div className="thread">
            {thread.map((c) => (
              <div key={c.id} className="cmt" data-ai={c.ai || undefined} data-resolved={c.state === 'resolved' || undefined}>
                <div className="cmt-meta">
                  <span className="cmt-av">{c.ai ? '*' : c.author.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}</span>
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
              placeholder={item.firstSectionId ? 'Add a comment...' : 'No section to comment on yet'}
              value={reply}
              disabled={!item.firstSectionId}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); postReply(); } }}
            />
            <button className="btn ghost" disabled={!reply.trim() || !item.firstSectionId} onClick={postReply}>{I.send} Comment</button>
          </div>
        </div>
      </div>

      {/* Real, persisted review threads (Phase-13 backend) — assigned to the
          signed-in reviewer, with reply / request-changes / resolve in place. */}
      <ReviewThreadsPane onNotice={fireToast} board={boardContext} />

      <C2CToast msg={toast} />
    </div>
  );
}
