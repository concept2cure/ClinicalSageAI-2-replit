/**
 * Whether a day exists: the existing programme-profile round-trip validator.
 * A shape check alone would silently turn 2026-02-30 into 2 March. Extracted
 * unchanged for the settings receipt guard and re-exported at the old server
 * path so existing profile/device callers keep their validation behavior.
 * Callers still apply their own YYYY-MM-DD shape and year-range contract.
 */
export function isRealCalendarDay(day: string): boolean {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === day;
}
