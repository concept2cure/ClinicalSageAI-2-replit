// Shared loading / empty / error states + chips for tasking surfaces.
// Status, priority, and due-date signals never rely on color alone — every chip
// pairs a tone with a text label and (for status / overdue) a matching icon —
// WCAG 2.2 AA (color is never the only signal).

import * as React from 'react';
import { TaskingIcon } from '../icons';
import { TASK_STATUS_LABEL, TASK_PRIORITY_LABEL } from '../data/nav';
import type { Task } from '../../services/taskingService';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="task-state" role="status">{label}</div>;
}

export function ErrorState({ message }: { message?: string }) {
  return (
    <div className="task-state task-state-err" role="alert">
      {message ?? 'Could not load this data. Try again.'}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="task-state">{children}</div>;
}

type Tone = 'ok' | 'warn' | 'err' | 'review' | 'dim';

const TONE_ICON: Record<Tone, string> = {
  ok: 'checkCircle',
  warn: 'clock',
  err: 'xCircle',
  review: 'alertCircle',
  dim: 'alertCircle',
};

/** Status chip — pairs a tone with a text label and a matching icon so the
 *  state is never conveyed by color alone. */
export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`task-chip task-chip-${tone}`}>
      <TaskingIcon name={TONE_ICON[tone]} />
      {label}
    </span>
  );
}

/** Map a raw unified-tasks status to a chip tone. */
export function statusTone(status: string): Tone {
  const v = (status || '').toLowerCase();
  if (v === 'completed') return 'ok';
  if (v === 'review') return 'review';
  if (v === 'in-progress') return 'warn';
  if (v === 'blocked' || v === 'cancelled') return 'err';
  return 'dim'; // pending
}

export function statusLabel(status: string): string {
  return TASK_STATUS_LABEL[(status || '').toLowerCase()] ?? status;
}

/** Priority pill — the priority word carries the meaning so it never depends on
 *  color alone. */
export function PriorityPill({ priority }: { priority: string }) {
  const v = (priority || 'medium').toLowerCase();
  return (
    <span className={`task-prio task-prio-${v}`}>
      {TASK_PRIORITY_LABEL[v] ?? priority}
    </span>
  );
}

export interface DueInfo {
  label: string;
  tone: Tone;
  overdue: boolean;
}

/** Resolve a due date into a relative label and a tone. The label always
 *  carries the meaning (e.g. "Overdue", "Today", "3d") so the date never
 *  depends on color alone. */
export function dueInfo(task: Task): DueInfo | null {
  if (!task.dueDate) return null;
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const done = (task.status || '').toLowerCase() === 'completed';
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round(
    (startOfDay(due).getTime() - startOfDay(now).getTime()) / (24 * 60 * 60 * 1000),
  );
  if (done) return { label: 'Done', tone: 'ok', overdue: false };
  if (days < 0) return { label: 'Overdue', tone: 'err', overdue: true };
  if (days === 0) return { label: 'Today', tone: 'err', overdue: false };
  if (days === 1) return { label: 'Tomorrow', tone: 'warn', overdue: false };
  if (days <= 7) return { label: `${days}d`, tone: 'warn', overdue: false };
  return { label: `${days}d`, tone: 'dim', overdue: false };
}

/** Two-letter assignee initials from a display name. */
export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
