import { Request, Response, NextFunction } from 'express';
import { reportSecurityAlert } from '../services/security-alerts';

/**
 * Tenant Auth Middleware for Test Assembly Tenants
 *
 * SECURITY: When ALLOWED_TEST_ASSEMBLY_TENANTS is set, this middleware
 * validates the tenant against the allowlist. The tenant identity is
 * derived from the authenticated JWT (req.user.organizationId) rather
 * than from user-supplied headers to prevent tenant impersonation.
 *
 * The tenant comes from the verified session or the request is refused.
 * Headers x-tenant-id / x-tenant used to be a fallback when no JWT user was
 * present, so a request the auth boundary had not authenticated could name an
 * allowlisted tenant and be admitted. They are now read only to report a
 * mismatch with the session (impersonation detection), never to admit.
 */
export function tenantAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.ALLOWED_TEST_ASSEMBLY_TENANTS;
  if (!allowed) return next();

  const allowedList = allowed.split(',').map(s => s.trim()).filter(Boolean);

  // SECURITY: the tenant is the session's, never a request header's.
  const jwtTenant = (req as any).user?.organizationId
    ? String((req as any).user.organizationId)
    : null;
  // security-allow: impersonation-detection — compared with the session below, never admitted on.
  const headerTenant = (req.header('x-tenant-id') || req.header('x-tenant') || '').toString();

  // Log impersonation attempts
  if (headerTenant && jwtTenant && headerTenant !== jwtTenant) {
    reportSecurityAlert({
      kind: 'tenant_header_mismatch',
      message:
        `tenantAuth: header tenant (${headerTenant}) differs from ` +
        `JWT tenant (${jwtTenant}). Using JWT value.`,
      detail: { headerTenant, jwtTenant, userId: (req as any).user?.id || 'unknown' },
    });
  }

  if (!jwtTenant) return res.status(403).json({ error: 'tenant context required' });
  if (!allowedList.includes(jwtTenant)) return res.status(403).json({ error: 'tenant not allowed' });

  return next();
}
