/**
 * Whether an account is in use (VSR-001 F-28, F-29).
 *
 * `users.status` is how an account is taken out of use. An administrator
 * suspends it (routes/admin/master-admin.ts, PATCH /users/:id/status →
 * 'suspended'); the identity provider deprovisions it (routes/scim.ts, DELETE
 * or active=false → 'inactive'); a self-serve sign-up creates it as
 * 'pending_verification' until the address is confirmed (routes/auth.ts,
 * services/email-verification.ts; IAM-17). The column is NOT NULL DEFAULT
 * 'active'. 'active' is the one value in use: any other, and an account that
 * is not there, is not.
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
/** A signed-up account whose address has not yet been confirmed (security audit 2026-09-24, IAM-17). */
export const ACCOUNT_STATUS_PENDING_VERIFICATION = 'pending_verification';

/** Whether a `users.status` value is the sign-up state that waits on the e-mail link. */
export function isPendingVerificationStatus(status: unknown): boolean {
  return status === ACCOUNT_STATUS_PENDING_VERIFICATION;
}

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
 * What the request path reads about an account, in one statement.
 *
 * `active` is `users.status === 'active'` (above). `passwordChangedAtSeconds`
 * is `users.password_changed_at` as whole epoch seconds, or null when the
 * account never changed its password (or is not there). Security audit
 * 2026-09-24, IAM-04: password reset and password change both stamp that
 * column and nothing on the request path read it, so every session issued
 * before the change kept working for the rest of its life. There is no
 * session-version column (plan P0-4b); the token's `iat` against this stamp is
 * the versioning the schema already carries. The seconds are computed in SQL
 * so the column's type (timestamp without time zone, written in UTC by every
 * writer) never passes through the driver's local-time parsing.
 */
export interface AccountStanding {
  active: boolean;
  passwordChangedAtSeconds: number | null;
}

/** A bigint pg hands back as text, a number, or nothing, as whole seconds. */
function wholeSecondsOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : null;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/**
 * Read the account's standing now, in the caller's database scope.
 *
 * Throws when the account cannot be read. The caller refuses on a throw: an
 * unreadable account is never assumed to be in use. One row comes back whether
 * or not the account exists; a missing account is not active and has no
 * password change. The status subquery is the statement `SELECT status FROM
 * users …` this module has always issued, which the request-path test doubles
 * key on; the second column rides beside it rather than changing it, so both
 * are one primary-key read. `db` is imported lazily so a module that imports
 * this one does not open a connection when it loads.
 */
export async function readAccountStanding(userId: number): Promise<AccountStanding> {
  const { pool } = await import('../db.js');
  // tenant-isolation-safe: an account's own status and password-change time,
  // keyed by the id the session or the sign-in already established; users is
  // the global identity table.
  const result = await pool.query(
    `SELECT (SELECT status FROM users WHERE id = $1 LIMIT 1) AS status,
            (SELECT floor(date_part('epoch', password_changed_at))::bigint FROM users WHERE id = $1 LIMIT 1)
              AS password_changed_at_seconds`,
    [userId],
  );
  const row = result.rows[0] as { status?: unknown; password_changed_at_seconds?: unknown } | undefined;
  return {
    active: isActiveAccountStatus(row?.status),
    passwordChangedAtSeconds: wholeSecondsOf(row?.password_changed_at_seconds),
  };
}

/**
 * The same reading, for a check that runs before a tenant is known: sign-in and
 * the checks that turn a token into an identity. It runs in the pre-auth scope,
 * which grants no role and so no policy bypass, as the sign-in's own reads do.
 */
export function readAccountStandingBeforeTenant(userId: number): Promise<AccountStanding> {
  return runWithPreAuthScope('auth:account-standing', () => readAccountStanding(userId));
}

/**
 * Whether the account may act, read now, in the caller's database scope.
 * Throws when the account cannot be read (see readAccountStanding).
 */
export async function isAccountActive(userId: number): Promise<boolean> {
  return (await readAccountStanding(userId)).active;
}

/** isAccountActive, before a tenant is known (see readAccountStandingBeforeTenant). */
export function isAccountActiveBeforeTenant(userId: number): Promise<boolean> {
  return runWithPreAuthScope('auth:account-standing', () => isAccountActive(userId));
}

/**
 * The second a token was issued, from its `iat` claim, else null. jsonwebtoken
 * stamps `iat` on every token it signs; no first-party issuer turns it off.
 */
export function issuedAtOfClaims(claims: unknown): number | null {
  if (!claims || typeof claims !== 'object') return null;
  const iat = (claims as { iat?: unknown }).iat;
  return typeof iat === 'number' && Number.isFinite(iat) ? Math.floor(iat) : null;
}

/** `users.password_changed_at` as read through drizzle (a Date), as whole seconds. */
export function passwordChangedAtSecondsOf(value: Date | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Whether a session issued at `issuedAtSeconds` predates the account's last
 * password change, and so is over (IAM-04).
 *
 * The comparison is whole seconds on both sides: a session minted in the same
 * second as the change (the sign-in that follows it) is current. An account
 * that never changed its password ends no session. A token with no `iat` is
 * refused in production, where nothing first-party mints one, and admitted
 * elsewhere, where test fixtures build claims by hand.
 */
export function sessionPredatesPasswordChange(
  issuedAtSeconds: number | null,
  passwordChangedAtSeconds: number | null,
  env: string | undefined = process.env.NODE_ENV,
): boolean {
  if (issuedAtSeconds === null) return env === 'production';
  if (passwordChangedAtSeconds === null) return false;
  return issuedAtSeconds < passwordChangedAtSeconds;
}

/**
 * Whether the session issued at `issuedAtSeconds` is still the account's, read
 * now, in the caller's database scope. Throws when the account cannot be read.
 */
export async function isSessionCurrent(userId: number, issuedAtSeconds: number | null): Promise<boolean> {
  const standing = await readAccountStanding(userId);
  return !sessionPredatesPasswordChange(issuedAtSeconds, standing.passwordChangedAtSeconds);
}

/** isSessionCurrent, before a tenant is known (see readAccountStandingBeforeTenant). */
export function isSessionCurrentBeforeTenant(userId: number, issuedAtSeconds: number | null): Promise<boolean> {
  return runWithPreAuthScope('auth:account-standing', () => isSessionCurrent(userId, issuedAtSeconds));
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
