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
 *   create      POST  /api/tasks/tasks           (AssignReviewDialog)
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
 * approval-gated task) the ceremony lives on the Task board, and the panel
 * says so and offers to go there rather than re-implementing a signing dialog.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest, redactInternals, serverMessage, type ApiRequestError } from '@/lib/queryClient';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';
import type { FireToast } from '../toast';

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

interface ReviewTaskRowProps {
  task: AuthoringTaskRow;
  busy: boolean;
  needsSignature: boolean;
  onTransition: (t: AuthoringTaskRow, status: 'in-progress' | 'completed') => void;
  onNav?: (id: string) => void;
}

/**
 * One task as a row: its state chip, meta line, the transitions its current
 * state allows, and the §11.50 note when the server gated completion. Exists
 * so the panel body is the list and this is the row.
 */
function ReviewTaskRow({ task, busy, needsSignature, onTransition, onNav }: ReviewTaskRowProps) {
  const st = TASK_STATE_LABEL[task.status] ?? { label: task.status.replace(/-/g, ' '), tone: 'idle' as const };
  const canStart = task.status === 'pending' || task.status === 'blocked';
  const canComplete = task.status === 'in-progress' || task.status === 'review';
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
      {needsSignature && (
        <div className="scaf-note" role="status" style={{ marginTop: 6, fontSize: 12 }}>
          Completing this task requires an electronic signature (21 CFR 11 §11.50). The signing ceremony — your password, the meaning, a reason — runs on the Task board.
          {onNav && (
            <button type="button" className="nda-open" style={{ marginLeft: 8 }} onClick={() => onNav('task-board')}>
              Open Task board
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
  onAssign: () => void;
  onNav?: (id: string) => void;
  onClose: () => void;
  fireToast: FireToast;
}

export function ReviewTasksPanel({ docId, docTitle, refreshKey, onAssign, onNav, onClose, fireToast }: ReviewTasksPanelProps) {
  const { state, rows, error, reload } = useDocumentTasks(docId, refreshKey);
  const [busy, setBusy] = useState<string | null>(null);
  /** A completion the server gated on a signature: named on the row, with the way there. */
  const [needsSignature, setNeedsSignature] = useState<string | null>(null);

  const transition = async (t: AuthoringTaskRow, status: 'in-progress' | 'completed') => {
    if (busy || !docId) return;
    setBusy(t.taskId);
    setNeedsSignature(null);
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
        setNeedsSignature(t.taskId);
        return;
      }
      fireToast(failure.message, 'error');
      if (failure.kind === 'conflict' || failure.kind === 'unknown') reload(docId);
    } finally {
      setBusy(null);
    }
  };

  const openCount = rows.filter(r => !['completed', 'cancelled'].includes(r.status)).length;

  return (
    <>
      <div className="ed-comments-h ed-comments-h-row">
        <span>Tasks{docTitle ? ` · ${docTitle}` : ''}</span>
        <button type="button" className="ed-comments-close" aria-label="Close tasks" title="Close tasks" onClick={onClose}>
          {I.close}
        </button>
      </div>
      {docId && (
        <div className="rt-bar">
          <span className="rt-bar-n">
            {state === 'ready' ? `${openCount} open · ${rows.length} total` : state === 'error' ? 'not read' : 'reading…'}
          </span>
          <button type="button" className="btn ghost" style={{ height: 28, fontSize: 12 }} onClick={onAssign} data-testid="rt-assign">
            {I.user} Assign review
          </button>
          <button type="button" className="nda-open" onClick={() => reload(docId)} disabled={state === 'loading'}>
            {state === 'loading' ? 'Loading…' : 'Refresh'}
          </button>
        </div>
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
        <EmptyState
          icon={I.checkSquare}
          title="No tasks linked to this document"
          hint="Assign a review to create one. Each task is a row on the organization’s task ledger, linked to this document by its id, and every transition is audited."
          action={{ label: 'Assign review', onAct: onAssign }}
          testId="rt-empty"
        />
      ) : (
        <div className="rt-list" role="list" aria-label="Tasks linked to this document">
          {rows.map(t => (
            <ReviewTaskRow
              key={t.taskId}
              task={t}
              busy={busy === t.taskId}
              needsSignature={needsSignature === t.taskId}
              onTransition={transition}
              onNav={onNav}
            />
          ))}
        </div>
      )}
    </>
  );
}
