// @ts-nocheck - TenantContext type conflicts with tenantDbHelper declarations
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
import type { Pool, PoolClient } from 'pg';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { getPool } from '../db';
import { eq } from 'drizzle-orm';
import { organizations } from '../../shared/schema';

// Define the tenant context interface to be attached to the request
export interface TenantContext {
  organizationId: string | null;
  organizationUuid?: string | null;
  clientWorkspaceId: string | null;
  module: string | null;
}

// Extend Express Request type to include tenant context
declare global {
  namespace Express {
    interface Request {
      user?: {
        id?: number | string;
        userId?: number | string;
        email?: string;
        role?: string;
        roles?: string[];
        organizationId?: number | string;
        permissions?: string[];
        tenantId?: number | string;
        industryMode?: string | null;
      };
      tenantContext?: {
        organizationId?: number | string | null;
        organizationUuid?: string | null;
        clientWorkspaceId?: number | string | null;
        module?: string | null;
        userId?: number | string;
        role?: string | null;
      };
      userId?: number | string;
      tenantId?: number | string;
      userRole?: string;
      userEmail?: string;
      dbClient?: PoolClient | null;
    }
  }
}

async function releaseDbClient(req: Request): Promise<void> {
  const client = req.dbClient;
  if (!client) {
    return;
  }
  req.dbClient = null;

  try {
    await client.query("SELECT set_config('app.current_tenant_id', '', false)");
    await client.query("SELECT set_config('app.current_user_role', '', false)");
    await client.query("SELECT set_config('app.current_org_id', '', false)");
  } finally {
    client.release();
  }
}

/**
 * Middleware to extract and attach tenant context to request object
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract tenant context from headers
  const organizationId = (req.headers['x-org-id'] as string) || null;
  const organizationUuid = (req.headers['x-org-uuid'] as string) || null;
  const clientWorkspaceId = (req.headers['x-client-id'] as string) || null;
  const module = (req.headers['x-module'] as string) || null;

  // Create tenant context object
  const tenantContext: TenantContext = {
    organizationId,
    organizationUuid,
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

  if (req.user?.tenantId) {
    const contextOrgId = parseInt(req.tenantContext.organizationId, 10);
    if (Number.isFinite(contextOrgId) && contextOrgId !== req.user.tenantId) {
      return res.status(403).json({
        error: 'Organization mismatch',
        message: 'Organization context does not match authenticated tenant',
      });
    }
  }

  next();
}

/**
 * Strict tenant context enforcement for every protected route.
 * Validates JWT, ensures tenant exists and is active, and sets RLS tenant context.
 */
export async function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing bearer token',
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || process.env.SESSION_SECRET || ''
    ) as {
      userId: string;
      organizationId: string;
      organizationUuid?: string;
      role?: string;
    };

    const organizationId = decoded.organizationId?.toString();
    if (!organizationId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing organization context',
      });
    }

    const tenant = await db
      .select({
        id: organizations.id,
        industryMode: organizations.industryMode,
        status: organizations.status,
      })
      .from(organizations)
      .where(eq(organizations.id, parseInt(organizationId, 10)))
      .limit(1);

    if (!tenant.length || tenant[0].status === 'suspended') {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Tenant not active',
      });
    }

    const organizationUuid =
      req.tenantContext?.organizationUuid || decoded.organizationUuid || null;

    req.tenantContext = {
      organizationId,
      organizationUuid,
      clientWorkspaceId: req.tenantContext?.clientWorkspaceId || null,
      module: req.tenantContext?.module || null,
    };

    req.user = {
      id: parseInt(decoded.userId, 10),
      tenantId: parseInt(organizationId, 10),
      industryMode: tenant[0].industryMode,
      role: decoded.role || null,
    };
    req.userId = req.user.id;
    req.tenantId = req.user.tenantId;

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [organizationId]);
      await client.query("SELECT set_config('app.current_user_role', $1, false)", [
        decoded.role || 'user',
      ]);
      await client.query("SELECT set_config('app.current_org_id', $1, false)", [
        organizationUuid || '',
      ]);
    } catch (error) {
      client.release();
      throw error;
    }

    req.dbClient = client;
    res.on('finish', () => {
      void releaseDbClient(req);
    });
    res.on('close', () => {
      void releaseDbClient(req);
    });

    return next();
  } catch (error) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Invalid or expired token',
    });
  }
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

export function getRequestDbClient(req: Request): PoolClient | Pool {
  return req.dbClient ?? getPool();
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
  getRequestDbClient,
  requireTenantMiddleware, // Alias for backward compatibility
  validateTenantAccessMiddleware, // Alias for backward compatibility
};
