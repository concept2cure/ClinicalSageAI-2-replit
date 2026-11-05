/**
 * The submission pyramid's schedule (S11, founder decision P-82; docs/design/THE_PROGRAM_2026-11-01.md §3.3, §7.2):
 * back-scheduling a work breakdown from the target submission date, where each task stands against its dates, each
 * phase's completing task, and one project's plan in a few figures for the portfolio line.
 *
 * Split out of SubmissionPyramidEngine.ts, which re-exports it. Pure arithmetic over the engine's pyramid: no model,
 * no store, no clock (callers pass `asOf`).
 *
 * @module services/regulatory/SubmissionPyramidSchedule
 */
import type { SubmissionType, SubmissionPyramid, PyramidTask } from './pyramids/types';

// ─── Back-scheduling from the target date (S11 step 3, THE_PROGRAM §3.3, §7.2) ─
//
// The schedule is built backwards from the target submission date. Each task's due date is the working day before
// the earliest start of the tasks that depend on it; the task that completes the submission is due on the target
// date (or the working day before it, when the target falls on a weekend). Tasks that follow the submission (the
// PMA's post-submission readiness) are laid forward from it. Working days are Monday to Friday; no holiday calendar
// is applied, and the UI says so.
//
// A task's length is the engine's own typical duration (IND-family tasks carry `timeline.typicalDurationWeeks`,
// five working days a week); where the engine has none, it is the task's estimated hours at one person's
// eight-hour day. Pure arithmetic over the pyramid: no model, no store, no clock (the caller passes `asOf`).

export type DurationBasis = 'typical-duration' | 'estimated-hours';

export interface ScheduledTask {
  /** First working day of the task, YYYY-MM-DD. */
  start: string;
  /** Last working day of the task: the date it is due, YYYY-MM-DD. */
  due: string;
  workingDays: number;
  basis: DurationBasis;
  /** True for a task that follows the submission and is laid forward from it. */
  afterSubmission?: true;
}

export interface BackSchedule {
  target: string;
  /** The task whose completion is the submission: the anchor the schedule is built back from. */
  anchorTaskId: string;
  /** The earliest start of any task: when the work must begin to make the target. */
  start: string;
  tasks: Record<string, ScheduledTask>;
}

export class ScheduleError extends Error {
  constructor(readonly code: 'INVALID_TARGET' | 'CYCLE' | 'NO_ANCHOR', message: string) { super(message); }
}

/** The task that completes the submission, where it is not the pyramid's one terminal task. */
const SUBMISSION_ANCHOR: Partial<Record<SubmissionType, string>> = { PMA: 'phase9.complete' };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function parseDay(iso: string): number | null {
  const m = ISO_DAY.exec(iso);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(t).toISOString().slice(0, 10) === iso ? t : null;
}
const dayIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isWorkday = (t: number) => { const d = new Date(t).getUTCDay(); return d !== 0 && d !== 6; };
/** The working day `n` working days from `t` (n < 0 goes back); n = 0 is `t` itself, moved back to a working day. */
function addWorkdays(t: number, n: number): number {
  let x = t;
  while (!isWorkday(x)) x -= DAY_MS;
  const step = n < 0 ? -DAY_MS : DAY_MS;
  for (let left = Math.abs(n); left > 0;) { x += step; if (isWorkday(x)) left -= 1; }
  return x;
}

/** A task's length in working days, and where it came from. */
export function taskWorkingDays(task: Pick<PyramidTask, 'estimatedHours' | 'timeline'>): { days: number; basis: DurationBasis } {
  const weeks = task.timeline?.typicalDurationWeeks;
  if (typeof weeks === 'number' && weeks > 0) return { days: Math.max(1, Math.round(weeks * 5)), basis: 'typical-duration' };
  return { days: Math.max(1, Math.ceil((task.estimatedHours || 0) / 8)), basis: 'estimated-hours' };
}

/** The tasks in an order where each comes after everything it depends on; a cycle is refused. */
function dependencyOrder(tasks: PyramidTask[]): PyramidTask[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const state = new Map<string, 1 | 2>();
  const out: PyramidTask[] = [];
  const visit = (t: PyramidTask) => {
    const s = state.get(t.id);
    if (s === 2) return;
    if (s === 1) throw new ScheduleError('CYCLE', `The work breakdown's dependencies form a cycle at ${t.id}.`);
    state.set(t.id, 1);
    for (const d of t.dependencies ?? []) { const dep = byId.get(d); if (dep) visit(dep); }
    state.set(t.id, 2);
    out.push(t);
  };
  tasks.forEach(visit);
  return out;
}

/** Each task's successors: the tasks that list it as a dependency. */
function successorMap(tasks: PyramidTask[]): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const t of tasks) for (const d of t.dependencies ?? []) successors.set(d, [...(successors.get(d) ?? []), t.id]);
  return successors;
}

/** The task that completes the submission: the named anchor, else the one task nothing depends on. */
function submissionAnchor(pyramid: SubmissionPyramid, successors: Map<string, string[]>): string {
  const terminal = pyramid.tasks.filter(t => !successors.has(t.id));
  const anchorId = SUBMISSION_ANCHOR[pyramid.type] ?? (terminal.length === 1 ? terminal[0].id : null);
  if (!anchorId || !pyramid.tasks.some(t => t.id === anchorId)) {
    throw new ScheduleError('NO_ANCHOR', `The ${pyramid.type} work breakdown has no single task that completes the submission.`);
  }
  return anchorId;
}

/** Everything that follows `id` (its descendants). */
function descendants(id: string, successors: Map<string, string[]>): Set<string> {
  const after = new Set<string>();
  const mark = (from: string) => { for (const s of successors.get(from) ?? []) if (!after.has(s)) { after.add(s); mark(s); } };
  mark(id);
  return after;
}

export function backSchedule(pyramid: SubmissionPyramid, target: string): BackSchedule {
  const targetT = parseDay(target);
  if (targetT === null) throw new ScheduleError('INVALID_TARGET', `The target date ${target} is not a calendar date (YYYY-MM-DD).`);
  const order = dependencyOrder(pyramid.tasks);
  const successors = successorMap(pyramid.tasks);
  const anchorId = submissionAnchor(pyramid, successors);
  // Everything that follows the anchor is laid forward from it; everything else is back-scheduled.
  const after = descendants(anchorId, successors);
  const out: Record<string, ScheduledTask> = {};
  const startT = new Map<string, number>();
  const dueT = new Map<string, number>();
  const place = (t: PyramidTask, start: number, due: number, days: number, basis: DurationBasis) => {
    startT.set(t.id, start); dueT.set(t.id, due);
    out[t.id] = { start: dayIso(start), due: dayIso(due), workingDays: days, basis, ...(after.has(t.id) ? { afterSubmission: true as const } : {}) };
  };
  for (const t of [...order].reverse().filter(x => !after.has(x.id))) {
    const { days, basis } = taskWorkingDays(t);
    const next = (successors.get(t.id) ?? []).filter(s => !after.has(s)).map(s => startT.get(s)!);
    const due = next.length ? addWorkdays(Math.min(...next), -1) : addWorkdays(targetT, 0);
    place(t, addWorkdays(due, -(days - 1)), due, days, basis);
  }
  for (const t of order.filter(x => after.has(x.id))) {
    const { days, basis } = taskWorkingDays(t);
    const start = addWorkdays(Math.max(...(t.dependencies ?? []).map(d => dueT.get(d) ?? targetT)), 1);
    place(t, start, addWorkdays(start, days - 1), days, basis);
  }
  const first = Math.min(...pyramid.tasks.filter(t => !after.has(t.id)).map(t => startT.get(t.id)!));
  return { target, anchorTaskId: anchorId, start: dayIso(first), tasks: out };
}

// ─── Where the work stands against its schedule (S11: workstreams, portfolio line) ─

/** Where an unfinished task stands against its dates on `asOf`: past its due date, past its start date and not
 *  started, or neither. A done task stands nowhere. The client's `pyStanding` (fixtures/pyramid-data.ts) is held to
 *  this by a parity test. */
export type TaskStanding = 'overdue' | 'late-to-start' | null;

export function taskStanding(status: string | undefined, slot: Pick<ScheduledTask, 'start' | 'due'> | undefined, asOf: string): TaskStanding {
  const s = status ?? 'todo';
  if (!slot || s === 'done') return null;
  if (slot.due < asOf) return 'overdue';
  if (slot.start < asOf && s === 'todo') return 'late-to-start';
  return null;
}

/** The task that completes a phase: its `<phase>.complete` task (every engine pyramid has one), else the phase's task
 *  that nothing else in the phase depends on, when there is exactly one. */
export function phaseGate(pyramid: SubmissionPyramid, phaseId: string): string | null {
  const inPhase = pyramid.tasks.filter(t => t.phaseId === phaseId);
  const named = inPhase.find(t => t.id === `${phaseId}.complete`);
  if (named) return named.id;
  const depended = new Set(inPhase.flatMap(t => t.dependencies ?? []));
  const last = inPhase.filter(t => !depended.has(t.id));
  return last.length === 1 ? last[0].id : null;
}

export type ScheduleStatus = 'complete' | 'blocked' | 'at-risk' | 'on-track' | 'unscheduled';

export interface ScheduleSummary {
  total: number;
  done: number;
  blocked: number;
  overdue: number;
  lateToStart: number;
  /** The next phase to complete (by its completing task's due date) that is not done, or null. */
  next: { phaseId: string; phaseName: string; taskId: string; due: string | null } | null;
  status: ScheduleStatus;
}

/** One project's plan in a few figures, for the portfolio line: counts, the next milestone, and one status word.
 *  Blocked when a task is recorded blocked; at risk when an unfinished task is past its dates; on track otherwise;
 *  unscheduled when no target date gives the tasks dates. */
export function scheduleSummary(
  pyramid: SubmissionPyramid, schedule: BackSchedule | null, statuses: Record<string, string>, asOf: string,
): ScheduleSummary {
  const statusOf = (id: string) => statuses[id] ?? 'todo';
  const standings = pyramid.tasks.map(t => taskStanding(statusOf(t.id), schedule?.tasks[t.id], asOf));
  const done = pyramid.tasks.filter(t => statusOf(t.id) === 'done').length;
  const blocked = pyramid.tasks.filter(t => statusOf(t.id) === 'blocked').length;
  const overdue = standings.filter(s => s === 'overdue').length;
  const lateToStart = standings.filter(s => s === 'late-to-start').length;
  const milestones = [...pyramid.phases].sort((a, b) => a.order - b.order).map(ph => {
    const taskId = phaseGate(pyramid, ph.id);
    return taskId ? { phaseId: ph.id, phaseName: ph.name, taskId, due: schedule?.tasks[taskId]?.due ?? null } : null;
  }).filter((m): m is NonNullable<typeof m> => m !== null && statusOf(m.taskId) !== 'done');
  const next = schedule ? [...milestones].sort((a, b) => String(a.due).localeCompare(String(b.due)))[0] ?? null : milestones[0] ?? null;
  const status: ScheduleStatus = done === pyramid.tasks.length ? 'complete'
    : blocked > 0 ? 'blocked'
    : !schedule ? 'unscheduled'
    : overdue + lateToStart > 0 ? 'at-risk' : 'on-track';
  return { total: pyramid.tasks.length, done, blocked, overdue, lateToStart, next, status };
}
