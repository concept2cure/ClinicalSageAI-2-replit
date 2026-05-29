// Tasking nav — cross-program task management workstream. Copy + groupings
// adapted from ui_kits/tasking (TK_COLUMNS, TK_SUGGESTIONS). Surfaces are backed
// by server/routes/unifiedTasks.routes.ts at /api/regulatory/tasks.

export interface TaskingNavItem {
  id: string;
  label: string;
  icon: string;
}

export const TASKING_NAV: TaskingNavItem[] = [
  { id: 'overview', label: 'Your work', icon: 'check' },
  { id: 'board',    label: 'Board',     icon: 'columns' },
  { id: 'list',     label: 'List',      icon: 'list' },
];

export const HERE_LABEL_TASKING: Record<string, string> = {
  overview: 'Your work',
  board:    'Board',
  list:     'List',
};

// Kanban columns. Each unified-tasks status maps to exactly one column; the
// column label carries the meaning so a card's position never depends on color.
export interface TaskColumn {
  id: string;
  label: string;
  /** unified_tasks status values that land in this column. */
  statuses: string[];
}

export const TASK_COLUMNS: TaskColumn[] = [
  { id: 'todo',    label: 'To do',       statuses: ['pending'] },
  { id: 'doing',   label: 'In progress', statuses: ['in-progress'] },
  { id: 'review',  label: 'In review',   statuses: ['review'] },
  { id: 'blocked', label: 'Blocked',     statuses: ['blocked'] },
  { id: 'done',    label: 'Done',        statuses: ['completed'] },
];

// The status a card moves to when dropped into / actioned toward a column.
export const COLUMN_TARGET_STATUS: Record<string, string> = {
  todo:    'pending',
  doing:   'in-progress',
  review:  'review',
  blocked: 'blocked',
  done:    'completed',
};

/** Map a raw unified-tasks status to its board column id. */
export function statusColumn(status: string): string {
  const v = (status || '').toLowerCase();
  const col = TASK_COLUMNS.find(c => c.statuses.includes(v));
  return col?.id ?? 'todo';
}

// Human-readable status labels (paired with text so meaning is never color-only).
export const TASK_STATUS_LABEL: Record<string, string> = {
  'pending':     'To do',
  'in-progress': 'In progress',
  'review':      'In review',
  'blocked':     'Blocked',
  'completed':   'Done',
  'cancelled':   'Cancelled',
};

// Human-readable priority labels.
export const TASK_PRIORITY_LABEL: Record<string, string> = {
  low:      'Low',
  medium:   'Medium',
  high:     'High',
  critical: 'Critical',
};

// Three AnA prompts per surface (sentence case, second person, no emoji).
export const TASKING_SUGGESTIONS: Record<string, string[]> = {
  overview: [
    'Show everything assigned to me, sorted by urgency',
    'What am I blocking for other people right now',
    'Summarize what is overdue across every program',
  ],
  board: [
    'Which tasks are blocked and what is blocking them',
    'Move the tasks that are ready for review into review',
    'Reassign the overdue tasks and notify the owners',
  ],
  list: [
    'List every high or critical task due this week',
    'Group the open tasks by program and assignee',
    'Which tasks have no due date set yet',
  ],
};
