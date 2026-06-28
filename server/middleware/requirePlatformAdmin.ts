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
 *   1. members whose resolved role is a platform role (super_admin /
 *      platform_admin / support), or
 *   2. emails on the PLATFORM_ADMIN_EMAILS allowlist (comma-separated env var)
 *      — the bootstrap path for the platform owner before a platform role is
 *      provisioned in the database.
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

/** True when the authenticated request belongs to a platform administrator. */
export function isPlatformAdmin(req: Request): boolean {
  const primaryRole = (req.userRole || req.user?.role || '').toString().toLowerCase();
  const roles = (req.user?.roles || []).map(r => String(r).toLowerCase());
  if (PLATFORM_ROLES.has(primaryRole)) return true;
  if (roles.some(r => PLATFORM_ROLES.has(r))) return true;

  const email = (req.userEmail || req.user?.email || '').toString().toLowerCase();
  if (email && allowlistedEmails().has(email)) return true;

  return false;
}

/**
 * True when the user holds an active platform_role_grants row for one of this
 * guard's roles. DB-backed fallback for when the synchronous role/email checks
 * fail — lets the owner designate personnel from inside the app (see
 * shared/schema.ts platformRoleGrants) without editing env allowlists. On any
 * DB error we DENY (return false) so a transient outage can never widen access.
 */
async function hasActivePlatformGrant(userId: number): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1 FROM platform_role_grants
        WHERE user_id = $1 AND revoked_at IS NULL AND LOWER(role) = ANY($2)
        LIMIT 1`,
      [userId, [...PLATFORM_ROLES]]
    );
    return result.rows.length > 0;
  } catch (err) {
    logger.error('Platform grant lookup failed — denying', err as Record<string, unknown>);
    return false;
  }
}

/**
 * Express middleware — gate a route to platform administrators only. Must run
 * AFTER `authMiddleware` (it relies on req.user / req.userRole being resolved).
 *
 * The synchronous role/email checks run FIRST and short-circuit with NO db
 * access (the hot path stays sync + db-free). Only when they fail do we fall
 * back to an async lookup against platform_role_grants for a designated grant.
 */
export async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user && req.userId == null) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (isPlatformAdmin(req)) {
    return next();
  }
  if (req.userId != null && (await hasActivePlatformGrant(Number(req.userId)))) {
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
