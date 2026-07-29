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

export type OverallScheduleStatus = 'on_track' | 'at_risk' | 'off_track';

export interface ScheduleHealth {
  assessedAt: string;
  total: number;
  completed: number;
  onTrack: number;
  atRisk: number;
  slipped: number;
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
  const onTrack = results.length - completed - slipped - atRisk - blocked;

  const criticalSlip = results.some((r) => r.nextStatus === 'slipped' && r.isCritical);
  let overallStatus: OverallScheduleStatus = 'on_track';
  if (criticalSlip || slipped > 0) overallStatus = 'off_track';
  else if (atRisk > 0 || blocked > 0) overallStatus = 'at_risk';

  const parts: string[] = [`${completed}/${results.length} milestones complete.`];
  if (slipped > 0) parts.push(`${slipped} slipped${criticalSlip ? ' (critical path affected)' : ''}.`);
  if (atRisk > 0) parts.push(`${atRisk} at risk.`);
  if (blocked > 0) parts.push(`${blocked} blocked.`);
  if (slipped === 0 && atRisk === 0 && blocked === 0) parts.push('Schedule is on track.');

  return {
    assessedAt: now.toISOString(),
    total: results.length,
    completed,
    onTrack,
    atRisk,
    slipped,
    overallStatus,
    summary: parts.join(' '),
    milestones: results,
  };
}
