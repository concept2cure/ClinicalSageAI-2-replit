/**
 * The UTC calendar day of a stored date, and whole days between two of them
 * (2026-10-19, rows D2 and D5).
 *
 * An agency letter's due date is stored as an instant at UTC midnight
 * (concept2cure_agency_communications.due_date). The server's overdue verdict
 * compares UTC calendar days (response-logic.ts letterOverdue: due today is
 * not overdue), and the inbox's day count must read the same days: counting
 * milliseconds from the browser's clock made a letter due today read "-1d"
 * from 12:00 UTC on, beside a verdict that it was not overdue. One rule, here,
 * for both sides.
 */

/** The UTC calendar day ('YYYY-MM-DD') of a stored date or instant; null when there is none or it does not parse. */
export function utcDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const t = new Date(value);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

/** Whole UTC calendar days from `today` to `due` (0 on the day, negative once the day has passed); null when either is missing. */
export function utcDaysUntil(due: string | null | undefined, today: string | null | undefined): number | null {
  const d = utcDay(due);
  const t = utcDay(today);
  if (d === null || t === null) return null;
  return Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${t}T00:00:00Z`)) / 86_400_000);
}
