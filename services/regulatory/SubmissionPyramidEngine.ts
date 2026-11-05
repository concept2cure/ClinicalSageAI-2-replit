import { build510kPyramid } from './pyramids/510k-pyramid';
import { buildIndPyramid } from './pyramids/ind-pyramid';
import { buildNdaPyramid } from './pyramids/nda-pyramid';
import { buildBlaPyramid } from './pyramids/bla-pyramid';
import { buildPmaPyramid } from './pyramids/pma-pyramid';
import { buildMaaPyramid } from './pyramids/maa-pyramid';
import { buildJndaPyramid } from './pyramids/jnda-pyramid';
import { buildDeNovoPyramid } from './pyramids/de-novo-pyramid';
import { buildIndAmendmentPyramid } from './pyramids/ind-amendment-pyramid';
import { buildIndAnnualReportPyramid } from './pyramids/ind-annual-report-pyramid';
import { buildIndSafetySupplementPyramid } from './pyramids/ind-safety-supplement-pyramid';

export type {
  SubmissionType,
  CoreSubmissionType,
  IndVariantType,
  BaseTask,
  PyramidTask,
  PyramidPhase,
  SubmissionPyramid,
  TaskStatus,
  TaskProgress,
  ProgressSummary,
  PhaseProgress,
  TaskRisk,
  RiskSeverity,
  DocumentBinding,
  TaskTimeline,
  SubTask,
  RegulatoryGuidance,
  CrossSubmissionDep,
  ResourceAllocation,
  RoleCapacity,
} from './pyramids/types';

import type {
  SubmissionType,
  SubmissionPyramid,
  PyramidTask,
  TaskProgress,
  ProgressSummary,
  ResourceAllocation,
  RoleCapacity,
  TaskRisk,
  CrossSubmissionDep,
  DocumentBinding,
} from './pyramids/types';

// ─── Pyramid Lookup ─────────────────────────────────────────────────────────

export function getPyramidForProject(type: SubmissionType): SubmissionPyramid {
  switch (type) {
    case '510K':
      return build510kPyramid();
    case 'IND':
      return buildIndPyramid();
    case 'NDA':
      return buildNdaPyramid();
    case 'BLA':
      return buildBlaPyramid();
    case 'PMA':
      return buildPmaPyramid();
    case 'MAA':
      return buildMaaPyramid();
    case 'JNDA':
      return buildJndaPyramid();
    case 'DE_NOVO':
      return buildDeNovoPyramid();
    case 'IND_AMENDMENT':
      return buildIndAmendmentPyramid();
    case 'IND_ANNUAL_REPORT':
      return buildIndAnnualReportPyramid();
    case 'IND_SAFETY_SUPPLEMENT':
      return buildIndSafetySupplementPyramid();
    default:
      throw new Error(`Unsupported submission type: ${type}`);
  }
}

export function getAllSupportedTypes(): SubmissionType[] {
  return [
    '510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'JNDA', 'DE_NOVO',
    'IND_AMENDMENT', 'IND_ANNUAL_REPORT', 'IND_SAFETY_SUPPLEMENT',
  ];
}

// ─── Progress Calculation ───────────────────────────────────────────────────

export function calculateProgress(
  pyramid: SubmissionPyramid,
  taskProgress: TaskProgress[],
): ProgressSummary {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  const total = pyramid.tasks.length;
  let completed = 0;
  let estimatedHoursRemaining = 0;
  let criticalTotal = 0;
  let criticalCompleted = 0;
  let riskScore = 0;
  const perPhase: ProgressSummary['perPhase'] = {};

  for (const phase of pyramid.phases) {
    const phaseTotal = phase.tasks.length;
    let phaseCompleted = 0;
    let phaseHoursRemaining = 0;

    for (const task of phase.tasks) {
      const isDone = statusMap.get(task.id) === 'done';
      if (isDone) {
        completed += 1;
        phaseCompleted += 1;
      } else {
        phaseHoursRemaining += task.estimatedHours;
        estimatedHoursRemaining += task.estimatedHours;
        if (task.risk) {
          riskScore += riskSeverityToScore(task.risk.severity) * task.risk.probability;
        }
      }

      if (task.critical) {
        criticalTotal += 1;
        if (isDone) criticalCompleted += 1;
      }
    }

    perPhase[phase.id] = {
      total: phaseTotal,
      completed: phaseCompleted,
      percentComplete: phaseTotal === 0 ? 0 : Math.round((phaseCompleted / phaseTotal) * 100),
      estimatedHoursRemaining: phaseHoursRemaining,
    };
  }

  return {
    total,
    completed,
    percentComplete: total === 0 ? 0 : Math.round((completed / total) * 100),
    perPhase,
    criticalPathProgress: criticalTotal === 0 ? 100 : Math.round((criticalCompleted / criticalTotal) * 100),
    estimatedHoursRemaining,
    riskScore: Math.round(riskScore * 100) / 100,
  };
}

// ─── Task Scheduling ────────────────────────────────────────────────────────

export function getNextAvailableTasks(
  pyramid: SubmissionPyramid,
  taskProgress: TaskProgress[],
): PyramidTask[] {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  const completed = new Set(
    taskProgress.filter(entry => entry.status === 'done').map(entry => entry.taskId),
  );

  return pyramid.tasks.filter(task => {
    const status = statusMap.get(task.id) ?? 'todo';
    if (status === 'done' || status === 'blocked') {
      return false;
    }
    return task.dependencies.every(dep => completed.has(dep));
  });
}

export function getCriticalPath(
  pyramid: SubmissionPyramid,
  taskProgress: TaskProgress[],
): PyramidTask[] {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  const criticalTasks = pyramid.tasks.filter(task => task.critical);
  const activeCritical = criticalTasks.filter(task => statusMap.get(task.id) !== 'done');

  if (activeCritical.length > 0) {
    return activeCritical;
  }

  return pyramid.tasks
    .filter(task => statusMap.get(task.id) !== 'done')
    .sort((a, b) => (b.estimatedHours || 0) - (a.estimatedHours || 0));
}

// ─── Risk Analysis ──────────────────────────────────────────────────────────

function riskSeverityToScore(severity: TaskRisk['severity']): number {
  switch (severity) {
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
    case 'critical': return 4;
  }
}

export function getRiskProfile(
  pyramid: SubmissionPyramid,
  taskProgress: TaskProgress[],
): { totalRiskScore: number; highRiskTasks: PyramidTask[]; mitigationGaps: PyramidTask[] } {
  const statusMap = new Map(taskProgress.map(entry => [entry.taskId, entry.status]));
  let totalRiskScore = 0;
  const highRiskTasks: PyramidTask[] = [];
  const mitigationGaps: PyramidTask[] = [];

  for (const task of pyramid.tasks) {
    if (statusMap.get(task.id) === 'done') continue;
    if (!task.risk) continue;

    const score = riskSeverityToScore(task.risk.severity) * task.risk.probability;
    totalRiskScore += score;

    if (task.risk.severity === 'high' || task.risk.severity === 'critical') {
      highRiskTasks.push(task);
    }
    if (task.risk.mitigations.length === 0) {
      mitigationGaps.push(task);
    }
  }

  return {
    totalRiskScore: Math.round(totalRiskScore * 100) / 100,
    highRiskTasks,
    mitigationGaps,
  };
}

// ─── Resource Allocation ────────────────────────────────────────────────────

export function getResourceAllocation(pyramid: SubmissionPyramid): ResourceAllocation[] {
  const roleMap = new Map<string, { total: number; count: number; criticalCount: number }>();

  for (const task of pyramid.tasks) {
    const role = task.role ?? 'unassigned';
    const current = roleMap.get(role) ?? { total: 0, count: 0, criticalCount: 0 };
    current.total += task.estimatedHours;
    current.count += 1;
    if (task.critical) current.criticalCount += 1;
    roleMap.set(role, current);
  }

  return Array.from(roleMap.entries())
    .map(([role, data]) => ({
      role,
      totalRequiredHours: data.total,
      taskCount: data.count,
      criticalTaskCount: data.criticalCount,
    }))
    .sort((a, b) => b.totalRequiredHours - a.totalRequiredHours);
}

export function getResourceBottlenecks(
  pyramid: SubmissionPyramid,
  capacity: RoleCapacity[],
): { role: string; requiredHours: number; availableHoursPerWeek: number; estimatedWeeks: number; overloaded: boolean }[] {
  const allocations = getResourceAllocation(pyramid);
  const capacityMap = new Map(capacity.map(c => [c.role, c.availableHoursPerWeek]));

  return allocations.map(alloc => {
    const available = capacityMap.get(alloc.role) ?? 40;
    const estimatedWeeks = Math.ceil(alloc.totalRequiredHours / available);
    return {
      role: alloc.role,
      requiredHours: alloc.totalRequiredHours,
      availableHoursPerWeek: available,
      estimatedWeeks,
      overloaded: estimatedWeeks > 4,
    };
  });
}

// ─── Document Binding Analysis ──────────────────────────────────────────────

export function getDocumentCoverage(
  pyramid: SubmissionPyramid,
): { ctdSection: string; sectionTitle: string; taskIds: string[]; covered: boolean }[] {
  const sectionMap = new Map<string, { title: string; taskIds: string[] }>();

  for (const task of pyramid.tasks) {
    if (!task.documentBindings) continue;
    for (const binding of task.documentBindings) {
      const existing = sectionMap.get(binding.ctdSection);
      if (existing) {
        existing.taskIds.push(task.id);
      } else {
        sectionMap.set(binding.ctdSection, { title: binding.sectionTitle, taskIds: [task.id] });
      }
    }

    if (!task.subTasks) continue;
    for (const sub of task.subTasks) {
      if (!sub.documentBinding) continue;
      const existing = sectionMap.get(sub.documentBinding.ctdSection);
      if (existing) {
        existing.taskIds.push(`${task.id}.${sub.id}`);
      } else {
        sectionMap.set(sub.documentBinding.ctdSection, {
          title: sub.documentBinding.sectionTitle,
          taskIds: [`${task.id}.${sub.id}`],
        });
      }
    }
  }

  return Array.from(sectionMap.entries())
    .map(([ctdSection, data]) => ({
      ctdSection,
      sectionTitle: data.title,
      taskIds: data.taskIds,
      covered: data.taskIds.length > 0,
    }))
    .sort((a, b) => a.ctdSection.localeCompare(b.ctdSection));
}

// ─── Cross-Submission Dependencies ──────────────────────────────────────────

export function getCrossSubmissionDependencies(
  pyramid: SubmissionPyramid,
): CrossSubmissionDep[] {
  const deps: CrossSubmissionDep[] = [];
  for (const task of pyramid.tasks) {
    if (task.crossSubmissionDeps) {
      for (const dep of task.crossSubmissionDeps) {
        deps.push(dep);
      }
    }
  }
  return deps;
}

// ─── Timeline Estimation ────────────────────────────────────────────────────

export interface TimelineEstimate {
  phaseId: string;
  phaseName: string;
  startWeek: number;
  endWeek: number;
  durationWeeks: number;
  fdaMilestones: { taskId: string; milestone: string; week: number; deadlineDays?: number }[];
}

export function estimateTimeline(pyramid: SubmissionPyramid): TimelineEstimate[] {
  const estimates: TimelineEstimate[] = [];

  for (const phase of pyramid.phases) {
    let minStart = Infinity;
    let maxEnd = 0;
    const milestones: TimelineEstimate['fdaMilestones'] = [];

    for (const task of phase.tasks) {
      if (task.timeline) {
        const start = task.timeline.typicalStartWeek ?? 0;
        const duration = task.timeline.typicalDurationWeeks ?? 1;
        const end = start + duration;
        if (start < minStart) minStart = start;
        if (end > maxEnd) maxEnd = end;

        if (task.timeline.fdaMilestone) {
          milestones.push({
            taskId: task.id,
            milestone: task.timeline.fdaMilestone,
            week: start,
            deadlineDays: task.timeline.regulatoryDeadlineDays,
          });
        }
      }
    }

    if (minStart === Infinity) minStart = 0;
    if (maxEnd === 0) maxEnd = minStart + 1;

    estimates.push({
      phaseId: phase.id,
      phaseName: phase.name,
      startWeek: minStart,
      endWeek: maxEnd,
      durationWeeks: maxEnd - minStart,
      fdaMilestones: milestones,
    });
  }

  return estimates;
}

// ─── Regulatory Guidance Extraction ─────────────────────────────────────────

export interface GuidanceReference {
  taskId: string;
  taskName: string;
  fdaGuidanceRef?: string;
  ichGuideline?: string;
  cfrReference?: string;
  keyConsiderations: string[];
}

export function getGuidanceReferences(pyramid: SubmissionPyramid): GuidanceReference[] {
  const refs: GuidanceReference[] = [];
  for (const task of pyramid.tasks) {
    if (!task.guidance) continue;
    refs.push({
      taskId: task.id,
      taskName: task.name,
      fdaGuidanceRef: task.guidance.fdaGuidanceRef,
      ichGuideline: task.guidance.ichGuideline,
      cfrReference: task.guidance.cfrReference,
      keyConsiderations: task.guidance.keyConsiderations ?? [],
    });
  }
  return refs;
}

// ─── Sub-task Expansion ─────────────────────────────────────────────────────

export interface FlattenedTask {
  taskId: string;
  taskName: string;
  subTaskId?: string;
  subTaskName?: string;
  estimatedHours: number;
  role?: string;
  ctdSection?: string;
  deliverable?: string;
}

export function flattenWithSubTasks(pyramid: SubmissionPyramid): FlattenedTask[] {
  const flattened: FlattenedTask[] = [];
  for (const task of pyramid.tasks) {
    if (task.subTasks && task.subTasks.length > 0) {
      for (const sub of task.subTasks) {
        flattened.push({
          taskId: task.id,
          taskName: task.name,
          subTaskId: sub.id,
          subTaskName: sub.name,
          estimatedHours: sub.estimatedHours,
          role: task.role,
          ctdSection: sub.documentBinding?.ctdSection,
          deliverable: sub.deliverable,
        });
      }
    } else {
      flattened.push({
        taskId: task.id,
        taskName: task.name,
        estimatedHours: task.estimatedHours,
        role: task.role,
        ctdSection: task.documentBindings?.[0]?.ctdSection,
      });
    }
  }
  return flattened;
}

// ─── Deliverables Catalog ───────────────────────────────────────────────────

export function getDeliverablesCatalog(
  pyramid: SubmissionPyramid,
): { taskId: string; taskName: string; phaseId: string; deliverables: string[] }[] {
  return pyramid.tasks
    .filter(t => t.deliverables && t.deliverables.length > 0)
    .map(t => ({
      taskId: t.id,
      taskName: t.name,
      phaseId: t.phaseId,
      deliverables: t.deliverables!,
    }));
}

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
