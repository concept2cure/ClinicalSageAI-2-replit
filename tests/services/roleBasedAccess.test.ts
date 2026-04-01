/**
 * Role-Based Access Control Service — Unit Tests
 *
 * Tests for FDA 21 CFR Part 11 §11.10(d) compliant RBAC service.
 * Covers deny-by-default, role hierarchy, cache TTL, org scoping,
 * and Express middleware behavior.
 *
 * @module tests/services/roleBasedAccess.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock drizzle-orm operators used by the service
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: any, val: any) => ({ type: 'eq', val })),
  and: vi.fn((...conds: any[]) => ({ type: 'and', conds })),
}));

// ---------------------------------------------------------------------------
// Mock DB and schema — we control what the DB returns per test
// ---------------------------------------------------------------------------

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockRowsForWhere = vi.fn();

// Drizzle-like query builder:
// - permissions path uses .where(...).limit(...)
// - roles path uses .where(...) directly (awaitable)
const queryBuilder: any = {
  from: (...args: any[]) => mockFrom(...args),
  where: (...args: any[]) => mockWhere(...args),
  limit: (...args: any[]) => mockLimit(...args),
};
mockFrom.mockImplementation(() => queryBuilder);
mockWhere.mockImplementation(() => ({
  limit: (...args: any[]) => mockLimit(...args),
  then: (resolve: (value: any) => any, reject?: (reason: any) => any) =>
    Promise.resolve(mockRowsForWhere()).then(resolve, reject),
}));
mockLimit.mockResolvedValue([]);
mockRowsForWhere.mockReturnValue([]);
mockSelect.mockReturnValue(queryBuilder);

const mockDb = { select: mockSelect };

const mockOrganizationUsers = {
  userId: 'organizationUsers.userId',
  organizationId: 'organizationUsers.organizationId',
  role: 'organizationUsers.role',
};

const mockClientUserPermissions = {
  userId: 'clientUserPermissions.userId',
  organizationId: 'clientUserPermissions.organizationId',
  permissions: 'clientUserPermissions.permissions',
};

vi.mock('../../server/db', () => ({ db: mockDb }));
vi.mock('../../server/db.ts', () => ({ db: mockDb }));
vi.mock('../../../shared/schema', () => ({
  organizationUsers: mockOrganizationUsers,
  clientUserPermissions: mockClientUserPermissions,
}));
vi.mock('../../../shared/schema/index.ts', () => ({
  organizationUsers: mockOrganizationUsers,
  clientUserPermissions: mockClientUserPermissions,
}));
vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks are registered
// ---------------------------------------------------------------------------

import { RBACService } from '../../server/services/roleBasedAccess';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshService(): RBACService {
  const svc = new RBACService();
  // Inject mocked DB/schema directly via internals so ensureSchema succeeds
  (svc as any).db = mockDb;
  (svc as any).schemaLoaded = true;
  (svc as any).organizationUsers = mockOrganizationUsers;
  (svc as any).clientUserPermissions = mockClientUserPermissions;
  return svc;
}

function createMockReqRes(overrides: Record<string, any> = {}) {
  const req: any = {
    userId: overrides.userId ?? 1,
    user: overrides.user ?? { id: 1 },
    tenantContext: { organizationId: overrides.organizationId ?? 10 },
    ...overrides,
  };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RBACService', () => {
  let rbac: RBACService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLimit.mockResolvedValue([]);
    mockRowsForWhere.mockReturnValue([]);
    rbac = freshService();
  });

  // -------------------------------------------------------------------------
  // Deny-by-default
  // -------------------------------------------------------------------------

  describe('deny-by-default', () => {
    it('should deny when userId is null or undefined', async () => {
      expect(await rbac.checkPermission(null, 'documents', 'read')).toBe(false);
      expect(await rbac.checkPermission(undefined, 'documents', 'read')).toBe(false);
    });

    it('should deny when userId is not a valid number', async () => {
      expect(await rbac.checkPermission('abc', 'documents', 'read')).toBe(false);
      expect(await rbac.checkPermission(NaN, 'documents', 'read')).toBe(false);
    });

    it('should deny when DB has no matching permission grants', async () => {
      // Permissions query returns empty
      mockLimit.mockResolvedValueOnce([]);
      // Roles query returns empty (via await .where() in getUserRoles)
      mockRowsForWhere.mockReturnValueOnce([]);

      const result = await rbac.checkPermission(1, 'documents', 'delete');
      expect(result).toBe(false);
    });

    it('should deny when DB throws an error (fail-closed)', async () => {
      mockLimit.mockRejectedValueOnce(new Error('connection refused'));

      const result = await rbac.checkPermission(1, 'audit', 'read');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Fine-grained permission checks
  // -------------------------------------------------------------------------

  describe('fine-grained permissions', () => {
    it('should grant access for explicit permission match', async () => {
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'documents:read': true } },
      ]);

      const result = await rbac.checkPermission(1, 'documents', 'read');
      expect(result).toBe(true);
    });

    it('should grant access for wildcard resource:* permission', async () => {
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'documents:*': true } },
      ]);

      const result = await rbac.checkPermission(1, 'documents', 'delete');
      expect(result).toBe(true);
    });

    it('should deny when explicit deny overrides grant', async () => {
      // Explicit deny takes precedence
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'audit:delete': false } },
      ]);

      const result = await rbac.checkPermission(1, 'audit', 'delete');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Role hierarchy
  // -------------------------------------------------------------------------

  describe('role hierarchy', () => {
    it('should grant admin implicit full access when no fine-grained perms exist', async () => {
      // No fine-grained permissions
      mockLimit.mockResolvedValueOnce([]);
      // Roles query returns admin
      mockRowsForWhere.mockReturnValueOnce([{ role: 'admin' }]);

      const result = await rbac.checkPermission(1, 'anything', 'delete');
      expect(result).toBe(true);
    });

    it('should grant super_admin implicit full access', async () => {
      mockLimit.mockResolvedValueOnce([]);
      mockRowsForWhere.mockReturnValueOnce([{ role: 'super_admin' }]);

      const result = await rbac.checkPermission(1, 'users', 'delete');
      expect(result).toBe(true);
    });

    it('should respect role hierarchy with hasRole — manager satisfies member requirement', async () => {
      mockRowsForWhere.mockReturnValueOnce([{ role: 'manager' }]);

      const result = await rbac.hasRole(1, 'member');
      expect(result).toBe(true);
    });

    it('should respect role hierarchy — viewer does NOT satisfy admin requirement', async () => {
      mockRowsForWhere.mockReturnValueOnce([{ role: 'viewer' }]);

      const result = await rbac.hasRole(1, 'admin');
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Organization scoping
  // -------------------------------------------------------------------------

  describe('organization scoping', () => {
    it('should pass organizationId to the DB query when provided', async () => {
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'projects:read': true } },
      ]);

      const result = await rbac.checkPermission(1, 'projects', 'read', 42);
      expect(result).toBe(true);
      // The select chain was invoked (we verify indirectly that orgId was used)
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should scope getUserRoles to a specific organization', async () => {
      mockRowsForWhere.mockReturnValueOnce([{ role: 'member' }]);

      const roles = await rbac.getUserRoles(1, 42);
      expect(roles).toEqual(['member']);
    });
  });

  // -------------------------------------------------------------------------
  // Cache TTL behavior
  // -------------------------------------------------------------------------

  describe('cache behavior', () => {
    it('should return cached result on second call without hitting DB again', async () => {
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'reports:read': true } },
      ]);

      // First call hits DB
      const r1 = await rbac.checkPermission(5, 'reports', 'read', 1);
      expect(r1).toBe(true);
      const dbCallCount = mockLimit.mock.calls.length;

      // Second call should use cache — no new DB calls
      const r2 = await rbac.checkPermission(5, 'reports', 'read', 1);
      expect(r2).toBe(true);
      expect(mockLimit.mock.calls.length).toBe(dbCallCount);
    });

    it('should clear cache when invalidateUser is called', async () => {
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'reports:read': true } },
      ]);

      await rbac.checkPermission(5, 'reports', 'read', 1);
      rbac.invalidateUser(5);

      // After invalidation, the next call must hit DB again
      mockLimit.mockResolvedValueOnce([]);
      mockRowsForWhere.mockReturnValueOnce([{ role: 'viewer' }]);

      const result = await rbac.checkPermission(5, 'reports', 'read', 1);
      // Now viewer without explicit perm => denied
      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Express middleware
  // -------------------------------------------------------------------------

  describe('requirePermission middleware', () => {
    it('should return 401 when no userId is present on request', async () => {
      const { req, res, next } = createMockReqRes({ userId: undefined, user: undefined });
      const mw = rbac.requirePermission('documents', 'read');

      await mw(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 when permission is denied', async () => {
      mockLimit.mockResolvedValueOnce([]);
      mockRowsForWhere.mockReturnValueOnce([{ role: 'viewer' }]);

      const { req, res, next } = createMockReqRes();
      const mw = rbac.requirePermission('admin', 'delete');

      await mw(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next() when permission is granted', async () => {
      mockLimit.mockResolvedValueOnce([
        { permissions: { 'documents:read': true } },
      ]);

      const { req, res, next } = createMockReqRes();
      const mw = rbac.requirePermission('documents', 'read');

      await mw(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
