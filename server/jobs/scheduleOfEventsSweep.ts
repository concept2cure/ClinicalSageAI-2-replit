/**
 * Schedule-of-Events proactive sweep.
 *
 * Periodically reviews every active project schedule of events so AnA "stays on
 * top of it" without anyone asking: it re-assesses milestone health, marks
 * slips / at-risk items, opens recovery & mitigation tasks, fires alerts, flags
 * goals whose target dates have passed, and refreshes AnA's narrative — all via
 * reviewScheduleHealthForSweep() (which reuses the platform's task + notification
 * tables). Each project is best-effort so one failure doesn't stop the rest.
 *
 * Lifecycle mirrors submission-chat-sweep-scheduler:
 *   - start() schedules a single timer (idempotent)
 *   - first sweep runs after a short startup delay
 *   - disabled in tests or when SCHEDULE_OF_EVENTS_SWEEP_DISABLED is truthy
 *   - listing failures are counted and logged before the next scheduled retry
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
  reviewScheduleHealthForSweep,
} from '../services/projects/schedule-of-events';
import { createScopedLogger } from '../utils/logger.js';
import { runScheduledOnce } from '../db/scheduledOnce';
import { withTenantConnection } from '../db/withTenantConnection';
import { filterTenantsForBackgroundWork } from '../services/tenant/tenant-lifecycle';
import type { RequestSqlClient } from '../db/requestDb';

const logger = createScopedLogger('schedule-of-events-sweep');

export interface ScheduleSweepSummary {
  schedules: number;
  reviewed: number;
  /** Unclaimed schedules: within the window or no longer active/eligible. */
  recentlyReviewed: number;
  /** Schedules of tenants whose lifecycle posture refuses background work (suspended, past due, canceled). */
  skippedNotEntitled: number;
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
  return { schedules: 0, reviewed: 0, recentlyReviewed: 0, skippedNotEntitled: 0, tasksCreated: 0, alertsCreated: 0, errors: 0 };
}

/**
 * Claim one schedule for review: stamp last_reviewed_by_ana_at only if it is
 * unset or older than the window. The guarded UPDATE is the arbiter — of any
 * number of concurrent or later sweeps inside the window, exactly one gets a
 * row back. The loser MUST NOT review, so the result is checked, not ignored.
 */
async function claimScheduleForReview(
  client: RequestSqlClient,
  plan: { scheduleId: number; orgId: number; projectId: number },
  minAgeMs: number,
): Promise<boolean> {
  const { rows } = await client.query(
    `UPDATE project_schedule_of_events
        SET last_reviewed_by_ana_at = now()
      WHERE id = $1
        AND organization_id = $2
        AND project_id = $3
        AND status = 'active'
        AND EXISTS (
          SELECT 1 FROM projects p JOIN organizations o ON o.id = p.organization_id
          WHERE p.id = project_schedule_of_events.project_id
            AND p.organization_id = project_schedule_of_events.organization_id
            AND p.status = 'active' AND o.status = 'active'
        )
        AND (last_reviewed_by_ana_at IS NULL
             OR last_reviewed_by_ana_at < now() - make_interval(secs => $4::double precision))
      RETURNING id`,
    [plan.scheduleId, plan.orgId, plan.projectId, minAgeMs / 1000],
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

/** Claim and review one plan under its own tenant's connection. Best-effort: a failure is counted. */
async function reviewPlan(
  p: { scheduleId: number; orgId: number; projectId: number },
  minAgeMs: number,
  summary: ScheduleSweepSummary,
): Promise<void> {
  try {
    const result = await withTenantConnection({
      tenantId: p.orgId, role: null, source: 'job', caller: 'schedule-of-events-sweep:review',
    }, async client => {
      if (!(await claimScheduleForReview(client, p, minAgeMs))) return null;
      // Let transaction failures reach the connection owner, which evicts
      // the client when a COMMIT acknowledgement is uncertain.
      return reviewScheduleHealthForSweep({ orgId: p.orgId, projectId: p.projectId, apply: true }, client);
    });
    if (result === null) {
      summary.recentlyReviewed += 1;
      return;
    }
    if (result.ok) {
      summary.reviewed += 1;
      summary.tasksCreated += result.tasksCreated;
      summary.alertsCreated += result.alertsCreated;
    } else {
      summary.errors += 1;
    }
  } catch {
    summary.errors += 1; // per-project best-effort
    logger.warn('schedule review failed', { organizationId: p.orgId, projectId: p.projectId, scheduleId: p.scheduleId });
  }
}

async function sweepAll(minAgeMs: number): Promise<ScheduleSweepSummary> {
  const summary = emptySummary();
  let plans: Array<{ scheduleId: number; orgId: number; projectId: number }>;
  try {
    plans = await listActiveSchedulePlans();
  } catch {
    summary.errors += 1;
    logger.warn('active schedule listing failed');
    return summary;
  }
  summary.schedules = plans.length;
  // TENANT LIFECYCLE, as taskDueSweep. The claim's SQL checks organizations.status
  // only, and a tenant whose row reads active can still be read_only: past due or
  // canceled. Every HTTP write refuses that tenant; this sweep created AnA's tasks
  // and alerts for it. One posture per distinct organization; a posture that
  // cannot be read refuses (backgroundWorkPermitted(null) is false).
  let allowedOrgs: Set<number>;
  try {
    allowedOrgs = await filterTenantsForBackgroundWork(plans.map(p => p.orgId));
  } catch {
    // Unknown entitlement is not permission: nothing is reviewed this tick.
    summary.errors += 1;
    logger.warn('tenant lifecycle read failed; no schedule was reviewed');
    return summary;
  }
  for (const p of plans) {
    if (!allowedOrgs.has(p.orgId)) {
      summary.skippedNotEntitled += 1;
      continue;
    }
    await reviewPlan(p, minAgeMs, summary);
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
