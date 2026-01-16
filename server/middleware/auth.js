/**
 * Authentication and Authorization Middleware
 *
 * This module provides middleware for JWT authentication,
 * role-based access control (RBAC), and permission validation.
 */

import { createRequire } from 'module';

// ESM wrapper around the CommonJS implementation.
const require = createRequire(import.meta.url);
const cjs = require('./auth.cjs');

export const authenticateJWT = cjs.authenticateJWT;
export const requireRole = cjs.requireRole;
export const requirePermission = cjs.requirePermission;
export const requireSameOrganization = cjs.requireSameOrganization;
export const isPublicRoute = cjs.isPublicRoute;

// Back-compat aliases used by some route modules
export const authenticateToken = cjs.authenticateJWT;
export const authenticate = cjs.authenticateJWT;
export const verifyJwt = cjs.authenticateJWT;
export const requireRoles = (...roles) => {
  const required = Array.isArray(roles[0]) ? roles[0] : roles;
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    if (userRoles.includes('admin') || required.some(r => userRoles.includes(r))) {
      return next();
    }
    return res.status(403).json({ status: 'error', message: 'Access denied: insufficient role' });
  };
};

// Back-compat helpers used by legacy CJS routes
export const validateAuth = cjs.authenticateJWT;
export const checkOrganizationAccess = (req, organizationId) => {
  if (!req.user) return false;
  return req.user.organizationId === organizationId || req.user.roles?.includes('admin');
};

export default cjs;

