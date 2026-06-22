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
 *   - only business roles (owner / business_admin / super_admin) or emails on
 *     the BUSINESS_CENTER_EMAILS allowlist may enter
 *
 * "Only I or other designated personnel" → the platform owner is super_admin
 * (and/or on the allowlist); finance staff are granted via the `business_admin`
 * role or by email.
 *
 * @compliance FDA 21 CFR Part 11 §11.10(d) — limiting access to authorized
 *             individuals; segregation of financial duties.
 */

import { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';

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

/** True when the authenticated request may access Business Center data. */
export function isBusinessAdmin(req: Request): boolean {
  const primaryRole = (req.userRole || req.user?.role || '').toString().toLowerCase();
  const roles = (req.user?.roles || []).map(r => String(r).toLowerCase());
  if (BUSINESS_ROLES.has(primaryRole)) return true;
  if (roles.some(r => BUSINESS_ROLES.has(r))) return true;

  const email = (req.userEmail || req.user?.email || '').toString().toLowerCase();
  if (email && allowlistedEmails().has(email)) return true;

  return false;
}

/**
 * Express middleware — gate a route to the Business Center tier. Must run AFTER
 * authMiddleware (relies on resolved req.user / req.userRole).
 */
export function requireBusinessAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user && req.userId == null) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!isBusinessAdmin(req)) {
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
  return next();
}
