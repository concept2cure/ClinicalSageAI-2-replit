/**
 * Communication Center · Review queue — every cross-program task currently in
 * the `review` state, org-scoped, for the current user when the "mine" filter
 * is on. Reuses the live tasking hook (useTasks → /api/regulatory/tasks/all)
 * and the tasking state helpers; no kit/demo arrays.
 *
 * This is the "what's waiting on me" half of the handoff hub — the approvals
 * tab covers formal e-sign sign-offs; this covers review-state work items.
 */

import * as React from 'react';
import { useTasks } from '../../hooks/useTasking';
import type { Task } from '../../services/taskingService';
import {
  Loading, ErrorState, Empty, PriorityPill, dueInfo, initials,
} from '../../tasking/surfaces/state';

interface ReviewQueueProps {
  owner: 'all' | 'mine';
  currentUserId: number | null;
  onAskAna: (t: string) => void;
}

export function CommReviewQueue({ owner, currentUserId, onAskAna }: ReviewQueueProps) {
  const filter = React.useMemo(
    () => ({
      status: 'review' as const,
      ...(owner === 'mine' && currentUserId != null ? { assigneeId: currentUserId } : {}),
    }),
    [owner, currentUserId],
  );
  const tasksQuery = useTasks(filter);

  // Due date ascending, undated last.
  const rows = React.useMemo(() => {
    const list = [...(tasksQuery.data ?? [])];
    return list.sort((a, b) => {
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }, [tasksQuery.data]);

  if (tasksQuery.isLoading) return <Loading label="Loading review queue…" />;
  if (tasksQuery.isError) return <ErrorState message="Could not load the review queue. Try again." />;
  if (rows.length === 0) return <Empty>Nothing is waiting on your review.</Empty>;

  const taskKey = (t: Task) => t.taskId ?? String(t.id);

  return (
    <div className="panel">
      <div className="panel-hdr">
        <div>
          <div className="t">Review queue</div>
          <div className="s">
            {rows.length} item{rows.length === 1 ? '' : 's'} in review · {owner === 'mine' ? 'assigned to you' : 'all programs'}
          </div>
        </div>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Task</th>
            <th>Module</th>
            <th>Owner</th>
            <th>Priority</th>
            <th>Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const due = dueInfo(t);
            return (
              <tr key={taskKey(t)}>
                <td>
                  <div className="k-name">{t.title}</div>
                  {t.category && <div className="k-holder">{t.category}</div>}
                </td>
                <td style={{ color: 'var(--text-300)' }}>{t.moduleType}</td>
                <td style={{ color: 'var(--text-300)' }}>
                  {t.assigneeName ? `${initials(t.assigneeName)} · ${t.assigneeName}` : 'Unassigned'}
                </td>
                <td><PriorityPill priority={String(t.priority)} /></td>
                <td>
                  {due ? (
                    <span className={`status-pill ${due.overdue ? 'empty' : 'review'}`}>{due.label}</span>
                  ) : (
                    <span className="status-pill na">No due date</span>
                  )}
                  <button
                    type="button"
                    className="tb-btn"
                    style={{ marginLeft: 6 }}
                    title="Ask AnA about this item"
                    aria-label={`Ask AnA about ${t.title}`}
                    onClick={() => onAskAna(`Help me review "${t.title}" (${t.moduleType}). Summarize what needs checking and draft a review note.`)}
                  >
                    Ask AnA
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
