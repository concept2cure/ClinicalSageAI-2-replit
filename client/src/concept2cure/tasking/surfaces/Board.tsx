// Tasking board — live Kanban across every program from
// GET /api/regulatory/tasks/all, grouped into columns by status. Each card is a
// keyboard-operable button; moving a card to the next / previous column issues a
// real PATCH /api/regulatory/tasks/:id/status. No kit / demo arrays.

import * as React from 'react';
import { useTasks, useUpdateTaskStatus } from '../../hooks/useTasking';
import type { Task, TaskStatus } from '../../services/taskingService';
import {
  TASK_COLUMNS, COLUMN_TARGET_STATUS, statusColumn, TASKING_SUGGESTIONS,
} from '../data/nav';
import { TaskingIcon } from '../icons';
import { Loading, ErrorState, Empty, PriorityPill, dueInfo, initials } from './state';

interface BoardProps {
  projectId: number | null;
  owner: 'all' | 'mine';
  currentUserId: number | null;
  onAskAna: (t: string) => void;
}

const COLUMN_ORDER = TASK_COLUMNS.map(c => c.id);

export function TaskingBoard({ projectId, owner, currentUserId, onAskAna }: BoardProps) {
  const filter = React.useMemo(
    () => ({
      ...(projectId != null ? { projectId } : {}),
      ...(owner === 'mine' && currentUserId != null ? { assigneeId: currentUserId } : {}),
    }),
    [projectId, owner, currentUserId],
  );
  const tasksQuery = useTasks(filter);
  const updateStatus = useUpdateTaskStatus();
  const tasks = tasksQuery.data ?? [];

  const taskKey = (t: Task) => t.taskId ?? String(t.id);

  const move = (t: Task, direction: 1 | -1) => {
    const colId = statusColumn(String(t.status));
    const idx = COLUMN_ORDER.indexOf(colId);
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= COLUMN_ORDER.length) return;
    const nextStatus = COLUMN_TARGET_STATUS[COLUMN_ORDER[nextIdx]] as TaskStatus;
    updateStatus.mutate({ id: taskKey(t), status: nextStatus, userId: currentUserId ?? undefined });
  };

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Tasking · cross-program</div>
          <h1 className="bp-title">Board</h1>
          <div className="bp-meta">
            {tasks.length} tasks · {owner === 'mine' ? 'assigned to you' : 'all assignees'}
            {projectId != null ? ' · one program' : ' · every program'}
          </div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('Reassign the overdue tasks and notify the owners')}>
            Ask AnA
          </button>
        </div>
      </div>

      {tasksQuery.isLoading ? (
        <Loading label="Loading tasks…" />
      ) : tasksQuery.isError ? (
        <ErrorState message="Could not load tasks." />
      ) : tasks.length === 0 ? (
        <Empty>No tasks match this filter yet.</Empty>
      ) : (
        <div className="task-board" role="list" aria-label="Task board">
          {TASK_COLUMNS.map(col => {
            const items = tasks.filter(t => statusColumn(String(t.status)) === col.id);
            const colIdx = COLUMN_ORDER.indexOf(col.id);
            return (
              <section key={col.id} className="task-col" role="listitem" aria-label={`${col.label}, ${items.length} tasks`}>
                <header className="task-col-head">
                  <span>{col.label}</span>
                  <span className="task-col-count">{items.length}</span>
                </header>
                <div className="task-col-body">
                  {items.map(t => {
                    const due = dueInfo(t);
                    const canPrev = colIdx > 0;
                    const canNext = colIdx < COLUMN_ORDER.length - 1;
                    return (
                      <div key={taskKey(t)} className="task-card">
                        <button className="task-card-main" type="button"
                                onClick={() => onAskAna(`Open task ${taskKey(t)} (${t.title}) on ${t.moduleType}`)}>
                          <div className="task-card-top">
                            <span className="task-card-kind">{t.moduleType}</span>
                            <PriorityPill priority={String(t.priority)} />
                          </div>
                          <div className="task-card-title">{t.title}</div>
                          <div className="task-card-foot">
                            {due && (
                              <span className={`task-due task-due-${due.tone}`}>
                                {due.overdue && <TaskingIcon name="warning" size={12} />}
                                {due.label}
                              </span>
                            )}
                            <span className="task-card-av" title={t.assigneeName ?? 'Unassigned'}
                                  aria-label={t.assigneeName ? `Assigned to ${t.assigneeName}` : 'Unassigned'}>
                              {initials(t.assigneeName)}
                            </span>
                          </div>
                        </button>
                        <div className="task-card-move" role="group" aria-label="Move task">
                          <button type="button" className="task-move-btn"
                                  disabled={!canPrev || updateStatus.isPending}
                                  aria-label={`Move ${t.title} to previous column`}
                                  title="Move back"
                                  onClick={() => move(t, -1)}>
                            <TaskingIcon name="arrowLeft" size={13} />
                          </button>
                          <button type="button" className="task-move-btn"
                                  disabled={!canNext || updateStatus.isPending}
                                  aria-label={`Move ${t.title} to next column`}
                                  title="Move forward"
                                  onClick={() => move(t, 1)}>
                            <TaskingIcon name="arrowRight" size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="task-col-empty">Nothing here</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="task-starters">
        {TASKING_SUGGESTIONS.board.map((s, i) => (
          <button key={i} className="task-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="task-starter-ico"><TaskingIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
