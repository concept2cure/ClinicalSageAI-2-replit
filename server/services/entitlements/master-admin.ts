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
 * WHO QUALIFIES. Only somebody `requirePlatformAdmin` already admits — the
 * owner grant is a subset of platform administration, never beside it — and
 * who, in addition, carries one of three signals:
 *
 *   1. the `super_admin` role — the platform-owner role. `platform_admin` and
 *      `support` are NOT included: they are staff roles for monitoring and
 *      assistance, and handing them a blanket commercial unlock would make the
 *      entitlement layer report something untrue about the tenant they are
 *      looking at.
 *   2. an email on the MASTER_ADMIN_EMAILS allowlist, on the holder's own
 *      (password) sign-in. There is no built-in address: unset, the allowlist
 *      is empty. A federated (SAML) session's e-mail is whatever the tenant's
 *      identity provider asserted, so it gets nothing from this list — the
 *      same rule `requirePlatformAdmin` applies to PLATFORM_ADMIN_EMAILS
 *      (audit IAM-03).
 *   3. an active `platform_role_grants` row for a master-admin role — the
 *      designation the owner makes from inside the app.
 *
 * ── Why the grant sits inside platform administration (finding 43) ─────────
 *
 * Until 2026-09-28 the two were decided side by side, and a source file named
 * the owner: `DEFAULT_MASTER_ADMIN_EMAILS` held one personal address and
 * applied whenever MASTER_ADMIN_EMAILS was unset — which is every deployment
 * Terraform provisions (security audit 2026-09-24, INF-27). The launch sweep
 * then saw one account answered two ways in one session: the nav resolver said
 * `masterAdmin: true` and unlocked every module, and the licensing console it
 * belongs to refused the same person with 403.
 *
 * The disagreement was the lesser problem. This grant is not only a nav-rail
 * unlock: `access-requests.ts` exempts a master admin from the tenant
 * boundary, so it answers module access requests for EVERY organization. Keyed
 * on a bare e-mail, with no provider check, it went to whichever account held
 * that address — including a federated session whose tenant IdP asserted it.
 * A cross-tenant power belongs to somebody the platform guard admits, so it is
 * now decided behind that guard ({@link resolveAdminStanding}), and the owner
 * is named by configuration or by an audited in-app designation, never by the
 * source code.
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
import { resolvePlatformAdmin, tokenProvider } from '../../middleware/requirePlatformAdmin.js';
import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('master-admin');

/**
 * Roles that carry the owner grant. Deliberately narrower than
 * `requirePlatformAdmin`'s PLATFORM_ROLES — see the module note above.
 */
export const MASTER_ADMIN_ROLES: ReadonlySet<string> = new Set(['super_admin']);

/**
 * Emails holding the owner grant, lower-cased. Unset or blank is an empty list:
 * no address is the owner by default.
 *
 * MASTER_ADMIN_EMAILS is comma-separated. It never admits anyone on its own —
 * {@link resolveAdminStanding} consults it only for somebody the platform
 * guard already admits (PLATFORM_ADMIN_EMAILS, a platform role, or an Access
 * Management designation).
 */
export function masterAdminEmails(): Set<string> {
  return new Set(
    (process.env.MASTER_ADMIN_EMAILS ?? '')
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
  /** The authentication surface that issued the session ('local-jwt', 'saml', …). */
  provider?: string | null;
}

/**
 * PURE: does this identity carry an owner signal (an allowlisted e-mail on the
 * owner's own sign-in)?
 *
 * `role` and `roles` are accepted and NOT read (D6, 2026-10-05,
 * docs/evidence/D6/2026-10-05-platform-standing/). On every authenticated
 * route they carry the tenant membership role, a column with no CHECK, so a
 * membership naming super_admin was an owner signal. The other signal is a
 * super_admin platform_role_grants row, which resolveAdminStanding looks up.
 *
 * A signal, not the verdict: the verdict also requires platform
 * administration, which this cannot see ({@link resolveAdminStanding}).
 * Exported so the rule can be tested directly.
 */
export function isMasterAdminIdentity(identity: MasterAdminIdentity): boolean {
  // Not for a federated session: its e-mail is the identity provider's word.
  const provider = (identity.provider ?? '').toString().trim().toLowerCase();
  const email = (identity.email ?? '').toString().trim().toLowerCase();
  if (email && provider !== 'saml' && masterAdminEmails().has(email)) return true;

  return false;
}

/**
 * Does the authenticated request carry an owner signal, by the SYNCHRONOUS
 * fields alone?
 *
 * Reads only fields an authentication middleware has already resolved — it
 * never parses a token, never touches the database, and an unauthenticated
 * request carries no signal. It is NOT the verdict: it cannot see platform
 * administration or an in-app designation. Decide with
 * {@link resolveMasterAdmin} / {@link resolveAdminStanding}.
 */
export function isMasterAdmin(req: Request): boolean {
  return isMasterAdminIdentity({
    email: req.userEmail ?? req.user?.email ?? null,
    role: req.userRole ?? req.user?.role ?? null,
    roles: req.user?.roles ?? null,
    provider: tokenProvider(req),
  });
}

/**
 * How long a designation lookup is reused, in milliseconds.
 *
 * The query runs only for somebody platform administration already admits and
 * who carries no synchronous owner signal — staff, not customers — so the cache
 * saves little now; it stays because it bounds that lookup per person.
 *
 * The cost is a bounded staleness window on BOTH directions: for up to this
 * long, a fresh designation is not yet honoured and a revoked one still is.
 * Platform administration itself is not cached (`requirePlatformAdmin`), so a
 * person whose last platform standing is revoked loses the owner grant at once;
 * one who keeps a `support` or `platform_admin` standing keeps the owner grant
 * — including cross-organization access-request decisions — for up to this
 * window after the `super_admin` designation is revoked. Stated rather than
 * hidden.
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

/** Who a request is, to the platform: staff admitted to Master Administration,
 *  and — inside that — the owner holding the commercial unlock. */
export interface AdminStanding {
  /** {@link resolvePlatformAdmin}: would the Master Administration guard admit it? */
  platformAdmin: boolean;
  /** The owner grant. Never true where `platformAdmin` is false. */
  masterAdmin: boolean;
}

/**
 * THE canonical answer to both questions, in one pass.
 *
 * Platform administration is decided first, by the guard's own function; a
 * request it refuses is never the owner and costs no designation lookup. Only
 * inside it are the owner signals read — sync first, then the designation.
 * Callers that need both (the nav rail) ask this once rather than resolving
 * platform administration twice.
 */
export async function resolveAdminStanding(req: Request): Promise<AdminStanding> {
  const platformAdmin = await resolvePlatformAdmin(req);
  if (!platformAdmin) return { platformAdmin, masterAdmin: false };
  if (isMasterAdmin(req)) return { platformAdmin, masterAdmin: true };
  const userId = Number(req.userId ?? req.user?.id ?? NaN);
  if (!Number.isFinite(userId)) return { platformAdmin, masterAdmin: false };
  return { platformAdmin, masterAdmin: await hasMasterAdminGrant(userId, Date.now()) };
}

/** Does this request hold the owner grant? {@link resolveAdminStanding}'s `masterAdmin`. */
export async function resolveMasterAdmin(req: Request): Promise<boolean> {
  return (await resolveAdminStanding(req)).masterAdmin;
}
