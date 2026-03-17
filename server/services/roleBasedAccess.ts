/**
 * Role-Based Access Control Service — Production Implementation
 *
 * FDA 21 CFR Part 11 §11.10(d) compliant access control.
 * Uses organizationUsers (role) + clientUserPermissions (fine-grained).
 *
 * Role hierarchy: super_admin > admin > manager > member > viewer
 * Permission format in clientUserPermissions.permissions JSON:
 *   { "resource:action": true, "audit:read": true, ... }
 *
 * Deny-by-default: if DB is unavailable or no matching grant, returns false.
 * In-memory cache with 60s TTL to avoid repeated DB hits.
 */

import { Request, Response, NextFunction } from 'express';
import { eq, and } from 'drizzle-orm';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('rbac');

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds

class TTLCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Prevent unbounded growth — evict expired entries periodically
    if (this.store.size > 5000) this.evictExpired();
    this.store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now > v.expiresAt) this.store.delete(k);
    }
  }
}

// ---------------------------------------------------------------------------
// Role hierarchy
// ---------------------------------------------------------------------------

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  member: 1,
  user: 1, // alias used by some org bootstrap code
  manager: 2,
  admin: 3,
  super_admin: 4,
};

// ---------------------------------------------------------------------------
// RBAC Service
// ---------------------------------------------------------------------------

class RBACService {
  private db: any = null;
  private schemaLoaded = false;
  private organizationUsers: any = null;
  private clientUserPermissions: any = null;

  // Caches keyed by "userId" or "userId:orgId"
  private rolesCache = new TTLCache<string[]>();
  private permCache = new TTLCache<boolean>();

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
      logger.warn('RBAC schema load failed — falling back to deny-by-default', { error });
      this.schemaLoaded = true; // Don't retry on every request
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Core permission check
  // -----------------------------------------------------------------------

  /**
   * Check if a user has a specific permission.
   *
   * @param userId         - The user to check
   * @param resource       - Resource name (e.g. "audit", "users", "documents")
   * @param action         - Action name (e.g. "read", "update", "delete")
   * @param organizationId - Optional org scope; when provided, roles are
   *                         checked within that org only.
   * @returns true only if an explicit grant exists; false otherwise (deny-by-default).
   */
  async checkPermission(
    userId: any,
    resource: string,
    action: string,
    organizationId?: number | string | null,
  ): Promise<boolean> {
    const ready = await this.ensureSchema();
    if (!ready || !userId) return false;

    const uid = Number(userId);
    if (Number.isNaN(uid)) return false;

    const orgId = organizationId != null ? Number(organizationId) : null;
    const cacheKey = `${uid}:${orgId ?? '*'}:${resource}:${action}`;

    // Check cache first
    const cached = this.permCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const result = await this._checkPermissionUncached(uid, resource, action, orgId);
      this.permCache.set(cacheKey, result);
      return result;
    } catch (error) {
      logger.error(`Permission check failed for user ${uid}`, { error });
      return false; // Fail-closed
    }
  }

  private async _checkPermissionUncached(
    userId: number,
    resource: string,
    action: string,
    organizationId: number | null,
  ): Promise<boolean> {
    // 1. Check fine-grained permissions in clientUserPermissions
    const permQuery = organizationId != null
      ? this.db
          .select({ permissions: this.clientUserPermissions.permissions })
          .from(this.clientUserPermissions)
          .where(
            and(
              eq(this.clientUserPermissions.userId, userId),
              eq(this.clientUserPermissions.organizationId, organizationId),
            ),
          )
          .limit(20)
      : this.db
          .select({ permissions: this.clientUserPermissions.permissions })
          .from(this.clientUserPermissions)
          .where(eq(this.clientUserPermissions.userId, userId))
          .limit(20);

    const perms = await permQuery;
    const permKey = `${resource}:${action}`;

    for (const row of perms) {
      const p = row.permissions as Record<string, boolean> | null;
      if (!p) continue;

      // Explicit deny takes precedence
      if (p[permKey] === false) return false;

      // Explicit grant
      if (p[permKey] === true || p['*:*'] === true || p[`${resource}:*`] === true) {
        return true;
      }
    }

    // 2. Fallback: admins and super_admins get implicit full access
    const roles = await this.getUserRoles(userId, organizationId);
    if (roles.includes('admin') || roles.includes('super_admin')) {
      return true;
    }

    return false;
  }

  // -----------------------------------------------------------------------
  // Role lookup
  // -----------------------------------------------------------------------

  /**
   * Get all roles for a user. When organizationId is provided, returns only
   * roles within that organization; otherwise returns roles across all orgs.
   */
  async getUserRoles(userId: any, organizationId?: number | string | null): Promise<string[]> {
    const ready = await this.ensureSchema();
    if (!ready || !userId) return [];

    const uid = Number(userId);
    if (Number.isNaN(uid)) return [];

    const orgId = organizationId != null ? Number(organizationId) : null;
    const cacheKey = `roles:${uid}:${orgId ?? '*'}`;

    const cached = this.rolesCache.get(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const condition = orgId != null
        ? and(
            eq(this.organizationUsers.userId, uid),
            eq(this.organizationUsers.organizationId, orgId),
          )
        : eq(this.organizationUsers.userId, uid);

      const rows = await this.db
        .select({ role: this.organizationUsers.role })
        .from(this.organizationUsers)
        .where(condition);

      const roles = rows.map((r: any) => r.role).filter(Boolean);
      this.rolesCache.set(cacheKey, roles);
      return roles;
    } catch (error) {
      logger.error(`getUserRoles failed for user ${uid}`, { error });
      return [];
    }
  }

  /**
   * Check if a user has at least the specified role (respects hierarchy).
   */
  async hasRole(userId: any, requiredRole: string, organizationId?: number | string | null): Promise<boolean> {
    const roles = await this.getUserRoles(userId, organizationId);
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 0;

    return roles.some(r => (ROLE_HIERARCHY[r] ?? -1) >= requiredLevel);
  }

  // -----------------------------------------------------------------------
  // Express middleware
  // -----------------------------------------------------------------------

  /**
   * Middleware: require a specific permission on a resource.
   * Derives userId and organizationId from req.
   */
  requirePermission(resource: string, action: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const organizationId =
        (req as any).tenantContext?.organizationId ||
        (req as any).user?.organizationId ||
        (req as any).tenantId ||
        null;

      const allowed = await this.checkPermission(userId, resource, action, organizationId);
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
   * Middleware: require at least a specific role.
   */
  requireRole(role: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userId = (req as any).userId || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const organizationId =
        (req as any).tenantContext?.organizationId ||
        (req as any).user?.organizationId ||
        (req as any).tenantId ||
        null;

      const hasIt = await this.hasRole(userId, role, organizationId);
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

  // -----------------------------------------------------------------------
  // Cache management
  // -----------------------------------------------------------------------

  /**
   * Invalidate all cached data for a user (call after role/permission changes).
   */
  invalidateUser(userId: number | string): void {
    // Since our cache keys include userId, we do a prefix scan.
    // For simplicity with the Map-based cache, we just clear everything
    // for this user by clearing the entire cache — acceptable given the
    // short TTL and low frequency of role changes.
    this.rolesCache = new TTLCache<string[]>();
    this.permCache = new TTLCache<boolean>();
    logger.debug(`Invalidated RBAC cache for user ${userId}`);
  }
}

const rbacService = new RBACService();
export default rbacService;
export { RBACService };
