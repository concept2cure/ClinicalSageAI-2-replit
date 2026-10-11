/**
 * Review tasks — the tasks linked to the open document, with their state.
 *
 * ── The one tasking path ─────────────────────────────────────────────────────
 * Three routers touch `unified_tasks`: `/api/tasks` (taskManagement.routes.ts),
 * `/api/regulatory/tasks` (unifiedTasks.routes.ts) and the read-only board
 * (`/api/task-management`). The canonical write path is `/api/tasks/tasks`:
 * it is what the Task board surface creates and moves through, it accepts the
 * polymorphic origin columns (`sourceEntityType` / `sourceEntityId`) that link
 * a task to the entity it was raised from, it runs the state machine
 * (services/tasking/task-state-machine.ts) on every transition, and its
 * completion gate is the §11.50 ceremony (task-signoff.ts, 428
 * ESIGN_REQUIRED). The regulatory router restricts `moduleType` to six values
 * that do not include authoring, and the board is a read. So:
 *
 *   create      POST  /api/tasks/tasks           (SendForReviewDialog, after the
 *                                                review request; AssignReviewDialog
 *                                                holds the create)
 *   transition  PATCH /api/tasks/tasks/:taskId   (this panel — Start, Complete)
 *   list        GET   /api/tasks/tasks/by-module/Authoring, filtered here to
 *               sourceEntityType 'authoring_document' + this document's id
 *
 * The list is the honest gap: no route filters by source entity, so this
 * reads the org's Authoring-module tasks (a bounded, real list) and keeps the
 * rows whose recorded origin is this document. Nothing is inferred from
 * titles. The exact need is recorded in docs/evidence/WN.
 *
 * ── Completion ───────────────────────────────────────────────────────────────
 * Completing is the tasking path's OWN transition, nothing invented here: a
 * PATCH to `completed`. When the server answers 428 ESIGN_REQUIRED (an
 * approval-gated task), the signature is taken here, on the document, in the
 * product's one signing dialog (TaskSignOffDialog.tsx over the shared
 * EsignModal), and the same transition is sent again carrying it. Until
 * 2026-10-08 the panel sent the signer to the Task board instead
 * (docs/design/ONE_ANA_ONE_CANVAS.md §4.7, slice 19: a reviewer signs on the
 * document, not on a task board).
 *
 * ── A review task and its review request ─────────────────────────────────────
 * Send for review writes two records: the review request the Review board
 * reads (authoring_reviews) and each reviewer's task. Since wave 2D the
 * verdict completes the reviewer's open review tasks on the document, in the
 * verdict's own transaction (authoring.router.ts closeReviewTasksOnVerdict),
 * except an approval-gated task, whose completion is a signature, and a
 * blocked one. Completing a task still records no verdict. So this panel reads
 * the document's review requests too (GET /api/authoring/documents/:id/reviews)
 * and states which is which (reviewTaskState.ts). While a review task's
 * assignee has a pending request, the task is not offered for completion: the
 * verdict comes first, on the Review board. A review task whose requests could
 * not be read is not offered for completion either.
 */
import React, { useCallback, useEffect, useId, useState } from 'react';
import { apiRequest, redactInternals, serverMessage, type ApiRequestError } from '@/lib/queryClient';
import type { EsignSigner } from '../../_shared/components/EsignModal';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import type { FireToast } from '../toast';
import { TaskSignOffDialog, type TaskSignOffRequest } from './TaskSignOffDialog';
import { CLOSED_TASK, reviewStateNote, taskReviewState, type TaskReviewState } from './reviewTaskState';

export { reviewStatusLabel } from './reviewTaskState';

/** The columns this panel reads from a unified_tasks row. */
export interface AuthoringTaskRow {
  taskId: string;
  title: string;
  status: string;
  priority: string | null;
  assigneeName: string | null;
  assigneeId: number | null;
  dueDate: string | null;
  description: string | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  approvalRequired: boolean | null;
  approvalStatus: string | null;
  createdAt: string | null;
  /** 'review' for a review task (buildReviewTaskBody); null when not recorded. */
  taskType: string | null;
}

export const AUTHORING_TASK_MODULE = 'Authoring';
export const AUTHORING_TASK_ENTITY = 'authoring_document';

/** How a task state reads. Text as well as tone — never colour alone. */
export const TASK_STATE_LABEL: Record<string, { label: string; tone: 'idle' | 'ok' | 'warn' | 'err' }> = {
  pending: { label: 'Assigned', tone: 'idle' },
  'in-progress': { label: 'In progress', tone: 'warn' },
  review: { label: 'In review', tone: 'warn' },
  completed: { label: 'Completed', tone: 'ok' },
  blocked: { label: 'Blocked', tone: 'err' },
  cancelled: { label: 'Cancelled', tone: 'idle' },
};

/**
 * An optional text column as it reaches the UI: absent and SQL NULL both read
 * as null, anything else as its string. Exists so row shaping states this once
 * instead of once per nullable column.
 */
function optionalText(value: unknown): string | null {
  return value == null ? null : String(value);
}

/**
 * Whether a `by-module` row records THIS document as its origin. The origin
 * columns decide it — never the title — so this predicate is the whole rule.
 */
function isTaskForDocument(row: Record<string, unknown> | null | undefined, docId: string): boolean {
  if (!row || typeof row !== 'object') return false;
  return row.sourceEntityType === AUTHORING_TASK_ENTITY && String(row.sourceEntityId ?? '') === docId;
}

/**
 * One `unified_tasks` row narrowed to the columns this panel renders. Exists so
 * the coercions live in one place and `tasksForDocument` reads as the filter it is.
 */
function toAuthoringTaskRow(row: Record<string, unknown>): AuthoringTaskRow {
  return {
    taskId: String(row.taskId ?? ''),
    title: String(row.title ?? ''),
    status: String(row.status ?? 'pending'),
    priority: optionalText(row.priority),
    assigneeName: optionalText(row.assigneeName),
    assigneeId: typeof row.assigneeId === 'number' ? row.assigneeId : null,
    dueDate: optionalText(row.dueDate),
    description: optionalText(row.description),
    sourceEntityType: String(row.sourceEntityType),
    sourceEntityId: String(row.sourceEntityId),
    approvalRequired: typeof row.approvalRequired === 'boolean' ? row.approvalRequired : null,
    approvalStatus: optionalText(row.approvalStatus),
    createdAt: optionalText(row.createdAt),
    taskType: optionalText(row.taskType),
  };
}

/** The rows of `by-module` that belong to `docId` — the origin columns, not the title. */
export function tasksForDocument(rows: unknown, docId: string): AuthoringTaskRow[] {
  if (!Array.isArray(rows)) return [];
  const out: AuthoringTaskRow[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    if (!isTaskForDocument(r, docId)) continue;
    out.push(toAuthoringTaskRow(r));
  }
  return out.filter(t => t.taskId);
}

function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  if (days < 0) return `due ${date} · ${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return `due today (${date})`;
  return `due ${date} · in ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * The single meta line under a task's title — who, when, how urgent, and
 * whether completing it is signature-gated. Exists so the row component is
 * markup and this shaping is readable on its own.
 */
function taskMetaLine(t: AuthoringTaskRow): string {
  const assignee = t.assigneeName
    ? `assigned to ${t.assigneeName}`
    : t.assigneeId ? `assigned to user ${t.assigneeId}` : 'unassigned';
  const signature = t.approvalRequired
    ? (t.approvalStatus === 'approved' ? 'signed' : 'needs e-signature to complete')
    : null;
  return [assignee, dueLabel(t.dueDate), t.priority ? `${t.priority} priority` : null, signature]
    .filter(Boolean)
    .join(' · ');
}

/** What a successful transition tells the user — completion names the ledger, a start does not. */
function transitionSuccessMessage(status: 'in-progress' | 'completed'): string {
  return status === 'completed'
    ? `Review task completed — recorded on the task ledger under your name.`
    : `Review task started.`;
}

/**
 * The sentence for a PATCH the server answered and refused, or null when it
 * did not refuse. Exists so the handler's happy path is not interleaved with
 * two failure shapes (unauthenticated, and everything else the server rejects).
 */
function refusalFromResponse(res: Response, json: unknown): string | null {
  if (res.status === 401) return 'Not changed — your session isn’t authenticated. Sign in and retry.';
  if (!res.ok) {
    return 'Couldn’t change the task — ' + (serverMessage(json) ?? `the server refused it (HTTP ${res.status})`) + '. Its state is unchanged.';
  }
  return null;
}

/** A thrown PATCH failure, named: the §11.50 gate, a state-machine conflict, a
 *  plain refusal, or an outcome nobody can confirm. */
type TransitionFailure =
  | { kind: 'esign' }
  | { kind: 'conflict'; message: string }
  | { kind: 'refused'; message: string }
  | { kind: 'unknown'; message: string };

/** Gateway statuses: usually a proxy's page, not the route's answer. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * A COMMIT the server could not confirm (OUTCOME_UNKNOWN), or a gateway's
 * answer: the change may have landed, so it is never reported as unchanged.
 */
function unknownOutcome(err: Partial<ApiRequestError> & { message?: string }): TransitionFailure | null {
  if (err?.code === 'OUTCOME_UNKNOWN') {
    return { kind: 'unknown', message: (err.message || 'Whether this change was saved is unknown.') + ' Re-reading the task list.' };
  }
  if (err?.status !== undefined && GATEWAY_STATUSES.has(err.status)) {
    return { kind: 'unknown', message: 'Couldn’t confirm the change: whether it was saved is unknown. Re-reading the task list.' };
  }
  return null;
}

/**
 * Which of the three failure shapes a thrown transition is. Exists because the
 * §11.50 gate must never be reported as a generic error, and a 409 must also
 * re-read the ledger — that decision belongs in one named place.
 */
function classifyTransitionError(e: unknown): TransitionFailure {
  const err = e as Partial<ApiRequestError> & { message?: string };
  if (err?.status === 428 || err?.code === 'ESIGN_REQUIRED') return { kind: 'esign' };
  const unknown = unknownOutcome(err);
  if (unknown) return unknown;
  if (err?.status === 409) {
    return {
      kind: 'conflict',
      message: 'Couldn’t change the task — ' + redactInternals(err.message, 'that transition is not allowed from its current state') + '. Its state is unchanged.',
    };
  }
  return {
    kind: 'refused',
    message: 'Couldn’t change the task — ' + redactInternals(err?.message, 'the server refused it') + '. Its state is unchanged.',
  };
}

interface DocumentTasksRead {
  state: 'idle' | 'loading' | 'ready' | 'error';
  rows: AuthoringTaskRow[];
  error: string | null;
  reload: (id: string) => void;
}

/**
 * The read half of the panel: the Authoring-module list, filtered to this
 * document, with its loading and failed-read states. Exists so a failed read
 * stays distinguishable from an empty one in one place, and so the component
 * below is the view.
 */
function useDocumentTasks(docId: string | null, refreshKey: number): DocumentTasksRead {
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [rows, setRows] = useState<AuthoringTaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setState('loading');
    setError(null);
    try {
      const res = await apiRequest('GET', `/api/tasks/tasks/by-module/${encodeURIComponent(AUTHORING_TASK_MODULE)}`);
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown } | null;
      if (!res.ok || !json?.success) {
        setState('error');
        setError(serverMessage(json) ?? `The task list did not respond (HTTP ${res.status}).`);
        setRows([]);
        return;
      }
      setRows(tasksForDocument(json.data, id));
      setState('ready');
    } catch (e) {
      setState('error');
      setError(redactInternals(e instanceof Error ? e.message : '', 'The task list could not be reached.'));
      setRows([]);
    }
  }, []);

  useEffect(() => {
    if (!docId) {
      setRows([]);
      setState('idle');
      return;
    }
    void load(docId);
  }, [docId, refreshKey, load]);

  const reload = useCallback((id: string) => { void load(id); }, [load]);
  return { state, rows, error, reload };
}

/** One review request on the document (an authoring_reviews row), as it is shown. */
export interface StandingReview {
  id: string;
  reviewerId: string;
  reviewer: string;
  status: string;
  requestedAt: string | null;
  reviewedAt: string | null;
}

/** The first non-blank string among the values, trimmed. */
function firstText(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

/**
 * The review requests GET /api/authoring/documents/:id/reviews answered for
 * THIS document, or null when the answer is not a reading of them: no success
 * envelope, no rows array, or a row of another document. Null is never read as
 * "nobody has been asked".
 */
export function standingReviewsOf(json: unknown, docId: string): StandingReview[] | null {
  const body = json as { success?: unknown; reviews?: unknown } | null;
  if (!body || body.success !== true || !Array.isArray(body.reviews)) return null;
  const rows = body.reviews as Array<Record<string, unknown> | null>;
  if (rows.some(r => !r || String(r.doc_id ?? '') !== docId || !String(r.reviewer_id ?? '').trim())) return null;
  return (rows as Array<Record<string, unknown>>).map(r => {
    const reviewerId = String(r.reviewer_id).trim();
    return {
      id: String(r.id ?? ''),
      reviewerId,
      reviewer: firstText(r.reviewer_name, r.reviewer_email) ?? reviewerId,
      status: String(r.review_status ?? ''),
      requestedAt: optionalText(r.requested_at),
      reviewedAt: optionalText(r.reviewed_at),
    };
  });
}

export interface DocumentReviewsRead {
  state: 'idle' | 'loading' | 'ready' | 'error';
  rows: StandingReview[];
  reload: () => void;
}

/**
 * The document's review requests, read when the document changes, when
 * `refreshKey` moves, and on reload. Shared by this panel and Send for review,
 * so both say the same thing about who has been asked and what they decided.
 */
/** One read of the document's review requests; null when it is not a reading of them. */
async function readStandingReviews(docId: string): Promise<StandingReview[] | null> {
  try {
    const res = await apiRequest('GET', `/api/authoring/documents/${encodeURIComponent(docId)}/reviews`);
    const json = await res.json().catch(() => null);
    return res.ok ? standingReviewsOf(json, docId) : null;
  } catch {
    return null;
  }
}

export function useDocumentReviews(docId: string | null, refreshKey = 0): DocumentReviewsRead {
  const [state, setState] = useState<DocumentReviewsRead['state']>('idle');
  const [rows, setRows] = useState<StandingReview[]>([]);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    setRows([]);
    if (!docId) {
      setState('idle');
      return undefined;
    }
    let alive = true;
    setState('loading');
    void readStandingReviews(docId).then(read => {
      if (!alive) return;
      setRows(read ?? []);
      setState(read ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [docId, refreshKey, epoch]);

  const reload = useCallback(() => setEpoch(e => e + 1), []);
  return { state, rows, reload };
}

interface ReviewTaskRowProps {
  task: AuthoringTaskRow;
  busy: boolean;
  review: TaskReviewState;
  onTransition: (t: AuthoringTaskRow, status: 'in-progress' | 'completed') => void;
  onOpenBoard?: () => void;
}

/**
 * One task as a row: its state chip, meta line, the transitions its current
 * state allows, and what its review request says. Exists so the panel body is
 * the list and this is the row. A review task whose verdict is not recorded is
 * not offered for completion: completing it would show a finished review the
 * Review board does not have.
 */
function ReviewTaskRow({ task, busy, review, onTransition, onOpenBoard }: ReviewTaskRowProps) {
  const st = TASK_STATE_LABEL[task.status] ?? { label: task.status.replace(/-/g, ' '), tone: 'idle' as const };
  const canStart = task.status === 'pending' || task.status === 'blocked';
  const verdictAllows = review.kind === 'none' || review.kind === 'recorded';
  const canComplete = verdictAllows && (task.status === 'in-progress' || task.status === 'review');
  const note = reviewStateNote(task, review);
  return (
    <div className="rt-row" role="listitem" data-status={task.status} data-testid="rt-row">
      <div className="rt-row-h">
        <span className="rt-row-t">{task.title}</span>
        <span className={`rd-chip tone-${st.tone}`}>{st.label}</span>
      </div>
      <div className="rt-row-m">{taskMetaLine(task)}</div>
      {task.description && <div className="rt-row-d">{task.description}</div>}
      <div className="rt-row-a">
        {canStart && (
          <button type="button" className="nda-open" disabled={busy} onClick={() => onTransition(task, 'in-progress')}>
            {I.play} Start
          </button>
        )}
        {canComplete && (
          <button type="button" className="nda-open" disabled={busy} onClick={() => onTransition(task, 'completed')} data-testid="rt-complete">
            {I.check} Complete
          </button>
        )}
        <span className="rt-row-id" title={task.taskId}>{task.taskId}</span>
      </div>
      {note && (
        <div className="rt-row-d" data-testid="rt-review-state" data-review={review.kind}>
          {review.kind === 'recorded' ? I.checkCircle : I.info} {note}
          {review.kind === 'pending' && onOpenBoard && (
            <button type="button" className="nda-open" style={{ marginLeft: 8 }} onClick={onOpenBoard}>
              Open the Review board
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export interface ReviewTasksPanelProps {
  docId: string | null;
  docTitle: string | null;
  refreshKey: number;
  /** Open Send for review: the review request and each reviewer's task. */
  onSendForReview: () => void;
  /* GE-P-3 (2026-09-28): the server's refusal of the review assignment for
     this caller, as the sentence to show; the control is disabled and
     described by it. Null or absent = allowed or unknown: enabled, the server
     decides. */
  sendRefusal?: string | null;
  /** Who the signing dialog shows as signing (the signed-in user). */
  signer?: EsignSigner;
  /** Open the Review board, where a reviewer records the verdict a review task waits on. */
  onOpenBoard?: () => void;
  onClose: () => void;
  fireToast: FireToast;
}

const TASK_LEDGER_HINT =
  'Each task is a row on the organization’s task ledger, linked to this document by its id, and every transition is audited.';

/** No task yet. GE-P-3: when the server refuses the review assignment, the
 *  refused act stays visible, disabled, in the bar above with its reason; this
 *  empty state does not repeat it as a live button. */
function NoTasksYet({ onSendForReview, sendRefusal }: { onSendForReview: () => void; sendRefusal?: string | null }) {
  return (
    <EmptyState
      icon={I.checkSquare}
      title="No tasks linked to this document"
      hint={sendRefusal
        ? TASK_LEDGER_HINT
        : 'Send the document for review to create them: the request is listed on the Review board, and each reviewer gets a task here. ' + TASK_LEDGER_HINT}
      action={sendRefusal ? undefined : { label: 'Send for review', onAct: onSendForReview }}
      testId="rt-empty"
    />
  );
}

/** The bar above the list: the counts, Send for review, and Refresh. */
function TasksBar({ state, openCount, total, onSendForReview, sendRefusal, refusalId, onRefresh }: {
  state: DocumentTasksRead['state'];
  openCount: number;
  total: number;
  onSendForReview: () => void;
  sendRefusal?: string | null;
  refusalId: string;
  onRefresh: () => void;
}) {
  return (
    <>
      <div className="rt-bar">
        <span className="rt-bar-n">
          {state === 'ready' ? `${openCount} open · ${total} total` : state === 'error' ? 'not read' : 'reading…'}
        </span>
        <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={onSendForReview} data-testid="rt-send-review"
          disabled={!!sendRefusal} aria-describedby={sendRefusal ? refusalId : undefined}>
          {I.send} Send for review
        </button>
        <button type="button" className="nda-open" onClick={onRefresh} disabled={state === 'loading'}>
          {state === 'loading' ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {sendRefusal && (
        <p id={refusalId} className="scaf-note" style={{ padding: '4px 12px', margin: 0, fontSize: 11.5 }} data-testid="rt-send-refusal">
          {sendRefusal}
        </p>
      )}
    </>
  );
}

/**
 * The transitions this panel sends, and the signature a gated completion asks
 * for. Its own hook so the panel body is the view. A 428 ESIGN_REQUIRED opens
 * the signing dialog on the document; nothing is reported as completed until
 * the server says so.
 */
function useTaskTransitions(docId: string | null, reload: (id: string) => void, fireToast: FireToast) {
  const [busy, setBusy] = useState<string | null>(null);
  /** A completion the server gated on a signature, awaiting the signer here. */
  const [signing, setSigning] = useState<TaskSignOffRequest | null>(null);

  const transition = async (t: AuthoringTaskRow, status: 'in-progress' | 'completed') => {
    if (busy || !docId) return;
    setBusy(t.taskId);
    try {
      const res = await apiRequest('PATCH', `/api/tasks/tasks/${encodeURIComponent(t.taskId)}`, {
        status,
        ...(status === 'completed' ? { progress: 100 } : {}),
      });
      const json = await res.json().catch(() => null);
      const refusal = refusalFromResponse(res, json);
      if (refusal) {
        fireToast(refusal, 'error');
        return;
      }
      fireToast(transitionSuccessMessage(status));
      reload(docId);
    } catch (e) {
      const failure = classifyTransitionError(e);
      if (failure.kind === 'esign') {
        setSigning({ taskId: t.taskId, title: t.title, status, progress: 100 });
        return;
      }
      fireToast(failure.message, 'error');
      if (failure.kind === 'conflict' || failure.kind === 'unknown') reload(docId);
    } finally {
      setBusy(null);
    }
  };

  const closeSigning = () => setSigning(null);
  const signed = (outcome: 'signed' | 'unknown') => {
    setSigning(null);
    if (outcome === 'signed') fireToast('Review task completed with your electronic signature, recorded on the task ledger.');
    else fireToast('Whether the signature was recorded is unknown. Re-reading the task list.', 'error');
    if (docId) reload(docId);
  };
  return { busy, transition, signing, closeSigning, signed };
}

/** The list itself: each task with what its review request says. */
function TaskList({ rows, reviews, busy, onTransition, onOpenBoard }: {
  rows: AuthoringTaskRow[];
  reviews: DocumentReviewsRead;
  busy: string | null;
  onTransition: (t: AuthoringTaskRow, status: 'in-progress' | 'completed') => void;
  onOpenBoard?: () => void;
}) {
  return (
    <div className="rt-list" role="list" aria-label="Tasks linked to this document">
      {rows.map(t => (
        <ReviewTaskRow
          key={t.taskId}
          task={t}
          busy={busy === t.taskId}
          review={taskReviewState(t, reviews)}
          onTransition={onTransition}
          onOpenBoard={onOpenBoard}
        />
      ))}
    </div>
  );
}

export function ReviewTasksPanel({ docId, docTitle, refreshKey, onSendForReview, sendRefusal, signer, onOpenBoard, onClose, fireToast }: ReviewTasksPanelProps) {
  const refusalId = useId();
  const { state, rows, error, reload: reloadTasks } = useDocumentTasks(docId, refreshKey);
  const reviews = useDocumentReviews(docId, refreshKey);
  const reloadReviews = reviews.reload;
  /* The tasks and the review requests are re-read together, so a row never
     pairs a fresh task state with a stale verdict. */
  const reload = useCallback((id: string) => {
    reloadTasks(id);
    reloadReviews();
  }, [reloadTasks, reloadReviews]);
  const { busy, transition, signing, closeSigning, signed } = useTaskTransitions(docId, reload, fireToast);

  const openCount = rows.filter(r => !CLOSED_TASK.has(r.status)).length;

  return (
    <>
      <div className="ed-comments-h ed-comments-h-row">
        <span>Tasks{docTitle ? ` · ${docTitle}` : ''}</span>
        <button type="button" className="ed-comments-close" aria-label="Close tasks" title="Close tasks" onClick={onClose}>
          {I.close}
        </button>
      </div>
      {docId && (
        <TasksBar
          state={state}
          openCount={openCount}
          total={rows.length}
          onSendForReview={onSendForReview}
          sendRefusal={sendRefusal}
          refusalId={refusalId}
          onRefresh={() => reload(docId)}
        />
      )}
      {!docId ? (
        <EmptyState icon={I.checkSquare} title="No document selected" hint="Select a document to see the tasks linked to it." />
      ) : state === 'error' ? (
        <EmptyState
          tone="error"
          icon={I.alertTriangle}
          title="Couldn’t read this document’s tasks"
          hint={error ?? 'The task list did not respond. This is a failed read — it does not mean there are no tasks.'}
          retry={() => reload(docId)}
          testId="rt-error"
        />
      ) : state === 'loading' && rows.length === 0 ? (
        <div role="status" className="scaf-note" style={{ padding: 12 }}>Reading the task ledger…</div>
      ) : rows.length === 0 ? (
        <NoTasksYet onSendForReview={onSendForReview} sendRefusal={sendRefusal} />
      ) : (
        <TaskList rows={rows} reviews={reviews} busy={busy} onTransition={transition} onOpenBoard={onOpenBoard} />
      )}
      {signing && <TaskSignOffDialog req={signing} signer={signer} onClose={closeSigning} onSigned={signed} />}
    </>
  );
}
