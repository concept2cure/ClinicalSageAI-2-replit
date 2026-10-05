/**
 * Platform-administration access guard — Master Administration module.
 *
 * The Master Administration surface is NON-client-facing: it grants the
 * platform owner and the support team cross-tenant visibility (every
 * organization, every user, platform-wide audit) for product-level support
 * and client monitoring. That is a fundamentally different trust boundary
 * from the org-scoped roles (admin/manager/member/viewer) every tenant has.
 *
 * For that reason this guard is deliberately STRICTER than the generic
 * `requireRole(...)` helper in ./auth.ts — it has NO org-`admin` bypass. A
 * tenant administrator must never reach platform-wide data. Access is granted
 * only to:
 *   1. (removed 2026-10-05) a request role of super_admin / platform_admin /
 *      support. Behind server/auth.ts the request role is the TENANT
 *      membership role (organization_users.role, a column with no CHECK), so a
 *      membership row naming a platform role opened every organisation's data
 *      (D6, docs/evidence/D6/2026-10-05-platform-standing/). Platform
 *      standing is (2) or (3), never a membership;
 *   2. emails on the PLATFORM_ADMIN_EMAILS allowlist (comma-separated env var)
 *      — the bootstrap path for the platform owner before a platform role is
 *      provisioned in the database. It applies to the owner's OWN (password)
 *      sign-in only: a federated (SAML) session's e-mail is whatever the
 *      identity provider asserted, so a tenant's IdP claiming the owner's
 *      address gets nothing from it (audit IAM-03). Such an identity is
 *      decided by the platform_role_grants path (3) alone.
 *   3. an active platform_role_grants row (DB-backed, see below).
 *
 * @compliance FDA 21 CFR Part 11 §11.10(d) — limiting system access to
 *             authorized individuals.
 */

import { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { query } from '../db';

const logger = createScopedLogger('platform-admin-guard');

/** Platform-level roles. NOT org-scoped — these see across every tenant. */
const PLATFORM_ROLES = new Set(['super_admin', 'platform_admin', 'support']);

/** Parse the comma-separated PLATFORM_ADMIN_EMAILS allowlist (lower-cased). */
function allowlistedEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Which authentication surface issued the request's token, when the
 * authenticator recorded it: `req.identity.provider` on the server/auth.ts
 * path ('local-jwt' for a password session, 'saml' for a federated one), else
 * a `provider` field on req.user. Empty when neither is set. Exported so the
 * owner grant's e-mail allowlist (services/entitlements/master-admin.ts)
 * refuses a federated e-mail by the same reading.
 */
export function tokenProvider(req: Request): string {
  const fromUser = (req.user as { provider?: unknown } | undefined)?.provider;
  return String(req.identity?.provider ?? fromUser ?? '').toLowerCase();
}

/** True when the authenticated request belongs to a platform administrator. */
export function isPlatformAdmin(req: Request): boolean {
  // No request role is read: it is the tenant membership role (header, 1).
  // The e-mail allowlist does not apply to a federated identity: its e-mail is
  // the identity provider's word, not the owner's password (see header, 2).
  const email = (req.userEmail || req.user?.email || '').toString().toLowerCase();
  if (email && tokenProvider(req) !== 'saml' && allowlistedEmails().has(email)) return true;

  return false;
}

/**
 * True when the user holds an active platform_role_grants row for one of
 * `roles`. Lets the owner designate personnel from inside the app (see
 * shared/schema.ts platformRoleGrants) without editing env allowlists. On any
 * DB error we DENY (return false) so a transient outage can never widen access.
 */
async function hasActivePlatformGrant(userId: number, roles: readonly string[]): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1 FROM platform_role_grants
        WHERE user_id = $1 AND revoked_at IS NULL AND LOWER(role) = ANY($2)
        LIMIT 1`,
      [userId, [...roles]]
    );
    return result.rows.length > 0;
  } catch (err) {
    logger.error('Platform grant lookup failed — denying', err as Record<string, unknown>);
    return false;
  }
}

/**
 * THE answer to "would {@link requirePlatformAdmin} admit this request?".
 *
 * The guard below decides with this and nothing else, and it is exported so a
 * surface that only needs to know — the account menu deciding whether to offer
 * the Master Administration console — asks the same function instead of
 * guessing from org roles. Before 2026-09-23 the menu offered "Licensing" to
 * every customer org admin, because the client had no platform-admin signal,
 * and every one of them opened a seven-tab console that refused every read.
 *
 * The synchronous role/email checks run FIRST and short-circuit with NO db
 * access. Only when they fail do we fall back to the platform_role_grants
 * lookup, which denies on any DB error.
 */
export async function resolvePlatformAdmin(req: Request): Promise<boolean> {
  return holdsPlatformRole(req, [...PLATFORM_ROLES]);
}

/** The verified account id an authenticator resolved: req.userId (server/auth.ts)
 *  or req.user.id / userId (middleware/auth.ts sets only req.user). Null unless a
 *  positive integer. */
function verifiedUserId(req: Request): number | null {
  const user = req.user as { id?: unknown; userId?: unknown } | undefined;
  const id = Number(req.userId ?? user?.id ?? user?.userId ?? NaN);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Per-request memo of platform standing by role set, so a route that asks in
 *  its guard and again in its handler costs one lookup. */
const standingMemo = new WeakMap<Request, Map<string, Promise<boolean>>>();

/**
 * Does this request hold platform standing for one of `roles`?
 *
 * The ONE decision for every across-organisations power: Master
 * Administration (via resolvePlatformAdmin), and each route's own staff rule
 * with its own role set (organizations, tenant settings, client workspaces,
 * tenant users, the lifecycle override, the estate audit checks). Standing is
 * the owner's own sign-in on PLATFORM_ADMIN_EMAILS, which holds every platform
 * role, or an active platform_role_grants row for one of `roles`.
 *
 * Never the request role. Behind server/auth.ts that is the tenant membership
 * role (organization_users.role, no CHECK), and each of those routes used to
 * read it, so a membership row naming super_admin reached every organisation
 * (D6, 2026-10-05, docs/evidence/D6/2026-10-05-cross-tenant-staff/).
 */
export function holdsPlatformRole(req: Request, roles: readonly string[]): Promise<boolean> {
  if (isPlatformAdmin(req)) return Promise.resolve(true);
  const userId = verifiedUserId(req);
  if (userId === null) return Promise.resolve(false);
  const key = [...roles].map(r => r.toLowerCase()).sort().join(',');
  let memo = standingMemo.get(req);
  if (!memo) {
    memo = new Map();
    standingMemo.set(req, memo);
  }
  let decision = memo.get(key);
  if (!decision) {
    decision = hasActivePlatformGrant(userId, key.split(','));
    memo.set(key, decision);
  }
  return decision;
}

/**
 * Express middleware — gate a route to platform administrators only. Must run
 * AFTER `authMiddleware` (it relies on req.user / req.userRole being resolved).
 * The decision is {@link resolvePlatformAdmin}.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user && req.userId == null) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (await resolvePlatformAdmin(req)) {
    return next();
  }
  logger.warn('Master Administration access denied', {
    userId: req.userId,
    role: req.userRole,
    email: req.userEmail,
    path: req.originalUrl,
  });
  return res.status(403).json({
    error: 'Master Administration access is restricted to platform administrators.',
  });
}
