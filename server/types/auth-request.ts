/**
 * Org / user resolvers for routes mounted under /api.
 *
 * The middleware chain wired in server/startup/middleware.ts (composing
 * server/middleware/enterprise-security.ts and the tenant-context layer)
 * populates four different shapes of org context on `req` before any route
 * handler runs:
 *
 *   - req.user.organizationId        (from authMiddleware)
 *   - req.tenantContext.organizationId (from tenantContextMiddleware)
 *   - req.organizationId             (shorthand attached by tenantContextMiddleware)
 *   - req.tenantId                   (legacy alias)
 *
 * Different writers chose different shapes; all four are populated.
 * These helpers normalize the read so route handlers never have to
 * reach for `(req as any).…`.
 *
 * Express types are augmented in server/middleware/auth.ts and
 * server/middleware/tenantContext.ts (declare global namespace Express);
 * those are the canonical declarations and we don't redeclare here.
 */

import type { Request } from 'express';

/**
 * Resolve the caller's organization id as a positive integer, or null
 * when no org context is attached. Reads from the four conventions
 * populated by the middleware chain — pure, safe to call from any
 * route handler regardless of mount path.
 */
export function resolveOrgId(req: Request): number | null {
  const v =
    (req as Request & { organizationId?: number | string }).organizationId ??
    req.tenantContext?.organizationId ??
    req.user?.organizationId ??
    (req as Request & { tenantId?: number | string }).tenantId;
  if (v === undefined || v === null) return null;
  const n = typeof v === 'string' ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the caller's user id as a number, or null when no user is
 * attached. Used by audit-row writers that record the actor against
 * each mutating action.
 */
export function resolveUserId(req: Request): number | null {
  const raw = req.user?.id;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : null;
}
