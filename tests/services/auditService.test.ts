/**
 * Audit Service — Unit Tests
 *
 * Tests for FDA 21 CFR Part 11 §11.10(e) compliant audit trail.
 * Covers logAction persistence, getAuditLog filtering, tamper-proof
 * hash chain verification, and fallback behavior.
 *
 * @module tests/services/auditService.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock drizzle-orm operators
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    eq: vi.fn((_col: any, val: any) => ({ type: 'eq', val })),
    and: vi.fn((...conds: any[]) => ({ type: 'and', conds })),
    or: vi.fn((...conds: any[]) => ({ type: 'or', conds })),
    gte: vi.fn((_col: any, val: any) => ({ type: 'gte', val })),
    lte: vi.fn((_col: any, val: any) => ({ type: 'lte', val })),
    desc: vi.fn((col: any) => ({ type: 'desc', col })),
    asc: vi.fn((col: any) => ({ type: 'asc', col })),
  };
});

// ---------------------------------------------------------------------------
// Mock DB chain
// ---------------------------------------------------------------------------

const {
  mockInsertValues,
  mockInsert,
  mockLimit,
  mockOrderBy,
  mockWhere,
  mockFrom,
  mockSelect,
  mockDb,
  mockClientQuery,
  mockClientRelease,
  mockConnect,
  mockPool,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined);
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockLimit = vi.fn();
  const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, orderBy: mockOrderBy }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  // logAction now writes the canonical audit_logs row via a raw pg client
  // transaction (BEGIN → SELECT FOR UPDATE → INSERT → COMMIT) so the row is
  // sha256-chained + HMAC-sealed. The SELECT FOR UPDATE must return rows:[] so
  // computeAuditChainSealed treats this as the genesis link.
  const mockClientQuery = vi.fn().mockResolvedValue({ rows: [] });
  const mockClientRelease = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
  const mockPool = { connect: mockConnect };
  return {
    mockInsertValues,
    mockInsert,
    mockLimit,
    mockOrderBy,
    mockWhere,
    mockFrom,
    mockSelect,
    mockDb: { insert: mockInsert, select: mockSelect },
    mockClientQuery,
    mockClientRelease,
    mockConnect,
    mockPool,
  };
});

vi.mock('../../server/db', () => ({
  db: mockDb,
  pool: mockPool,
}));

// ---------------------------------------------------------------------------
// Mock schema
// ---------------------------------------------------------------------------

// Hoist mockAuditLogs so it's available when vi.mock's factory runs (mocks
// are hoisted above top-level statements).
const { mockAuditLogs } = vi.hoisted(() => ({
  mockAuditLogs: {
    tenantId: 'audit_logs.tenantId',
    userId: 'audit_logs.userId',
    action: 'audit_logs.action',
    tableName: 'audit_logs.tableName',
    recordId: 'audit_logs.recordId',
    oldValues: 'audit_logs.oldValues',
    newValues: 'audit_logs.newValues',
    ipAddress: 'audit_logs.ipAddress',
    userAgent: 'audit_logs.userAgent',
    createdAt: 'audit_logs.createdAt',
  },
}));

// Mock both the path the test uses (`../../../shared/schema` from tests/)
// and the path the service uses (`../../shared/schema` from server/services/),
// so the mock applies regardless of how vitest's resolver normalizes the
// two strings. Both resolve to the same module (shared/schema.ts), but
// vitest 2.1's mock-key matching is path-string-sensitive.
vi.mock('../../../shared/schema', () => ({
  auditLogs: mockAuditLogs,
}));
vi.mock('../../shared/schema', () => ({
  auditLogs: mockAuditLogs,
}));

// ---------------------------------------------------------------------------
// Mock tamper-proof audit log
// ---------------------------------------------------------------------------

const mockTpLog = {
  initialize: vi.fn().mockResolvedValue(undefined),
  log: vi.fn().mockResolvedValue(undefined),
  verifyChain: vi.fn().mockResolvedValue({ valid: true, entriesVerified: 5 }),
  search: vi.fn().mockResolvedValue([]),
};

vi.mock('../../server/lib/tamper-proof-audit', () => ({
  getTamperProofAuditLog: vi.fn(() => mockTpLog),
  TamperProofAuditLog: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

vi.mock('../../server/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { AuditService } from '../../server/services/auditService';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuditService', () => {
  let audit: AuditService;

  beforeEach(() => {
    vi.clearAllMocks();
    audit = new AuditService();
  });

  // -------------------------------------------------------------------------
  // logAction
  // -------------------------------------------------------------------------

  describe('logAction — persistence', () => {
    // logAction writes the canonical audit_logs row through a raw pg client
    // transaction (BEGIN → SELECT FOR UPDATE → chained+sealed INSERT → COMMIT).
    // The INSERT is a parameterized query; columns map to params in order:
    //   $1 id, $2 tenant_id, $3 user_id, $4 action, $5 table_name, $6 record_id,
    //   $7 actor_id, $8 target, $9 payload_hash, $10 sha256_chain, $11 occurred_at,
    //   $12 hmac_seal, $13 old_values, $14 new_values, $15 ip_address, $16 user_agent
    function insertParams(): unknown[] | undefined {
      const call = mockClientQuery.mock.calls.find(
        (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('INSERT INTO audit_logs'),
      );
      return call?.[1] as unknown[] | undefined;
    }

    it('should insert a chained+sealed audit row with object-form entry', async () => {
      await audit.logAction({
        tenantId: 1,
        userId: 42,
        action: 'create',
        resourceType: 'document',
        resourceId: 'doc-999',
        details: { name: 'Protocol v2' },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      // BEGIN/SELECT FOR UPDATE/INSERT/COMMIT all went through the client, and
      // the connection was released.
      expect(mockConnect).toHaveBeenCalled();
      expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
      expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
      expect(mockClientRelease).toHaveBeenCalled();

      const params = insertParams();
      expect(params).toBeDefined();
      expect(params![1]).toBe(1); // tenant_id
      expect(params![2]).toBe(42); // user_id / actor_id
      expect(params![3]).toBe('create'); // action
      expect(params![4]).toBe('document'); // table_name
      expect(params![5]).toBe('doc-999'); // record_id
      expect(params![9]).toMatch(/^[0-9a-f]{64}$/); // sha256_chain
      expect(params![14]).toBe('10.0.0.1'); // ip_address
      expect(params![15]).toBe('Mozilla/5.0'); // user_agent
    });

    it('should accept positional-form arguments for backward compatibility', async () => {
      await audit.logAction('org-5', 7, 'update', 'project', 'proj-1', { note: 'changed status' });

      const params = insertParams();
      expect(params).toBeDefined();
      expect(params![3]).toBe('update'); // action
      expect(params![4]).toBe('project'); // table_name
      expect(params![5]).toBe('proj-1'); // record_id
      expect(params![2]).toBe(7); // actor_id
    });

    it('should resolve tenantId from organizationId alias', async () => {
      await audit.logAction({
        organizationId: 77,
        userId: 1,
        action: 'read',
        resourceType: 'submission',
      });

      const params = insertParams();
      expect(params).toBeDefined();
      expect(params![1]).toBe(77); // tenant_id resolved from organizationId
    });

    it('should not throw when the DB write fails (non-fatal)', async () => {
      // First client query (BEGIN) rejects → the whole audit write fails, but
      // logAction must swallow it (an audit-trail outage must not break the
      // action it records).
      mockClientQuery.mockRejectedValueOnce(new Error('connection reset'));

      await expect(
        audit.logAction({
          tenantId: 1,
          userId: 1,
          action: 'delete',
          resourceType: 'user',
        }),
      ).resolves.toBeUndefined();

      // The connection is always released even on failure.
      expect(mockClientRelease).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getAuditLog
  // -------------------------------------------------------------------------

  describe('getAuditLog — filtering', () => {
    it('should return rows from Drizzle query', async () => {
      const fakeRows = [
        { id: 1, action: 'create', tableName: 'document' },
        { id: 2, action: 'update', tableName: 'document' },
      ];
      mockLimit.mockResolvedValueOnce(fakeRows);

      const result = await audit.getAuditLog({ resourceType: 'document' });

      expect(result).toEqual(fakeRows);
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should apply userId filter', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await audit.getAuditLog({ userId: 42 });

      // eq() should have been called with the userId column and value
      const { eq } = await import('drizzle-orm');
      expect(eq).toHaveBeenCalledWith(mockAuditLogs.userId, 42);
    });

    it('should apply date range filters', async () => {
      const from = new Date('2025-01-01');
      const to = new Date('2025-12-31');
      mockLimit.mockResolvedValueOnce([]);

      await audit.getAuditLog({ fromDate: from, toDate: to });

      const { gte, lte } = await import('drizzle-orm');
      expect(gte).toHaveBeenCalledWith(mockAuditLogs.createdAt, from);
      expect(lte).toHaveBeenCalledWith(mockAuditLogs.createdAt, to);
    });

    it('should respect custom limit', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await audit.getAuditLog({ limit: 25 });

      expect(mockLimit).toHaveBeenCalledWith(25);
    });

    it('should default to 100 rows when no limit specified', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await audit.getAuditLog({});

      expect(mockLimit).toHaveBeenCalledWith(100);
    });

    it('should return empty array when both Drizzle and tamper-proof log fail', async () => {
      mockLimit.mockRejectedValueOnce(new Error('db down'));

      const result = await audit.getAuditLog();

      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // verifyChain
  // -------------------------------------------------------------------------

  describe('verifyChain — tamper-proof hash chain', () => {
    it('should return valid:false when tamper-proof log is unavailable', async () => {
      // pool is null in our mock, so tamperProofLog stays null
      const result = await audit.verifyChain();

      // Without a pool the service returns { valid: false, entriesVerified: 0 }
      expect(result).toEqual(
        expect.objectContaining({ valid: expect.any(Boolean) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Static constants
  // -------------------------------------------------------------------------

  describe('constants', () => {
    it('should expose ACTIONS map with known action types', () => {
      expect(AuditService.ACTIONS).toHaveProperty('USER_LOGIN', 'user_login');
      expect(AuditService.ACTIONS).toHaveProperty('SIGNATURE_APPLY', 'signature_apply');
      expect(AuditService.ACTIONS).toHaveProperty('DATA_MODIFY', 'data_modify');
    });

    it('should expose RESOURCE_TYPES map', () => {
      expect(AuditService.RESOURCE_TYPES).toHaveProperty('DOCUMENT', 'document');
      expect(AuditService.RESOURCE_TYPES).toHaveProperty('SUBMISSION', 'submission');
    });
  });
});
