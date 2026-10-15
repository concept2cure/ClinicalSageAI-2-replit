/** Calendar recurrence in the schedule's local timezone; no cron dependency.
 * DST gaps move forward by the gap and folds use the earlier occurrence, once.
 * Legacy offsets are minutes east of UTC; an IANA timezone takes precedence. */
import type { ReportSchedule } from './types';

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let result = formatters.get(zone);
  if (!result) {
    result = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatters.set(zone, result);
  }
  return result;
}

/** Invalid timezone claims must not silently become UTC schedules. */
export function isValidTimeZone(zone: string): boolean {
  try { formatter(zone).format(new Date(0)); return true; } catch { return false; }
}

function localStamp(at: number, schedule: ReportSchedule): number {
  if (!schedule.timeZone) return at + (schedule.timeZoneOffsetMinutes ?? 0) * 60_000;
  const parts = Object.fromEntries(formatter(schedule.timeZone).formatToParts(new Date(at)).map(p => [p.type, p.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
}

function instantForLocal(local: number, schedule: ReportSchedule): number {
  if (!schedule.timeZone) return local - (schedule.timeZoneOffsetMinutes ?? 0) * 60_000;
  // Sample both sides of any timezone transition surrounding this civil date.
  const offsets = new Set<number>();
  for (let hours = -48; hours <= 48; hours += 12) {
    const sample = local + hours * 3_600_000;
    offsets.add(localStamp(sample, schedule) - sample);
  }
  const candidates = [...offsets].map(offset => ({ instant: local - offset, civil: localStamp(local - offset, schedule) }));
  const exact = candidates.filter(c => c.civil === local).map(c => c.instant);
  if (exact.length) return Math.min(...exact);
  // A nonexistent wall-clock time: choose the nearest forward projection.
  const after = candidates.filter(c => c.civil > local).sort((a, b) => a.civil - b.civil || a.instant - b.instant);
  if (!after.length) throw new Error('Unable to resolve report schedule timezone');
  return after[0].instant;
}

function validateSchedule(schedule: ReportSchedule, from: Date): void {
  if (!Number.isFinite(from.getTime())) throw new Error('Invalid report schedule anchor');
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23 ||
      !Number.isInteger(schedule.minute ?? 0) || (schedule.minute ?? 0) < 0 || (schedule.minute ?? 0) > 59) {
    throw new Error('Invalid report schedule time');
  }
  if (schedule.timeZone && !isValidTimeZone(schedule.timeZone)) throw new Error('Invalid report schedule timezone');
  if (schedule.timeZoneOffsetMinutes != null && (!Number.isInteger(schedule.timeZoneOffsetMinutes) || Math.abs(schedule.timeZoneOffsetMinutes) > 840)) {
    throw new Error('Invalid report schedule offset');
  }
  if ((schedule.dayOfWeek != null && !Number.isFinite(schedule.dayOfWeek)) ||
      (schedule.dayOfMonth != null && !Number.isFinite(schedule.dayOfMonth))) {
    throw new Error('Invalid report schedule calendar day');
  }
}

/** Compute one occurrence strictly after from, using the local calendar. */
export function computeNextRun(schedule: ReportSchedule, from: Date): Date {
  validateSchedule(schedule, from);
  const local = new Date(localStamp(from.getTime(), schedule));
  const year = local.getUTCFullYear(), month = local.getUTCMonth(), day = local.getUTCDate();
  const hour = schedule.hour, minute = schedule.minute ?? 0;
  const dow = ((Math.floor(schedule.dayOfWeek ?? 1) % 7) + 7) % 7;
  const dom = Math.max(1, Math.min(28, Math.floor(schedule.dayOfMonth ?? 1)));
  let civil: number;
  let advance: () => void;
  if (schedule.cadence === 'daily') {
    civil = Date.UTC(year, month, day, hour, minute);
    advance = () => { civil += 86_400_000; };
  } else if (schedule.cadence === 'weekly') {
    civil = Date.UTC(year, month, day + (dow - local.getUTCDay() + 7) % 7, hour, minute);
    advance = () => { civil += 7 * 86_400_000; };
  } else if (schedule.cadence === 'monthly') {
    civil = Date.UTC(year, month, dom, hour, minute);
    advance = () => { const d = new Date(civil); civil = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, dom, hour, minute); };
  } else throw new Error('Invalid report schedule cadence');
  let instant = instantForLocal(civil, schedule);
  while (instant <= from.getTime()) { advance(); instant = instantForLocal(civil, schedule); }
  return new Date(instant);
}

/** Legacy helper. A row's persisted nextRunAt is authoritative in due scans. */
export function isDue(schedule: ReportSchedule, anchor: Date, now: Date): boolean {
  return now.getTime() >= computeNextRun(schedule, anchor).getTime();
}
