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
import { verifyJwtWithRotation } from '../utils/jwtVerify.js';

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
    const user = verifyJwtWithRotation(token);

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
 * Roles that carry authority ACROSS tenants.
 *
 * The org-scoped vocabulary is admin / manager / member / viewer. Self-service
 * signup mints the org-scoped `admin` for the first user of every new
 * organization, so an org admin is an ordinary customer, not staff. Kept
 * identical to PLATFORM_SCOPED_ROLES in ./auth.ts — pinned by
 * __tests__/platform-role-escalation.test.ts.
 */
const PLATFORM_SCOPED_ROLES = new Set([
  'super_admin',
  'platform_admin',
  'superadmin',
  'support',
]);

/**
 * Check if the user has one of the required roles.
 *
 * ── Which twin runs depends on the resolver ─────────────────────────────────
 * `server/middleware/auth.js` and `server/middleware/auth.ts` both exist and
 * export overlapping names, so the 95 call sites that import the bare specifier
 * `'../middleware/auth'` get whichever one their bundler resolves first. That
 * differs per runtime — measured, not assumed:
 *
 *   esbuild (`npm run build` -> dist/index.js, i.e. PRODUCTION)  -> auth.ts
 *   tsx     (`npm run dev`)                                      -> auth.ts
 *   Vite / vitest                                                -> auth.js
 *
 * esbuild's default resolveExtensions is `.tsx,.ts,.jsx,.js`; Vite's is
 * `.mjs,.js,.mts,.ts`. So `.js` wins ONLY under vitest — production and dev
 * both load the TypeScript twin. Both files therefore carry the same guard: the
 * `.ts` copy is what ships, and this one is what the suite exercises. Change one
 * without the other and the tests stop describing production.
 *
 * ── Two defects this had, both invisible from the call site ─────────────────
 * 1. It took a SINGLE role while every caller invokes it variadically. So
 *    `requireRole('super_admin', 'platform_admin')` silently discarded
 *    'platform_admin' — the guard denied genuine platform admins while the
 *    org-admin bypass below admitted ordinary customers. Exactly backwards.
 * 2. The `|| userRoles.includes('admin')` bypass was unconditional, so a
 *    platform-scoped guard accepted the org `admin` that signup hands out
 *    free. That is the escalation an external audit reproduced live:
 *
 *        POST /api/auth/signup  → JWT role:"admin", org 30
 *        DELETE /api/tenants/28 → 200 "…VICTIM PHARMA … permanently deleted"
 *
 * The org-admin stand-in is kept but SCOPED, not deleted: `regulatory-author`
 * is asked for by 284 call sites and granted to nobody, so removing the
 * stand-in outright would 403 the entire authoring surface for every customer.
 * It now answers org-scoped requirements only; a platform-scoped requirement
 * gets no stand-in. A route that means to admit org admins alongside staff
 * still lists 'admin' explicitly, which is matched before the stand-in.
 *
 * The previous comment here claimed this "Mirrors the canonical auth.ts
 * requireRole". It did not — that one is variadic. It does now.
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // If not authenticated, deny access
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Get user roles from JWT payload
    const userRoles = req.user.roles || (req.user.role ? [req.user.role] : []);

    const hasRole = allowedRoles.some(role => userRoles.includes(role) || role === '*');
    const requiresPlatformRole = allowedRoles.some(role => PLATFORM_SCOPED_ROLES.has(role));
    const orgAdminStandIn = !requiresPlatformRole && userRoles.includes('admin');

    if (hasRole || orgAdminStandIn) {
      return next();
    }

    // Log authorization failure
    logger.warn('Authorization failed: insufficient role', {
      userId: req.user.id,
      requiredRole: allowedRoles.join('|'),
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

  // Check if user belongs to the organization.
  //
  // The exemption was `!req.user.roles.includes('admin')` — the ORG-scoped
  // admin that signup mints for the first user of every new organization. So
  // the guard whose whole job is blocking cross-tenant access exempted any
  // customer admin from it, and then logged "Cross-tenant access attempt
  // blocked" for everyone else. Crossing tenants is platform staff only.
  const callerRoles = [req.user.role, ...(req.user.roles || [])].filter(Boolean);
  const isPlatformStaff = callerRoles.some(role => PLATFORM_SCOPED_ROLES.has(role));
  if (req.user.organizationId !== organizationId && !isPlatformStaff) {
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
 * Check if route is public (no authentication required).
 *
 * Matches the path exactly or as a strict subpath (route + '/'). Bare
 * prefix matching with `startsWith` is intentionally avoided so a
 * crafted path like '/auth/loginEvil' cannot inherit the
 * '/auth/login' exemption and bypass authentication.
 */
const PUBLIC_ROUTES = [
  '/api/health',
  '/health',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/api/public',
];

const isPublicRoute = path => {
  for (const route of PUBLIC_ROUTES) {
    if (path === route) return true;
    if (path.startsWith(route + '/')) return true;
  }
  return false;
};

// Aliases used across codebase
const authenticateToken = authenticateJWT;
const requireAuth = authenticateJWT;
const authenticate = authenticateJWT;

export {
  PLATFORM_SCOPED_ROLES,
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
