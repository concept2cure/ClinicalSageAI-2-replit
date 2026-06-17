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
 * @module server/jobs/scheduleOfEventsSweep
 */

import { listActiveSchedulePlans, reviewScheduleHealth } from '../services/projects/schedule-of-events';

export interface ScheduleSweepSummary {
  schedules: number;
  reviewed: number;
  tasksCreated: number;
  alertsCreated: number;
  errors: number;
}

/** One sweep across every active schedule of events. */
export async function runScheduleOfEventsSweep(): Promise<ScheduleSweepSummary> {
  const summary: ScheduleSweepSummary = { schedules: 0, reviewed: 0, tasksCreated: 0, alertsCreated: 0, errors: 0 };
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
      console.log(
        `[schedule-of-events-sweep] reviewed ${summary.reviewed}/${summary.schedules} schedule(s): ` +
          `${summary.tasksCreated} task(s), ${summary.alertsCreated} alert(s)`,
      );
    }
  } catch (err: any) {
    console.warn('[schedule-of-events-sweep] tick failed (will retry next interval):', err?.message || err);
  }
}

/**
 * Start the periodic sweep. Idempotent. Returns true if a timer was scheduled.
 * Self-guards to a no-op in tests or when SCHEDULE_OF_EVENTS_SWEEP_DISABLED is set.
 */
export function startScheduleOfEventsSweep(): boolean {
  if (timer || startupTimer) return false;
  if (isDisabled()) return false;
  const intervalMs = readIntervalMs();

  startupTimer = setTimeout(() => {
    startupTimer = null;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }, Math.min(STARTUP_DELAY_MS, intervalMs));
  if (typeof startupTimer.unref === 'function') startupTimer.unref();

  console.log(
    `[schedule-of-events-sweep] scheduled (interval=${intervalMs}ms, first=${Math.min(STARTUP_DELAY_MS, intervalMs)}ms)`,
  );
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
