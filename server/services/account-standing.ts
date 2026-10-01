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
import { sessionStartSecondsOf } from './session-inactivity';

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
 * before the change kept working for the rest of its life. The seconds are
 * computed in SQL so the column's type (timestamp without time zone, written in
 * UTC by every writer) never passes through the driver's local-time parsing.
 *
 * `sessionsEndedAtSeconds` is `users.sessions_ended_at`, the same kind of stamp
 * for the two other events that end every session the account holds: a sign-out
 * everywhere (POST /api/auth/logout with terminateAllSessions) and the account
 * leaving status 'active' (a database trigger stamps it, whoever wrote the
 * status; migrations/20261001_users_sessions_ended_at.sql). Plan P0-4b, security
 * audit 2026-09-24 IAM-04 (b): until it existed the first was ignored and the
 * second only paused a session, which came back when the account was
 * reactivated. Together the two stamps are the account's session version: a
 * session that began before the later of them is over (sessionEndedByStanding).
 *
 * `membershipBeganAtSeconds` is `organization_users.created_at` of the account's
 * membership in the organisation the session is for, read in the same statement
 * when the caller names one; null otherwise, and when there is no such row (the
 * membership checks refuse that). Plan P0-4b R1 (product decision 2026-10-01):
 * removing a member ends that organisation's sessions durably. Until then a
 * member removed and re-added within a session's life got the same session back,
 * because every door read only whether the row existed. A session that began
 * before its membership did is not that membership's.
 */
export interface AccountStanding {
  active: boolean;
  passwordChangedAtSeconds: number | null;
  sessionsEndedAtSeconds: number | null;
  membershipBeganAtSeconds?: number | null;
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
 * key on; the other columns ride beside it rather than changing it, so all
 * are one primary-key read. `db` is imported lazily so a module that imports
 * this one does not open a connection when it loads.
 *
 * With `organizationId`, the statement also reads when the account's membership
 * in that organisation began (its unique (user_id, organization_id) row), so the
 * gates and the refresh ask one question of one reading (plan P0-4b R1). A
 * caller that names no organisation (sign-in, the signer, the connector's
 * account check) issues the statement without it. The seconds are computed in
 * SQL, as for password_changed_at, but not read the same way. created_at is a
 * timestamp without time zone that every writer leaves to its default now(), so
 * it holds the writing connection's local time, not UTC. It is read in the zone
 * of the connection reading it (`AT TIME ZONE current_setting('TimeZone')`),
 * which is the zone it was written in: no connection sets its own TimeZone.
 * Read as UTC (until the P0-4b fix round of 2026-10-01), a database in
 * Asia/Tokyo put every membership 9 h in the future, so every session begun in
 * those 9 h was refused as ended; one in America/* put it hours in the past, so a
 * session older than its membership stayed current
 * (tests/db/account-standing-time-zone.dbtest.ts).
 */
export async function readAccountStanding(userId: number, organizationId: number | null = null): Promise<AccountStanding> {
  const { pool } = await import('../db.js');
  const membershipNamed = organizationId !== null && Number.isSafeInteger(organizationId);
  // tenant-isolation-safe: an account's own status and session-ending stamps,
  // keyed by the id the session or the sign-in already established; users is
  // the global identity table. The membership read is the account's own row in
  // the organisation its own session names, the read every gate already makes.
  const result = await pool.query(
    `SELECT (SELECT status FROM users WHERE id = $1 LIMIT 1) AS status,
            (SELECT floor(date_part('epoch', password_changed_at))::bigint FROM users WHERE id = $1 LIMIT 1)
              AS password_changed_at_seconds,
            (SELECT floor(date_part('epoch', sessions_ended_at))::bigint FROM users WHERE id = $1 LIMIT 1)
              AS sessions_ended_at_seconds${
                membershipNamed
                  ? `,
            (SELECT floor(date_part('epoch', created_at AT TIME ZONE current_setting('TimeZone')))::bigint
               FROM organization_users
              WHERE user_id = $1 AND organization_id = $2 LIMIT 1)
              AS membership_began_at_seconds`
                  : ''
              }`,
    membershipNamed ? [userId, organizationId] : [userId],
  );
  const row = result.rows[0] as
    | {
        status?: unknown;
        password_changed_at_seconds?: unknown;
        sessions_ended_at_seconds?: unknown;
        membership_began_at_seconds?: unknown;
      }
    | undefined;
  return {
    active: isActiveAccountStatus(row?.status),
    passwordChangedAtSeconds: wholeSecondsOf(row?.password_changed_at_seconds),
    sessionsEndedAtSeconds: wholeSecondsOf(row?.sessions_ended_at_seconds),
    membershipBeganAtSeconds: wholeSecondsOf(row?.membership_began_at_seconds),
  };
}

/**
 * The stamp an event that ends sessions writes: the first whole second after
 * `atMs`, even when `atMs` falls exactly on a second (plan P0-4b R3, decided by
 * tests/db/session-termination.dbtest.ts (6)).
 *
 * A token records when its session began to the whole second (`sst`, `iat`), so
 * a session begun in the event's own second cannot be told apart from one begun
 * after it. Until 2026-10-01 the stamp was the event's own second, compared
 * strictly, and a session begun in that second before the event survived it.
 * Stamping the next second ends every session begun in the event's second; the
 * writer then answers once that second has begun (untilStampHasBegun), so the
 * session that follows the event (the holder signing in again) begins in the
 * stamp's second or later and is current. The comparison stays strict, as for
 * a membership's start, where the session the membership's creation begins
 * (sign-up, SSO provisioning, first-run setup) shares its second.
 */
export function endingStampOf(atMs: number = Date.now()): Date {
  return new Date((Math.floor(atMs / 1000) + 1) * 1000);
}

/**
 * Wait until the stamp's second has begun on this server's clock, so the answer
 * to the event that wrote it is never seen before it. At most one second.
 */
export async function untilStampHasBegun(stamp: Date): Promise<void> {
  const wait = stamp.getTime() - Date.now();
  if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, Math.min(wait, 1000)));
}

/**
 * End every session the account holds: stamp `users.sessions_ended_at` with
 * the first whole second after `at` (endingStampOf), never moving it backwards
 * (a write that did would revive a session an earlier one ended). Every
 * authenticator then refuses, at its next request, each session that began
 * before the stamp, access and refresh token alike (sessionEndedByStanding).
 * `at` is the server's clock, the clock that stamps a session's start (`sst`).
 * In the caller's database scope; throws when the write fails, and returns
 * whether the account was there to stamp. A caller answering a person waits
 * for the stamp first (untilStampHasBegun).
 */
export async function endEverySessionOf(userId: number, at: Date = new Date()): Promise<boolean> {
  const { pool } = await import('../db.js');
  // tenant-isolation-safe: the account's own row, by the id its live session established.
  const result = await pool.query(
    `UPDATE users
        SET sessions_ended_at = GREATEST(COALESCE(sessions_ended_at, '-infinity'::timestamptz), $2::timestamptz)
      WHERE id = $1`,
    [userId, endingStampOf(at.getTime()).toISOString()],
  );
  return (result.rowCount ?? 0) === 1;
}

/**
 * The same reading, for a check that runs before a tenant is known: sign-in and
 * the checks that turn a token into an identity. It runs in the pre-auth scope,
 * which grants no role and so no policy bypass, as the sign-in's own reads do.
 */
export function readAccountStandingBeforeTenant(userId: number, organizationId: number | null = null): Promise<AccountStanding> {
  return runWithPreAuthScope('auth:account-standing', () => readAccountStanding(userId, organizationId));
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
 * The second before which every session of the account is over: the latest of
 * its last password change, its last end of every session and, when one was
 * read, the start of its membership in the session's organisation; else null.
 */
export function sessionsEndedBeforeSecondsOf(standing: AccountStanding): number | null {
  const stamps = [standing.passwordChangedAtSeconds, standing.sessionsEndedAtSeconds, standing.membershipBeganAtSeconds].filter(
    (s): s is number => typeof s === 'number',
  );
  return stamps.length === 0 ? null : Math.max(...stamps);
}

/**
 * Whether the account's standing has ended the session these claims belong to:
 * the session began before the account's last password change, its last end of
 * every session, or its membership in the session's organisation (IAM-04; plan
 * P0-4b, R1). Every door asks this one question of the standing it has read:
 * the /api gate, a router's own gate, verifyLiveToken, the refresh, the second
 * factor of a sign-in, and the connector's /token exchanges.
 *
 * Measured from the session's start (`sst`, carried unchanged through every
 * refresh and rotation; a token without one, from its own `iat`), not from the
 * token's issue. Until 2026-10-01 it was the token's `iat`, and a session could
 * outlive the change by rotating in the same second: a refresh token minted at
 * .2 s of the second the password changed at .7 s carried that second as its
 * `iat`, was not "before" it, and refreshed for ever after. A session's start
 * cannot be moved by refreshing. Strictly before, in whole seconds: an ending
 * stamp is the first whole second after its event (endingStampOf, R3), and a
 * session that begins in a membership's own second is the one its creation began.
 */
export function sessionEndedByStanding(
  claims: unknown,
  standing: AccountStanding,
  env: string | undefined = process.env.NODE_ENV,
): boolean {
  return sessionPredatesPasswordChange(sessionStartSecondsOf(claims), sessionsEndedBeforeSecondsOf(standing), env);
}

/**
 * Whether the session issued at `issuedAtSeconds` is still the account's, read
 * now, in the caller's database scope. Throws when the account cannot be read.
 */
export async function isSessionCurrent(userId: number, issuedAtSeconds: number | null): Promise<boolean> {
  const standing = await readAccountStanding(userId);
  return !sessionPredatesPasswordChange(issuedAtSeconds, sessionsEndedBeforeSecondsOf(standing));
}

/** isSessionCurrent, before a tenant is known (see readAccountStandingBeforeTenant). */
export function isSessionCurrentBeforeTenant(userId: number, issuedAtSeconds: number | null): Promise<boolean> {
  return runWithPreAuthScope('auth:account-standing', () => isSessionCurrent(userId, issuedAtSeconds));
}

/** A positive integer id given as a number or a string of digits, else null. */
function positiveIntegerIdOf(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const id = Number(raw.trim());
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  return null;
}

/**
 * The organisation a token's session is for (`organizationId`, the claim every
 * first-party issuer stamps on an access token; `orgId` on older ones), else
 * null. A refresh token names none: the refresh reads the membership it mints for.
 */
export function organizationIdOfClaims(claims: unknown): number | null {
  if (!claims || typeof claims !== 'object') return null;
  const c = claims as { organizationId?: unknown; orgId?: unknown };
  return positiveIntegerIdOf(c.organizationId ?? c.orgId);
}

/**
 * The account a token names, when it names one by its integer id (every
 * first-party sign-in stamps `userId`), else null. A subject that is not an
 * integer names no row in `users`, so there is no standing to read for it.
 */
export function accountIdOfClaims(claims: unknown): number | null {
  if (!claims || typeof claims !== 'object') return null;
  const c = claims as { userId?: unknown; sub?: unknown; id?: unknown };
  return positiveIntegerIdOf(c.userId ?? c.sub ?? c.id);
}
