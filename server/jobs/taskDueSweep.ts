/**
 * Task due-date sweep — the "work finds you" half of task notifications.
 *
 * Task EVENTS notify (assignment, blocked, completion, unblock cascade —
 * services/tasking/task-side-effects), but nothing fired when a deadline
 * simply approached or passed with no event (collaboration/tasking assessment
 * D14 / backlog item 6: "task notifications (due/overdue) — the columns are
 * unread"). This sweep closes that: assignees are notified ONCE when a task
 * comes due within 48 hours and ONCE when it goes overdue, idempotent via
 * metadata markers on the task row, so a restarting server never re-spams.
 *
 * Lifecycle mirrors scheduleOfEventsSweep:
 *   - start() schedules a single timer (idempotent)
 *   - first sweep after a short startup delay
 *   - disabled in tests or when TASK_DUE_SWEEP_DISABLED is truthy
 *   - unprovisioned tables / DB errors are treated as zero work
 *
 * @module server/jobs/taskDueSweep
 */

import { and, eq, isNull, isNotNull, inArray, lt, sql } from 'drizzle-orm';
import { createScopedLogger } from '../utils/logger.js';
import { runWithSystemTenantScope } from '../db/tenantStore';

const logger = createScopedLogger('task-due-sweep');

export const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;

export type DueClass = 'overdue' | 'due-soon' | null;

/** Pure: how a due date reads at `now`. */
export function classifyDue(dueDate: Date | string | null, now: number): DueClass {
  if (!dueDate) return null;
  const due = dueDate instanceof Date ? dueDate.getTime() : new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return null;
  if (due < now) return 'overdue';
  if (due <= now + DUE_SOON_WINDOW_MS) return 'due-soon';
  return null;
}

/**
 * Pure: has this class of notification already been sent for the task?
 * A task that was due-soon-notified still gets its overdue notification;
 * an overdue-notified task never re-notifies for either class.
 */
export function alreadyNotified(metadata: unknown, cls: Exclude<DueClass, null>): boolean {
  const m = (metadata ?? {}) as Record<string, unknown>;
  if (cls === 'due-soon') {
    return Boolean(m.dueSoonNotifiedAt) || Boolean(m.overdueNotifiedAt);
  }
  return Boolean(m.overdueNotifiedAt);
}

export interface TaskDueSweepSummary {
  scanned: number;
  dueSoonNotified: number;
  overdueNotified: number;
  errors: number;
}

/** One sweep across every open, dated, assigned task in every organization. */
export async function runTaskDueSweep(): Promise<TaskDueSweepSummary> {
  return runWithSystemTenantScope('task-due-sweep', async () => {
    const summary: TaskDueSweepSummary = {
      scanned: 0,
      dueSoonNotified: 0,
      overdueNotified: 0,
      errors: 0,
    };

    let db: typeof import('../db').db;
    let unifiedTasks: typeof import('../../shared/schema').unifiedTasks;
    try {
      ({ db } = await import('../db'));
      ({ unifiedTasks } = await import('../../shared/schema'));
    } catch {
      return summary; // no database in this environment — no work
    }

    const now = Date.now();
    let rows: Array<{
      taskId: string;
      organizationId: number;
      assigneeId: number | null;
      title: string;
      dueDate: Date | null;
      metadata: unknown;
    }>;
    try {
      rows = await db
        .select({
          taskId: unifiedTasks.taskId,
          organizationId: unifiedTasks.organizationId,
          assigneeId: unifiedTasks.assigneeId,
          title: unifiedTasks.title,
          dueDate: unifiedTasks.dueDate,
          metadata: unifiedTasks.metadata,
        })
        .from(unifiedTasks)
        .where(
          and(
            inArray(unifiedTasks.status, ['pending', 'in-progress', 'review', 'blocked']),
            isNull(unifiedTasks.deletedAt),
            isNotNull(unifiedTasks.assigneeId),
            isNotNull(unifiedTasks.dueDate),
            // Only rows inside the window are candidates; far-future rows
            // never leave the index.
            lt(unifiedTasks.dueDate, new Date(now + DUE_SOON_WINDOW_MS))
          )
        )
        .limit(500);
    } catch {
      return summary; // unprovisioned / transient — zero work, retry next tick
    }

    summary.scanned = rows.length;
    if (!rows.length) return summary;

    const { notifyTaskEvent } = await import('../services/tasking/task-side-effects');

    for (const row of rows) {
      try {
        const cls = classifyDue(row.dueDate, now);
        if (!cls || alreadyNotified(row.metadata, cls)) continue;

        const marker = cls === 'overdue' ? 'overdueNotifiedAt' : 'dueSoonNotifiedAt';
        const nextMetadata = {
          ...((row.metadata ?? {}) as Record<string, unknown>),
          [marker]: new Date(now).toISOString(),
        };
        // Stamp BEFORE notifying: a duplicate suppression beats a duplicate
        // notification if the process dies between the two.
        await db
          .update(unifiedTasks)
          .set({ metadata: nextMetadata, updatedAt: new Date() })
          .where(
            and(
              eq(unifiedTasks.taskId, row.taskId),
              eq(unifiedTasks.organizationId, row.organizationId),
              // Concurrency guard: only stamp if still unstamped.
              sql`COALESCE(${unifiedTasks.metadata} ->> ${marker}, '') = ''`
            )
          );

        notifyTaskEvent({
          organizationId: row.organizationId,
          recipientUserId: row.assigneeId,
          category: 'task_update',
          severity: cls === 'overdue' ? 'warning' : 'info',
          title: cls === 'overdue' ? `Overdue: ${row.title}` : `Due soon: ${row.title}`,
          body:
            cls === 'overdue'
              ? 'This task has passed its due date.'
              : 'This task is due within 48 hours.',
          taskId: row.taskId,
        });
        if (cls === 'overdue') summary.overdueNotified += 1;
        else summary.dueSoonNotified += 1;
      } catch {
        summary.errors += 1; // per-task best-effort
      }
    }
    return summary;
  });
}

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // hourly
const STARTUP_DELAY_MS = 3 * 60 * 1000; // 3 min before first sweep

let timer: ReturnType<typeof setInterval> | null = null;
let startupTimer: ReturnType<typeof setTimeout> | null = null;
let lastSweep: { at: Date; summary: TaskDueSweepSummary } | null = null;

function isDisabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  const flag = (process.env.TASK_DUE_SWEEP_DISABLED || '').toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(flag);
}

function readIntervalMs(): number {
  const raw = process.env.TASK_DUE_SWEEP_INTERVAL_MS;
  if (!raw) return DEFAULT_INTERVAL_MS;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_INTERVAL_MS;
}

async function tick(): Promise<void> {
  try {
    const summary = await runTaskDueSweep();
    lastSweep = { at: new Date(), summary };
    if (summary.dueSoonNotified > 0 || summary.overdueNotified > 0) {
      logger.info('sweep notified on due dates', {
        scanned: summary.scanned,
        dueSoonNotified: summary.dueSoonNotified,
        overdueNotified: summary.overdueNotified,
        errors: summary.errors,
      });
    }
  } catch (err: any) {
    logger.warn('tick failed (will retry next interval)', { error: err?.message || String(err) });
  }
}

/**
 * Start the periodic sweep. Idempotent. Returns true if a timer was scheduled.
 * Self-guards to a no-op in tests or when TASK_DUE_SWEEP_DISABLED is set.
 */
export function startTaskDueSweep(): boolean {
  if (timer || startupTimer) return false;
  if (isDisabled()) {
    logger.info('disabled', {
      enabled: false,
      controlledBy: 'TASK_DUE_SWEEP_DISABLED',
      reason:
        process.env.NODE_ENV === 'test'
          ? 'test environment'
          : 'TASK_DUE_SWEEP_DISABLED is set',
    });
    return false;
  }
  const intervalMs = readIntervalMs();
  startupTimer = setTimeout(() => {
    startupTimer = null;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
  }, STARTUP_DELAY_MS);
  if (typeof startupTimer.unref === 'function') startupTimer.unref();
  logger.info('scheduled', { intervalMs, startupDelayMs: STARTUP_DELAY_MS });
  return true;
}

/** Stop timers (tests / shutdown). */
export function stopTaskDueSweep(): void {
  if (timer) { clearInterval(timer); timer = null; }
  if (startupTimer) { clearTimeout(startupTimer); startupTimer = null; }
}

/** Introspection for health surfaces. */
export function getTaskDueSweepStatus(): {
  running: boolean;
  lastSweep: { at: Date; summary: TaskDueSweepSummary } | null;
} {
  return { running: timer != null || startupTimer != null, lastSweep };
}
