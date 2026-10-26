import React, { useEffect, useRef, useState } from 'react';
import { I } from './icons';
import { useLiveData, useLiveRows } from './dataConnect';
import { apiCall } from './apiCall';
import { useDialog } from './useDialog';
import { authService, useAuth } from '@/services/portal/authService';
import { capturedActorHeaders } from '@/utils/authToken';
import { surfaceLeaveRefusal } from './navParams';
import { taskActorScope, taskTargetLocation, type TaskActorScope } from './taskTarget';
import { NotificationOpenButton } from './NotificationOpenButton';
import { NotificationPreferences, NOTIFICATION_PREFERENCES_CHANGED } from './NotificationPreferences';
import { OpenWorkGroups, useOpenWorkReads, type MyQueue, type MyWork, type MyWorkItem, type PendingApproval } from './OpenWork';

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
     · GET /api/review/board?scope=mine         — the authoring approval
       chain (authoring_workflow_steps) at the user's sign-off, the store
       the launch workflow writes and the Review surface reads. It read
       /api/approval-workflows/pending, over document_workflows and
       unified_documents, which nothing at launch writes (document store
       consolidation step 7).
     · GET /api/mdx/notifications?unread=true   — messages & alerts
       (task assignments, blocked/completed events and Collaborate
       messages all land here).

   Every source degrades independently: a failed source says so in
   its own group and never renders as empty, and never fabricates a
   count. The trigger badge is the real total of open work — the
   hardcoded rail "12" is gone (D40) — or "?" when a count read failed.
   ================================================================ */

interface NotificationRow {
  id: number;
  category: string;
  severity: string;
  title: string;
  body: string | null;
  created_at?: string;
  resource_type?: string | null;
  resource_id?: string | number | null;
  action_url?: string | null;
  metadata?: Record<string,unknown> | null;
}

type TaskTrayProps = { onNav?: (id: string) => void; onAsk?: (text: string) => void };

function useTaskTrayOwnership(scope: TaskActorScope | null, onNav: TaskTrayProps['onNav']) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const stillOwned = () => {
    const current = taskActorScope(authService.getUser());
    if (!mounted.current || !scope || !current || current.userId !== scope.userId || current.organizationId !== scope.organizationId) return false;
    try { capturedActorHeaders({ userId: Number(scope.userId), organizationId: Number(scope.organizationId) }); return true; }
    catch { return false; }
  };
  const beforeNotificationOpen = () => {
    if (!stillOwned()) throw new Error('Your signed-in account or organization changed. Reopen Your work.');
    if (!onNav) throw new Error('Navigation is unavailable. Close and reopen Your work.');
  };
  return { stillOwned, beforeNotificationOpen };
}

function useNotificationPreferenceRefresh(scope: TaskActorScope | null, stillOwned: () => boolean,
  setRefreshKey: React.Dispatch<React.SetStateAction<number>>) {
  useEffect(() => {
    const refresh = (event: Event) => {
      const changed = (event as CustomEvent<TaskActorScope>).detail;
      if (changed?.userId === scope?.userId && changed?.organizationId === scope?.organizationId && stillOwned()) {
        setRefreshKey(key => key + 1);
      }
    };
    window.addEventListener(NOTIFICATION_PREFERENCES_CHANGED, refresh);
    return () => window.removeEventListener(NOTIFICATION_PREFERENCES_CHANGED, refresh);
  }, [scope?.userId, scope?.organizationId, stillOwned, setRefreshKey]);
}

export function TaskTray(props: TaskTrayProps) {
  const { user } = useAuth();
  const scope = taskActorScope(user);
  return <TaskTrayOwner key={scope ? `${scope.userId}:${scope.organizationId}` : 'signed-out'} {...props} scope={scope} />;
}

function TaskTrayOwner({ onNav, onAsk, scope }: TaskTrayProps & { scope: TaskActorScope | null }) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const { stillOwned, beforeNotificationOpen } = useTaskTrayOwnership(scope, onNav);

  useNotificationPreferenceRefresh(scope, stillOwned, setRefreshKey);

  // The badge needs a count while the tray is closed; the heavier sources load
  // when it opens. refreshKey re-pulls after a mutation (mark read).
  const { myWork, queue, approvals, assigned, approvalRows } = useOpenWorkReads(open, refreshKey);
  const notifs = useLiveRows<NotificationRow>(
    open ? '/api/mdx/notifications?unread=true&limit=20' : null, ['notifs', open, refreshKey]
  );
  const unread = useLiveData<{ unread: number }>('/api/mdx/notifications/unread-count', ['unread', open, refreshKey]);

  const work = myWork.data;
  /* A failed fetch used to be indistinguishable from "nothing pending": the
     group simply did not render. For the one surface whose job is telling a
     regulatory professional what needs their signature, silence that means
     "you're clear" when it actually means "we don't know" is the worst
     available failure. Surfaced the same way myWork's error already is. */
  const approvalsError = approvals.error;
  const queueError = queue.error;
  const notifsError = notifs.error;
  const badge = (work?.total ?? 0) + (unread.data?.unread ?? 0);
  /* The badge is a sum of two reads. When either failed, `?? 0` made the failed
     half vanish, so a bell with nothing on it meant "you're clear" when it
     meant "we don't know" — the failure the comment above exists to rule out.
     A failed count shows as unknown, never as a smaller or zero total. */
  const countsIncomplete = Boolean(myWork.error || unread.error);
  const triggerLabel = countsIncomplete
    ? `Your work — couldn't load every count${badge ? `; at least ${badge} item${badge === 1 ? '' : 's'} waiting` : ''}`
    : `Your work${badge ? ` — ${badge} item${badge === 1 ? '' : 's'} waiting` : ''}`;

  const markRead = async (id: number) => {
    if (!stillOwned()) { setNavigationError('Your signed-in account or organization changed. Reopen Your work.'); return; }
    const res = await apiCall('POST', `/api/mdx/notifications/${id}/read`);
    // A failed mark-read leaves the row unread — nothing is fabricated.
    if (res.ok && stillOwned()) setRefreshKey(k => k + 1);
  };

  const canLeave = () => {
    if (!stillOwned()) { setNavigationError('Your signed-in account or organization changed. Reopen Your work.'); return false; }
    const refusal = surfaceLeaveRefusal();
    if (refusal) { setNavigationError(refusal); return false; }
    return true;
  };
  const triage = onAsk ? (text: string) => {
    if (!canLeave()) return;
    onAsk(text);
    setOpen(false);
  } : undefined;
  const go = (surface: string) => {
    if (!canLeave()) return;
    if (!onNav) { setNavigationError('Navigation is unavailable. Close and reopen Your work.'); return; }
    onNav(surface);
    setOpen(false);
  };
  const openTask = (taskId: string) => {
    const target = taskTargetLocation(taskId, scope);
    if (!target) { setNavigationError('This task link is invalid. Open the task board to retry.'); return; }
    go(target);
  };

  return (
    <>
      <button
        className="tt-trigger tb-btn"
        onClick={() => { setNavigationError(''); setOpen(o => !o); }}
        title={countsIncomplete ? "Your tasks, approvals and messages — some counts couldn't be loaded" : 'Your tasks, approvals and messages'}
        aria-label={triggerLabel}
        aria-expanded={open}
      >
        {I.bell}
        {countsIncomplete ? (
          <span className="tt-badge" aria-hidden="true">?</span>
        ) : (
          badge > 0 && <span className="tt-badge">{badge > 99 ? '99+' : badge}</span>
        )}
      </button>
      {open && (
        <TrayPanel
          onClose={() => setOpen(false)}
          work={work}
          workLoading={myWork.loading}
          workError={myWork.error}
          assigned={assigned}
          queue={queue.data}
          queueError={queueError}
          approvalRows={approvalRows}
          approvalsError={approvalsError}
          notifs={notifs.rows}
          notifsLoading={notifs.loading}
          notifsError={notifsError}
          markRead={markRead}
          go={go}
          openTask={openTask}
          navigationError={navigationError}
          onAsk={triage}
          openNotification={target => { onNav?.(target); setOpen(false); }}
          beforeNotificationOpen={beforeNotificationOpen}
          openPreferences={() => { if (!stillOwned()) { setNavigationError('Your signed-in account or organization changed. Reopen Your work.'); return; } setOpen(false); setPreferencesOpen(true); }}
        />
      )}
      {preferencesOpen && scope && <NotificationPreferences scope={scope} onClose={()=>setPreferencesOpen(false)}/>}
    </>
  );
}

function TrayPanel({
  onClose, work, workLoading, workError, assigned, queue, queueError, approvalRows, approvalsError,
  notifs, notifsLoading, notifsError, markRead, go, openTask, navigationError, onAsk, openPreferences,
  openNotification, beforeNotificationOpen,
}: {
  onClose: () => void;
  work: MyWork | null;
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
  notifs: NotificationRow[];
  notifsLoading: boolean;
  /** Same rule as queueError: a failed read is not an empty inbox. */
  notifsError?: string;
  markRead: (id: number) => void;
  go: (surface: string) => void;
  openTask: (taskId: string) => void;
  navigationError: string;
  onAsk?: (text: string) => void;
  openPreferences: () => void;
  openNotification: (target: string) => void;
  beforeNotificationOpen: () => void;
}) {
  const ref = useDialog(onClose);

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

        {navigationError && <div className="tt-empty" role="alert">{navigationError}</div>}

        {onAsk && (
          <button className="tt-triage" onClick={() => { onAsk('Triage everything assigned to me across all projects and tell me what to do first'); }}>
            {I.sparkles} Triage my day with AnA
          </button>
        )}

        <div className="tt-scroll">
          <OpenWorkGroups workLoading={workLoading} workError={workError} assigned={assigned}
            queue={queue} queueError={queueError} approvalRows={approvalRows} approvalsError={approvalsError}
            go={go} openTask={openTask} />

          <div className="tt-group">
            <div className="tt-group-head">Messages &amp; alerts <button type="button" className="btn ghost small" onClick={openPreferences}>Notification preferences</button></div>
            {notifsLoading ? (
              <div className="tt-empty">Loading…</div>
            ) : notifsError ? (
              <div className="tt-empty" role="alert">
                Couldn't load your messages and alerts. Close and reopen this panel to try again.
              </div>
            ) : !notifs.length ? (
              <div className="tt-empty">No unread messages or alerts.</div>
            ) : notifs.map(n => (
              <div key={n.id} className="tt-item tt-notif" data-sev={n.severity}>
                <span className={`tt-dot tt-dot-${n.severity === 'critical' ? 'err' : n.severity === 'warning' ? 'warn' : 'ok'}`} aria-hidden />
                <span className="tt-item-body">
                  <span className="tt-item-title">{n.title}</span>
                  {n.body && <span className="tt-item-sub">{n.body}</span>}
                  <NotificationOpenButton notice={n} navigate={openNotification} beforeOpen={beforeNotificationOpen}/>
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
