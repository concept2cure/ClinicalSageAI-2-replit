/**
 * Authentication and Authorization Middleware
 *
 * CommonJS implementation retained for legacy require() callers.
 * The ESM wrapper lives in `server/middleware/auth.js`.
 */

const jwt = require('jsonwebtoken');
const config = require('../config/environment.cjs').config;
const { createLogger } = require('../utils/monitoring.cjs');

const logger = createLogger('auth');

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
    const user = jwt.verify(token, config.jwt.secret);

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
    logger.warn('Authorization failed - insufficient role', {
      userId: req.user.id,
      email: req.user.email,
      requiredRole,
      userRoles,
      path: req.path,
    });

    return res.status(403).json({
      status: 'error',
      message: `Access denied: ${requiredRole} role required`,
    });
  };
};

/**
 * Check if user has the required permission
 */
const requirePermission = requiredPermission => {
  return (req, res, next) => {
    // If not authenticated, deny access
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Get user permissions from JWT payload
    const userPermissions = req.user.permissions || [];

    // Check if user has the required permission or admin role
    if (userPermissions.includes(requiredPermission) || (req.user.roles || []).includes('admin')) {
      return next();
    }

    // Log authorization failure
    logger.warn('Authorization failed - insufficient permission', {
      userId: req.user.id,
      email: req.user.email,
      requiredPermission,
      userPermissions,
      path: req.path,
    });

    return res.status(403).json({
      status: 'error',
      message: `Access denied: ${requiredPermission} permission required`,
    });
  };
};

/**
 * Ensure the request's organization matches the resource organization
 * CRITICAL SECURITY: Prevents tenant data leakage
 */
const requireSameOrganization = (req, res, next) => {
  // If not authenticated, deny access
  if (!req.user || !req.user.organizationId) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
    });
  }

  // Get organization ID from request parameters or body
  const organizationId =
    req.params.organizationId || req.body.organizationId || req.query.organizationId;

  // If no organization ID in request, allow (some routes don't need this check)
  if (!organizationId) {
    return next();
  }

  // Convert to number for comparison
  const requestedOrgId = parseInt(organizationId);

  // Allow admins to access any organization
  if ((req.user.roles || []).includes('admin')) {
    return next();
  }

  // Check if user's organization matches requested organization
  if (req.user.organizationId !== requestedOrgId) {
    logger.warn('Organization access denied', {
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

module.exports = {
  authenticateJWT,
  // Legacy aliases
  validateAuth: authenticateJWT,
  checkOrganizationAccess: (req, organizationId) => {
    if (!req.user) return false;
    return req.user.organizationId === organizationId || req.user.roles?.includes('admin');
  },
  requireRole,
  requirePermission,
  requireSameOrganization,
  isPublicRoute,
};
