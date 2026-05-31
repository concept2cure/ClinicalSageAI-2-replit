/**
 * Pure presentation helpers for the Phase 11 Intelligence cluster routes.
 *
 * Extracted from intelligence-cluster.ts so the date math + label formatting
 * (the part with real branching) is unit-testable without a DB or an Express
 * request. The route imports these; see intelligence-cluster.format.test.ts.
 *
 * @module server/routes/intelligence-cluster.format
 */

const MS_PER_DAY = 86_400_000;

/** Days from `now` until `d`, rounded up. Negative when `d` is in the past. */
export function daysUntil(d: Date, now: number = Date.now()): number {
  return Math.ceil((d.getTime() - now) / MS_PER_DAY);
}

/** Whole-day delta between two dates (`b - a`), rounded to nearest day. */
export function dayDelta(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** TLF queue "due in" label: 'overdue' when past, else 'N days'. */
export function formatDueIn(dueAt: Date, now: number = Date.now()): string {
  const d = daysUntil(dueAt, now);
  return d < 0 ? 'overdue' : `${d} days`;
}

/**
 * Forecast delta label vs target. Ahead of target → '−Nd' (U+2212 minus,
 * matching the kit fixture); behind or on target → '+Nd'.
 */
export function formatDelta(target: Date, forecast: Date): string {
  const delta = dayDelta(target, forecast);
  return delta < 0 ? `−${Math.abs(delta)}d` : `+${delta}d`;
}

/** ISO date (YYYY-MM-DD) for display. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
