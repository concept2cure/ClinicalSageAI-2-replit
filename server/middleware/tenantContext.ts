/**
 * Tenant Context Middleware
 *
 * This middleware extracts tenant context information (organization ID, client workspace ID,
 * and module) from HTTP headers and attaches it to the request object for all API routes.
 *
 * It implements the multi-tenant isolation model by ensuring every database operation has
 * the appropriate tenant context.
 */

import { Request, Response, NextFunction } from 'express';

// Define the tenant context interface to be attached to the request
export interface TenantContext {
  organizationId: string | null;
  clientWorkspaceId: string | null;
  module: string | null;
}

// Extend Express Request type to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

/**
 * Middleware to extract and attach tenant context to request object
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract tenant context from headers
  const organizationId =
    (req.headers['x-organization-id'] as string) ||
    (req.headers['x-org-id'] as string) ||
    null;
  const clientWorkspaceId =
    (req.headers['x-client-workspace-id'] as string) ||
    (req.headers['x-client-id'] as string) ||
    null;
  const module = (req.headers['x-module'] as string) || null;

  // Create tenant context object
  const tenantContext: TenantContext = {
    organizationId,
    clientWorkspaceId,
    module,
  };

  // Attach to request
  req.tenantContext = tenantContext;

  // Log tenant context for debugging (remove in production)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Tenant Context:', JSON.stringify(tenantContext));
  }

  // Continue to next middleware or route handler
  next();
}

/**
 * Middleware to require organization context for protected routes
 */
export function requireOrganizationContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext?.organizationId) {
    return res.status(403).json({
      error: 'Organization context required',
      message: 'This endpoint requires an organization context',
    });
  }

  next();
}

/**
 * Middleware to require client workspace context for protected routes
 */
export function requireClientWorkspaceContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext?.clientWorkspaceId) {
    return res.status(403).json({
      error: 'Client workspace context required',
      message: 'This endpoint requires a client workspace context',
    });
  }

  next();
}

/**
 * Middleware to require module context for protected routes
 */
export function requireModuleContext(req: Request, res: Response, next: NextFunction) {
  if (!req.tenantContext?.module) {
    return res.status(403).json({
      error: 'Module context required',
      message: 'This endpoint requires a module context',
    });
  }

  next();
}

/**
 * Helper to get current tenant context from request
 */
export function getTenantContext(req: Request): TenantContext {
  return req.tenantContext;
}

/**
 * Backward Compatibility Aliases
 *
 * These aliases maintain compatibility with existing code while we transition
 * to the more semantically accurate function names. This allows us to gradually
 * update route files without breaking existing functionality.
 *
 * Long-term plan: Once all files have been updated to use the new function names,
 * these aliases can be removed in a future release.
 */
export const requireTenantMiddleware = requireOrganizationContext;
export const validateTenantAccessMiddleware = requireOrganizationContext;
export const tenantContext = tenantContextMiddleware;

export default {
  tenantContextMiddleware,
  requireOrganizationContext,
  requireClientWorkspaceContext,
  requireModuleContext,
  getTenantContext,
  requireTenantMiddleware, // Alias for backward compatibility
  validateTenantAccessMiddleware, // Alias for backward compatibility
};
