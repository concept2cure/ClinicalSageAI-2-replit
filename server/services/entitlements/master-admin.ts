/**
 * Master-admin identity — the platform owner's unconditional licence grant.
 *
 * WHAT THIS IS. One place that answers "is this request the platform owner?".
 * The owner is not a customer of the platform, so no commercial packaging
 * applies to them: every licensable module resolves as entitled, which is what
 * lets the owner open, demonstrate and support any capability without first
 * buying it from themselves.
 *
 * WHAT THIS IS NOT — and this boundary is the whole reason the module is small
 * and separate:
 *
 *   - It is NOT a tenancy bypass. Master admin widens the ENTITLEMENT verdict
 *     for the organization the request is already scoped to. It never changes
 *     which organization that is, never crosses an RLS boundary, and is never
 *     consulted by anything that resolves tenant scope. A master admin looking
 *     at org 42 still sees org 42's data — they just see all of its modules
 *     unlocked.
 *   - It is NOT an authorization guard. Route access stays with
 *     `requirePlatformAdmin` / `requireBusinessAdmin` / `requireRole`. Nothing
 *     here may be used to admit a request to a route.
 *   - It is NOT the Business Center gate. That one is deliberately narrower
 *     (financials); this one is deliberately about commercial packaging.
 *
 * WHO QUALIFIES. Three independent signals. The first two match the pattern
 * already used by `requireBusinessAdmin`:
 *
 *   1. the `super_admin` role — the platform-owner role. `platform_admin` and
 *      `support` are NOT included: they are staff roles for monitoring and
 *      assistance, and handing them a blanket commercial unlock would make the
 *      entitlement layer report something untrue about the tenant they are
 *      looking at.
 *   2. an email on the MASTER_ADMIN_EMAILS allowlist. The built-in default is
 *      the platform owner's own address, so a fresh deployment works without
 *      configuration; setting the env var REPLACES that default outright (it
 *      does not append), so an operator can move or remove the grant.
 *   3. an active `platform_role_grants` row for a master-admin role — the
 *      designation the owner makes from inside the app.
 *
 * ── Why (3) had to be added ─────────────────────────────────────────────────
 *
 * Signals 1 and 2 are synchronous and both read state that arrives with the
 * request. Neither of them can see a grant made through the Access Management
 * console (`server/routes/admin/access-management.ts`), which writes
 * `platform_role_grants` and is the audited, in-app way the owner designates
 * personnel — precisely so nobody has to edit an env allowlist to do it.
 *
 * `requirePlatformAdmin` already honours those rows as a DB-backed fallback,
 * and it does NOT write the resolved role back onto the request. So the two
 * questions disagreed: somebody designated `super_admin` in the console could
 * open the Master Admin console (route access granted by the fallback) while
 * the entitlement layer still answered "not the owner" and greyed their nav
 * rail — one identity, two answers, from two code paths. That is the
 * duplication the working agreement forbids, and this is the correction.
 *
 * The grant lookup filters on MASTER_ADMIN_ROLES, deliberately NOT on
 * `requirePlatformAdmin`'s broader PLATFORM_ROLES. A `support` or
 * `platform_admin` designation admits somebody to the console without handing
 * them a blanket commercial unlock, which is exactly the distinction the role
 * set above exists to draw. Widening this to PLATFORM_ROLES would erase it.
 *
 * ── Which way this fails, and why it is the opposite of the gate ────────────
 *
 * A lookup failure resolves to NOT the owner. That is the opposite direction to
 * `moduleEntitlementGate`, which fails OPEN on an entitlement error — and the
 * asymmetry is deliberate, because the two are answering different questions.
 * The gate's failure mode is refusing a paying customer, so it serves. This
 * one's failure mode is handing an unverified identity every module on the
 * platform, so it declines. The cost of declining is that a designated owner
 * briefly sees locks; the cost of the other direction is a commercial unlock
 * granted on a database error.
 *
 * @module server/services/entitlements/master-admin
 */

import type { Request } from 'express';
import { query } from '../../db';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('master-admin');

/**
 * Roles that carry the owner grant. Deliberately narrower than
 * `requirePlatformAdmin`'s PLATFORM_ROLES — see the module note above.
 */
export const MASTER_ADMIN_ROLES: ReadonlySet<string> = new Set(['super_admin']);

/**
 * The platform owner's address, used when MASTER_ADMIN_EMAILS is unset.
 *
 * This is the same identity `server/db/bootstrap/seed-default-org.ts` seeds as
 * the platform's admin account, kept as a constant here rather than read from
 * DEMO_USER_EMAIL: that variable exists to point the *demo seed* somewhere
 * else, and reusing it would silently move the owner's licence grant with it.
 */
export const DEFAULT_MASTER_ADMIN_EMAILS: readonly string[] = ['jonmichaelpsmith@gmail.com'];

/**
 * Emails holding the owner grant, lower-cased.
 *
 * MASTER_ADMIN_EMAILS is a comma-separated REPLACEMENT for the default, not an
 * addition to it — an operator who sets it to a single address has moved the
 * grant, and one who sets it to a value with no usable entries has removed it.
 * A blank/whitespace-only value is treated as unset (the default applies), so a
 * variable that exists but was never filled in cannot silently leave the
 * platform with no owner.
 */
export function masterAdminEmails(): Set<string> {
  const raw = process.env.MASTER_ADMIN_EMAILS;
  if (raw == null || raw.trim() === '') return new Set(DEFAULT_MASTER_ADMIN_EMAILS);
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** The identity fields the decision reads. Kept structural so the pure check is
 *  testable without an Express request. */
export interface MasterAdminIdentity {
  email?: string | null;
  role?: string | null;
  roles?: ReadonlyArray<string | null | undefined> | null;
}

/**
 * PURE: does this identity hold the owner grant?
 *
 * Exported separately from {@link isMasterAdmin} so the rule can be tested
 * directly, and so non-HTTP callers (jobs, tools) can ask the same question
 * without fabricating a request object.
 */
export function isMasterAdminIdentity(identity: MasterAdminIdentity): boolean {
  const primaryRole = (identity.role ?? '').toString().trim().toLowerCase();
  if (primaryRole && MASTER_ADMIN_ROLES.has(primaryRole)) return true;

  const roles = (identity.roles ?? []).map((r) => String(r ?? '').trim().toLowerCase());
  if (roles.some((r) => r && MASTER_ADMIN_ROLES.has(r))) return true;

  const email = (identity.email ?? '').toString().trim().toLowerCase();
  if (email && masterAdminEmails().has(email)) return true;

  return false;
}

/**
 * Does the authenticated request hold the owner grant, by the SYNCHRONOUS
 * signals alone?
 *
 * Reads only fields an authentication middleware has already resolved — it
 * never parses a token, never touches the database, and an unauthenticated
 * request is never the owner.
 *
 * Prefer {@link resolveMasterAdmin} anywhere the answer decides what a person
 * sees: this one cannot see an in-app designation, so it answers "no" for
 * somebody the owner has designated through the console. It stays exported and
 * unchanged for callers that must not await, and for the pure-rule tests.
 */
export function isMasterAdmin(req: Request): boolean {
  return isMasterAdminIdentity({
    email: req.userEmail ?? req.user?.email ?? null,
    role: req.userRole ?? req.user?.role ?? null,
    roles: req.user?.roles ?? null,
  });
}

/**
 * How long a designation lookup is reused, in milliseconds.
 *
 * The sync signals short-circuit before any of this, so the query only runs for
 * identities that are NOT already the owner by role or email — which is nearly
 * every request. Without a cache that would put a query on a nav-rail load for
 * every ordinary user of the platform, to answer "no" every time.
 *
 * The cost is a bounded staleness window on BOTH directions: for up to this
 * long, a fresh designation is not yet honoured and a revoked one still is.
 * That is an entitlement widening, not route access — `requirePlatformAdmin`
 * has no cache, so a revoked person is out of the console immediately and only
 * their nav rail lags. Stated rather than hidden.
 */
export const MASTER_ADMIN_GRANT_TTL_MS = 30_000;

const grantCache = new Map<number, { holds: boolean; at: number }>();

/** Drop the designation cache. For tests, and for a caller that has just
 *  changed a grant and wants the next read to reflect it. */
export function clearMasterAdminGrantCache(): void {
  grantCache.clear();
}

/**
 * Is there an active in-app designation for this user carrying a master-admin
 * role?
 *
 * Filters on MASTER_ADMIN_ROLES, NOT on `requirePlatformAdmin`'s PLATFORM_ROLES
 * — see the module note. A lookup failure answers false and is logged: this
 * decision fails closed.
 */
async function hasMasterAdminGrant(userId: number, now: number): Promise<boolean> {
  const cached = grantCache.get(userId);
  if (cached && now - cached.at < MASTER_ADMIN_GRANT_TTL_MS) return cached.holds;

  let holds = false;
  try {
    const result = await query(
      `SELECT 1 FROM platform_role_grants
        WHERE user_id = $1 AND revoked_at IS NULL AND LOWER(role) = ANY($2)
        LIMIT 1`,
      [userId, [...MASTER_ADMIN_ROLES]],
    );
    holds = result.rows.length > 0;
  } catch (err) {
    // Not cached: a transient failure must not pin "not the owner" for the
    // whole TTL, or one blip would grey the owner's rail for half a minute.
    logger.error('master-admin designation lookup failed — treating as not the owner', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  grantCache.set(userId, { holds, at: now });
  return holds;
}

/**
 * THE canonical answer: does this request hold the owner grant?
 *
 * Sync signals first, so the common owner path costs no query and every other
 * path costs at most one per {@link MASTER_ADMIN_GRANT_TTL_MS}. Use this
 * wherever the answer decides what somebody sees.
 */
export async function resolveMasterAdmin(req: Request): Promise<boolean> {
  if (isMasterAdmin(req)) return true;
  const userId = Number(req.userId ?? req.user?.id ?? NaN);
  if (!Number.isFinite(userId)) return false;
  return hasMasterAdminGrant(userId, Date.now());
}
