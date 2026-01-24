/**
 * Unified Authentication Module
 * 
 * This module consolidates all authentication and authorization functionality.
 * 
 * ARCHITECTURE:
 * - jwt.middleware.ts: JWT verification (production)
 * - rbac.middleware.ts: Role-based access control
 * - dev.middleware.ts: Development mode bypass
 * - types.ts: Auth types and interfaces
 * 
 * USAGE:
 * ```typescript
 * import { authenticateJWT, requireRole, requirePermission } from '@server/auth';
 * 
 * app.use('/api', authenticateJWT);
 * app.get('/admin', requireRole('admin'), adminHandler);
 * ```
 * 
 * SECURITY NOTES:
 * - JWT tokens contain organizationId for tenant isolation
 * - NEVER trust x-organization-id header (logged and ignored)
 * - All auth decisions audit-logged for 21 CFR Part 11
 */

// Re-export from existing implementations during migration
export { authenticateJWT, isPublicRoute, requireRole, hasPermission } from '../middleware/auth.js';
export { authMiddleware } from '../auth';
export { default as rbacService } from '../services/roleBasedAccess.js';

// Types
export interface AuthUser {
  id: number;
  email: string;
  role: string;
  organizationId: number;
}

export interface TenantContext {
  organizationId: number;
  userId?: number;
  role?: string;
}

// Declare augmented Express types
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      userId?: number;
      userRole?: string;
      userEmail?: string;
      tenantId?: number;
      organizationId?: number;
      tenantContext?: TenantContext;
    }
  }
}
