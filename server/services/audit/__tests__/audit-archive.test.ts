/**
 * Audit archive job tests — verifies the contract:
 *   1. Rows past cutoff are read in batches.
 *   2. Sink receives the batch + checksum.
 *   3. The database's archive door — public.audit_logs_archive_delete(ids,
 *      locator, sha256, cutoff) — is called only after the sink confirms a
 *      matching checksum, once per batch, with exactly those arguments.
 *   4. Mismatched checksum leaves rows in the hot table and reports an error.
 *   5. A refusal by the door aborts the batch, is counted (`deleteRefusals`)
 *      and reported (`errors`); rows stay.
 *   6. The service never opens the trigger with a session setting and never
 *      issues a raw DELETE (security audit 2026-09-24 DP-04, plan P0-8a).
 *
 * The door itself is exercised on a real engine in
 * audit-archive-delete-door.pglite.integration.test.ts; here it is a stand-in
 * that behaves as the function does (deletes exactly the named rows, or throws).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAuditArchive, computeBatchHash } from '../audit-archive.service';

type Row = { id: string; created_at: string; tenant_id: number; action: string };

const DOOR = 'audit_logs_archive_delete';
const SHA_OK = /^[0-9a-f]{64}$/;

function pgClientWithRows(
  initialRows: Row[],
  opts: { refuseDoor?: (ids: string[]) => Error | null; poolShaped?: boolean } = {},
) {
  let rows = [...initialRows];
  const client: any = {
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
      if (sql.includes(DOOR)) {
        const [ids, locator, sha256, cutoff] = params as [string[], string, string, Date];
        const refusal = opts.refuseDoor?.(ids) ?? null;
        if (refusal) throw refusal;
        // What the real function does before deleting: every check fails closed.
        if (!ids.length) throw new Error('AUDIT_ARCHIVE_REFUSED: the batch names no rows');
        if (!locator || !locator.trim()) throw new Error('AUDIT_ARCHIVE_REFUSED: the archive locator is empty');
        if (!SHA_OK.test(sha256)) throw new Error('AUDIT_ARCHIVE_REFUSED: the archive sha256 is missing or is not a 64-hex-character digest');
        const named = rows.filter(r => ids.includes(r.id));
        if (named.length !== ids.length) throw new Error('AUDIT_ARCHIVE_REFUSED: named rows are not in audit_logs');
        if (named.some(r => r.created_at >= cutoff.toISOString())) {
          throw new Error('AUDIT_ARCHIVE_REFUSED: the batch contains a row newer than the cutoff');
        }
        rows = rows.filter(r => !ids.includes(r.id));
        return { rows: [{ deleted: named.length }], rowCount: 1 };
      }
      throw new Error(`unexpected statement from the archive service: ${sql}`);
    }),
    _peek: () => rows,
  };
  if (opts.poolShaped) {
    // A Pool exposes connect(); the service must not need it for a one-statement door.
    client.connect = vi.fn(async () => {
      throw new Error('the archive service checked out a dedicated connection it no longer needs');
    });
  }
  return client;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HOT = '2027-01-01T00:00:00.000Z'; // current
const COLD_1 = '2024-01-01T00:00:00.000Z';
const COLD_2 = '2024-06-01T00:00:00.000Z';
const okSink = () => ({
  writeBatch: vi.fn(async ({ sha256 }: any) => ({ storedSha256: sha256, locator: 's3://audit-archive/2026/09/25/b.json' })),
});

describe('runAuditArchive', () => {
  beforeEach(() => vi.clearAllMocks());

  it('archives rows past cutoff and removes them from hot through the door', async () => {
    const client = pgClientWithRows([
      { id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' },
      { id: uuid(2), created_at: COLD_2, tenant_id: 1, action: 'b' },
      { id: uuid(3), created_at: HOT, tenant_id: 1, action: 'c' },
    ]);
    const sink = okSink();

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01T00:00:00Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(2);
    expect(result.batches).toBe(1);
    expect(result.deleteRefusals).toBe(0);
    expect(result.errors).toEqual([]);
    expect(sink.writeBatch).toHaveBeenCalledTimes(1);
    expect(client._peek().map((r: Row) => r.id)).toEqual([uuid(3)]);
  });

  it('calls the door once per batch with the ids, the sink locator, the stored checksum and the cutoff, after the sink confirmed', async () => {
    const client = pgClientWithRows([
      { id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' },
      { id: uuid(2), created_at: COLD_2, tenant_id: 2, action: 'b' },
    ]);
    const sink = okSink();
    const cutoff = new Date('2025-01-01T00:00:00Z');

    await runAuditArchive(client as any, { olderThan: cutoff, batchSize: 10, sink });

    const doorCalls = client.query.mock.calls.filter(([sql]: [string]) => sql.includes(DOOR));
    expect(doorCalls).toHaveLength(1);
    const [sql, params] = doorCalls[0];
    expect(sql).toMatch(/SELECT public\.audit_logs_archive_delete\(\$1::uuid\[\], \$2, \$3, \$4::timestamptz\) AS deleted/);
    const expectedSha = computeBatchHash([
      { id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' },
      { id: uuid(2), created_at: COLD_2, tenant_id: 2, action: 'b' },
    ]);
    expect(params).toEqual([[uuid(1), uuid(2)], 's3://audit-archive/2026/09/25/b.json', expectedSha, cutoff]);
    // Order: sink first, door second.
    const sinkOrder = sink.writeBatch.mock.invocationCallOrder[0];
    const doorOrder = client.query.mock.invocationCallOrder[client.query.mock.calls.indexOf(doorCalls[0])];
    expect(sinkOrder).toBeLessThan(doorOrder);
  });

  it('never opens the trigger with a session setting and never issues a raw DELETE', async () => {
    const client = pgClientWithRows([{ id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' }]);
    await runAuditArchive(client as any, { olderThan: new Date('2025-01-01Z'), batchSize: 10, sink: okSink() });
    for (const [sql] of client.query.mock.calls as [string][]) {
      expect(sql).not.toMatch(/audit_archive_bypass/);
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK|SET)\b/i);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+audit_logs/i);
    }
    // Comments stripped: the header may name the retired GUC as history; the code may not use it.
    const src = fs
      .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'audit-archive.service.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/audit_archive_bypass/);
    expect(src).not.toMatch(/DELETE\s+FROM\s+audit_logs/i);
  });

  it('a refusal by the door aborts the batch, is counted and reported, and leaves the rows in hot', async () => {
    const client = pgClientWithRows(
      [
        { id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' },
        { id: uuid(2), created_at: COLD_2, tenant_id: 1, action: 'b' },
      ],
      {
        refuseDoor: () =>
          Object.assign(new Error('AUDIT_ARCHIVE_REFUSED: cutoff 2026-09-01 is inside the 24-month hot window'), { code: 'P0A04' }),
      },
    );
    const sink = okSink();

    const result = await runAuditArchive(client as any, { olderThan: new Date('2025-01-01Z'), batchSize: 1, sink });

    expect(result.rowsArchived).toBe(0);
    expect(result.batches).toBe(0);
    expect(result.deleteRefusals).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Archive delete refused');
    expect(result.errors[0]).toContain('AUDIT_ARCHIVE_REFUSED');
    expect(result.errors[0]).toContain('s3://audit-archive/2026/09/25/b.json');
    expect(result.errors[0]).toContain('Rows remain in hot table');
    // The run stopped at the refused batch: no second batch was read or shipped.
    expect(sink.writeBatch).toHaveBeenCalledTimes(1);
    expect(client._peek()).toHaveLength(2);
  });

  it('a door that reports a count other than the batch size is treated as a refusal', async () => {
    const client = pgClientWithRows([{ id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' }]);
    client.query.mockImplementationOnce(async () => ({ rows: [{ id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' }] }));
    client.query.mockImplementationOnce(async () => ({ rows: [{ deleted: 0 }] }));

    const result = await runAuditArchive(client as any, { olderThan: new Date('2025-01-01Z'), batchSize: 10, sink: okSink() });

    expect(result.rowsArchived).toBe(0);
    expect(result.deleteRefusals).toBe(1);
    expect(result.errors[0]).toMatch(/returned 0 for a batch of 1/);
  });

  it('works on a Pool-shaped client without checking out a dedicated connection', async () => {
    const client = pgClientWithRows([{ id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' }], { poolShaped: true });

    const result = await runAuditArchive(client as any, { olderThan: new Date('2025-01-01Z'), batchSize: 10, sink: okSink() });

    expect(result.errors).toEqual([]);
    expect(result.rowsArchived).toBe(1);
    expect(client.connect).not.toHaveBeenCalled();
  });

  it('does NOT call the door when the sink reports a checksum mismatch', async () => {
    const client = pgClientWithRows([{ id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' }]);
    const sink = {
      writeBatch: vi.fn(async () => ({ storedSha256: 'wrong', locator: 'mem' })),
    };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(0);
    expect(result.deleteRefusals).toBe(0);
    expect(result.errors[0]).toContain('Checksum mismatch');
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes(DOOR))).toBe(false);
    // Row remains in hot.
    expect(client._peek().map((r: Row) => r.id)).toEqual([uuid(1)]);
  });

  it('aborts on sink throw and leaves rows in hot', async () => {
    const client = pgClientWithRows([{ id: uuid(1), created_at: COLD_1, tenant_id: 1, action: 'a' }]);
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
    expect(client.query.mock.calls.some(([sql]: [string]) => sql.includes(DOOR))).toBe(false);
    expect(client._peek().length).toBe(1);
  });

  it('chunks large datasets into multiple batches, one door call each', async () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: uuid(i + 1),
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      tenant_id: 1,
      action: 'a',
    }));
    const client = pgClientWithRows(rows);
    const sink = okSink();

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.batches).toBe(3); // 10 + 10 + 5
    expect(result.rowsArchived).toBe(25);
    expect(client.query.mock.calls.filter(([sql]: [string]) => sql.includes(DOOR))).toHaveLength(3);
    expect(client._peek().length).toBe(0);
  });

  it('respects maxBatches as a time-box', async () => {
    const rows: Row[] = Array.from({ length: 25 }, (_, i) => ({
      id: uuid(i + 1),
      created_at: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      tenant_id: 1,
      action: 'a',
    }));
    const client = pgClientWithRows(rows);

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      maxBatches: 1,
      sink: okSink(),
    });

    expect(result.batches).toBe(1);
    expect(result.rowsArchived).toBe(10);
    expect(client._peek().length).toBe(15);
  });

  it('returns zero work when nothing past cutoff', async () => {
    const client = pgClientWithRows([{ id: uuid(1), created_at: HOT, tenant_id: 1, action: 'a' }]);
    const sink = { writeBatch: vi.fn() };

    const result = await runAuditArchive(client as any, {
      olderThan: new Date('2025-01-01Z'),
      batchSize: 10,
      sink,
    });

    expect(result.rowsArchived).toBe(0);
    expect(result.batches).toBe(0);
    expect(result.deleteRefusals).toBe(0);
    expect(sink.writeBatch).not.toHaveBeenCalled();
  });

  it('the default cutoff is never inside the 24-month floor the door enforces', async () => {
    const client = pgClientWithRows([]);
    const before = Date.now();
    const result = await runAuditArchive(client as any, { batchSize: 10, sink: okSink() });
    const cutoff = new Date(result.cutoff);
    const floor = new Date(before);
    floor.setUTCMonth(floor.getUTCMonth() - 24);
    expect(cutoff.getTime()).toBeLessThanOrEqual(floor.getTime());
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
