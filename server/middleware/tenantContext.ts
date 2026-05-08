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
import { and, eq } from 'drizzle-orm';
import { organizations, organizationUsers } from '../../shared/schema';
import { runWithTenantScope } from '../db/tenantStore';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('tenant-context');

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
 *
 * SECURITY: Organization ID is derived exclusively from the authenticated
 * JWT token (req.user.organizationId), NOT from request headers.
 * This prevents tenant impersonation attacks where a user sends a forged
 * x-org-id / x-organization-id header to access another tenant's data.
 *
 * Non-sensitive supplemental context (clientWorkspaceId, module) may still
 * come from headers as they are scoped within the tenant boundary.
 */
export function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // SECURITY: organizationId MUST come from verified JWT (set by auth middleware),
  // never from user-supplied headers.
  const jwtOrganizationId = req.user?.organizationId != null
    ? String(req.user.organizationId)
    : null;

  // Preserve existing tenant context (e.g., set by requireTenantContext from JWT)
  const existing = req.tenantContext || ({} as any);

  // SECURITY: Log a warning if the client sent a header org ID that differs
  // from the JWT org ID. This may indicate a tenant impersonation attempt.
  const headerOrgId = (req.headers['x-org-id'] as string) || null;
  if (headerOrgId && jwtOrganizationId && headerOrgId !== jwtOrganizationId) {
    logger.warn('Tenant impersonation attempt blocked', {
      jwtOrgId: jwtOrganizationId,
      headerOrgId,
      userId: req.user?.id ?? 'unknown',
      path: req.path,
    });
  }

  // Non-sensitive supplemental context may come from headers
  const organizationUuid = (req.headers['x-org-uuid'] as string) || existing.organizationUuid || null;
  const clientWorkspaceId = (req.headers['x-client-id'] as string) || existing.clientWorkspaceId || null;
  const module = (req.headers['x-module'] as string) || existing.module || null;

  // Create tenant context object — organizationId always from JWT
  const tenantContext: TenantContext = {
    organizationId:
      jwtOrganizationId || (existing.organizationId != null ? String(existing.organizationId) : null),
    organizationUuid,
    clientWorkspaceId,
    module,
  };

  // Attach to request
  req.tenantContext = tenantContext;

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
    const contextOrgId = parseInt(String(req.tenantContext.organizationId ?? ''), 10);
    const userTenantId = typeof req.user.tenantId === 'number'
      ? req.user.tenantId
      : parseInt(String(req.user.tenantId), 10);
    if (Number.isFinite(contextOrgId) && contextOrgId !== userTenantId) {
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
    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        error: 'Authentication unavailable',
        message: 'JWT verifier is not configured',
      });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing bearer token',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] }) as {
      userId: string;
      organizationId: string;
      organizationUuid?: string;
    };

    const organizationId = decoded.organizationId?.toString();
    if (!organizationId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing organization context',
      });
    }

    const userId = parseInt(decoded.userId, 10);
    const orgIdInt = parseInt(organizationId, 10);
    if (!Number.isFinite(userId) || !Number.isFinite(orgIdInt)) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Invalid token claims',
      });
    }

    const tenant = await db
      .select({
        id: organizations.id,
        industryMode: organizations.industryMode,
        status: organizations.status,
      })
      .from(organizations)
      .where(eq(organizations.id, orgIdInt))
      .limit(1);

    if (!tenant.length || tenant[0].status === 'suspended') {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Tenant not active',
      });
    }

    const membership = await db
      .select({ role: organizationUsers.role })
      .from(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.organizationId, orgIdInt)))
      .limit(1);

    if (!membership.length) {
      return res.status(403).json({
        error: 'Authentication required',
        message: 'User is not a member of this organization',
      });
    }

    const resolvedRole = membership[0].role;

    const organizationUuid =
      req.tenantContext?.organizationUuid || decoded.organizationUuid || null;

    req.tenantContext = {
      organizationId,
      organizationUuid,
      clientWorkspaceId: req.tenantContext?.clientWorkspaceId || null,
      module: req.tenantContext?.module || null,
    };

    req.user = {
      id: userId,
      tenantId: orgIdInt,
      industryMode: tenant[0].industryMode,
      role: resolvedRole,
      organizationId: organizationId,
    };
    req.userId = req.user.id;
    req.tenantId = req.user.tenantId;

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [organizationId]);
      await client.query("SELECT set_config('app.current_user_role', $1, false)", [
        resolvedRole,
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

    // Establish a tenant AsyncLocalStorage scope for the rest of the request.
    // Pool instrumentation reads this on every query so we can count which
    // queries run without a tenant boundary — the gap that would silently
    // turn into "zero rows" once RLS is enabled in PR B.
    return runWithTenantScope(
      {
        tenantId: organizationId,
        orgUuid: organizationUuid || null,
        role: resolvedRole || null,
        source: 'request',
        caller: req.path,
      },
      () => next()
    );
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
 * Helper to get current tenant context from request. Throws if no
 * tenant context is attached — call only after the request has been
 * through `tenantContextMiddleware` or `requireTenantContext`.
 */
export function getTenantContext(req: Request): TenantContext {
  const ctx = req.tenantContext;
  if (!ctx) {
    throw new Error('getTenantContext called before tenant context was set on the request');
  }
  return {
    organizationId: ctx.organizationId == null ? null : String(ctx.organizationId),
    organizationUuid: ctx.organizationUuid ?? null,
    clientWorkspaceId: ctx.clientWorkspaceId == null ? null : String(ctx.clientWorkspaceId),
    module: ctx.module ?? null,
  };
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
