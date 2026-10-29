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
 * A task with a long horizon may say how much notice it needs:
 * `metadata.remindDaysBefore` (1 to MAX_REMIND_DAYS). A controlled document's
 * periodic review carries 30 (services/qms/periodic-review-task.ts); two days'
 * notice of an annual review is no notice. The window is decided in SQL, so the
 * batch limit is still never filled by rows that are not yet due.
 *
 * Lifecycle mirrors scheduleOfEventsSweep:
 *   - start() schedules a single timer (idempotent)
 *   - first sweep after a short startup delay
 *   - disabled in tests or when TASK_DUE_SWEEP_DISABLED is truthy
 *   - unprovisioned tables / DB errors are treated as zero work
 *
 * @module server/jobs/taskDueSweep
 */

import { and, asc, eq, isNull, isNotNull, inArray, lt, or, sql } from 'drizzle-orm';
import { createScopedLogger } from '../utils/logger.js';
import { runWithSystemTenantScope } from '../db/tenantStore';
import { filterTenantsForBackgroundWork } from '../services/tenant/tenant-lifecycle';

const logger = createScopedLogger('task-due-sweep');

export const DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;
/** The most notice a task may ask for; also the sweep's bound on the due-date index. */
export const MAX_REMIND_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DueClass = 'overdue' | 'due-soon' | null;

/**
 * Pure: the notice a task asks for, from `metadata.remindDaysBefore`; 48 hours
 * when it asks for none or for something else. The same reading as the sweep's
 * SQL, which matches the value's text against /^[1-9][0-9]?$/.
 */
export function remindWindowMs(metadata: unknown): number {
  const raw = (metadata as { remindDaysBefore?: unknown } | null | undefined)?.remindDaysBefore;
  const text = typeof raw === 'number' || typeof raw === 'string' ? String(raw) : '';
  const days = /^[1-9][0-9]?$/.test(text) ? Number(text) : 0;
  return days >= 1 && days <= MAX_REMIND_DAYS ? days * DAY_MS : DUE_SOON_WINDOW_MS;
}

/** Pure: how a due date reads at `now`, with the task's own notice window. */
export function classifyDue(dueDate: Date | string | null, now: number, windowMs: number = DUE_SOON_WINDOW_MS): DueClass {
  if (!dueDate) return null;
  const due = dueDate instanceof Date ? dueDate.getTime() : new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return null;
  if (due < now) return 'overdue';
  if (due <= now + windowMs) return 'due-soon';
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
  /** Rows skipped because their organization is not entitled to operate. */
  skippedNotEntitled: number;
  errors: number;
}


/**
 * Claim and send the notification for one task. Returns the class notified, or
 * null when the row was not due, was already notified, or was claimed by a
 * concurrent sweep.
 *
 * Extracted from `runTaskDueSweep` so that function stays inside the
 * lines-per-function budget after the tenant-entitlement filter was added.
 */
async function notifyOneTask(
  row: {
    taskId: string;
    organizationId: number;
    assigneeId: number | null;
    title: string;
    dueDate: Date | null;
    metadata: unknown;
  },
  now: number,
  deps: { db: any; unifiedTasks: any; notifyTaskEvent: (p: any) => void }
): Promise<'overdue' | 'due-soon' | null> {
  const { db, unifiedTasks, notifyTaskEvent } = deps;
  const windowMs = remindWindowMs(row.metadata);
  const cls = classifyDue(row.dueDate, now, windowMs);
  if (!cls || alreadyNotified(row.metadata, cls)) return null;

  const marker = cls === 'overdue' ? 'overdueNotifiedAt' : 'dueSoonNotifiedAt';
  const nextMetadata = {
    ...((row.metadata ?? {}) as Record<string, unknown>),
    [marker]: new Date(now).toISOString(),
  };
  // Stamp BEFORE notifying: a duplicate suppression beats a duplicate
  // notification if the process dies between the two. The guarded UPDATE is also
  // the concurrency arbiter — with two replicas (or overlapping sweeps) both can
  // pass the read, but only ONE update affects a row. The loser MUST NOT notify,
  // so the result is checked, not ignored.
  const stamped = await db
    .update(unifiedTasks)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(
      and(
        eq(unifiedTasks.taskId, row.taskId),
        eq(unifiedTasks.organizationId, row.organizationId),
        sql`COALESCE(${unifiedTasks.metadata} ->> ${marker}, '') = ''`
      )
    )
    .returning({ taskId: unifiedTasks.taskId });
  if (!stamped.length) return null; // another sweep claimed this notification

  notifyTaskEvent({
    organizationId: row.organizationId,
    recipientUserId: row.assigneeId,
    category: 'task_update',
    severity: cls === 'overdue' ? 'warning' : 'info',
    title: cls === 'overdue' ? `Overdue: ${row.title}` : `Due soon: ${row.title}`,
    body: dueNoticeBody(cls, row.dueDate, windowMs),
    taskId: row.taskId,
  });
  return cls;
}

/** The notice's sentence. A task with its own lead names its due date: "within 30 days" says less. */
function dueNoticeBody(cls: 'overdue' | 'due-soon', dueDate: Date | null, windowMs: number): string {
  if (cls === 'overdue') return 'This task has passed its due date.';
  if (windowMs === DUE_SOON_WINDOW_MS || !dueDate) return 'This task is due within 48 hours.';
  return `This task is due on ${new Date(dueDate).toISOString().slice(0, 10)}.`;
}

/** One sweep across every open, dated, assigned task in every organization. */
export async function runTaskDueSweep(): Promise<TaskDueSweepSummary> {
  return runWithSystemTenantScope('task-due-sweep', async () => {
    const summary: TaskDueSweepSummary = {
      scanned: 0,
      dueSoonNotified: 0,
      overdueNotified: 0,
      skippedNotEntitled: 0,
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
            // Only rows inside their window are candidates: the 48 hours, or
            // the task's own lead (remindWindowMs, in SQL so a non-numeric
            // lead can never be cast). Far-future rows never leave the index.
            lt(unifiedTasks.dueDate, new Date(now + MAX_REMIND_DAYS * DAY_MS)),
            // Nested CASE: only it guarantees the cast runs after the pattern matched.
            sql`${unifiedTasks.dueDate} < ${new Date(now)}::timestamp + make_interval(secs => CASE
                 WHEN ${unifiedTasks.metadata} ->> 'remindDaysBefore' ~ '^[1-9][0-9]?$'
                 THEN CASE WHEN (${unifiedTasks.metadata} ->> 'remindDaysBefore')::int <= ${MAX_REMIND_DAYS}
                           THEN (${unifiedTasks.metadata} ->> 'remindDaysBefore')::int * 86400
                           ELSE ${DUE_SOON_WINDOW_MS / 1000} END
                 ELSE ${DUE_SOON_WINDOW_MS / 1000} END)`,
            // Already-handled rows are excluded IN SQL, not after the limit.
            // Filtering markers in JS let a batch of stamped rows consume the
            // whole limit forever, starving unnotified tasks beyond it.
            //   · an overdue-notified task is finished with the sweep;
            //   · a due-soon-notified task still deserves its overdue notice,
            //     so it stays a candidate once its due date has passed.
            sql`${unifiedTasks.metadata} ->> 'overdueNotifiedAt' IS NULL`,
            or(
              lt(unifiedTasks.dueDate, new Date(now)),
              sql`${unifiedTasks.metadata} ->> 'dueSoonNotifiedAt' IS NULL`
            )
          )
        )
        .orderBy(asc(unifiedTasks.dueDate))
        .limit(500);
    } catch {
      return summary; // unprovisioned / transient — zero work, retry next tick
    }

    summary.scanned = rows.length;
    if (!rows.length) return summary;

    // TENANT LIFECYCLE. This sweep selects across EVERY organization and sends
    // notifications, and it runs on no transport — so the HTTP lifecycle guard
    // never saw it. Before this filter a suspended organization's users kept
    // receiving automated mail about work every HTTP route would refuse them,
    // and the platform kept spending on tenants that are not paying.
    //
    // Resolved ONCE per distinct organization rather than per row: at a 500-row
    // limit the posture cache makes repeats cheap, but the round-trips are not
    // free. Skipped tenants are counted, not logged per row — a suspended tenant
    // with 200 due tasks should produce one summary number, not 200 log lines.
    const allowedOrgs = await filterTenantsForBackgroundWork(rows.map(r => r.organizationId));

    const { notifyTaskEvent } = await import('../services/tasking/task-side-effects');

    for (const row of rows) {
      try {
        if (!allowedOrgs.has(row.organizationId)) {
          summary.skippedNotEntitled += 1;
          continue;
        }
        const notified = await notifyOneTask(row, now, { db, unifiedTasks, notifyTaskEvent });
        if (notified === 'overdue') summary.overdueNotified += 1;
        else if (notified === 'due-soon') summary.dueSoonNotified += 1;
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
    const { runCompanyLegalRenewalSweep } = await import('./companyLegalRenewalSweep');
    const legal = await runCompanyLegalRenewalSweep();
    if (legal.errors) logger.warn('company legal renewal sweep needs retry', { errors: legal.errors });
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
