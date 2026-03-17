// @ts-nocheck - Express.Request.user type conflicts with tenantContext.ts
/**
 * Authentication Middleware
 *
 * Enterprise-grade authentication and authorization middleware
 * for TrialSage V2 platform.
 *
 * @module server/middleware/auth
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';

// SECURITY FIX: isDev variable removed — no more dev-mode auth bypasses.

// JWT token payload interface
interface JWTPayload {
  userId?: number | string;
  id?: number | string;
  sub?: number | string;
  email?: string;
  role?: string;
  roles?: string[];
  organizationId?: string;
  orgId?: string;
  permissions?: string[];
}

// Extend Request type to include user
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
    }
  }
}

/**
 * Authenticate JWT token from Authorization header
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  // SECURITY FIX: Dev auto-auth removed. All requests must provide a valid JWT.
  // To test locally, create a user via POST /api/auth/signup then login normally.

  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({
      error: { code: 'AUTH_001', message: 'No authentication token provided' },
    });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    req.user = {
      id: decoded.userId || decoded.id || decoded.sub || 0,
      userId: decoded.userId || decoded.id || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user',
      roles: decoded.roles || [decoded.role || 'user'],
      organizationId: decoded.organizationId || decoded.orgId,
      permissions: decoded.permissions || [],
    };
    next();
  } catch (error) {
    return res.status(401).json({
      error: { code: 'AUTH_002', message: 'Invalid or expired token' },
    });
  }
};

/**
 * Alias for authenticateToken - used by some routes
 */
export const authenticateJWT = authenticateToken;

/**
 * Alias for authenticateToken - used by some routes
 */
export const authenticate = authenticateToken;

/**
 * Require authentication middleware
 * Alias for authenticateToken for semantic clarity
 */
export const requireAuth = authenticateToken;

/**
 * Require specific role(s) for access
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // SECURITY FIX: Dev-mode role bypass removed. Roles are always enforced.

    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_003', message: 'Authentication required' },
      });
    }

    const userRoles = req.user.roles || [req.user.role];
    const hasRole = allowedRoles.some(role => userRoles?.includes(role) || role === '*');

    if (!hasRole && !userRoles?.includes('admin')) {
      return res.status(403).json({
        error: { code: 'AUTH_004', message: 'Insufficient permissions' },
      });
    }

    next();
  };
};

/**
 * Require organization access
 * Ensures user belongs to the requested organization
 */
export const requireOrgAccess = (req: Request, res: Response, next: NextFunction) => {
  // SECURITY FIX: Dev-mode org bypass removed. Org access is always enforced.

  if (!req.user) {
    return res.status(401).json({
      error: { code: 'AUTH_003', message: 'Authentication required' },
    });
  }

  // Admin users have access to all organizations
  if (req.user.role === 'admin' || req.user.roles?.includes('admin')) {
    return next();
  }

  // Check if request has an orgId parameter that matches user's org
  const requestedOrgId =
    req.params.orgId ||
    req.params.organizationId ||
    req.body?.organizationId ||
    req.query?.organizationId;

  if (requestedOrgId && requestedOrgId !== req.user.organizationId) {
    return res.status(403).json({
      error: { code: 'AUTH_005', message: 'Access to this organization denied' },
    });
  }

  next();
};

/**
 * Require same organization middleware
 */
export const requireSameOrganization = requireOrgAccess;

/**
 * Require specific permission for access
 */
export const requirePermission = (resource: string, action: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // SECURITY FIX: Dev-mode permission bypass removed. Permissions are always enforced.

    if (!req.user) {
      return res.status(401).json({
        error: { code: 'AUTH_003', message: 'Authentication required' },
      });
    }

    const permissions = req.user.permissions || [];
    const requiredPermission = `${resource}:${action}`;

    const hasPermission =
      permissions.includes('*') ||
      permissions.includes(requiredPermission) ||
      permissions.includes(`${resource}:*`);

    if (!hasPermission && req.user.role !== 'admin') {
      return res.status(403).json({
        error: { code: 'AUTH_006', message: `Permission '${requiredPermission}' required` },
      });
    }

    next();
  };
};

/**
 * Optional authentication - attaches user if token present, continues if not
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    // SECURITY FIX: Dev auto-auth removed from optional auth path.
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
    req.user = {
      id: decoded.userId || decoded.id || decoded.sub || 0,
      userId: decoded.userId || decoded.id || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user',
      roles: decoded.roles || [decoded.role || 'user'],
      organizationId: decoded.organizationId || decoded.orgId,
      permissions: decoded.permissions || [],
    };
  } catch {
    // Token invalid but that's okay for optional auth
  }

  next();
};

export default {
  authenticateToken,
  authenticateJWT,
  authenticate,
  requireAuth,
  requireRole,
  requireOrgAccess,
  requireSameOrganization,
  requirePermission,
  optionalAuth,
};
