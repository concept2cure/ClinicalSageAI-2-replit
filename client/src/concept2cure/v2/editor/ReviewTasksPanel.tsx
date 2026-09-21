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
 * says so and offers to go there rather than re-implementing a PIN dialog.
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

/** The rows of `by-module` that belong to `docId` — the origin columns, not the title. */
export function tasksForDocument(rows: unknown, docId: string): AuthoringTaskRow[] {
  if (!Array.isArray(rows)) return [];
  const out: AuthoringTaskRow[] = [];
  for (const r of rows as Array<Record<string, unknown>>) {
    if (!r || typeof r !== 'object') continue;
    if (r.sourceEntityType !== AUTHORING_TASK_ENTITY || String(r.sourceEntityId ?? '') !== docId) continue;
    out.push({
      taskId: String(r.taskId ?? ''),
      title: String(r.title ?? ''),
      status: String(r.status ?? 'pending'),
      priority: r.priority == null ? null : String(r.priority),
      assigneeName: r.assigneeName == null ? null : String(r.assigneeName),
      assigneeId: typeof r.assigneeId === 'number' ? r.assigneeId : null,
      dueDate: r.dueDate == null ? null : String(r.dueDate),
      description: r.description == null ? null : String(r.description),
      sourceEntityType: String(r.sourceEntityType),
      sourceEntityId: String(r.sourceEntityId),
      approvalRequired: typeof r.approvalRequired === 'boolean' ? r.approvalRequired : null,
      approvalStatus: r.approvalStatus == null ? null : String(r.approvalStatus),
      createdAt: r.createdAt == null ? null : String(r.createdAt),
    });
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
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [rows, setRows] = useState<AuthoringTaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** A completion the server gated on a signature: named on the row, with the way there. */
  const [needsSignature, setNeedsSignature] = useState<string | null>(null);

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
      if (res.status === 401) {
        fireToast('Not changed — your session isn’t authenticated. Sign in and retry.', 'error');
        return;
      }
      if (!res.ok) {
        fireToast('Couldn’t change the task — ' + (serverMessage(json) ?? `the server refused it (HTTP ${res.status})`) + '. Its state is unchanged.', 'error');
        return;
      }
      fireToast(
        status === 'completed'
          ? `Review task completed — recorded on the task ledger under your name.`
          : `Review task started.`,
      );
      void load(docId);
    } catch (e) {
      const err = e as Partial<ApiRequestError> & { message?: string };
      if (err?.status === 428 || err?.code === 'ESIGN_REQUIRED') {
        setNeedsSignature(t.taskId);
        return;
      }
      if (err?.status === 409) {
        fireToast('Couldn’t change the task — ' + redactInternals(err.message, 'that transition is not allowed from its current state') + '. Its state is unchanged.', 'error');
        void load(docId);
        return;
      }
      fireToast('Couldn’t change the task — ' + redactInternals(err?.message, 'the server refused it') + '. Its state is unchanged.', 'error');
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
          <button type="button" className="nda-open" onClick={() => void load(docId)} disabled={state === 'loading'}>
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
          retry={() => void load(docId)}
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
          {rows.map(t => {
            const st = TASK_STATE_LABEL[t.status] ?? { label: t.status.replace(/-/g, ' '), tone: 'idle' as const };
            const due = dueLabel(t.dueDate);
            const canStart = t.status === 'pending' || t.status === 'blocked';
            const canComplete = t.status === 'in-progress' || t.status === 'review';
            return (
              <div key={t.taskId} className="rt-row" role="listitem" data-status={t.status} data-testid="rt-row">
                <div className="rt-row-h">
                  <span className="rt-row-t">{t.title}</span>
                  <span className={`rd-chip tone-${st.tone}`}>{st.label}</span>
                </div>
                <div className="rt-row-m">
                  {[
                    t.assigneeName ? `assigned to ${t.assigneeName}` : t.assigneeId ? `assigned to user ${t.assigneeId}` : 'unassigned',
                    due,
                    t.priority ? `${t.priority} priority` : null,
                    t.approvalRequired ? (t.approvalStatus === 'approved' ? 'signed' : 'needs e-signature to complete') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {t.description && <div className="rt-row-d">{t.description}</div>}
                <div className="rt-row-a">
                  {canStart && (
                    <button type="button" className="nda-open" disabled={busy === t.taskId} onClick={() => void transition(t, 'in-progress')}>
                      {I.play} Start
                    </button>
                  )}
                  {canComplete && (
                    <button type="button" className="nda-open" disabled={busy === t.taskId} onClick={() => void transition(t, 'completed')} data-testid="rt-complete">
                      {I.check} Complete
                    </button>
                  )}
                  <span className="rt-row-id" title={t.taskId}>{t.taskId}</span>
                </div>
                {needsSignature === t.taskId && (
                  <div className="scaf-note" role="status" style={{ marginTop: 6, fontSize: 12 }}>
                    Completing this task requires an electronic signature (21 CFR 11 §11.50). The signing ceremony — PIN, meaning, reason — runs on the Task board.
                    {onNav && (
                      <button type="button" className="nda-open" style={{ marginLeft: 8 }} onClick={() => onNav('task-board')}>
                        Open Task board
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
