/**
 * Who may read every AnA record and live run in their organisation: its admins
 * and owners — the people who answer an inspector.
 *
 * One rule for the full turn record (turn-records.ts) and for a live run's
 * progress (runs.ts, AnA detach D-1(b)), so the two cannot drift apart.
 *
 * @module server/routes/ana-ri/record-access
 */

/** Org roles that may read every record and live run in their organization. */
const RECORD_READER_ROLES = new Set(['admin', 'owner']);

/** True when the caller may read any record in their organization. */
export function readsEveryRecord(user: { role?: unknown; roles?: unknown } | undefined): boolean {
  const roles: unknown[] = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles : [user?.role];
  return roles.some((r) => typeof r === 'string' && RECORD_READER_ROLES.has(r.toLowerCase()));
}
