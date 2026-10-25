/**
 * Your open work — what is waiting for the signed-in person, in three groups:
 * tasks assigned to them (sections to write, deliverables from a project's
 * Plan), approvals they sign, and reviews. One reading and one rendering for
 * the two places that show it: the top bar's "Your work" panel (TaskTray.tsx)
 * and Home's "Your open items" (HomeSections.tsx; CLIENT_JOURNEY_2026-10-25.md,
 * pass 5, decision 9). Moved here from TaskTray, unchanged in what it reads and
 * says, so Home does not draw a second copy.
 *
 * Reads (each degrades on its own; a failed read is said, never an empty list):
 *   GET /api/task-management/my-work      open unified tasks assigned to you
 *   GET /api/concept2cure/reviews/my-queue review threads and tasks for you
 *   GET /api/review/board?scope=mine      authoring approvals at your sign-off
 */
import React from 'react';
import { I } from './icons';
import { useLiveData } from './dataConnect';

export interface MyWorkItem {
  taskId: string;
  title: string;
  projectId: number | null;
  moduleType: string;
  status: string;
  priority: string;
  dueDate: string | null;
  overdue: boolean;
  dueSoon: boolean;
  blocked: boolean;
  approvalRequired: boolean;
  approvalStatus: string;
  criticalPath: boolean;
}
export interface MyWork {
  items: MyWorkItem[];
  total: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  approvalsPending: number;
}
export interface MyQueue {
  threads: Array<{ threadId: string; title: string | null; artifactTitle?: string | null; priority?: string | null }>;
  tasks: Array<{ taskId: string; title: string; dueAt?: string | null; artifactTitle?: string | null; taskType?: string }>;
  totalThreads: number;
  totalTasks: number;
  unreadNotifications: number;
  overdueTasks: number;
}
/** The fields of one GET /api/review/board queue row this tray reads
 *  (ReviewItemView, server/services/review/authoring-review-board.ts). The
 *  authoring store records no due date, so none is shown. */
export interface PendingApproval {
  id: string;
  doc: string;
  prog: string | null;
  role: string;
  atMySignOff: boolean;
}

/** Only a canonical saved-run resource creates a report navigation target. */
export function dueLabel(iso: string | null): string {
  if (!iso) return '';
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return '';
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days}d`;
}

/** The three reads. `full` false reads only my-work (the bell's badge while its panel is closed). */
export function useOpenWorkReads(full: boolean, refreshKey: number) {
  const myWork = useLiveData<MyWork>('/api/task-management/my-work', ['my-work', full, refreshKey]);
  const queue = useLiveData<MyQueue>(full ? '/api/concept2cure/reviews/my-queue' : null, ['my-queue', full, refreshKey]);
  const approvals = useLiveData<{ queue: PendingApproval[] }>(
    full ? '/api/review/board?scope=mine&limit=25' : null, ['approvals', full, refreshKey]
  );
  return {
    myWork, queue, approvals,
    assigned: myWork.data?.items ?? [],
    approvalRows: (approvals.data?.queue ?? []).filter((a) => a.atMySignOff),
  };
}

type Go = (surface: string) => void;

/** One row: a dot whose tone repeats the words beside it, a title, a line of detail. */
function WorkRow({ tone, title, sub, onOpen }: { tone: 'err' | 'warn' | 'ok'; title: string; sub: string; onOpen: () => void }) {
  return (
    <button className="tt-item" onClick={onOpen}>
      <span className={`tt-dot tt-dot-${tone}`} aria-hidden />
      <span className="tt-item-body">
        <span className="tt-item-title">{title}</span>
        <span className="tt-item-sub">{sub}</span>
      </span>
      <span className="tt-go">{I.arrowRight}</span>
    </button>
  );
}

function AssignedGroup({ workLoading, workError, assigned, go, openTask }: {
  workLoading: boolean; workError?: string; assigned: MyWorkItem[]; go: Go; openTask: (taskId: string) => void;
}) {
  // Overdue first, then due-soon, then the rest — the triage order.
  const ordered = [...assigned].sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) || Number(b.dueSoon) - Number(a.dueSoon)
  );
  const tone = (t: MyWorkItem) => (t.overdue ? 'err' : t.dueSoon || t.blocked ? 'warn' : 'ok');
  return (
    <div className="tt-group">
      <div className="tt-group-head">Assigned to you</div>
      {workLoading ? (
        <div className="tt-empty">Loading…</div>
      ) : workError ? (
        <div className="tt-empty" role="alert">Couldn't load your tasks — retry from the board.</div>
      ) : !ordered.length ? (
        <div className="tt-empty">Nothing assigned to you right now. Tasks land here as soon as someone assigns you one.</div>
      ) : ordered.slice(0, 8).map(t => (
        <WorkRow key={t.taskId} tone={tone(t)} title={t.title} onOpen={() => openTask(t.taskId)}
          sub={`${t.moduleType}${t.blocked ? ' · blocked' : ''}${t.dueDate ? ` · ${dueLabel(t.dueDate)}` : ''}`} />
      ))}
      {ordered.length > 8 && (
        <button className="tt-more" onClick={() => go('tasks')}>+{ordered.length - 8} more on the board</button>
      )}
    </div>
  );
}

function ApprovalsGroup({ assigned, approvalRows, approvalsError, go, openTask }: {
  assigned: MyWorkItem[]; approvalRows: PendingApproval[]; approvalsError?: string; go: Go; openTask: (taskId: string) => void;
}) {
  // "Not yet approved", not "== pending": approval_status is nullable with no
  // default and nothing writes 'pending', so the old predicate meant this
  // group could never list a task.
  const approvalsFromBoard = assigned.filter(t => t.approvalRequired && t.approvalStatus !== 'approved');
  if (!approvalsFromBoard.length && !approvalRows.length && !approvalsError) return null;
  return (
    <div className="tt-group">
      <div className="tt-group-head">Approvals — you sign</div>
      {approvalsError && (
        <div className="tt-empty" role="alert">
          Couldn't load your approvals, so this list may be incomplete — open Review to check.
        </div>
      )}
      {approvalsFromBoard.map(t => (
        <WorkRow key={t.taskId} tone="err" title={t.title} onOpen={() => openTask(t.taskId)}
          sub={`Task approval pending${t.dueDate ? ` · ${dueLabel(t.dueDate)}` : ''}`} />
      ))}
      {approvalRows.slice(0, 5).map((a) => (
        <WorkRow key={a.id} tone="err" title={a.doc || 'Document approval'} onOpen={() => go('review')}
          sub={`${a.role ? `${a.role} · ` : ''}${a.prog ? `${a.prog} · ` : ''}awaiting your sign-off`} />
      ))}
      {/* Without this, someone with 7 pending approvals saw 5 and had no
          signal the other 2 existed — for signature-required items. */}
      {approvalRows.length > 5 && (
        <button className="tt-more" onClick={() => go('review')}>
          +{approvalRows.length - 5} more awaiting your sign-off
        </button>
      )}
    </div>
  );
}

function ReviewGroup({ queue, queueError, go }: { queue: MyQueue | null; queueError?: string; go: Go }) {
  const reviewTasks = queue?.tasks ?? [];
  const reviewThreads = queue?.threads ?? [];
  if (!reviewTasks.length && !reviewThreads.length && !queueError) return null;
  return (
    <div className="tt-group">
      <div className="tt-group-head">Review — threads &amp; change requests</div>
      {queueError && (
        <div className="tt-empty" role="alert">
          Couldn't load your review queue, so this list may be incomplete — open Review to check.
        </div>
      )}
      {reviewTasks.slice(0, 5).map(t => (
        <WorkRow key={t.taskId} tone="warn" title={t.title} onOpen={() => go('review')}
          sub={`${t.artifactTitle || 'Review task'}${t.dueAt ? ` · ${dueLabel(t.dueAt)}` : ''}`} />
      ))}
      {reviewThreads.slice(0, 5).map(t => (
        <WorkRow key={t.threadId} tone="warn" title={t.title || 'Review thread'} onOpen={() => go('review')}
          sub={t.artifactTitle || 'Open discussion assigned to you'} />
      ))}
      {(reviewTasks.length > 5 || reviewThreads.length > 5) && (
        <button className="tt-more" onClick={() => go('review')}>
          +{Math.max(reviewTasks.length - 5, 0) + Math.max(reviewThreads.length - 5, 0)} more in review
        </button>
      )}
    </div>
  );
}

export function OpenWorkGroups({ workLoading, workError, assigned, queue, queueError, approvalRows, approvalsError, go, openTask }: {
  workLoading: boolean;
  workError?: string;
  assigned: MyWorkItem[];
  queue: MyQueue | null;
  /** Fetch failures are passed in, not swallowed: an empty approvals list and a
   *  failed approvals fetch must not look the same on a surface whose job is
   *  telling someone what needs their signature. */
  queueError?: string;
  approvalRows: PendingApproval[];
  approvalsError?: string;
  go: Go;
  openTask: (taskId: string) => void;
}) {
  return (
    <>
      <AssignedGroup workLoading={workLoading} workError={workError} assigned={assigned} go={go} openTask={openTask} />
      <ApprovalsGroup assigned={assigned} approvalRows={approvalRows} approvalsError={approvalsError} go={go} openTask={openTask} />
      <ReviewGroup queue={queue} queueError={queueError} go={go} />
    </>
  );
}
