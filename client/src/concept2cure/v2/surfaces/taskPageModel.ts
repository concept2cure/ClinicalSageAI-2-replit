/**
 * What the Tasks page shows, computed from the reads it already makes (D6.md §A.4
 * steps 2-6, as amended by §A.7; P-131). Split out of TaskBoard.tsx, which is over
 * its size limits, so each rule is testable without rendering the board:
 *
 *   - whose work is shown: Mine, Everyone, or Needs an owner (the `tasking.filter`
 *     action's `mine` param: "true", "false", "unassigned");
 *   - the rows, filtered as the controls say and in the order of need;
 *   - the header's one line, said only when the reads it rests on succeeded;
 *   - what AnA is told of the person's work and of the work with no owner;
 *   - Analytics' Team productivity rows, with the work that has no owner named.
 *
 * No model supplies a figure, a ranking or the item to start with (RULE 2).
 */
import { myWorkNeed, type MyWorkItem } from '../OpenWork';
import type { TaskLine } from './TaskPageHeader';
import { everyoneLine, mineLine, unownedLine, type LineRead, type NeedLineItem } from './taskNeedSentence';
import { boardNeed, needsAnOwner, waitsOnSignOff, type BoardCardFacts } from './taskListRows';
import { orderByNeed } from './taskOrderOfNeed';

export type Who = 'mine' | 'everyone' | 'unowned';

/** The segmented control, in the order a person reads it. */
export const WHO_OPTIONS: ReadonlyArray<readonly [Who, string]> = [
  ['mine', 'Mine'], ['everyone', 'Everyone'], ['unowned', 'Needs an owner'],
];

/** What AnA's filter said it applied, in words. */
export const WHO_APPLIED: Record<Who, string> = {
  mine: 'my tasks only', everyone: "everyone's tasks", unowned: 'the tasks that need an owner',
};

/** The `mine` param of `tasking.filter` (shared/navigation/surface-actions.ts), or null for a value it does not take. */
export function whoFromParam(value: string): Who | null {
  if (value === 'true') return 'mine';
  if (value === 'false') return 'everyone';
  if (value === 'unassigned') return 'unowned';
  return null;
}

/** What these rules read of a board card. */
export interface PageCard extends BoardCardFacts { project: string }

export interface RowFilter { proj: string; mod: string; who: Who; myId: string }

/** The cards the controls keep, in the order of need. Archived work is never listed. */
export function boardRows<T extends PageCard>(tasks: readonly T[], f: RowFilter, now: number): T[] {
  const kept = tasks.filter((t) =>
    (f.proj === 'all' || t.project === f.proj) &&
    (f.mod === 'all' || t.moduleType === f.mod) &&
    t.status !== 'cancelled' &&
    (f.who === 'everyone' || (f.who === 'mine' ? f.myId !== '' && t.assignee === f.myId : needsAnOwner(t))));
  return orderByNeed(kept, (t) => boardNeed(t, now), now);
}

const isOpen = (t: { status: string }) => t.status !== 'completed' && t.status !== 'cancelled';

/** The reads the line rests on, as the page holds them. */
export interface LineReads {
  board: { loading: boolean; failed: boolean; ownUnread: boolean };
  myWork: LineRead;
  approvals: LineRead;
  /** Documents at the person's sign-off (the review board). */
  signOffs: number;
}

export interface LineInput<T extends PageCard> {
  who: Who;
  reads: LineReads;
  /** The rows on screen (boardRows). */
  rows: readonly T[];
  /** Open work that needs an owner under the same project and module filters. */
  unowned: readonly T[];
  projectName: string | null;
  /** The title of the critical-path task that is blocked, when one is. */
  blockedAt: string | null;
  open: (taskId: string) => void;
  showUnowned: () => void;
  showPath: () => void;
  now: number;
}

const needItem = (t: PageCard, now: number): NeedLineItem =>
  ({ ...boardNeed(t, now), title: t.title, signOff: waitsOnSignOff(t) });

/** The header's one line (A.4 step 2; A.7 item 3). */
export function taskPageLine<T extends PageCard>(input: LineInput<T>): TaskLine {
  const { who, reads, rows, unowned, now } = input;
  if (reads.board.loading) return { kind: 'text', text: 'Reading the task board…' };
  // A failed board read is said by the error panel below the header; the line says nothing over it.
  if (reads.board.failed) return { kind: 'quiet' };
  const open = rows.filter(isOpen);
  if (who === 'unowned') {
    const first = open[0];
    return {
      kind: 'unowned', text: unownedLine(open.length, input.projectName),
      first: first ? { title: first.title, open: () => input.open(first.taskId) } : null,
    };
  }
  if (who === 'everyone') {
    return {
      kind: 'everyone', blockedAt: input.blockedAt, showPath: input.showPath,
      text: everyoneLine({ items: open.map((t) => boardNeed(t, now)), open: open.length, projectName: input.projectName, now }),
    };
  }
  const own = reads.board.ownUnread;
  const line = mineLine({
    reads: { myWork: reads.myWork, approvals: reads.approvals, board: { loading: false, failed: own } },
    items: open.map((t) => needItem(t, now)),
    signOffs: reads.signOffs,
    unowned: own ? null : unowned.length,
    now,
  });
  return { kind: 'mine', line, openStart: input.open, showUnowned: input.showUnowned };
}

/** What AnA is told of the person's work and of the work with no owner (A.7 item 8). */
export function needFactsForAna(input: {
  unowned: readonly (PageCard & { due: string })[] | null;
  myWork: { loading: boolean; error?: string; items: readonly MyWorkItem[] };
  now: number;
}) {
  const { unowned, myWork, now } = input;
  const read = myWork.loading ? 'loading' : myWork.error ? 'failed' : 'read';
  const mine = read === 'read' ? orderByNeed(myWork.items, myWorkNeed, now) : null;
  return {
    /* The person's open items from the one per-person read (my-work, as the top bar and Home show them), in
       the order of need. Null while that read is loading or after it failed: unknown, never none. */
    yourOpenItemsRead: read,
    yourOpenItems: mine?.slice(0, 20).map((t) => ({
      taskId: t.taskId, title: t.title, project: t.projectName ?? null, priority: t.priority,
      due: t.waitingOn ? null : t.dueDate, overdue: t.overdue, waitingOn: t.waitingOn ?? null,
    })) ?? null,
    yourOpenItemsTotal: mine?.length ?? null,
    /* Open work on the board that can be assigned and has no assignee. Null when the board's own tasks
       could not be read. */
    needsAnOwner: unowned
      ? { count: unowned.length, tasks: unowned.slice(0, 8).map((t) => ({ taskId: t.taskId, title: t.title, due: t.due })) }
      : null,
  };
}

/** One row of Analytics' Team productivity card. */
export interface TeamRow { key: string; label: string; person: boolean; open: number; done: number }

/** The words of the row for work kept in other stores (the schedule, correspondence, filings). */
export const OTHER_STORES_LABEL = 'From the schedule, correspondence and filings';

/**
 * Team productivity (A.7 item 7): one row per person, "Unassigned" for the board's own work with nobody
 * assigned, and the work other stores keep on its own row (it has no assignee on this board). The lead's
 * workload sentence (A.4 step 3) lives here as the order: the person with the most open work first.
 */
export function teamRows(list: readonly PageCard[], nameOf: (id: string) => string): TeamRow[] {
  const rows = new Map<string, TeamRow>();
  for (const t of list) {
    const key = t.readOnly ? '\u0000other' : t.assignee === '' ? '\u0000none' : t.assignee;
    const label = t.readOnly ? OTHER_STORES_LABEL : t.assignee === '' ? 'Unassigned' : nameOf(t.assignee);
    const row = rows.get(key) ?? { key, label, person: !t.readOnly && t.assignee !== '', open: 0, done: 0 };
    if (t.status === 'completed') row.done += 1; else row.open += 1;
    rows.set(key, row);
  }
  // People first, the one carrying the most open work at the top; then Unassigned and other stores' work.
  return [...rows.values()].sort((a, b) => Number(b.person) - Number(a.person) || (a.person && b.person ? b.open - a.open : 0));
}
