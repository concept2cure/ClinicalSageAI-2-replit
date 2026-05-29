// Tasking list — live table of every task from GET /api/regulatory/tasks/all.
// Title, program (module), assignee, priority, due date, status. Sorted by due
// date with overdue first. No kit / demo arrays.

import * as React from 'react';
import { useTasks } from '../../hooks/useTasking';
import type { Task } from '../../services/taskingService';
import { TASKING_SUGGESTIONS } from '../data/nav';
import { TaskingIcon } from '../icons';
import {
  Loading, ErrorState, Empty, StatusChip, PriorityPill, statusTone, statusLabel, dueInfo, initials,
} from './state';

interface ListProps {
  projectId: number | null;
  owner: 'all' | 'mine';
  currentUserId: number | null;
  onAskAna: (t: string) => void;
}

export function TaskingList({ projectId, owner, currentUserId, onAskAna }: ListProps) {
  const filter = React.useMemo(
    () => ({
      ...(projectId != null ? { projectId } : {}),
      ...(owner === 'mine' && currentUserId != null ? { assigneeId: currentUserId } : {}),
    }),
    [projectId, owner, currentUserId],
  );
  const tasksQuery = useTasks(filter);
  const taskKey = (t: Task) => t.taskId ?? String(t.id);

  // Sort by due date, undated last; the server already orders by priority.
  const rows = React.useMemo(() => {
    const list = [...(tasksQuery.data ?? [])];
    return list.sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }, [tasksQuery.data]);

  return (
    <div className="bp-surface">
      <div className="bp-page-head">
        <div>
          <div className="bp-kicker">Tasking · cross-program</div>
          <h1 className="bp-title">List</h1>
          <div className="bp-meta">Title, program, assignee, priority, due date, status</div>
        </div>
        <div className="bp-page-actions">
          <button className="bp-btn-primary" type="button"
                  onClick={() => onAskAna('List every high or critical task due this week')}>
            Ask AnA
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-card-head">
          <span>Tasks</span>
          <span className="bp-meta">{rows.length} tasks</span>
        </div>
        {tasksQuery.isLoading ? (
          <Loading label="Loading tasks…" />
        ) : tasksQuery.isError ? (
          <ErrorState message="Could not load tasks." />
        ) : rows.length === 0 ? (
          <Empty>No tasks match this filter yet.</Empty>
        ) : (
          <table className="bp-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Program</th>
                <th>Assignee</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => {
                const due = dueInfo(t);
                return (
                  <tr key={taskKey(t)}>
                    <td>
                      <button className="task-link" type="button"
                              onClick={() => onAskAna(`Open task ${taskKey(t)} (${t.title}) on ${t.moduleType}`)}>
                        <span className="task-link-t">{t.title}</span>
                        {t.category && <span className="task-link-s">{t.category}</span>}
                      </button>
                    </td>
                    <td className="task-mut">{t.moduleType}</td>
                    <td>
                      <span className="task-assignee">
                        <span className="task-card-av" aria-hidden="true">{initials(t.assigneeName)}</span>
                        <span>{t.assigneeName ?? 'Unassigned'}</span>
                      </span>
                    </td>
                    <td><PriorityPill priority={String(t.priority)} /></td>
                    <td>
                      {due
                        ? <span className={`task-due task-due-${due.tone}`}>
                            {due.overdue && <TaskingIcon name="warning" size={12} />}
                            {due.label}
                          </span>
                        : <span className="task-mut">No due date</span>}
                    </td>
                    <td><StatusChip tone={statusTone(String(t.status))} label={statusLabel(String(t.status))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="task-starters">
        {TASKING_SUGGESTIONS.list.map((s, i) => (
          <button key={i} className="task-starter" type="button" onClick={() => onAskAna(s)}>
            <span className="task-starter-ico"><TaskingIcon name="sparkles" /></span>
            <span>{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
