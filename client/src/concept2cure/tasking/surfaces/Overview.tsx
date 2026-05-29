// Tasking overview ("Your work") — AnA-first composer + live summary tiles +
// a needs-attention queue derived from the live tasks. All tasks come from
// GET /api/regulatory/tasks/all (org-scoped). When the owner toggle is on
// "mine" the list is also assignee-filtered server-side. No kit / demo arrays.

import * as React from 'react';
import { useTasks } from '../../hooks/useTasking';
import type { Task } from '../../services/taskingService';
import { TASKING_SUGGESTIONS, statusColumn } from '../data/nav';
import { TaskingIcon } from '../icons';
import { Loading, ErrorState, Empty, PriorityPill, dueInfo, initials } from './state';

interface OverviewProps {
  projectId: number | null;
  owner: 'all' | 'mine';
  currentUserId: number | null;
  onAskAna: (t: string) => void;
}

export function TaskingOverview({ projectId, owner, currentUserId, onAskAna }: OverviewProps) {
  const filter = React.useMemo(
    () => ({
      ...(projectId != null ? { projectId } : {}),
      ...(owner === 'mine' && currentUserId != null ? { assigneeId: currentUserId } : {}),
    }),
    [projectId, owner, currentUserId],
  );
  const tasksQuery = useTasks(filter);
  const tasks = tasksQuery.data ?? [];
  const taskKey = (t: Task) => t.taskId ?? String(t.id);

  const isOpen = (t: Task) => statusColumn(String(t.status)) !== 'done';
  const open = tasks.filter(isOpen);
  const blocked = tasks.filter(t => statusColumn(String(t.status)) === 'blocked');
  const dueToday = tasks.filter(t => isOpen(t) && dueInfo(t)?.label === 'Today').length;
  const overdue = tasks.filter(t => isOpen(t) && dueInfo(t)?.overdue).length;

  // Needs-attention: open tasks that are overdue, due today, or blocked —
  // overdue first, then by priority weight.
  const prioWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const attention = tasks
    .filter(t => {
      if (!isOpen(t)) return false;
      const d = dueInfo(t);
      return (d?.overdue || d?.label === 'Today') || statusColumn(String(t.status)) === 'blocked';
    })
    .sort((a, b) => {
      const ao = dueInfo(a)?.overdue ? 1 : 0;
      const bo = dueInfo(b)?.overdue ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return (prioWeight[String(b.priority)] ?? 0) - (prioWeight[String(a.priority)] ?? 0);
    })
    .slice(0, 6);

  const [composer, setComposer] = React.useState('');
  const send = (t: string) => {
    const v = t.trim();
    if (v) onAskAna(v);
    setComposer('');
  };

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Tasking and collaboration</div>
          <h1 className="bp-title">Your work across every program</h1>
          <div className="bp-meta">
            {owner === 'mine' ? 'You own' : 'The team owns'} {open.length} open tasks · {dueToday} due today · {overdue} overdue · {blocked.length} blocked
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Show everything assigned to me, sorted by urgency')}>
            Triage with AnA
          </button>
        </div>
      </div>

      {/* AnA composer */}
      <form className="task-composer" onSubmit={e => { e.preventDefault(); send(composer); }}>
        <label htmlFor="task-composer-input" className="task-sr-only">Ask AnA to triage, reassign, or summarize</label>
        <input id="task-composer-input" type="text"
               placeholder="Ask AnA to triage, reassign, or summarize your work…"
               value={composer} onChange={e => setComposer(e.target.value)} />
        <button className="bp-btn-primary" type="submit" disabled={!composer.trim()} aria-label="Send">
          <TaskingIcon name="arrowRight" />
        </button>
      </form>

      <div className="task-starters">
        {TASKING_SUGGESTIONS.overview.map((s, i) => (
          <button key={i} className="task-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="task-starter-ico"><TaskingIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>

      {/* Live summary tiles */}
      <div className="task-tiles">
        <div className="task-tile">
          <div className="task-tile-num">{open.length}</div>
          <div className="task-tile-lbl">Open tasks</div>
        </div>
        <div className="task-tile">
          <div className="task-tile-num">{dueToday}</div>
          <div className="task-tile-lbl">Due today</div>
        </div>
        <div className="task-tile">
          <div className="task-tile-num">{overdue}</div>
          <div className="task-tile-lbl">Overdue</div>
        </div>
        <div className="task-tile">
          <div className="task-tile-num">{blocked.length}</div>
          <div className="task-tile-lbl">Blocked</div>
        </div>
      </div>

      {/* Needs-attention queue from live tasks */}
      <div className="bp-card">
        <div className="bp-card-head">
          <span>Needs attention</span>
          <span className="bp-meta">{attention.length} items</span>
        </div>
        {tasksQuery.isLoading ? (
          <Loading label="Loading tasks…" />
        ) : tasksQuery.isError ? (
          <ErrorState message="Could not load tasks." />
        ) : attention.length === 0 ? (
          <Empty>Nothing overdue, due today, or blocked. You are caught up.</Empty>
        ) : (
          <div className="task-queue">
            {attention.map(t => {
              const due = dueInfo(t);
              const isBlocked = statusColumn(String(t.status)) === 'blocked';
              return (
                <button key={taskKey(t)} className="task-q-item" type="button"
                        onClick={() => onAskAna(`Open task ${taskKey(t)} (${t.title}) on ${t.moduleType} — what is left to do and who owns it`)}>
                  <span className="task-q-ico">
                    <TaskingIcon name={isBlocked ? 'xCircle' : due?.overdue ? 'warning' : 'clock'} />
                  </span>
                  <div className="task-q-body">
                    <div className="task-q-title">{t.title}</div>
                    <div className="task-q-sub">
                      {t.moduleType}
                      {t.assigneeName ? ` · ${t.assigneeName}` : ' · Unassigned'}
                    </div>
                  </div>
                  <PriorityPill priority={String(t.priority)} />
                  {due && (
                    <span className={`task-due task-due-${due.tone}`}>
                      {due.overdue && <TaskingIcon name="warning" size={12} />}
                      {due.label}
                    </span>
                  )}
                  <span className="task-card-av" aria-hidden="true">{initials(t.assigneeName)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
