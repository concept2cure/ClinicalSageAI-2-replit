/**
 * Schedule-of-Events health — pure assessment of milestone slippage / risk.
 *
 * Given the current milestones (with their target dates and progress), this
 * derives each milestone's health status and an overall verdict. It is pure
 * (no DB, no clock side effects beyond the injected `now`) so the proactive
 * sweep and the read API both compute the same thing.
 *
 * @module server/services/projects/schedule-of-events/health
 */

export type ScheduleStatus =
  | 'not_started'
  | 'in_progress'
  | 'at_risk'
  | 'completed'
  | 'slipped'
  | 'blocked';

export interface MilestoneHealthInput {
  key: string;
  title: string;
  status: ScheduleStatus;
  targetDate: Date | null;
  isCritical: boolean;
  progress: number;
}

export interface MilestoneHealthResult {
  key: string;
  title: string;
  previousStatus: ScheduleStatus;
  nextStatus: ScheduleStatus;
  slipDays: number | null;
  changed: boolean;
  isCritical: boolean;
  reason: string;
}

/**
 * 'not_assessed' when there is nothing to assess: no milestones, or no open
 * milestone with a target date. Both used to read 'on_track' — "Schedule is on
 * track." over an empty or undated schedule (2026-10-15).
 */
export type OverallScheduleStatus = 'on_track' | 'at_risk' | 'off_track' | 'not_assessed';

export interface ScheduleHealth {
  assessedAt: string;
  total: number;
  completed: number;
  /** Open milestones with a target date that are on course. */
  onTrack: number;
  atRisk: number;
  slipped: number;
  /** Open milestones with no target date: not assessed, and not counted as on track. */
  undated: number;
  overallStatus: OverallScheduleStatus;
  summary: string;
  milestones: MilestoneHealthResult[];
}

const DAY_MS = 86_400_000;

export interface AssessOptions {
  now?: Date;
  /** A not-yet-started milestone within this many days of its target is at risk. */
  atRiskWindowDays?: number;
}

/** Assess one milestone's health. Terminal states (completed/blocked) are respected. */
function assessMilestone(m: MilestoneHealthInput, now: Date, windowDays: number): MilestoneHealthResult {
  const base = {
    key: m.key,
    title: m.title,
    previousStatus: m.status,
    isCritical: m.isCritical,
  };

  if (m.status === 'completed') {
    return { ...base, nextStatus: 'completed', slipDays: null, changed: false, reason: 'Milestone complete.' };
  }
  if (m.status === 'blocked') {
    return { ...base, nextStatus: 'blocked', slipDays: null, changed: false, reason: 'Milestone is blocked — needs resolution before it can progress.' };
  }
  if (!m.targetDate || !Number.isFinite(m.targetDate.getTime())) {
    return { ...base, nextStatus: m.status, slipDays: null, changed: false, reason: 'No target date set.' };
  }

  const daysUntil = Math.round((m.targetDate.getTime() - now.getTime()) / DAY_MS);

  if (daysUntil < 0) {
    const slipDays = Math.abs(daysUntil);
    return {
      ...base,
      nextStatus: 'slipped',
      slipDays,
      changed: m.status !== 'slipped',
      reason: `Target date passed ${slipDays} day${slipDays === 1 ? '' : 's'} ago without completion.`,
    };
  }

  const behind =
    m.status === 'not_started' || (m.status === 'in_progress' && m.progress < 70);
  if (daysUntil <= windowDays && behind) {
    return {
      ...base,
      nextStatus: 'at_risk',
      slipDays: null,
      changed: m.status !== 'at_risk',
      reason: `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'} and only ${m.progress}% complete.`,
    };
  }

  // Comfortably on track — relax a stale at_risk back to its working state.
  const relaxed: ScheduleStatus = m.status === 'at_risk' ? (m.progress > 0 ? 'in_progress' : 'not_started') : m.status;
  return {
    ...base,
    nextStatus: relaxed,
    slipDays: null,
    changed: relaxed !== m.status,
    reason: `On track — due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`,
  };
}

interface HealthCounts {
  total: number; completed: number; onTrack: number; atRisk: number;
  slipped: number; blocked: number; undated: number;
}

function overallFor(c: HealthCounts): OverallScheduleStatus {
  if (c.slipped > 0) return 'off_track';
  if (c.atRisk > 0 || c.blocked > 0) return 'at_risk';
  // Nothing to assess: no milestones, or no open milestone with a date.
  if (c.total === 0 || (c.onTrack === 0 && c.undated > 0)) return 'not_assessed';
  return 'on_track';
}

function summarise(c: HealthCounts, overall: OverallScheduleStatus, criticalSlip: boolean): string {
  const parts: string[] = c.total === 0
    ? ['No milestones are scheduled.']
    : [`${c.completed}/${c.total} milestones complete.`];
  if (c.slipped > 0) parts.push(`${c.slipped} slipped${criticalSlip ? ' (critical path affected)' : ''}.`);
  if (c.atRisk > 0) parts.push(`${c.atRisk} at risk.`);
  if (c.blocked > 0) parts.push(`${c.blocked} blocked.`);
  if (c.undated > 0) parts.push(`${c.undated} without a target date — not assessed.`);
  if (overall === 'on_track') parts.push(c.undated > 0 ? 'The dated milestones are on track.' : 'Schedule is on track.');
  return parts.join(' ');
}

export function assessScheduleHealth(
  milestones: MilestoneHealthInput[],
  opts: AssessOptions = {},
): ScheduleHealth {
  const now = opts.now ?? new Date();
  const windowDays = opts.atRiskWindowDays ?? 14;
  const results = milestones.map((m) => assessMilestone(m, now, windowDays));

  const completed = results.filter((r) => r.nextStatus === 'completed').length;
  const slipped = results.filter((r) => r.nextStatus === 'slipped').length;
  const atRisk = results.filter((r) => r.nextStatus === 'at_risk').length;
  const blocked = results.filter((r) => r.nextStatus === 'blocked').length;
  // An open milestone with no target date cannot be on or off track; it was
  // counted as on track.
  const undated = milestones.filter(
    (m) => m.status !== 'completed' && m.status !== 'blocked'
      && (!m.targetDate || !Number.isFinite(m.targetDate.getTime())),
  ).length;
  const onTrack = results.length - completed - slipped - atRisk - blocked - undated;

  const criticalSlip = results.some((r) => r.nextStatus === 'slipped' && r.isCritical);
  const counts = { total: results.length, completed, onTrack, atRisk, slipped, blocked, undated };
  const overallStatus = overallFor(counts);
  const summary = summarise(counts, overallStatus, criticalSlip);

  return {
    assessedAt: now.toISOString(),
    total: results.length,
    completed,
    onTrack,
    atRisk,
    slipped,
    undated,
    overallStatus,
    summary,
    milestones: results,
  };
}
