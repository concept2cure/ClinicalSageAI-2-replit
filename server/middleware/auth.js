/**
 * Authentication and Authorization Middleware (.js variant)
 *
 * NOTE: This file and server/middleware/auth.ts export the same named functions
 * but with different implementations. This .js version includes stricter security
 * (organizationId required in JWT, tenant impersonation blocking, public route
 * bypass). The .ts version is simpler but lacks those checks.
 *
 * Post-beta consolidation: merge the security features from this file into auth.ts
 * and migrate all importers to the .ts version. See docs/proof/KNOWN_ISSUES_LEDGER.md M-5.
 *
 * This module provides middleware for JWT authentication,
 * role-based access control (RBAC), and permission validation.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { createLogger } from '../utils/monitoring.js';

const logger = createLogger('auth');

/**
 * Verify JWT token and attach user to request
 * CRITICAL SECURITY: Enforces JWT-based tenant isolation
 */
const authenticateJWT = (req, res, next) => {
  // Skip authentication for public routes
  if (isPublicRoute(req.path)) {
    return next();
  }

  // Get the authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
    });
  }

  // Extract the token
  const token = authHeader.split(' ')[1];

  try {
    // Verify the token with appropriate secret for current environment
    const user = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

    // CRITICAL SECURITY CHECK: Ensure organizationId is in JWT payload
    if (!user.organizationId) {
      logger.error('JWT token missing organizationId', {
        userId: user.id,
        email: user.email,
      });
      return res.status(403).json({
        status: 'error',
        message: 'Invalid token: missing organization context',
      });
    }

    // Attach user to request
    req.user = user;

    // CRITICAL SECURITY: Set organizationId from JWT (NEVER from headers)
    // This prevents tenant impersonation attacks
    req.organizationId = user.organizationId;

    // SECURITY WARNING: Ignore x-organization-id header if present
    // Log if client attempts to override organizationId via header
    const headerOrgId = req.headers['x-organization-id'];
    if (headerOrgId && parseInt(headerOrgId) !== user.organizationId) {
      logger.warn('Tenant impersonation attempt blocked', {
        userId: user.id,
        jwtOrganizationId: user.organizationId,
        headerOrganizationId: headerOrgId,
        ip: req.ip,
        path: req.path,
      });
    }

    // Log authentication success
    logger.debug('User authenticated', {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', { error: error.message });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        status: 'error',
        message: 'Token expired. Please login again.',
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Invalid token',
    });
  }
};

/**
 * Backward-compat alias used by older JS routes.
 * Keep export shape stable during Stage 3 canonicalization.
 */
const verifyJwt = authenticateJWT;

/**
 * Check if user has the required role
 */
const requireRole = requiredRole => {
  return (req, res, next) => {
    // If not authenticated, deny access
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Get user roles from JWT payload
    const userRoles = req.user.roles || [];

    // Check if user has the required role or admin role
    if (userRoles.includes(requiredRole) || userRoles.includes('admin')) {
      return next();
    }

    // Log authorization failure
    logger.warn('Authorization failed: insufficient role', {
      userId: req.user.id,
      requiredRole,
      userRoles,
    });

    return res.status(403).json({
      status: 'error',
      message: 'Access denied: insufficient permissions',
    });
  };
};

/**
 * Check if user has permission for a specific resource
 * This is more fine-grained than role-based checks
 */
const requirePermission = (resource, action) => {
  return (req, res, next) => {
    // If not authenticated, deny access
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Get user permissions from JWT payload
    const userPermissions = req.user.permissions || {};

    // Get resource permissions
    const resourcePermissions = userPermissions[resource] || [];

    // Check if user has the required permission or has wildcard permission
    if (resourcePermissions.includes(action) || resourcePermissions.includes('*')) {
      return next();
    }

    // Log authorization failure
    logger.warn('Authorization failed: insufficient permission', {
      userId: req.user.id,
      resource,
      action,
      userPermissions,
    });

    return res.status(403).json({
      status: 'error',
      message: `Access denied: ${action} permission required for ${resource}`,
    });
  };
};

/**
 * Backward-compat permission helper used by @server/auth barrel.
 * Returns true/false only; does not send responses.
 */
const hasPermission = (req, requiredPermission) => {
  if (!req?.user) return false;

  // Admin always passes local permission checks.
  if (req.user.role === 'admin' || req.user.roles?.includes?.('admin')) {
    return true;
  }

  const [resource, action] = String(requiredPermission || '').split(':');
  if (!resource || !action) return false;

  const userPermissions = req.user.permissions || {};
  const resourcePermissions = userPermissions[resource] || [];
  return (
    resourcePermissions.includes(action) ||
    resourcePermissions.includes('*') ||
    userPermissions['*']?.includes?.('*') ||
    userPermissions['*']?.includes?.(action)
  );
};

/**
 * Middleware to ensure user belongs to the organization
 * This enforces tenant isolation at the application level
 */
const requireSameOrganization = (req, res, next) => {
  // If not authenticated, deny access
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
    });
  }

  // Get organization ID from request (set by tenantContext middleware)
  const organizationId = req.organizationId;

  // If no organization ID in request, skip this check
  if (!organizationId) {
    return next();
  }

  // Check if user belongs to the organization
  if (req.user.organizationId !== organizationId && !req.user.roles.includes('admin')) {
    logger.warn('Cross-tenant access attempt blocked', {
      userId: req.user.id,
      userOrganizationId: req.user.organizationId,
      requestedOrganizationId: organizationId,
    });

    return res.status(403).json({
      status: 'error',
      message: 'Access denied: resource belongs to a different organization',
    });
  }

  next();
};

/**
 * Check if route is public (no authentication required)
 */
const isPublicRoute = path => {
  const publicRoutes = [
    '/api/health',
    '/health',
    '/auth/login',
    '/auth/register',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/api/public',
  ];

  // Check if path starts with any public route
  return publicRoutes.some(route => path.startsWith(route));
};

// Aliases used across codebase
const authenticateToken = authenticateJWT;
const requireAuth = authenticateJWT;
const authenticate = authenticateJWT;

export {
  authenticateJWT,
  verifyJwt,
  authenticateToken,
  requireAuth,
  authenticate,
  requireRole,
  hasPermission,
  requirePermission,
  requireSameOrganization,
  isPublicRoute,
};
