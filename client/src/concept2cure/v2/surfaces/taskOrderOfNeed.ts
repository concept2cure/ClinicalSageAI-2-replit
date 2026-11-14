/**
 * The order of need (P-131 item 3; D6.md §A.7 item 6): one rule for every place a
 * person's work is listed — the Tasks page's list and board columns, the top
 * bar's and Home's "Assigned to you" (OpenWork.tsx), and the sentence that names
 * what to start with.
 *
 *   1. By when: overdue, then due within 7 days, then later, then no due date.
 *   2. Within each: critical, urgent, high, medium, low, then no priority.
 *   3. Then the earlier due date.
 *   4. Then a stable key, so two reads of the same work list it the same way.
 *
 * Whether an item is overdue is the caller's fact, never re-derived here: there
 * is one overdue rule, my-work.ts's (a review route member that waits on an
 * earlier step is outside the triage, and is passed with no due date). The
 * server side (S9) implements the same rule; this side never depends on the
 * server having done so.
 *
 * Priority words come from several stores. They are read on the scale the
 * cross-store view already normalises (unified-work-view.ts `normalizePriority`:
 * correspondence's major and minor are high and low), except that critical and
 * urgent keep their own places here, critical first.
 */

export type NeedGroup = 'overdue' | 'week' | 'later' | 'none';

/** The groups in the order a person reads them, with the words they read. */
export const NEED_GROUPS: ReadonlyArray<{ id: NeedGroup; label: string }> = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'week', label: 'Due within 7 days' },
  { id: 'later', label: 'Later' },
  { id: 'none', label: 'No due date' },
];

/** What the rule reads of one item. */
export interface NeedFacts {
  /** A stable identity: a task id, an approval id. */
  key: string;
  priority: string | null | undefined;
  /** The due date as an ISO string; null when there is none, or when it is outside the triage. */
  dueIso: string | null | undefined;
  /** By the one overdue rule (my-work.ts), decided by the caller. */
  overdue: boolean;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const PRIORITY_RANK: Record<string, number> = {
  critical: 0,
  urgent: 1,
  high: 2,
  major: 2,
  medium: 3,
  normal: 3,
  low: 4,
  minor: 4,
};
const NO_PRIORITY = 5;

/** 0 for critical through 4 for low; 5 when the item carries no priority the scale knows. */
export function priorityRank(priority: string | null | undefined): number {
  const word = String(priority ?? '').trim().toLowerCase();
  return PRIORITY_RANK[word] ?? NO_PRIORITY;
}

function dueMs(dueIso: string | null | undefined): number | null {
  if (!dueIso) return null;
  const ms = new Date(dueIso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Which group an item belongs to at `now`. */
export function needGroupOf(item: Pick<NeedFacts, 'dueIso' | 'overdue'>, now: number): NeedGroup {
  if (item.overdue) return 'overdue';
  const due = dueMs(item.dueIso);
  if (due === null) return 'none';
  return due - now <= WEEK_MS ? 'week' : 'later';
}

const GROUP_RANK: Record<NeedGroup, number> = { overdue: 0, week: 1, later: 2, none: 3 };

/** The comparator: negative when `a` is needed before `b`. */
export function compareByNeed(a: NeedFacts, b: NeedFacts, now: number): number {
  const group = GROUP_RANK[needGroupOf(a, now)] - GROUP_RANK[needGroupOf(b, now)];
  if (group) return group;
  const priority = priorityRank(a.priority) - priorityRank(b.priority);
  if (priority) return priority;
  const da = dueMs(a.dueIso);
  const db = dueMs(b.dueIso);
  if (da !== null && db !== null && da !== db) return da - db;
  if (a.key === b.key) return 0;
  return a.key < b.key ? -1 : 1;
}

/** A sorted copy of `items` in the order of need. The input is not changed. */
export function orderByNeed<T>(items: readonly T[], facts: (item: T) => NeedFacts, now: number): T[] {
  return items
    .map((item) => ({ item, need: facts(item) }))
    .sort((x, y) => compareByNeed(x.need, y.need, now))
    .map(({ item }) => item);
}

/** `items` in the order of need, split into the four groups (every group present, empty ones too). */
export function groupByNeed<T>(
  items: readonly T[],
  facts: (item: T) => NeedFacts,
  now: number,
): Array<{ id: NeedGroup; label: string; items: T[] }> {
  const ordered = orderByNeed(items, facts, now);
  return NEED_GROUPS.map(({ id, label }) => ({
    id, label, items: ordered.filter((item) => needGroupOf(facts(item), now) === id),
  }));
}

/** Whole days an overdue date is past `now` (0 when it fell due earlier today). */
export function daysOverdue(dueIso: string | null | undefined, now: number): number {
  const due = dueMs(dueIso);
  return due === null || due >= now ? 0 : Math.floor((now - due) / DAY_MS);
}
