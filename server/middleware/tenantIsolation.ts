/**
 * Tenant Isolation Middleware
 *
 * Enforces strict tenant isolation for multi-tenant SaaS.
 * Validates organization context and prevents cross-tenant data access.
 *
 * @version 2.0.0
 * @module server/middleware/tenantIsolation
 */

import { Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { logSecurityEvent } from '../services/audit/auditLogger';

const logger = createScopedLogger('tenant-isolation');

// Tenant context attached to requests
export interface TenantContext {
  organizationId: string;
  workspaceId?: string;
  userId: string;
  roles: string[];
  permissions: string[];
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

/**
 * Extract and validate tenant context from request
 *
 * SECURITY: Organization ID is derived exclusively from the authenticated
 * JWT token (req.user.organizationId), NOT from user-supplied headers.
 * This prevents tenant impersonation attacks where a user sends a forged
 * x-organization-id header to access another organization's data.
 */
export function tenantIsolationMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    // SECURITY: organizationId MUST come from the verified JWT token (set by auth
    // middleware on req.user), never from user-supplied headers or query params.
    const user = req.user as any;
    const jwtOrganizationId = user?.organizationId != null
      ? String(user.organizationId)
      : null;

    // Fall back to session only if no JWT org (session is server-side, not user-controlled)
    const organizationId = jwtOrganizationId || (req as any).session?.organizationId || null;

    // SECURITY: Detect and log header-based impersonation attempts
    const headerOrgId = req.headers['x-organization-id'] as string;
    if (headerOrgId && jwtOrganizationId && headerOrgId !== jwtOrganizationId) {
      const userId = user?.id || 'unknown';
      logger.warn('Tenant impersonation attempt blocked', {
        jwtOrgId: jwtOrganizationId,
        headerOrgId,
        userId,
        path: req.path,
      });
      logSecurityEvent(
        String(userId),
        jwtOrganizationId,
        'tenant_impersonation_attempt',
        'critical',
        { headerOrgId, jwtOrgId: jwtOrganizationId, path: req.path }
      );
      // Do NOT use the header value — continue with JWT value
    }

    const userId = user?.id || user?.userId || 'anonymous';

    // workspaceId is scoped within a tenant and may come from headers
    const workspaceId = req.headers['x-workspace-id'] as string;

    // Validate organization ID format
    if (organizationId && !isValidOrganizationId(organizationId)) {
      logger.warn('Invalid organization ID format', { organizationId, userId });
      logSecurityEvent(String(userId), organizationId || 'unknown', 'invalid_org_id', 'warning', {
        providedId: organizationId,
      });
      res.status(400).json({ error: 'Invalid organization ID format' });
      return;
    }

    // Attach tenant context to request
    req.tenant = {
      organizationId: organizationId || 'default',
      workspaceId,
      userId: String(userId),
      roles: extractRoles(req),
      permissions: extractPermissions(req),
    };

    // Log tenant context for debugging
    logger.debug('Tenant context established', {
      organizationId: req.tenant.organizationId,
      userId: req.tenant.userId,
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error('Tenant isolation error', { error });
    res.status(500).json({ error: 'Tenant context error' });
  }
}

/**
 * Validate organization ID format
 */
function isValidOrganizationId(id: string): boolean {
  // UUID format or alphanumeric with dashes/underscores
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const simpleRegex = /^[a-z0-9_-]{1,64}$/i;
  return uuidRegex.test(id) || simpleRegex.test(id);
}

/**
 * Extract roles from request/session
 */
function extractRoles(req: Request): string[] {
  const user = req.user as any;
  if (user?.roles) return Array.isArray(user.roles) ? user.roles : [user.roles];
  if (user?.role) return [user.role];
  return ['viewer'];
}

/**
 * Extract permissions from request/session
 */
function extractPermissions(req: Request): string[] {
  const user = req.user as any;
  return user?.permissions || [];
}

/**
 * Require tenant context middleware
 * Use after tenantIsolationMiddleware to enforce tenant requirement
 */
export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.tenant || !req.tenant.organizationId || req.tenant.organizationId === 'default') {
    logger.warn('Missing tenant context', { path: req.path });
    res.status(401).json({ error: 'Organization context required' });
    return;
  }
  next();
}

/**
 * Validate resource belongs to tenant
 */
export function validateResourceTenant(
  resourceOrgId: string | null | undefined,
  requestOrgId: string
): boolean {
  if (!resourceOrgId) return false;
  return resourceOrgId === requestOrgId;
}

/**
 * Scope query to tenant
 */
export function scopeToTenant<T extends Record<string, unknown>>(
  query: T,
  organizationId: string
): T & { organizationId: string } {
  return { ...query, organizationId };
}

/**
 * Check if user has required role
 */
export function hasRole(req: Request, requiredRole: string): boolean {
  return req.tenant?.roles.includes(requiredRole) || req.tenant?.roles.includes('admin') || false;
}

/**
 * Check if user has required permission
 */
export function hasPermission(req: Request, requiredPermission: string): boolean {
  return (
    req.tenant?.permissions.includes(requiredPermission) ||
    req.tenant?.roles.includes('admin') ||
    false
  );
}

/**
 * Role-based access control middleware factory
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasRequiredRole = roles.some(role => hasRole(req, role));
    if (!hasRequiredRole) {
      logger.warn('Insufficient role', {
        userId: req.tenant.userId,
        required: roles,
        actual: req.tenant.roles,
      });
      logSecurityEvent(
        req.tenant.userId,
        req.tenant.organizationId,
        'insufficient_role',
        'warning',
        { required: roles, actual: req.tenant.roles }
      );
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Permission-based access control middleware factory
 */
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const hasRequiredPermission = permissions.some(perm => hasPermission(req, perm));
    if (!hasRequiredPermission) {
      logger.warn('Insufficient permission', {
        userId: req.tenant.userId,
        required: permissions,
      });
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

export default {
  tenantIsolationMiddleware,
  requireTenant,
  validateResourceTenant,
  scopeToTenant,
  hasRole,
  hasPermission,
  requireRole,
  requirePermission,
};
