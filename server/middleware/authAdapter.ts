/**
 * Auth Middleware Adapter
 *
 * This module provides ES module compatible authentication middleware
 * that wraps the existing CommonJS auth middleware
 */

import { Request, Response, NextFunction } from 'express';
import { createRequire } from 'module';

// Create require function for loading CommonJS modules in ES module context
const require = createRequire(import.meta.url);

// Import the CommonJS auth middleware
const authModule = require('./auth');
const { authenticateJWT, requireRole: requireRoleJs, requirePermission: requirePermissionJs, requireSameOrganization: requireSameOrganizationJs } = authModule;

/**
 * Authenticate middleware for Express routes
 * This is a wrapper around authenticateJWT for TypeScript compatibility
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  return authenticateJWT(req, res, next);
};

/**
 * Require role middleware for Express routes
 * This is a wrapper around requireRole for TypeScript compatibility
 */
export const requireRole = (role: string) => {
  return requireRoleJs(role);
};

/**
 * Require permission middleware for Express routes
 * This is a wrapper around requirePermission for TypeScript compatibility
 */
export const requirePermission = (resource: string, action: string) => {
  return requirePermissionJs(resource, action);
};

/**
 * Require same organization middleware for Express routes
 * This is a wrapper around requireSameOrganization for TypeScript compatibility
 */
export const requireSameOrganization = (req: Request, res: Response, next: NextFunction) => {
  return requireSameOrganizationJs(req, res, next);
};
