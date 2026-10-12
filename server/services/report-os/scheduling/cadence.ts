/**
 * Deterministic next-run computation for constrained cadence presets.
 *
 * Pure, no cron library, no IO. All arithmetic is performed in UTC for
 * determinism; `schedule.timeZoneOffsetMinutes` is intentionally ignored here
 * and is expected to be applied by the caller when presenting times to users.
 */

import type { ReportSchedule } from './types';

/** Clamp a monthly day-of-month into the 1..28 range valid in every month. */
function clampDayOfMonth(day: number | undefined): number {
  if (typeof day !== 'number' || Number.isNaN(day)) return 1;
  if (day < 1) return 1;
  if (day > 28) return 28;
  return Math.floor(day);
}

/** Normalize a day-of-week into 0..6 (0=Sun). Defaults to Monday (1). */
function normalizeDayOfWeek(day: number | undefined): number {
  if (typeof day !== 'number' || Number.isNaN(day)) return 1;
  const mod = ((Math.floor(day) % 7) + 7) % 7;
  return mod;
}

/** Build a UTC Date at the given calendar position and the schedule's time. */
function utcAt(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(Date.UTC(year, month, day, hour, minute, 0, 0));
}

/**
 * Compute the next occurrence of `schedule` strictly AFTER `from`.
 *
 * The returned Date is always strictly greater than `from`.
 */
export function computeNextRun(schedule: ReportSchedule, from: Date): Date {
  const hour = schedule.hour;
  const minute = schedule.minute ?? 0;

  const year = from.getUTCFullYear();
  const month = from.getUTCMonth();
  const date = from.getUTCDate();

  if (schedule.cadence === 'daily') {
    let candidate = utcAt(year, month, date, hour, minute);
    if (candidate.getTime() <= from.getTime()) {
      candidate = utcAt(year, month, date + 1, hour, minute);
    }
    return candidate;
  }

  if (schedule.cadence === 'weekly') {
    const targetDow = normalizeDayOfWeek(schedule.dayOfWeek);
    const currentDow = from.getUTCDay();
    const deltaDays = (targetDow - currentDow + 7) % 7;
    let candidate = utcAt(year, month, date + deltaDays, hour, minute);
    if (candidate.getTime() <= from.getTime()) {
      // Same weekday today but the time has already passed (deltaDays === 0),
      // so roll forward a full week.
      candidate = utcAt(year, month, date + deltaDays + 7, hour, minute);
    }
    return candidate;
  }

  // monthly
  const targetDom = clampDayOfMonth(schedule.dayOfMonth);
  let candidate = utcAt(year, month, targetDom, hour, minute);
  if (candidate.getTime() <= from.getTime()) {
    candidate = utcAt(year, month + 1, targetDom, hour, minute);
  }
  return candidate;
}

/**
 * Whether the schedule is due to run at `now`, counting from `anchor`.
 *
 * `anchor` is the last run, or — for a subscription that has never run — its
 * CREATION time. It is deliberately non-nullable.
 *
 * ── THE DEFECT THIS SIGNATURE CLOSES (coverage review C-26b) ────────────────
 * It used to take `lastRunAt: Date | null` and substitute `new Date(0)` for a
 * null. Every next-run computed from the epoch is in 1970, so `now >= next` was
 * true for EVERY never-run subscription whatever its cadence: a monthly
 * schedule created at 14:00 fired on the sweep ten minutes later. Worse, it
 * disagreed with the row it is supposed to agree with — `createSubscription`
 * stores `nextRunAt = computeNextRun(schedule, now)`, so the screen showed a
 * date weeks away while the sweep fired immediately.
 *
 * Anchoring on `createdAt` makes the predicate and the column converge BY
 * CONSTRUCTION rather than by coincidence: `createSubscription` computes
 * `nextRunAt` from `new Date()` in the same call that the database stamps
 * `createdAt` with `defaultNow()`, so `computeNextRun(schedule, createdAt)` is
 * the stored `nextRunAt`. `scheduling.test.ts` asserts that convergence rather
 * than trusting it.
 *
 * A non-nullable parameter is the point: a sentinel cannot be reintroduced by
 * passing a null, because there is no null to pass.
 */
export function isDue(
  schedule: ReportSchedule,
  anchor: Date,
  now: Date,
): boolean {
  const next = computeNextRun(schedule, anchor);
  return now.getTime() >= next.getTime();
}
