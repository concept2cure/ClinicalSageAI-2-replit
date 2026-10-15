/**
 * Schedule-of-Events proactive sweep.
 *
 * Periodically reviews every active project schedule of events so AnA "stays on
 * top of it" without anyone asking: it re-assesses milestone health, marks
 * slips / at-risk items, opens recovery & mitigation tasks, fires alerts, flags
 * goals whose target dates have passed, and refreshes AnA's narrative — all via
 * reviewScheduleHealth() (which reuses the platform's task + notification
 * tables). Each project is best-effort so one failure doesn't stop the rest.
 *
 * Lifecycle mirrors submission-chat-sweep-scheduler:
 *   - start() schedules a single timer (idempotent)
 *   - first sweep runs after a short startup delay
 *   - disabled in tests, when SCHEDULE_OF_EVENTS_SWEEP_DISABLED is truthy, or
 *     when the schedule tables don't exist yet (listActiveSchedulePlans throws
 *     → caught, treated as zero work)
 *
 * Multi-process (production runs three copies of the server, each starting
 * this sweep; there is no Redis). Two guards, because they stop different
 * duplicates:
 *   - a cross-process LEASE (db/scheduledOnce) — sweeps never overlap, so two
 *     processes cannot both open a recovery task / fire a slip alert for the
 *     same milestone off the same stale read;
 *   - a per-schedule CLAIM — a guarded UPDATE ... RETURNING on the plan row's
 *     last_reviewed_by_ana_at, the same claim step taskDueSweep uses. Timers on
 *     different processes fire hours apart, so the lease alone would still let
 *     each process review every schedule once per interval — three
 *     health_review revisions every 6 h. A schedule reviewed less than
 *     REVIEW_CLAIM_FRACTION of an interval ago is not claimable and is skipped.
 *     A claim is taken BEFORE the review: if the process dies mid-review the
 *     schedule waits one interval (the cadence it had anyway) rather than
 *     being reviewed twice.
 *
 * @module server/jobs/scheduleOfEventsSweep
 */

import {
  listActiveSchedulePlans,
  reviewScheduleHealth,
} from '../services/projects/schedule-of-events';
import { createScopedLogger } from '../utils/logger.js';
import { pool } from '../db';
import { runScheduledOnce } from '../db/scheduledOnce';

const logger = createScopedLogger('schedule-of-events-sweep');

export interface ScheduleSweepSummary {
  schedules: number;
  reviewed: number;
  /** Schedules skipped because they were reviewed within the claim window. */
  recentlyReviewed: number;
  tasksCreated: number;
  alertsCreated: number;
  errors: number;
  /** Set when another process held the sweep lease; nothing was done here. */
  skipped?: 'held_elsewhere';
}

/**
 * A schedule is re-claimable once its last review is older than this fraction
 * of the sweep interval. Slightly under 1 so a process whose own timer fires a
 * few ms "early" relative to the stamp still claims on its next tick.
 */
const REVIEW_CLAIM_FRACTION = 0.9;

function emptySummary(): ScheduleSweepSummary {
  return { schedules: 0, reviewed: 0, recentlyReviewed: 0, tasksCreated: 0, alertsCreated: 0, errors: 0 };
}

/**
 * Claim one schedule for review: stamp last_reviewed_by_ana_at only if it is
 * unset or older than the window. The guarded UPDATE is the arbiter — of any
 * number of concurrent or later sweeps inside the window, exactly one gets a
 * row back. The loser MUST NOT review, so the result is checked, not ignored.
 */
async function claimScheduleForReview(scheduleId: number, minAgeMs: number): Promise<boolean> {
  // tenant-isolation-safe: runs under the sweep's audited system scope
  // (runScheduledOnce → runWithSystemTenantScope) and is keyed by the plan's
  // primary key, taken from the estate-wide active-plan listing.
  const { rows } = await pool.query(
    `UPDATE project_schedule_of_events
        SET last_reviewed_by_ana_at = now()
      WHERE id = $1
        AND (last_reviewed_by_ana_at IS NULL
             OR last_reviewed_by_ana_at < now() - make_interval(secs => $2::double precision))
      RETURNING id`,
    [scheduleId, minAgeMs / 1000],
  );
  return rows.length > 0;
}

/**
 * One sweep across every active schedule of events, under the cross-process
 * lease. `minReviewAgeMs` defaults to REVIEW_CLAIM_FRACTION of the configured
 * interval.
 */
export async function runScheduleOfEventsSweep(
  options: { minReviewAgeMs?: number } = {},
): Promise<ScheduleSweepSummary> {
  const minAgeMs = options.minReviewAgeMs ?? Math.floor(readIntervalMs() * REVIEW_CLAIM_FRACTION);
  const outcome = await runScheduledOnce('schedule-of-events-sweep', () => sweepAll(minAgeMs));
  return outcome.ran ? outcome.value : { ...emptySummary(), skipped: 'held_elsewhere' };
}

async function sweepAll(minAgeMs: number): Promise<ScheduleSweepSummary> {
  const summary = emptySummary();
  let plans: Array<{ scheduleId: number; orgId: number; projectId: number }>;
  try {
    plans = await listActiveSchedulePlans();
  } catch {
    // Tables not migrated yet, or transient DB error — treat as no work.
    return summary;
  }
  summary.schedules = plans.length;
  for (const p of plans) {
    try {
      if (!(await claimScheduleForReview(p.scheduleId, minAgeMs))) {
        summary.recentlyReviewed += 1;
        continue;
      }
      const result = await reviewScheduleHealth({
        orgId: p.orgId,
        projectId: p.projectId,
        apply: true,
        triggeredBy: 'scheduler',
      });
      if (result.ok) {
        summary.reviewed += 1;
        summary.tasksCreated += result.tasksCreated;
        summary.alertsCreated += result.alertsCreated;
      }
    } catch {
      summary.errors += 1; // per-project best-effort
    }
  }
  return summary;
}

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const STARTUP_DELAY_MS = 5 * 60 * 1000; // 5 min before first sweep

let timer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let lastSweep: { at: Date; summary: ScheduleSweepSummary } | null = null;

function isDisabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const flag = (process.env.SCHEDULE_OF_EVENTS_SWEEP_DISABLED || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(flag);
}

function readIntervalMs(): number {
  const raw = process.env.SCHEDULE_OF_EVENTS_SWEEP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
}

async function tick(): Promise<void> {
  try {
    const summary = await runScheduleOfEventsSweep();
    lastSweep = { at: new Date(), summary };
    if (summary.tasksCreated > 0 || summary.alertsCreated > 0) {
      logger.info('sweep reviewed schedules', {
        reviewed: summary.reviewed,
        schedules: summary.schedules,
        tasksCreated: summary.tasksCreated,
        alertsCreated: summary.alertsCreated,
      });
    }
  } catch (err: any) {
    logger.warn('tick failed (will retry next interval)', { error: err?.message || String(err) });
  }
}

/**
 * Start the periodic sweep. Idempotent. Returns true if a timer was scheduled.
 * Self-guards to a no-op in tests or when SCHEDULE_OF_EVENTS_SWEEP_DISABLED is set.
 */
export function startScheduleOfEventsSweep(): boolean {
  if (timer || startupTimer) return false;
  if (isDisabled()) {
    // Boot-posture line: state the decision and the env var that controls it.
    logger.info('disabled', {
      enabled: false,
      controlledBy: 'SCHEDULE_OF_EVENTS_SWEEP_DISABLED',
      reason:
        process.env.NODE_ENV === 'test'
          ? 'test environment'
          : 'SCHEDULE_OF_EVENTS_SWEEP_DISABLED is set',
    });
    return false;
  }
  const intervalMs = readIntervalMs();

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }, Math.min(STARTUP_DELAY_MS, intervalMs));
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  logger.info('scheduled', {
    enabled: true,
    controlledBy: 'SCHEDULE_OF_EVENTS_SWEEP_DISABLED',
    intervalMs,
    firstRunMs: Math.min(STARTUP_DELAY_MS, intervalMs),
  });
  return true;
}

/** Stop the periodic sweep. Used in tests / graceful shutdown. */
export function stopScheduleOfEventsSweep(): void {
  if (startupTimer) {
    clearTimeout(startupTimer);
    startupTimer = null;
  }
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getScheduleSweepStatus(): {
  running: boolean;
  intervalMs: number;
  lastSweep: { at: string; summary: ScheduleSweepSummary } | null;
} {
  return {
    running: !!timer,
    intervalMs: readIntervalMs(),
    lastSweep: lastSweep ? { at: lastSweep.at.toISOString(), summary: lastSweep.summary } : null,
  };
}
