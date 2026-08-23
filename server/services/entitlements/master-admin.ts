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
 * WHO QUALIFIES. Two independent signals, matching the pattern already used by
 * `requireBusinessAdmin`:
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
 *
 * @module server/services/entitlements/master-admin
 */

import type { Request } from 'express';

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
 * Does the authenticated request hold the owner grant?
 *
 * Reads only fields an authentication middleware has already resolved — it
 * never parses a token, and an unauthenticated request is never the owner.
 */
export function isMasterAdmin(req: Request): boolean {
  return isMasterAdminIdentity({
    email: req.userEmail ?? req.user?.email ?? null,
    role: req.userRole ?? req.user?.role ?? null,
    roles: req.user?.roles ?? null,
  });
}
