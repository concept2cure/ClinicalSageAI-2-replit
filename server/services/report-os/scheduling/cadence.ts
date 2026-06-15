/**
 * Deterministic next-run computation for constrained cadence presets.
 *
 * Pure, no cron library, no IO. All arithmetic is performed in UTC for
 * determinism; `schedule.timeZoneOffsetMinutes` is intentionally ignored here
 * and is expected to be applied by the caller when presenting times to users.
 */

import type { ReportSchedule } from './types';

/** A sentinel "distant past" used when there is no recorded last run. */
const DISTANT_PAST = new Date(0);

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
 * Whether the schedule is due to run at `now`, given the last run time.
 *
 * True when `now` is at or past the next run computed from `lastRunAt`
 * (or from a distant past when there has been no prior run).
 */
export function isDue(
  schedule: ReportSchedule,
  lastRunAt: Date | null,
  now: Date,
): boolean {
  const anchor = lastRunAt ?? DISTANT_PAST;
  const next = computeNextRun(schedule, anchor);
  return now.getTime() >= next.getTime();
}
