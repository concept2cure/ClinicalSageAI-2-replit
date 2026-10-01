/**
 * The period a compliance report covers, from the request's `from` / `to`.
 *
 * UTC calendar dates, inclusive. `to` defaults to today and `from` to 90 days
 * before `to`. A malformed or impossible date, `from` after `to`, or a span of
 * more than 366 days is refused — never coerced into some other period, which
 * would hand an inspector a report about dates they did not ask for. An as-of
 * report uses `to` alone; `from` is not read.
 *
 * @module server/services/audit/compliance-reports/period
 */
import type { PeriodBounds, PeriodKind, ReportPeriod } from './types';

export const DEFAULT_PERIOD_DAYS = 90;
export const MAX_PERIOD_DAYS = 366;

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PeriodParse =
  | { ok: true; period: ReportPeriod; bounds: PeriodBounds }
  | { ok: false; message: string };

/** A YYYY-MM-DD string as the UTC midnight it names, or null when it is not a real date in that form. */
function utcDate(value: string): Date | null {
  if (!DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // 2026-02-30 parses as 2026-03-02; the round trip refuses it.
  return d.toISOString().slice(0, 10) === value ? d : null;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/** A query value read as a date: absent is undefined, anything that is not one date string is null. */
function readDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') return null;
  return utcDate(raw);
}

function refused(message: string): PeriodParse {
  return { ok: false, message };
}

/**
 * Parse the period for a report of `kind`. `now` is the clock "today" is read
 * from (UTC), passed by tests.
 */
export function parseReportPeriod(
  query: { from?: unknown; to?: unknown },
  kind: PeriodKind,
  now: Date = new Date(),
): PeriodParse {
  const to = readDate(query.to) ?? (query.to === undefined ? utcDate(dayOf(now)) : null);
  if (!to) return refused('The end date must be a calendar date written as YYYY-MM-DD.');
  const end = new Date(to.getTime() + DAY_MS).toISOString();

  if (kind === 'as-of') {
    return {
      ok: true,
      period: { from: null, to: dayOf(to), kind },
      bounds: { start: to.toISOString(), end },
    };
  }

  const given = readDate(query.from);
  if (given === null) return refused('The start date must be a calendar date written as YYYY-MM-DD.');
  const from = given ?? new Date(to.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
  if (from.getTime() > to.getTime()) return refused('The start date is after the end date.');
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (days > MAX_PERIOD_DAYS) {
    return refused(`A report covers at most ${MAX_PERIOD_DAYS} days; this period is ${days} days.`);
  }
  return {
    ok: true,
    period: { from: dayOf(from), to: dayOf(to), kind },
    bounds: { start: from.toISOString(), end },
  };
}
