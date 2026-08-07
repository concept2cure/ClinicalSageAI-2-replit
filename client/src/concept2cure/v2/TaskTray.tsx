import React, { useEffect, useState } from 'react';
import { I } from './icons';
import { useLiveData, useLiveRows } from './dataConnect';
import { apiRequest } from '@/lib/queryClient';
import { useDialog } from './useDialog';

/* ================================================================
   Task Tray — the persistent "what needs me" affordance in every
   shell top bar (assessment P3: tasking is connective tissue,
   accessed in-place — not a destination).

   Real data only:
     · GET /api/task-management/my-work         — open unified tasks
       assigned to the signed-in user, with overdue / due-soon /
       approval counts (canonical store).
     · GET /api/concept2cure/reviews/my-queue   — review threads +
       review tasks assigned to the user (Phase-13 collaboration
       backend — previously shipped with no client consumer at all).
     · GET /api/approval-workflows/pending      — workflow approvals
       awaiting the user's sign-off.
     · GET /api/mdx/notifications?unread=true   — messages & alerts
       (task assignments, blocked/completed events and Collaborate
       messages all land here).

   Every source degrades independently to its own honest empty; a
   failed source never fabricates a count. The trigger badge is the
   real total of open work — the hardcoded rail "12" is gone (D40).
   ================================================================ */

interface MyWorkItem {
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
interface MyWork {
  items: MyWorkItem[];
  total: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  approvalsPending: number;
}
interface MyQueue {
  threads: Array<{ threadId: string; title: string | null; artifactTitle?: string | null; priority?: string | null }>;
  tasks: Array<{ taskId: string; title: string; dueAt?: string | null; artifactTitle?: string | null; taskType?: string }>;
  totalThreads: number;
  totalTasks: number;
  unreadNotifications: number;
  overdueTasks: number;
}
interface PendingApproval {
  workflowId?: string;
  documentTitle?: string;
  stepName?: string;
  startedByName?: string;
  due?: string | null;
}
interface NotificationRow {
  id: number;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  created_at?: string;
}

function dueLabel(iso: string | null): string {
  if (!iso) return '';
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return '';
  const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `${-days}d overdue`;
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days}d`;
}

export function TaskTray({ onNav, onAsk }: { onNav?: (id: string) => void; onAsk?: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // The badge needs a count while the tray is closed; the heavier sources load
  // when it opens. refreshKey re-pulls after a mutation (mark read).
  const myWork = useLiveData<MyWork>('/api/task-management/my-work', ['my-work', open, refreshKey]);
  const queue = useLiveData<MyQueue>(open ? '/api/concept2cure/reviews/my-queue' : null, ['my-queue', open, refreshKey]);
  const approvals = useLiveData<{ approvals: PendingApproval[] }>(
    open ? '/api/approval-workflows/pending' : null, ['approvals', open, refreshKey]
  );
  const notifs = useLiveRows<NotificationRow>(
    open ? '/api/mdx/notifications?unread=true&limit=20' : null, ['notifs', open, refreshKey]
  );
  const unread = useLiveData<{ unread: number }>('/api/mdx/notifications/unread-count', ['unread', open, refreshKey]);

  const work = myWork.data;
  const assigned = work?.items ?? [];
  const approvalRows = approvals.data?.approvals ?? [];
  const badge = (work?.total ?? 0) + (unread.data?.unread ?? 0);

  const markRead = async (id: number) => {
    try {
      await apiRequest('POST', `/api/mdx/notifications/${id}/read`);
      setRefreshKey(k => k + 1);
    } catch { /* the row stays unread; nothing fabricated */ }
  };

  const go = (surface: string) => {
    setOpen(false);
    onNav?.(surface);
  };

  return (
    <>
      <button
        className="tt-trigger tb-btn"
        onClick={() => setOpen(o => !o)}
        title="Your tasks, approvals and messages"
        aria-label={`Your work${badge ? ` — ${badge} item${badge === 1 ? '' : 's'} waiting` : ''}`}
        aria-expanded={open}
      >
        {I.bell}
        {badge > 0 && <span className="tt-badge">{badge > 99 ? '99+' : badge}</span>}
      </button>
      {open && (
        <TrayPanel
          onClose={() => setOpen(false)}
          work={work}
          workLoading={myWork.loading}
          workError={myWork.error}
          assigned={assigned}
          queue={queue.data}
          approvalRows={approvalRows}
          notifs={notifs.rows}
          notifsLoading={notifs.loading}
          markRead={markRead}
          go={go}
          onAsk={onAsk}
        />
      )}
    </>
  );
}

function TrayPanel({
  onClose, work, workLoading, workError, assigned, queue, approvalRows,
  notifs, notifsLoading, markRead, go, onAsk,
}: {
  onClose: () => void;
  work: MyWork | null;
  workLoading: boolean;
  workError?: string;
  assigned: MyWorkItem[];
  queue: MyQueue | null;
  approvalRows: PendingApproval[];
  notifs: NotificationRow[];
  notifsLoading: boolean;
  markRead: (id: number) => void;
  go: (surface: string) => void;
  onAsk?: (text: string) => void;
}) {
  const ref = useDialog(onClose);
  // Overdue first, then due-soon, then the rest — the triage order.
  const ordered = [...assigned].sort((a, b) =>
    Number(b.overdue) - Number(a.overdue) || Number(b.dueSoon) - Number(a.dueSoon)
  );
  const reviewTasks = queue?.tasks ?? [];
  const reviewThreads = queue?.threads ?? [];
  const approvalsFromBoard = assigned.filter(t => t.approvalRequired && t.approvalStatus === 'pending');

  return (
    <>
      <div className="tt-scrim" onClick={onClose} />
      <aside className="tt-panel" role="dialog" aria-modal="true" aria-label="Your work" tabIndex={-1} ref={ref}>
        <div className="tt-head">
          <b>Your work</b>
          <span className="tt-head-meta">
            {work ? `${work.total} assigned · ${work.overdue} overdue` : workLoading ? 'loading…' : ''}
          </span>
          <button className="tt-close" onClick={onClose} aria-label="Close">{I.close}</button>
        </div>

        {onAsk && (
          <button className="tt-triage" onClick={() => { onAsk('Triage everything assigned to me across all projects and tell me what to do first'); onClose(); }}>
            {I.sparkles} Triage my day with AnA
          </button>
        )}

        <div className="tt-scroll">
          <div className="tt-group">
            <div className="tt-group-head">Assigned to you</div>
            {workLoading ? (
              <div className="tt-empty">Loading…</div>
            ) : workError ? (
              <div className="tt-empty" role="alert">Couldn't load your tasks — retry from the board.</div>
            ) : !ordered.length ? (
              <div className="tt-empty">Nothing assigned to you right now.</div>
            ) : ordered.slice(0, 8).map(t => (
              <button key={t.taskId} className="tt-item" onClick={() => go('tasks')}>
                <span className={`tt-dot tt-dot-${t.overdue ? 'err' : t.dueSoon || t.blocked ? 'warn' : 'ok'}`} aria-hidden />
                <span className="tt-item-body">
                  <span className="tt-item-title">{t.title}</span>
                  <span className="tt-item-sub">
                    {t.moduleType}{t.blocked ? ' · blocked' : ''}{t.dueDate ? ` · ${dueLabel(t.dueDate)}` : ''}
                  </span>
                </span>
                <span className="tt-go">{I.arrowRight}</span>
              </button>
            ))}
            {ordered.length > 8 && (
              <button className="tt-more" onClick={() => go('tasks')}>+{ordered.length - 8} more on the board</button>
            )}
          </div>

          {(approvalsFromBoard.length > 0 || approvalRows.length > 0) && (
            <div className="tt-group">
              <div className="tt-group-head">Approvals — you sign</div>
              {approvalsFromBoard.map(t => (
                <button key={t.taskId} className="tt-item" onClick={() => go('tasks')}>
                  <span className="tt-dot tt-dot-err" aria-hidden />
                  <span className="tt-item-body">
                    <span className="tt-item-title">{t.title}</span>
                    <span className="tt-item-sub">Task approval pending{t.dueDate ? ` · ${dueLabel(t.dueDate)}` : ''}</span>
                  </span>
                  <span className="tt-go">{I.arrowRight}</span>
                </button>
              ))}
              {approvalRows.slice(0, 5).map((a, i) => (
                <button key={a.workflowId ?? i} className="tt-item" onClick={() => go('review')}>
                  <span className="tt-dot tt-dot-err" aria-hidden />
                  <span className="tt-item-body">
                    <span className="tt-item-title">{a.documentTitle || a.stepName || 'Workflow approval'}</span>
                    <span className="tt-item-sub">{a.stepName ? `${a.stepName} · ` : ''}{a.startedByName ? `from ${a.startedByName}` : 'awaiting your sign-off'}</span>
                  </span>
                  <span className="tt-go">{I.arrowRight}</span>
                </button>
              ))}
            </div>
          )}

          {(reviewTasks.length > 0 || reviewThreads.length > 0) && (
            <div className="tt-group">
              <div className="tt-group-head">Review — threads &amp; change requests</div>
              {reviewTasks.slice(0, 5).map(t => (
                <button key={t.taskId} className="tt-item" onClick={() => go('review')}>
                  <span className="tt-dot tt-dot-warn" aria-hidden />
                  <span className="tt-item-body">
                    <span className="tt-item-title">{t.title}</span>
                    <span className="tt-item-sub">{t.artifactTitle || 'Review task'}{t.dueAt ? ` · ${dueLabel(t.dueAt)}` : ''}</span>
                  </span>
                  <span className="tt-go">{I.arrowRight}</span>
                </button>
              ))}
              {reviewThreads.slice(0, 5).map(t => (
                <button key={t.threadId} className="tt-item" onClick={() => go('review')}>
                  <span className="tt-dot tt-dot-warn" aria-hidden />
                  <span className="tt-item-body">
                    <span className="tt-item-title">{t.title || 'Review thread'}</span>
                    <span className="tt-item-sub">{t.artifactTitle || 'Open discussion assigned to you'}</span>
                  </span>
                  <span className="tt-go">{I.arrowRight}</span>
                </button>
              ))}
            </div>
          )}

          <div className="tt-group">
            <div className="tt-group-head">Messages &amp; alerts</div>
            {notifsLoading ? (
              <div className="tt-empty">Loading…</div>
            ) : !notifs.length ? (
              <div className="tt-empty">You're all caught up.</div>
            ) : notifs.map(n => (
              <div key={n.id} className="tt-item tt-notif" data-sev={n.severity}>
                <span className={`tt-dot tt-dot-${n.severity === 'critical' ? 'err' : n.severity === 'warning' ? 'warn' : 'ok'}`} aria-hidden />
                <span className="tt-item-body">
                  <span className="tt-item-title">{n.title}</span>
                  {n.body && <span className="tt-item-sub">{n.body}</span>}
                </span>
                <button className="tt-read" onClick={() => markRead(n.id)} aria-label={`Mark "${n.title}" read`} title="Mark read">{I.check}</button>
              </div>
            ))}
          </div>
        </div>

        <button className="tt-foot" onClick={() => go('tasks')}>
          Open the task board {I.arrowRight}
        </button>
      </aside>
    </>
  );
}
