import { Request, Response, NextFunction } from 'express';

/**
 * Tenant Auth Middleware for Test Assembly Tenants
 *
 * SECURITY: When ALLOWED_TEST_ASSEMBLY_TENANTS is set, this middleware
 * validates the tenant against the allowlist. The tenant identity is
 * derived from the authenticated JWT (req.user.organizationId) rather
 * than from user-supplied headers to prevent tenant impersonation.
 *
 * Headers x-tenant-id / x-tenant are only used as a fallback when no
 * JWT user context is available (e.g., service-to-service calls), and
 * a security warning is logged if the header value differs from the JWT.
 */
export function tenantAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.ALLOWED_TEST_ASSEMBLY_TENANTS;
  if (!allowed) return next();

  const allowedList = allowed.split(',').map(s => s.trim()).filter(Boolean);

  // SECURITY: Prefer the JWT-derived organization ID over user-supplied headers
  const jwtTenant = (req as any).user?.organizationId
    ? String((req as any).user.organizationId)
    : null;
  const headerTenant = (req.header('x-tenant-id') || req.header('x-tenant') || '').toString();

  // Log impersonation attempts
  if (headerTenant && jwtTenant && headerTenant !== jwtTenant) {
    console.warn(
      `[SECURITY] tenantAuth: header tenant (${headerTenant}) differs from ` +
      `JWT tenant (${jwtTenant}). Using JWT value. userId=${(req as any).user?.id || 'unknown'}`
    );
  }

  const tenant = jwtTenant || headerTenant;

  if (!tenant) return res.status(403).json({ error: 'tenant context required' });
  if (!allowedList.includes(tenant)) return res.status(403).json({ error: 'tenant not allowed' });

  return next();
}
