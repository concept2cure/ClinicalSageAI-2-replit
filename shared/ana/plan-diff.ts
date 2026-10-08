/**
 * How AnA's declared plan changed from one `update_plan` to the next, and the
 * ids its tasks carry through a turn (ANA-SUMMARY S4,
 * docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §1a "Task-list events", §4
 * "update_plan").
 *
 * One diff for both halves. The client drew the live transcript's plan rows
 * from its own copy (anaProgress.ts); the server now writes the Summary's
 * task events from the same function, so a reloaded turn and a live one say
 * the same changes in the same order.
 *
 * Task ids (`t1`, `t2`, …) are the server's, never the model's: a task gets
 * the next id the first time its lower-cased title appears in the turn. Two
 * steps of one plan cannot share a title (turn-plan.ts refuses it). A title
 * that disappears and later returns gets a new id, so it reads as Removed and
 * then Added; a renamed task likewise reads as Removed plus Added.
 *
 * Pure, no I/O.
 *
 * @module shared/ana/plan-diff
 */

export type PlanStepStatus = 'pending' | 'in_progress' | 'completed';

export interface PlanStep {
  title: string;
  status: PlanStepStatus;
}

export type PlanChangeKind = 'added' | 'started' | 'completed' | 'removed';

/** One change to the declared plan, in the order it arrived. */
export interface PlanChange {
  kind: PlanChangeKind;
  title: string;
  at: number;
  /** The agentic-loop round of the update_plan call that made the change. */
  round?: number;
  /** True for the steps of the first plan the turn declared. */
  initial?: boolean;
}

/**
 * The changes from one plan to the next, keyed by title (the tool asks for the
 * same titles on every call). A first plan is all `added`, marked `initial`,
 * so the transcript can say "Planned 5 steps" once rather than five times.
 */
export function diffPlan(prev: PlanStep[] | undefined, next: PlanStep[], at: number, round?: number): PlanChange[] {
  const before = new Map((prev ?? []).map((s) => [s.title.toLowerCase(), s]));
  const initial = !prev || prev.length === 0;
  const tag = { at, ...(round ? { round } : {}), ...(initial ? { initial: true } : {}) };
  const changes: PlanChange[] = [];
  for (const s of next) {
    const was = before.get(s.title.toLowerCase());
    if (!was) changes.push({ kind: 'added', title: s.title, ...tag });
    if (s.status !== was?.status) {
      if (s.status === 'in_progress') changes.push({ kind: 'started', title: s.title, ...tag });
      if (s.status === 'completed') changes.push({ kind: 'completed', title: s.title, ...tag });
    }
    before.delete(s.title.toLowerCase());
  }
  for (const gone of before.values()) changes.push({ kind: 'removed', title: gone.title, at, ...(round ? { round } : {}) });
  return changes;
}

/** A task change with the task's id, as the Summary's task event carries it. */
export interface TaskChange {
  task: string;
  change: PlanChangeKind;
  title: string;
}

/**
 * The turn's task ids. Keyed by lower-cased title while the task is in the
 * plan; released when it leaves, so a title that comes back is a new task.
 */
export class TaskIds {
  private readonly live = new Map<string, string>();
  private issued = 0;

  /** The id of a task in the plan now, issuing the next one for a title new to it. */
  idFor(title: string): string {
    const key = title.toLowerCase();
    let id = this.live.get(key);
    if (!id) {
      this.issued += 1;
      id = `t${this.issued}`;
      this.live.set(key, id);
    }
    return id;
  }

  /** The task left the plan: its title no longer names it. */
  release(title: string): string {
    const id = this.idFor(title);
    this.live.delete(title.toLowerCase());
    return id;
  }
}

/**
 * The changes from `prev` to `next` with their task ids, issuing and releasing
 * ids as the plan changes. A plan's new tasks come first, then its starts,
 * completions and removals, each in the plan's order (S5): the Summary reads
 * "Added task" for every new task before "Started" for any of them, as a
 * person reads a list being set out before the work on it begins.
 */
export function taskChanges(prev: PlanStep[] | undefined, next: PlanStep[], ids: TaskIds): TaskChange[] {
  const changes = diffPlan(prev, next, 0).map((c) => ({
    task: c.kind === 'removed' ? ids.release(c.title) : ids.idFor(c.title),
    change: c.kind,
    title: c.title,
  }));
  return [...changes.filter((c) => c.change === 'added'), ...changes.filter((c) => c.change !== 'added')];
}
