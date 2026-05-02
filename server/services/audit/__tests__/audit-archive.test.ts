/**
 * Audit archive job tests — verifies the contract:
 *   1. Rows past cutoff are read in batches.
 *   2. Sink receives the batch + checksum.
 *   3. DELETE only fires after the sink confirms a matching checksum.
 *   4. Mismatched checksum leaves rows in the hot table and reports an error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { runAuditArchive, computeBatchHash } from '../audit-archive.service';

type Row = { id: number; created_at: string; tenant_id: number; action: string };

function pgClientWithRows(initialRows: Row[]) {
  let rows = [...initialRows];
  return {
    query: vi.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT * FROM audit_logs')) {
        const cutoff = (params?.[0] as Date).toISOString();
        const limit = params?.[1] as number;
        const eligible = rows
          .filter(r => r.created_at < cutoff)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .slice(0, limit);
        return { rows: eligible };
      }
      if (sql.includes('DELETE FROM audit_logs')) {
        const ids = (params?.[0] as number[]) ?? [];
        rows = rows.filter(r => !ids.includes(r.id));
        return { rows: [], rowCount: ids.length };
      }
      return { rows: [] };
    }),
    _peek: () => rows,
  };
}

const HOT = '2027-01-01T00:00:00.000Z'; // current
const COLD_1 = '2024-01-01T00:00:00.000Z';
const COLD_2 = '2024-06-01T00:00:00.000Z';

describe('runAuditArchive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('archives rows past cutoff and deletes them from hot', async () => {
    const client = pgClientWithRows([
      { id: 1, created_at: COLD_1, tenant_id: 1, action: 'a' },
      { id: 2, created_at: COLD_2, tenant_id: 1, action: 'b' },
      { id: 3, created_at: HOT, tenant_id: 1, action: 'c' },
    ]);
    const sink = {
      writeBatch: vi.fn(async ({ rows, sha256 }: any) => ({
        storedSha256: sha256,
        locator: 'mem',
      })),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01T00:00:00Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(2);
    expect(result.batches).toBe(1);
    expect(result.errors).toEqual([]);
    expect(sink.writeBatch).toHaveBeenCalledTimes(1);
    expect(client._peek().map(r => r.id)).toEqual([3]);
  });

  it('does NOT delete from hot when the sink reports a checksum mismatch', async () => {
    const client = pgClientWithRows([
      { id: 1, created_at: COLD_1, tenant_id: 1, action: 'a' },
    ]);
    const sink = {
      writeBatch: vi.fn(async () => ({ storedSha256: 'wrong', locator: 'mem' })),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(0);
    expect(result.errors[0]).toContain('Checksum mismatch');
    // Row remains in hot.
    expect(client._peek().map(r => r.id)).toEqual([1]);
  });

  it('aborts on sink throw and leaves rows in hot', async () => {
    const client = pgClientWithRows([
      { id: 1, created_at: COLD_1, tenant_id: 1, action: 'a' },
    ]);
    const sink = {
      writeBatch: vi.fn(async () => {
        throw new Error('S3 down');
      }),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(0);
    expect(result.errors[0]).toContain('Sink write failed');
    expect(client._peek().length).toBe(1);
  });

  it('chunks large datasets into multiple batches', async () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      tenant_id: 1,
      action: 'a',
    }));
    const client = pgClientWithRows(rows);
    const sink = {
      writeBatch: vi.fn(async ({ sha256 }: any) => ({
        storedSha256: sha256,
        locator: 'mem',
      })),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.batches).toBe(3); // 10 + 10 + 5
    expect(result.rowsArchived).toBe(25);
    expect(client._peek().length).toBe(0);
  });

  it('respects maxBatches as a time-box', async () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      tenant_id: 1,
      action: 'a',
    }));
    const client = pgClientWithRows(rows);
    const sink = {
      writeBatch: vi.fn(async ({ sha256 }: any) => ({
        storedSha256: sha256,
        locator: 'mem',
      })),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      maxBatches: 1,
      sink,
    });

    expect(result.batches).toBe(1);
    expect(result.rowsArchived).toBe(10);
    expect(client._peek().length).toBe(15);
  });

  it('returns zero work when nothing past cutoff', async () => {
    const client = pgClientWithRows([
      { id: 1, created_at: HOT, tenant_id: 1, action: 'a' },
    ]);
    const sink = {
      writeBatch: vi.fn(),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(0);
    expect(result.batches).toBe(0);
    expect(sink.writeBatch).not.toHaveBeenCalled();
  });
});

describe('computeBatchHash', () => {
  it('produces the same hash for the same rows regardless of key order', () => {
    const a = computeBatchHash([{ a: 1, b: 2, c: 3 }]);
    const b = computeBatchHash([{ c: 3, a: 1, b: 2 }]);
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = computeBatchHash([{ a: 1 }]);
    const b = computeBatchHash([{ a: 2 }]);
    expect(a).not.toBe(b);
  });
});
