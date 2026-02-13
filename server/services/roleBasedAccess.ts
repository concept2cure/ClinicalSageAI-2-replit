/**
 * Role-Based Access Control Service — Production Implementation
 *
 * CRIT-01 FIX: Replaced always-true stub with DB-backed checks.
 * Uses organizationUsers (role) + clientUserPermissions (fine-grained).
 *
 * Role hierarchy: super_admin > admin > manager > member > viewer
 * Permission format: { "module:resource:action": true/false }
 */

import { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('rbac');

// Role hierarchy — higher index = more privilege
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  member: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

class RBACService {
  private db: any = null;
  private schemaLoaded = false;
  private organizationUsers: any = null;
  private clientUserPermissions: any = null;

  /**
   * Lazy-load DB and schema to avoid circular imports at module-init time.
   */
  private async ensureSchema(): Promise<boolean> {
    if (this.schemaLoaded) return !!this.db;
    try {
      const dbModule = await import('../db');
      this.db = dbModule.db;
      const schema = await import('../../shared/schema');
      this.organizationUsers = schema.organizationUsers;
      this.clientUserPermissions = schema.clientUserPermissions;
      this.schemaLoaded = true;
      return !!this.db;
    } catch (error) {
      logger.warn('RBAC schema load failed — falling back to deny-by-default', error);
      this.schemaLoaded = true; // Don't retry on every request
      return false;
    }
  }

  /**
   * Check if a user has a specific permission on a resource.
   * Returns false (deny) if DB is unavailable — fail-closed.
   */
  async checkPermission(userId: any, resource: string, action: string): Promise<boolean> {
    const ready = await this.ensureSchema();
    if (!ready || !userId) return false;

    try {
      // Check fine-grained permissions in clientUserPermissions
      const perms = await this.db
        .select({ permissions: this.clientUserPermissions.permissions })
        .from(this.clientUserPermissions)
        .where(eq(this.clientUserPermissions.userId, Number(userId)))
        .limit(10);

      const permKey = `${resource}:${action}`;
      for (const row of perms) {
        const p = row.permissions as Record<string, boolean>;
        if (p && (p[permKey] === true || p['*:*'] === true || p[`${resource}:*`] === true)) {
          return true;
        }
      }

      // Fallback: admins and super_admins get implicit permission
      const roles = await this.getUserRoles(userId);
      if (roles.includes('admin') || roles.includes('super_admin')) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Permission check failed for user ${userId}`, error);
      return false; // Fail-closed
    }
  }

  /**
   * Get all roles for a user across their organizations.
   */
  async getUserRoles(userId: any): Promise<string[]> {
    const ready = await this.ensureSchema();
    if (!ready || !userId) return [];

    try {
      const rows = await this.db
        .select({ role: this.organizationUsers.role })
        .from(this.organizationUsers)
        .where(eq(this.organizationUsers.userId, Number(userId)));

      return rows.map((r: any) => r.role).filter(Boolean);
    } catch (error) {
      logger.error(`getUserRoles failed for user ${userId}`, error);
      return [];
    }
  }

  /**
   * Check if a user has at least the specified role (respects hierarchy).
   */
  async hasRole(userId: any, requiredRole: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

    return roles.some(r => (ROLE_HIERARCHY[r] ?? -1) >= requiredLevel);
  }

  /**
   * Express middleware: require a specific permission on a resource.
   * Returns 403 if the user lacks the permission.
   */
  requirePermission(resource: string, action: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const allowed = await this.checkPermission(userId, resource, action);
      if (!allowed) {
        logger.warn(`RBAC denied: user ${userId} → ${resource}:${action}`);
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: `${resource}:${action}`,
        });
      }

      next();
    };
  }

  /**
   * Express middleware: require at least a specific role.
   * Returns 403 if the user lacks the role.
   */
  requireRole(role: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasIt = await this.hasRole(userId, role);
      if (!hasIt) {
        logger.warn(`RBAC denied: user ${userId} lacks role ${role}`);
        return res.status(403).json({
          error: 'Insufficient role',
          required: role,
        });
      }

      next();
    };
  }
}

const rbacService = new RBACService();
export default rbacService;
export { RBACService };
