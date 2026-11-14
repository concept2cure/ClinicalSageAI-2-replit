/**
 * The Tasks page's rows, as the order of need and the List read them. Split out of
 * TaskBoard.tsx (D6-1; P-131), which is over its size limits: one overdue rule,
 * what "needs an owner" means, and the one row shape the List draws for a task.
 */
import type { NeedFacts } from './taskOrderOfNeed';
import { TB_COLS, TB_SRC } from '../fixtures/task-board-data';

/** What these rules read of a board card (TaskItem, TaskBoard.tsx). */
export interface BoardCardFacts {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  moduleType: string;
  source: string;
  due: string;
  dueDateIso: string | null;
  readOnly?: boolean;
  reviewRoute?: unknown;
  approvalRequired?: boolean;
  approvalStatus?: string;
  blocked?: boolean;
  blocking?: boolean;
  criticalPath?: boolean;
}

/** The blocking flag's words, shared by the card, the List row and the Analytics count. */
export const BLOCKING_FLAG = 'Blocking the submission';

/**
 * A review route member that is blocked waits on an earlier step, a review, or
 * the sender (my-work.ts `routeWaitingOn`): its assignee cannot act, so it is
 * outside the overdue triage. The board's card carries the route and the status,
 * which is all that rule reads.
 */
export function routeWaits(t: Pick<BoardCardFacts, 'reviewRoute' | 'status'>): boolean {
  return Boolean(t.reviewRoute) && t.status === 'blocked';
}

/**
 * Overdue, by the one rule (my-work.ts): computed from the machine-readable
 * `dueDateIso` (server column, kept fresh by the taskDueSweep job), never by
 * parsing the humanised `due` label. Completed and cancelled work is never
 * overdue, and neither is a route member that waits on someone else.
 */
export function isOverdue(t: Pick<BoardCardFacts, 'dueDateIso' | 'status' | 'reviewRoute'>, now: number = Date.now()): boolean {
  if (!t.dueDateIso || t.status === 'completed' || t.status === 'cancelled' || routeWaits(t)) return false;
  const due = new Date(t.dueDateIso).getTime();
  return Number.isFinite(due) && due < now;
}

/** What the order of need reads of a board card. */
export function boardNeed(t: BoardCardFacts, now: number = Date.now()): NeedFacts {
  return { key: t.taskId, priority: t.priority, dueIso: routeWaits(t) ? null : t.dueDateIso, overdue: isOverdue(t, now) };
}

/** Needs an owner: open, assignable on this board (not another store's card), and nobody assigned. */
export function needsAnOwner(t: Pick<BoardCardFacts, 'assignee' | 'readOnly' | 'status'>): boolean {
  return !t.readOnly && t.assignee === '' && t.status !== 'completed' && t.status !== 'cancelled';
}

/** Approval-gated and not yet approved: it waits on a sign-off. */
export function waitsOnSignOff(t: { approvalRequired?: boolean; approvalStatus?: string }): boolean {
  return Boolean(t.approvalRequired) && t.approvalStatus !== 'approved';
}

/** One row of the List. */
export interface ListRow {
  key: string;
  title: string;
  status: string;
  /** The status in words: the row's dot carries it in colour, the words carry it for everyone. */
  statusLabel: string;
  module: string;
  priority: string;
  owner: string;
  /** The project's name, shown when the list spans projects; null when the filter names it already. */
  project: string | null;
  due: string;
  overdue: boolean;
  /** Where the work comes from, in words (the row's title). */
  from: string;
  /** What the table's flags said, in words: on the critical path, blocking the submission. */
  flags: string[];
  need: NeedFacts;
  onOpen: () => void;
}

const statusLabel = (status: string) => TB_COLS.find((c) => c.id === status)?.label ?? status;

/** A board card as a row. */
export function boardListRow(t: BoardCardFacts, deps: {
  owner: string; project: string | null; onOpen: () => void; now?: number;
}): ListRow {
  return {
    key: t.taskId, title: t.title, status: t.status, statusLabel: statusLabel(t.status),
    module: t.moduleType, priority: t.priority, owner: deps.owner || 'Unassigned', project: deps.project,
    due: routeWaits(t) ? 'Waits on its review route' : t.due, overdue: isOverdue(t, deps.now),
    from: `From: ${(TB_SRC[t.source] ?? TB_SRC.unified).t}`, need: boardNeed(t, deps.now), onOpen: deps.onOpen,
    flags: [t.criticalPath ? 'On the critical path' : '', t.blocking && !t.blocked ? BLOCKING_FLAG : ''].filter(Boolean),
  };
}
