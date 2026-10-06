/**
 * The tenant purge records itself, on its own transaction (P1-23 part, DP-10
 * residual).
 *
 * A fake pool records every statement and which connection ran it, so these
 * cases assert where the audit row is written: on the purge's transaction
 * client, after the deletes and the status change, before COMMIT — and that a
 * refused audit row rolls the purge back. The real-database counterpart, with
 * the chain verified and the row surviving the full purge list, is
 * tests/db/tenant-purge-audit.dbtest.ts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OffboardingStateError, PURGE_CHILD_TABLES, PURGE_RETAINED_RECORDS, purgeTenant } from '../tenant-offboarding';

vi.mock('../../../middleware/orgMembership', () => ({
  invalidateOrgMembershipCache: vi.fn(),
}));

const ORG = 42;
const ACTOR = 7;
const DIGEST = 'sha256:abc';
const EXPORTED_AT = new Date('2026-09-20T10:00:00Z');
const PURGED_AT = new Date('2026-10-01T06:00:00Z');

type Statement = { via: 'pool' | 'client'; text: string; params?: unknown[] };

function orgRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORG,
    name: 'Acme Bio',
    status: 'pending_deletion',
    deletion_requested_at: new Date('2026-08-01T00:00:00Z'),
    deletion_requested_by: 3,
    deletion_reason: 'contract ended',
    purge_eligible_at: new Date(Date.now() - 86_400_000),
    purged_at: null,
    final_export_digest: null,
    ...overrides,
  };
}

function makePool(opts: { refuseAudit?: boolean } = {}) {
  const statements: Statement[] = [];
  const respond = (via: Statement['via']) => async (text: string, params?: unknown[]) => {
    statements.push({ via, text, params });
    if (opts.refuseAudit && /INSERT INTO audit_logs/.test(text)) {
      throw Object.assign(new Error('audit store refused the row'), { code: '42501' });
    }
    if (/FROM tenant_export_receipts/.test(text)) {
      return {
        rows: [
          { organization_id: ORG, digest: DIGEST, table_count: 12, row_count: 340, created_at: EXPORTED_AT, created_by: 3 },
        ],
      };
    }
    if (/SELECT id, name, status/.test(text)) return { rows: [orgRow()] };
    if (/^DELETE FROM projects/.test(text)) return { rows: [], rowCount: 4 };
    if (/^DELETE FROM documents/.test(text)) return { rows: [], rowCount: 9 };
    if (/UPDATE organizations/.test(text)) return { rows: [{ purged_at: PURGED_AT }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const pool = {
    statements,
    query: vi.fn(respond('pool')),
    connect: vi.fn(async () => ({ query: vi.fn(respond('client')), release: vi.fn() })),
  };
  return pool as any;
}

const purge = (pool: unknown, purgedByUserId = ACTOR) =>
  purgeTenant(pool as never, {
    organizationId: ORG,
    purgedByUserId,
    preconditions: { finalExportDigest: DIGEST },
    childTables: ['projects', 'documents'],
    auditContext: { ipAddress: '203.0.113.9', userAgent: 'ops-console' },
  });

const indexOf = (statements: Statement[], re: RegExp) => statements.findIndex((s) => re.test(s.text));

beforeEach(() => vi.clearAllMocks());

describe('the purge writes its chained audit row inside its own transaction', () => {
  it('on the transaction client, after the deletes and the status change, before COMMIT', async () => {
    const pool = makePool();
    await purge(pool);

    const s: Statement[] = pool.statements;
    const insert = indexOf(s, /INSERT INTO audit_logs/);
    expect(insert, 'the purge must write an audit row').toBeGreaterThan(-1);
    expect(s[insert].via, 'on the purge’s own transaction, not a side connection').toBe('client');
    expect(insert).toBeGreaterThan(indexOf(s, /^DELETE FROM documents/));
    expect(insert).toBeGreaterThan(indexOf(s, /UPDATE organizations/));
    expect(insert).toBeLessThan(indexOf(s, /^COMMIT$/));
  });

  it('names who purged which organisation, when, the export it relied on, and what it deleted', async () => {
    const pool = makePool();
    await purge(pool);

    const insert = pool.statements.find((x: Statement) => /INSERT INTO audit_logs/.test(x.text));
    const [, tenantId, userId, action, tableName, recordId] = insert.params;
    expect({ tenantId, userId, action, tableName, recordId }).toEqual({
      tenantId: ORG,
      userId: ACTOR,
      action: 'tenant_purged',
      tableName: 'organizations',
      recordId: String(ORG),
    });
    expect(insert.params).toContain('203.0.113.9');
    expect(insert.params).toContain('ops-console');
    expect(insert.params).toContain('contract ended');
    const details = JSON.parse(insert.params[13]);
    expect(details).toMatchObject({
      organizationId: ORG,
      organizationName: 'Acme Bio',
      purgedBy: ACTOR,
      purgedAt: PURGED_AT.toISOString(),
      deletionReason: 'contract ended',
      deletionRequestedBy: 3,
      retentionOverrideReason: null,
      exportManifest: {
        digest: DIGEST,
        tableCount: 12,
        rowCount: 340,
        exportedAt: EXPORTED_AT.toISOString(),
        exportedBy: 3,
      },
      deletedRows: { projects: 4, documents: 9 },
      totalRowsDeleted: 13,
    });
  });

  it('returns the counts it recorded', async () => {
    const result = await purge(makePool());
    expect(result.deletedRows).toEqual({ projects: 4, documents: 9 });
  });
});

describe('fail closed', () => {
  it('a refused audit row rolls the purge back: ROLLBACK, no COMMIT, and the purge rejects', async () => {
    const pool = makePool({ refuseAudit: true });
    await expect(purge(pool)).rejects.toThrow(/audit store refused/);
    const s: Statement[] = pool.statements;
    expect(indexOf(s, /^COMMIT$/), 'nothing commits without its record').toBe(-1);
    expect(indexOf(s, /^ROLLBACK$/)).toBeGreaterThan(indexOf(s, /INSERT INTO audit_logs/));
  });

  it('refuses a purge it cannot attribute to a person, before anything is touched', async () => {
    for (const nobody of [0, -1, Number.NaN, 1.5]) {
      const pool = makePool();
      await expect(purge(pool, nobody)).rejects.toMatchObject({ code: 'PURGE_ACTOR_REQUIRED' });
      expect(pool.connect).not.toHaveBeenCalled();
    }
    await expect(purge(makePool(), 0)).rejects.toBeInstanceOf(OffboardingStateError);
  });
});

describe('the purge cannot reach its own record', () => {
  it('lists neither the audit trail nor the export receipt it relied on', () => {
    for (const kept of ['audit_logs', 'tenant_export_receipts', 'organizations', ...Object.keys(PURGE_RETAINED_RECORDS)]) {
      expect(PURGE_CHILD_TABLES).not.toContain(kept);
    }
  });

  it('refuses a table-list expansion that would erase retained disposition receipts before touching the database', async () => {
    for (const table of ['document_data_dispositions', 'public.document_data_dispositions']) {
      const pool = makePool();
      await expect(purgeTenant(pool, {
        organizationId: ORG, purgedByUserId: ACTOR,
        preconditions: { finalExportDigest: DIGEST }, childTables: ['projects', table],
      })).rejects.toMatchObject({ code: 'PURGE_RETAINED_RECORD' });
      expect(pool.query).not.toHaveBeenCalled();
      expect(pool.connect).not.toHaveBeenCalled();
    }
  });
});
