/**
 * Whether an account is in use (VSR-001 F-28).
 *
 * `users.status` is how an account is taken out of use. An administrator
 * suspends it (routes/admin/master-admin.ts, PATCH /users/:id/status →
 * 'suspended'); the identity provider deprovisions it (routes/scim.ts, DELETE
 * or active=false → 'inactive'). The column is NOT NULL DEFAULT 'active', and
 * every path that creates an account writes 'active'. So 'active' is the one
 * value in use: any other, and an account that is not there, is not.
 *
 * Until 2026-09-23 the column was read at exactly one moment, the submission
 * release signature's own password check. The signing ceremony did not read it,
 * so a suspended or deprovisioned account signed on every other surface
 * (tests/db/account-standing.dbtest.ts). Every reading goes through here, so the
 * answer to "can this account act?" is the same wherever it is asked.
 *
 * @compliance 21 CFR Part 11 §11.10(d), §11.300(b)
 * @module server/services/account-standing
 */

/** The one status in which an account may act. */
export const ACCOUNT_STATUS_ACTIVE = 'active';

/**
 * What the account holder is told, wherever an account out of use is refused.
 * Said only to someone who has already shown the account's password or holds
 * its session, so it tells nobody else anything.
 */
export const ACCOUNT_INACTIVE_MESSAGE = 'This account is not active. Contact your administrator.';

/** Whether a `users.status` value is the one in which an account may act. */
export function isActiveAccountStatus(status: unknown): boolean {
  return status === ACCOUNT_STATUS_ACTIVE;
}

/**
 * Whether the account may act, read now, in the caller's database scope.
 *
 * Throws when the account cannot be read. The caller refuses on a throw: an
 * unreadable account is never assumed to be in use. `db` is imported lazily so
 * a module that imports this one does not open a connection when it loads.
 */
export async function isAccountActive(userId: number): Promise<boolean> {
  const { pool } = await import('../db.js');
  // tenant-isolation-safe: an account's own status, keyed by the id the session
  // or the sign-in already established; users is the global identity table.
  const result = await pool.query('SELECT status FROM users WHERE id = $1 LIMIT 1', [userId]);
  return isActiveAccountStatus(result.rows[0]?.status);
}
