/**
 * Whether an account is in use (VSR-001 F-28, F-29).
 *
 * `users.status` is how an account is taken out of use. An administrator
 * suspends it (routes/admin/master-admin.ts, PATCH /users/:id/status →
 * 'suspended'); the identity provider deprovisions it (routes/scim.ts, DELETE
 * or active=false → 'inactive'). The column is NOT NULL DEFAULT 'active', and
 * every path that creates an account writes 'active'. So 'active' is the one
 * value in use: any other, and an account that is not there, is not.
 *
 * Until 2026-09-23 the column was read at exactly one moment, the submission
 * release signature's own password check. Nothing else read it: a suspended or
 * deprovisioned account signed on every other surface (F-28), signed in, and
 * kept every session it held, whose refresh token minted new ones (F-29;
 * tests/db/account-standing.dbtest.ts). Every reading goes through here, so the
 * answer to "can this account act?" is the same wherever it is asked: the
 * signing ceremony, sign-in, and each check that turns a token into an
 * identity.
 *
 * @compliance 21 CFR Part 11 §11.10(d), §11.300(b)
 * @module server/services/account-standing
 */

import { runWithPreAuthScope } from '../db/tenantStore';

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

/**
 * The same reading, for a check that runs before a tenant is known: sign-in and
 * the checks that turn a token into an identity. It runs in the pre-auth scope,
 * which grants no role and so no policy bypass, as the sign-in's own reads do.
 */
export function isAccountActiveBeforeTenant(userId: number): Promise<boolean> {
  return runWithPreAuthScope('auth:account-standing', () => isAccountActive(userId));
}

/**
 * The account a token names, when it names one by its integer id (every
 * first-party sign-in stamps `userId`), else null. A subject that is not an
 * integer names no row in `users`, so there is no standing to read for it.
 */
export function accountIdOfClaims(claims: unknown): number | null {
  if (!claims || typeof claims !== 'object') return null;
  const c = claims as { userId?: unknown; sub?: unknown; id?: unknown };
  const raw = c.userId ?? c.sub ?? c.id;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const id = Number(raw.trim());
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  return null;
}
