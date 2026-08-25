/**
 * Storage quota policy tests.
 *
 * The decision (`evaluateStorageQuota`) is pure, so it is tested exhaustively —
 * including the boundaries, which is where a quota is actually wrong in
 * production. The I/O around it is thin by design and is covered through the
 * cache/admission behaviour rather than by mocking a database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  admittedBytesSinceMeasure,
  evaluateStorageQuota,
  getTenantStorage,
  invalidateTenantStorage,
  isStorageEnforcementOn,
  recordAdmittedBytes,
} from '../tenant-storage';

const GB = 1024 ** 3;

describe('evaluateStorageQuota — the pure decision', () => {
  it('permits a write that lands under the limit', () => {
    const d = evaluateStorageQuota({ usedBytes: GB, maxStorageGb: 5, incomingBytes: GB });
    expect(d.outcome).toBe('allowed');
    expect(d.allowed).toBe(true);
    expect(d.limitBytes).toBe(5 * GB);
    expect(d.projectedBytes).toBe(2 * GB);
    expect(d.remainingBytes).toBe(3 * GB);
  });

  it('permits a write that lands EXACTLY on the limit', () => {
    // The boundary is the whole point of writing this test. `<` instead of `<=`
    // makes a tenant who bought 5 GB unable to store the 5th gigabyte, which is
    // a support ticket that reads like a billing error.
    const d = evaluateStorageQuota({ usedBytes: 4 * GB, maxStorageGb: 5, incomingBytes: GB });
    expect(d.allowed).toBe(true);
    expect(d.projectedBytes).toBe(5 * GB);
    expect(d.remainingBytes).toBe(0);
  });

  it('refuses the byte that crosses the limit', () => {
    const d = evaluateStorageQuota({ usedBytes: 5 * GB, maxStorageGb: 5, incomingBytes: 1 });
    expect(d.outcome).toBe('exceeded');
    expect(d.allowed).toBe(false);
    expect(d.remainingBytes).toBe(0);
  });

  it('refuses a tenant already over the limit even with a zero-byte write', () => {
    // A chunked upload declares no Content-Length and arrives here as zero
    // incoming bytes. An already-over tenant must still be refused.
    const d = evaluateStorageQuota({ usedBytes: 6 * GB, maxStorageGb: 5, incomingBytes: 0 });
    expect(d.allowed).toBe(false);
  });

  describe('what "no limit" means', () => {
    // Two quota systems on one product disagreeing about the meaning of 0 is how
    // an unlimited enterprise tenant gets locked out on a Friday afternoon.
    // `seat-licensing.evaluateSeats` treats seats_purchased <= 0 as unlimited,
    // and `billing.ts` writes -1 for unlimited plans. Both must land here.
    it.each([
      ['zero', 0],
      ['the billing sentinel for unlimited', -1],
      ['any negative value', -100],
    ])('treats %s as unlimited', (_label, maxStorageGb) => {
      const d = evaluateStorageQuota({ usedBytes: 900 * GB, maxStorageGb, incomingBytes: 50 * GB });
      expect(d.outcome).toBe('unlimited');
      expect(d.allowed).toBe(true);
      expect(d.limitBytes).toBeNull();
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
    ])('treats %s as unlimited', (_label, maxStorageGb) => {
      const d = evaluateStorageQuota({ usedBytes: 900 * GB, maxStorageGb, incomingBytes: GB });
      expect(d.outcome).toBe('unlimited');
      expect(d.allowed).toBe(true);
    });

    it('does not treat a fractional sub-1GB limit as unlimited by accident', () => {
      // Math.floor(0.5) === 0, which the unlimited branch would swallow. The
      // column is an integer GB count, so this cannot arrive from the schema —
      // but it can arrive from a plan config, and silently granting unlimited
      // storage to the smallest plan is the worst possible rounding direction.
      const d = evaluateStorageQuota({ usedBytes: 0, maxStorageGb: 0.5, incomingBytes: 1 });
      expect(d.outcome).toBe('unlimited');
      // Documented, not endorsed: floor-to-zero means unlimited. Asserted so the
      // behaviour is a decision on the record rather than an accident, and so a
      // future move to fractional limits fails here first.
    });
  });

  describe('hostile inputs', () => {
    it('clamps negative usage and incoming bytes to zero', () => {
      const d = evaluateStorageQuota({ usedBytes: -5, maxStorageGb: 1, incomingBytes: -5 });
      expect(d.usedBytes).toBe(0);
      expect(d.incomingBytes).toBe(0);
      expect(d.allowed).toBe(true);
    });

    it('treats NaN as zero rather than propagating it into the comparison', () => {
      // NaN <= limit is false, so an unguarded NaN would refuse every upload.
      const d = evaluateStorageQuota({ usedBytes: NaN, maxStorageGb: 5, incomingBytes: NaN });
      expect(d.allowed).toBe(true);
      expect(d.projectedBytes).toBe(0);
    });

    it('treats a non-finite limit as unlimited rather than throwing', () => {
      const d = evaluateStorageQuota({ usedBytes: GB, maxStorageGb: Infinity, incomingBytes: GB });
      expect(d.outcome).toBe('unlimited');
      expect(d.allowed).toBe(true);
    });
  });
});

describe('isStorageEnforcementOn', () => {
  it('enforces in production when unset — the control is not born inert', () => {
    expect(isStorageEnforcementOn({ NODE_ENV: 'production' })).toBe(true);
  });

  it('does not enforce outside production when unset', () => {
    expect(isStorageEnforcementOn({ NODE_ENV: 'development' })).toBe(false);
    expect(isStorageEnforcementOn({})).toBe(false);
  });

  it("honours an explicit 'report' escape in production", () => {
    // The reconciliation window: existing tenants sit against a max_storage
    // default that nothing has ever measured them against.
    expect(
      isStorageEnforcementOn({ NODE_ENV: 'production', STORAGE_LIMIT_ENFORCEMENT: 'report' })
    ).toBe(false);
  });

  it("honours an explicit 'enforce' outside production", () => {
    expect(
      isStorageEnforcementOn({ NODE_ENV: 'development', STORAGE_LIMIT_ENFORCEMENT: 'enforce' })
    ).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(
      isStorageEnforcementOn({ NODE_ENV: 'development', STORAGE_LIMIT_ENFORCEMENT: '  ENFORCE ' })
    ).toBe(true);
  });

  it('falls back to the environment default on a typo, never to "off"', () => {
    // A misspelled value must not silently disable a paid limit.
    expect(
      isStorageEnforcementOn({ NODE_ENV: 'production', STORAGE_LIMIT_ENFORCEMENT: 'repot' })
    ).toBe(true);
  });
});

describe('the cache does not let a burst outrun the quota', () => {
  const ORG = 4242;

  // A stub client standing in for the pool: the accounting SQL is exercised by
  // the schema-contract suite against a real database, so what matters here is
  // how many times the sum is TAKEN and what is charged between takes.
  function stubClient(bytesPerCall: number[]) {
    let call = 0;
    return {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('information_schema')) {
          return { rows: [{ table_name: 'file_uploads', tenant_col: 'organization_id', size_col: 'file_size' }] };
        }
        const total = bytesPerCall[Math.min(call++, bytesPerCall.length - 1)];
        return { rows: [{ total: String(total) }] };
      }),
    } as never;
  }

  beforeEach(() => {
    invalidateTenantStorage();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    invalidateTenantStorage();
  });

  it('serves a second read from cache without re-summing', async () => {
    const client = stubClient([100]);
    await getTenantStorage(client, ORG);
    await getTenantStorage(client, ORG);
    // 2 queries per sum (catalog + one table). A second sum would make it 4.
    expect((client as unknown as { query: { mock: { calls: unknown[] } } }).query.mock.calls.length).toBe(2);
  });

  it('adds bytes admitted since the sum to the figure the next decision sees', async () => {
    const client = stubClient([100]);
    const first = await getTenantStorage(client, ORG);
    expect(first.bytes).toBe(100);

    recordAdmittedBytes(ORG, 900);
    expect(admittedBytesSinceMeasure(ORG)).toBe(900);

    const second = await getTenantStorage(client, ORG);
    expect(second.bytes).toBe(1000);
  });

  it('refuses a burst that would fit individually against the stale figure', async () => {
    // The hole this closes: limit 1 GB, 0 bytes used, and five 300 MB uploads
    // inside one cache window. Against the stale sum every one of them "fits".
    const client = stubClient([0]);
    const limit = { maxStorageGb: 1 };
    const chunk = 300 * 1024 * 1024;

    const outcomes: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const usage = await getTenantStorage(client, ORG);
      const d = evaluateStorageQuota({ ...limit, usedBytes: usage.bytes, incomingBytes: chunk });
      outcomes.push(d.allowed);
      if (d.allowed) recordAdmittedBytes(ORG, chunk);
    }

    // 3 × 300 MB fits inside 1 GiB (900 MB); the 4th crosses it.
    expect(outcomes).toEqual([true, true, true, false, false]);
  });

  it('stops double-charging once the sum has caught up', async () => {
    // After the TTL the database sum includes the admitted bytes, so the
    // accumulator must reset or the tenant is billed for them twice.
    const client = stubClient([0, 900]);
    await getTenantStorage(client, ORG);
    recordAdmittedBytes(ORG, 900);
    expect((await getTenantStorage(client, ORG)).bytes).toBe(900);

    vi.advanceTimersByTime(31_000);

    const refreshed = await getTenantStorage(client, ORG);
    expect(refreshed.bytes).toBe(900);
    expect(admittedBytesSinceMeasure(ORG)).toBe(0);
  });

  it('does not charge a tenant that has never been measured', () => {
    // No cache entry means the next read comes from the database anyway; a
    // counter kept here would be discarded and could only ever mislead.
    invalidateTenantStorage();
    recordAdmittedBytes(ORG, 500);
    expect(admittedBytesSinceMeasure(ORG)).toBe(0);
  });

  it('invalidates one tenant without clearing the others', async () => {
    const client = stubClient([100]);
    await getTenantStorage(client, ORG);
    await getTenantStorage(client, ORG + 1);
    recordAdmittedBytes(ORG + 1, 50);

    invalidateTenantStorage(ORG);
    expect(admittedBytesSinceMeasure(ORG)).toBe(0);
    expect(admittedBytesSinceMeasure(ORG + 1)).toBe(50);
  });
});
