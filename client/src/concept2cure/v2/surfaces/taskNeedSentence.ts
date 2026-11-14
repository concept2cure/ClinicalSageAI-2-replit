/**
 * The Tasks page's one line (D6.md §A.4 step 2, as amended by §A.7 item 3),
 * computed by code from the reads the page makes. No model supplies a figure, a
 * ranking or the item to start with (RULE 2; P-131 item 4).
 *
 *   Mine:            "{n} tasks need you: {o} overdue, {w} due within 7 days. Start
 *                    with “{title}”: {why}." — said only when every read it rests
 *                    on succeeded. A failed read names the list that could not be
 *                    read; it is never said as "Nothing is assigned to you".
 *   Everyone:        "{n} open[ on {project}] · {w} due within 7 days · {o} overdue."
 *   Needs an owner:  "{k} open tasks need an owner."
 *
 * The item to start with is the first in the order of need (taskOrderOfNeed.ts),
 * so it is the first row under the first group that has one.
 */
import { daysOverdue, needGroupOf, priorityRank, type NeedFacts } from './taskOrderOfNeed';

const DAY_MS = 86_400_000;

/** One read the line rests on. */
export interface LineRead { loading: boolean; failed: boolean }

/** One assigned item, as the line reads it. */
export interface NeedLineItem extends NeedFacts {
  title: string;
  /** Approval-gated and not yet approved: it waits on the person's sign-off. */
  signOff: boolean;
}

export interface MineLineInput {
  /** The person's assigned tasks (my-work), the documents at their sign-off (the review board) and, where
   *  the list is drawn from it, the board's own tasks. */
  reads: { myWork: LineRead; approvals: LineRead; board?: LineRead };
  /** The assigned tasks, already in the order of need, already filtered as the list is. */
  items: readonly NeedLineItem[];
  /** Documents waiting on the person's sign-off. */
  signOffs: number;
  /** Open, assignable tasks with no assignee; null when the board's own tasks could not be read. */
  unowned: number | null;
  now: number;
}

export type MineLine =
  | { kind: 'reading'; text: string }
  | { kind: 'unread'; text: string }
  | {
      kind: 'said';
      lead: string;
      start: { key: string; title: string; why: string } | null;
      tail: string;
      unowned: number;
    };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Why this item first: one of the facts its row already shows. */
export function whyFirst(item: NeedLineItem, now: number): string {
  if (needGroupOf(item, now) === 'overdue') {
    const days = daysOverdue(item.dueIso, now);
    return days >= 1 ? `it is ${plural(days, 'day', 'days')} overdue` : 'it fell due earlier today';
  }
  if (item.signOff) return 'it waits on your sign-off';
  const due = item.dueIso ? new Date(item.dueIso).getTime() : NaN;
  if (Number.isFinite(due)) {
    const days = Math.round((due - now) / DAY_MS);
    if (days <= 0) return 'it is due today';
    if (days === 1) return 'it is due tomorrow';
    return `it is due in ${days} days`;
  }
  if (priorityRank(item.priority) < 5) return `it is marked ${String(item.priority).trim().toLowerCase()}`;
  return 'nothing assigned to you has a due date';
}

/** The lists the line rests on that could not be read, in a reader's words. */
function unreadLists(reads: MineLineInput['reads']): string[] {
  const unread: string[] = [];
  if (reads.board?.failed) unread.push("the board's own tasks");
  if (reads.myWork.failed) unread.push('the tasks assigned to you');
  if (reads.approvals.failed) unread.push('the documents waiting on your sign-off');
  return unread;
}

/** The line in Mine. */
export function mineLine(input: MineLineInput): MineLine {
  const { reads, items, signOffs, unowned, now } = input;
  const unread = unreadLists(reads);
  if (unread.length) {
    return { kind: 'unread', text: `What is needed of you is not known: ${joinList(unread)} could not be read.` };
  }
  if (reads.myWork.loading || reads.approvals.loading || reads.board?.loading) return { kind: 'reading', text: 'Reading what is needed of you…' };
  const n = items.length;
  const overdue = items.filter((t) => needGroupOf(t, now) === 'overdue').length;
  const week = items.filter((t) => needGroupOf(t, now) === 'week').length;
  const lead = n
    ? `${plural(n, 'task needs', 'tasks need')} you: ${overdue ? `${overdue} overdue` : 'none overdue'}, ${week} due within 7 days.`
    : signOffs ? 'No task is assigned to you.' : 'Nothing is assigned to you.';
  const first = items[0];
  return {
    kind: 'said',
    lead,
    start: first ? { key: first.key, title: first.title, why: whyFirst(first, now) } : null,
    tail: signOffs ? `${plural(signOffs, 'document waits', 'documents wait')} on your sign-off.` : '',
    unowned: unowned ?? 0,
  };
}

/** The line in Everyone (A.4 step 2). */
export function everyoneLine(input: {
  items: readonly NeedFacts[]; open: number; projectName: string | null; now: number;
}): string {
  const { items, open, projectName, now } = input;
  const overdue = items.filter((t) => needGroupOf(t, now) === 'overdue').length;
  const week = items.filter((t) => needGroupOf(t, now) === 'week').length;
  return `${open} open${projectName ? ` on ${projectName}` : ''} · ${week} due within 7 days · ${overdue ? `${overdue} overdue` : 'none overdue'}.`;
}

/** The line in Needs an owner. */
export function unownedLine(count: number, projectName: string | null): string {
  const where = projectName ? ` on ${projectName}` : '';
  return count
    ? `${plural(count, 'open task needs', 'open tasks need')} an owner${where}.`
    : `Every open task${where} that can be assigned here has an owner.`;
}

/** "1 needs an owner" / "3 need an owner" — the words of the link to that view. */
export function unownedLinkText(count: number): string {
  return `${count} ${count === 1 ? 'needs' : 'need'} an owner`;
}
