/**
 * Business Center access guard — finance / business-operations tier.
 *
 * The Business Center exposes cost-based accounting, revenue, and margin data
 * across every client. That is MORE sensitive than the support-facing Master
 * Administration surface, so this gate is strictly NARROWER than
 * requirePlatformAdmin:
 *
 *   - the support role does NOT pass here (it can monitor, not see financials)
 *   - platform_admin does NOT pass here either
 *   - only an active platform_role_grants row for a business role (owner /
 *     business_admin / super_admin), or the owner's own address on the
 *     BUSINESS_CENTER_EMAILS allowlist, may enter
 *
 * "Only I or other designated personnel" → the platform owner is on the
 * allowlist and/or holds a super_admin grant; finance staff are granted
 * `business_admin` in Access Management.
 *
 * Standing is PLATFORM standing, never a tenant role (D6, 2026-10-05,
 * docs/evidence/D6/2026-10-05-business-center-standing/). This guard used to
 * admit a req.userRole, req.user.role or req.user.roles of owner,
 * business_admin or super_admin. On this router those are the TENANT membership
 * role (server/auth.ts reads organization_users), and `owner` is a tenant
 * administrative role across the codebase (tenant-users.ts, tenant-export.ts,
 * ORG_ROLE_FUNCTIONAL_GRANTS). So any membership carrying it, such as one
 * written by an older version, a future writer, or a hand edit, would have
 * opened every client's cost, revenue and margin to that tenant.
 *
 * @compliance FDA 21 CFR Part 11 §11.10(d) — limiting access to authorized
 *             individuals; segregation of financial duties.
 */

import { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { query } from '../db';
import { tokenProvider } from './requirePlatformAdmin';

const logger = createScopedLogger('business-center-guard');

/** Roles permitted into the Business Center. Deliberately excludes support. */
export const BUSINESS_ROLES = new Set(['owner', 'business_admin', 'super_admin']);

/** Emails on the BUSINESS_CENTER_EMAILS allowlist (lower-cased). Exported so
 *  the access-roster endpoint reports the same source of truth this gate uses. */
export function businessAllowlistedEmails(): Set<string> {
  return new Set(
    (process.env.BUSINESS_CENTER_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function allowlistedEmails(): Set<string> {
  return businessAllowlistedEmails();
}

/** True when the request's own sign-in is on the Business Center allowlist.
 *  The synchronous half of the guard; the other half is a platform grant
 *  (hasActiveBusinessGrant). No request role is read: on this router that is
 *  the tenant membership role (see the module comment). */
export function isBusinessAdmin(req: Request): boolean {

  // The allowlist names the owner's OWN (password) sign-in. A federated
  // session's e-mail is whatever its identity provider asserted, so it gets
  // nothing from the list: the rule requirePlatformAdmin applies to
  // PLATFORM_ADMIN_EMAILS (audit IAM-03), by the same reading of the provider.
  // Such an identity is decided by a platform_role_grants row alone.
  const email = (req.userEmail || req.user?.email || '').toString().toLowerCase();
  if (email && tokenProvider(req) !== 'saml' && allowlistedEmails().has(email)) return true;

  return false;
}

/**
 * True when the user holds an active platform_role_grants row for one of the
 * business roles. DB-backed fallback for when the synchronous role/email checks
 * fail — lets the owner designate finance personnel from inside the app (see
 * shared/schema.ts platformRoleGrants) without editing env allowlists. On any
 * DB error we DENY (return false) so a transient outage can never widen access.
 */
async function hasActiveBusinessGrant(userId: number): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1 FROM platform_role_grants
        WHERE user_id = $1 AND revoked_at IS NULL AND LOWER(role) = ANY($2)
        LIMIT 1`,
      [userId, [...BUSINESS_ROLES]]
    );
    return result.rows.length > 0;
  } catch (err) {
    logger.error('Business grant lookup failed — denying', err as Record<string, unknown>);
    return false;
  }
}

/**
 * Business standing: the owner's own sign-in on the allowlist, or an active
 * platform business grant. The one decision for the Business Center and for
 * Access Management's "only a business administrator designates finance
 * personnel" check, so the two cannot disagree.
 */
export async function hasBusinessStanding(req: Request): Promise<boolean> {
  if (isBusinessAdmin(req)) return true;
  const userId = Number(req.userId ?? NaN);
  return Number.isFinite(userId) && (await hasActiveBusinessGrant(userId));
}

/**
 * Express middleware — gate a route to the Business Center tier. Must run AFTER
 * authMiddleware (relies on resolved req.user / req.userRole).
 *
 * The synchronous role/email checks run FIRST and short-circuit with NO db
 * access (the hot path stays sync + db-free). Only when they fail do we fall
 * back to an async lookup against platform_role_grants for a designated grant.
 */
export async function requireBusinessAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user && req.userId == null) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (await hasBusinessStanding(req)) {
    return next();
  }
  logger.warn('Business Center access denied', {
    userId: req.userId,
    role: req.userRole,
    email: req.userEmail,
    path: req.originalUrl,
  });
  return res.status(403).json({
    error: 'Business Center access is restricted to the platform owner and designated finance personnel.',
  });
}
