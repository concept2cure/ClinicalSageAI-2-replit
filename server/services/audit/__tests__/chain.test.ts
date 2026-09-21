/**
 * Tests for the audit_logs SHA-256 hash chain — writer (computeAuditChain /
 * computeAuditChainSealed), payload hashing (hashPayload), the pure walk
 * (walkAuditChain) and the verifiers (verifyAuditChain, verifyAuditChainSeals).
 *
 * These functions take an injectable PoolClient ({ query }), so no DB is
 * needed — a fake client answers each statement the writer issues (tenant
 * lookup, lock, schema check, head read, announcement) from the rows each test
 * controls. What needs a real database — locks, the trigger, row level
 * security — lives in chain-order.pglite.test.ts and chain-concurrency.dbtest.ts.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  computeAuditChain,
  computeAuditChainSealed,
  deriveChainHash,
  hashPayload,
  verifyAuditChain,
  verifyAuditChainSeals,
  walkAuditChain,
  AuditChainPartialViewError,
  AuditChainSchemaMissingError,
  AuditChainTenantUnresolvedError,
  AUDIT_CHAIN_LOCK_CLASS,
  AUDIT_CHAIN_TENANT_GUC,
  type ChainRow,
  type ChainWalkRow,
  type PoolClient,
} from '../chain';
import { sealRecord, verifySeal } from '../audit-hmac-seal';
import { runWithTenantScope } from '../../../db/tenantStore';

const GENESIS = '0'.repeat(64);

interface FakeOptions {
  /** Answer to the connection's app.current_tenant_id lookup. */
  connectionTenant?: string | null;
  /** Whether the fixture reports audit_logs.chain_seq present. */
  ordered?: boolean;
  rlsEnforce?: string | null;
  role?: string | null;
}

interface Fake extends PoolClient {
  calls: Array<{ sql: string; params?: unknown[] }>;
}

/** A PoolClient that answers the writer's/verifier's statements from `rows`. */
function fakeClient(rows: object[], opts: FakeOptions = {}): Fake {
  const calls: Fake['calls'] = [];
  const answer = rows as Record<string, unknown>[];
  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('information_schema.columns')) return { rows: [{ present: opts.ordered ?? true }] };
      if (sql.includes("current_setting('app.current_tenant_id'")) return { rows: [{ tenant: opts.connectionTenant ?? null }] };
      if (sql.includes("current_setting('app.rls_enforce'")) {
        return { rows: [{ rls_enforce: opts.rlsEnforce ?? null, role: opts.role ?? null }] };
      }
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('set_config')) return { rows: [] };
      return { rows: answer };
    },
  };
}

type Base = ChainRow & { id?: string; chain_seq?: number | null };

/**
 * Build a correctly-chained sequence of rows from base rows, in list order,
 * each committing the previous row's hash (genesis for the first) — exactly
 * what the writer produces for one tenant's chain.
 */
function chainRows(bases: Base[], previous: string = GENESIS): ChainWalkRow[] {
  const out: ChainWalkRow[] = [];
  let prev = previous;
  bases.forEach((b, i) => {
    const { id, chain_seq, ...row } = b;
    const hash = deriveChainHash(row, prev);
    out.push({ ...row, id: id ?? String(i + 1), chain_seq: chain_seq ?? null, sha256_chain: hash, hmac_seal: null });
    prev = hash;
  });
  return out;
}

const at = (s: number) => new Date(Date.UTC(2026, 4, 29, 0, 0, s)).toISOString();

/** The same row as an older caller passes it: no tenant of its own. */
function withoutTenant(row: ChainRow): ChainRow {
  const copy: ChainRow = { ...row };
  delete copy.tenant_id;
  return copy;
}

const baseRows: Base[] = [
  { action: 'c2c.work.claim', actor_id: 1, target: 'document:d1', payload_hash: 'p1', occurred_at: at(0), tenant_id: 7, chain_seq: 1 },
  { action: 'c2c.work.sign',  actor_id: 2, target: 'document:d1', payload_hash: 'p2', occurred_at: at(1), tenant_id: 7, chain_seq: 2 },
  { action: 'c2c.work.lock',  actor_id: 1, target: 'document:d1', payload_hash: 'p3', occurred_at: at(2), tenant_id: 7, chain_seq: 3 },
];

describe('hashPayload', () => {
  it('is deterministic for equal payloads', () => {
    expect(hashPayload({ a: 1, b: 2 })).toBe(hashPayload({ a: 1, b: 2 }));
  });

  it('differs for different payloads', () => {
    expect(hashPayload({ a: 1 })).not.toBe(hashPayload({ a: 2 }));
  });

  it('returns a 64-char hex digest', () => {
    expect(hashPayload({ x: 'y' })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('computeAuditChain (writer)', () => {
  const row: ChainRow = { ...baseRows[0] };

  it('uses the genesis hash when the tenant has no prior row', async () => {
    const h1 = await computeAuditChain(fakeClient([]), row);
    expect(h1).toBe(deriveChainHash(row, GENESIS));
    expect(await computeAuditChain(fakeClient([]), row)).toBe(h1);
  });

  it('chains onto the tenant head (order-sensitive)', async () => {
    const h1 = await computeAuditChain(fakeClient([]), baseRows[0]);
    const h2 = await computeAuditChain(fakeClient([{ sha256_chain: h1 }]), baseRows[1]);
    expect(h2).toBe(deriveChainHash(baseRows[1], h1));
    expect(h2).not.toBe(await computeAuditChain(fakeClient([{ sha256_chain: GENESIS }]), baseRows[1]));
  });

  it('locks the tenant chain, reads the tenant head by chain_seq, and announces the position', async () => {
    const client = fakeClient([]);
    await computeAuditChain(client, row);
    const lock = client.calls.find((c) => c.sql.includes('pg_advisory_xact_lock'));
    expect(lock?.params).toEqual([AUDIT_CHAIN_LOCK_CLASS, 7]);
    const head = client.calls.find((c) => c.sql.includes('FROM audit_logs'));
    expect(head?.sql).toContain('tenant_id = $1');
    expect(head?.sql).toContain('chain_seq DESC NULLS LAST, occurred_at DESC, id DESC');
    expect(head?.sql).not.toContain('FOR UPDATE');
    expect(head?.params).toEqual([7]);
    const announce = client.calls.find((c) => c.sql.includes('set_config'));
    expect(announce?.params).toEqual([AUDIT_CHAIN_TENANT_GUC, '7']);
    // The lock precedes the head read; the announcement follows it.
    const order = client.calls.map((c) => c.sql);
    expect(order.findIndex((s) => s.includes('pg_advisory_xact_lock'))).toBeLessThan(order.findIndex((s) => s.includes('FROM audit_logs')));
    expect(order.findIndex((s) => s.includes('FROM audit_logs'))).toBeLessThan(order.findIndex((s) => s.includes('set_config')));
  });

  it('resolves the tenant from the connection when the row carries none', async () => {
    const client = fakeClient([], { connectionTenant: '42' });
    await computeAuditChain(client, withoutTenant(row));
    expect(client.calls.find((c) => c.sql.includes('pg_advisory_xact_lock'))?.params).toEqual([AUDIT_CHAIN_LOCK_CLASS, 42]);
  });

  it('resolves the tenant from the request scope when neither row nor connection carries one', async () => {
    const client = fakeClient([]);
    await runWithTenantScope({ tenantId: '9', orgUuid: null, role: null, source: 'test' }, () => computeAuditChain(client, withoutTenant(row)));
    expect(client.calls.find((c) => c.sql.includes('pg_advisory_xact_lock'))?.params).toEqual([AUDIT_CHAIN_LOCK_CLASS, 9]);
  });

  it('refuses a row whose tenant cannot be resolved outside a test runtime (fail closed)', async () => {
    const saved = { VITEST: process.env.VITEST, NODE_ENV: process.env.NODE_ENV };
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    try {
      await expect(computeAuditChain(fakeClient([]), withoutTenant(row))).rejects.toBeInstanceOf(AuditChainTenantUnresolvedError);
    } finally {
      if (saved.VITEST === undefined) delete process.env.VITEST; else process.env.VITEST = saved.VITEST;
      if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.NODE_ENV;
    }
  });

  it('under vitest, a harness without tenant context gets the legacy recipe: no tenant filter, no announcement', async () => {
    const client = fakeClient([{ sha256_chain: 'a'.repeat(64) }]);
    const { tenantId, previousHash } = await computeAuditChainSealed(client, withoutTenant(row));
    expect(tenantId).toBeNull();
    expect(previousHash).toBe('a'.repeat(64));
    const head = client.calls.find((c) => c.sql.includes('FROM audit_logs'));
    expect(head?.sql).not.toContain('tenant_id');
    expect(head?.sql).toContain('occurred_at DESC, id DESC');
    expect(client.calls.some((c) => c.sql.includes('set_config'))).toBe(false);
    expect(client.calls.find((c) => c.sql.includes('pg_advisory_xact_lock'))?.params).toEqual([AUDIT_CHAIN_LOCK_CLASS, 0]);
  });

  it('refuses to write against a database without chain_seq outside a test runtime', async () => {
    const saved = { VITEST: process.env.VITEST, NODE_ENV: process.env.NODE_ENV };
    delete process.env.VITEST;
    process.env.NODE_ENV = 'production';
    try {
      await expect(computeAuditChain(fakeClient([], { ordered: false }), row)).rejects.toBeInstanceOf(AuditChainSchemaMissingError);
    } finally {
      if (saved.VITEST === undefined) delete process.env.VITEST; else process.env.VITEST = saved.VITEST;
      if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.NODE_ENV;
    }
  });

  it('falls back to the pre-fix order, once warned, only for a test fixture without chain_seq', async () => {
    const client = fakeClient([], { ordered: false });
    await computeAuditChain(client, row);
    const head = client.calls.find((c) => c.sql.includes('FROM audit_logs'));
    expect(head?.sql).toContain('occurred_at DESC, id DESC');
    expect(head?.sql).not.toContain('chain_seq');
  });
});

describe('walkAuditChain (pure)', () => {
  it('verifies an intact per-tenant sequenced chain', () => {
    const rows = chainRows(baseRows);
    const walk = walkAuditChain(rows);
    expect(walk).toMatchObject({ ok: true, rowsChecked: 3, tenants: 1, legacyRows: 0, sequencedRows: 3 });
    expect(walk.links.get('2')).toBe(rows[0].sha256_chain);
  });

  it('keeps chains of different tenants independent', () => {
    const a = chainRows(baseRows);
    const b = chainRows(baseRows.map((r, i) => ({ ...r, id: `b${i}`, tenant_id: 8, occurred_at: at(i), chain_seq: 10 + i })));
    expect(walkAuditChain([...a, ...b])).toMatchObject({ ok: true, rowsChecked: 6, tenants: 2 });
  });

  it('orders sequenced rows by chain_seq, not occurred_at (the F-1 ordering half)', () => {
    // Row 2 was stamped earlier than row 1 but committed after it.
    const rows = chainRows([
      { ...baseRows[0], occurred_at: at(5), chain_seq: 1 },
      { ...baseRows[1], occurred_at: at(1), chain_seq: 2 },
    ]);
    expect(walkAuditChain(rows).ok).toBe(true);
    // The same rows without an order key are walked by occurred_at and break.
    const unordered = rows.map((r) => ({ ...r, chain_seq: null }));
    expect(walkAuditChain(unordered)).toMatchObject({ ok: false, brokenAt: { id: '2', segment: 'legacy' } });
  });

  it('treats an empty log as ok', () => {
    expect(walkAuditChain([])).toMatchObject({ ok: true, rowsChecked: 0, tenants: 0 });
  });

  it('detects a tampered middle row and stops at the first break', () => {
    const rows = chainRows(baseRows);
    rows[1].payload_hash = 'TAMPERED';
    const walk = walkAuditChain(rows);
    expect(walk.ok).toBe(false);
    expect(walk.rowsChecked).toBe(2); // stops at the broken row
    expect(walk.brokenAt).toMatchObject({ id: '2', segment: 'sequenced', tenantId: 7, commitsTo: null });
    expect(walk.brokenAt?.stored).not.toBe(walk.brokenAt?.expected);
  });

  it('detects a tampered stored hash on the first row', () => {
    const rows = chainRows(baseRows);
    rows[0].sha256_chain = 'f'.repeat(64);
    expect(walkAuditChain(rows)).toMatchObject({ ok: false, brokenAt: { id: '1', commitsTo: null } });
  });

  it('accepts legacy rows written under the tenant view AND under the global view', () => {
    // Pre-fix writers: tenant 7's rows on a tenant-scoped connection (they see
    // only tenant 7), tenant 8's rows on an unscoped connection (they see the
    // global head). Both derive from a predecessor their writer could see.
    const t7a = chainRows([{ ...baseRows[0], id: 't7a', occurred_at: at(0), chain_seq: null }]);
    const t8a = chainRows([{ ...baseRows[0], id: 't8a', tenant_id: 8, occurred_at: at(1), chain_seq: null }], t7a[0].sha256_chain);
    const t7b = chainRows([{ ...baseRows[1], id: 't7b', occurred_at: at(2), chain_seq: null }], t7a[0].sha256_chain);
    const t8b = chainRows([{ ...baseRows[1], id: 't8b', tenant_id: 8, occurred_at: at(3), chain_seq: null }], t7b[0].sha256_chain);
    const walk = walkAuditChain([...t7a, ...t8a, ...t7b, ...t8b]);
    expect(walk).toMatchObject({ ok: true, rowsChecked: 4, legacyRows: 4, sequencedRows: 0, tenants: 2 });
  });

  it('names what a broken legacy row actually commits to (fork diagnosis)', () => {
    // Two rows of one tenant both committing to genesis: the pre-fix fork.
    const a = chainRows([{ ...baseRows[0], id: 'a', occurred_at: at(0), chain_seq: null }]);
    const b = chainRows([{ ...baseRows[1], id: 'b', occurred_at: at(1), chain_seq: null }]);
    const walk = walkAuditChain([...a, ...b]);
    expect(walk).toMatchObject({ ok: false, brokenAt: { id: 'b', segment: 'legacy', commitsTo: 'genesis' } });
    // A row committing to a row that is not its predecessor.
    const c = chainRows([{ ...baseRows[2], id: 'c', occurred_at: at(2), chain_seq: null }], a[0].sha256_chain);
    const fork = walkAuditChain([...a, chainRows([{ ...baseRows[1], id: 'b2', occurred_at: at(1), chain_seq: null }], a[0].sha256_chain)[0], ...c]);
    expect(fork.brokenAt).toMatchObject({ id: 'c', commitsTo: { id: 'a', tenantId: 7 } });
  });

  it("anchors a tenant's first sequenced row to its legacy head", () => {
    const legacy = chainRows([
      { ...baseRows[0], id: 'l1', occurred_at: at(0), chain_seq: null },
      { ...baseRows[1], id: 'l2', occurred_at: at(1), chain_seq: null },
    ]);
    const sequenced = chainRows([{ ...baseRows[2], id: 's1', occurred_at: at(2), chain_seq: 1 }], legacy[1].sha256_chain);
    expect(walkAuditChain([...legacy, ...sequenced])).toMatchObject({ ok: true, legacyRows: 2, sequencedRows: 1 });
    // …and refuses one that skipped the legacy head (genesis instead).
    const skipped = chainRows([{ ...baseRows[2], id: 's1', occurred_at: at(2), chain_seq: 1 }]);
    expect(walkAuditChain([...legacy, ...skipped])).toMatchObject({ ok: false, brokenAt: { id: 's1', segment: 'sequenced', commitsTo: 'genesis' } });
  });
});

describe('verifyAuditChain (reader)', () => {
  it('reports ok for an intact chain read from the database', async () => {
    const result = await verifyAuditChain(fakeClient(chainRows(baseRows)));
    expect(result).toMatchObject({ ok: true, rowsChecked: 3 });
    expect(result.brokenAt).toBeUndefined();
    expect((result as unknown as Record<string, unknown>).links).toBeUndefined();
  });

  it('reads every tenant with no tenant predicate, and one tenant with it', async () => {
    const all = fakeClient([]);
    await verifyAuditChain(all);
    expect(all.calls.find((c) => c.sql.includes('FROM audit_logs'))?.sql).not.toContain('tenant_id = $1');
    const one = fakeClient([]);
    await verifyAuditChain(one, { tenantId: 7 });
    const read = one.calls.find((c) => c.sql.includes('FROM audit_logs'));
    expect(read?.sql).toContain('tenant_id = $1');
    expect(read?.params).toEqual([7]);
  });

  it('refuses a cross-tenant verification on a tenant-scoped connection (fail closed)', async () => {
    await expect(verifyAuditChain(fakeClient([], { rlsEnforce: 'on' }))).rejects.toBeInstanceOf(AuditChainPartialViewError);
    await expect(verifyAuditChain(fakeClient([], { rlsEnforce: 'on', role: 'app_super_admin' }))).resolves.toMatchObject({ ok: true });
    await expect(verifyAuditChain(fakeClient([], { rlsEnforce: 'on' }), { tenantId: 7 })).resolves.toMatchObject({ ok: true });
  });
});

describe('computeAuditChainSealed + verifyAuditChainSeals (21 CFR Part 11 §11.70)', () => {
  const KEY = 'test-audit-hmac-key';
  const row: ChainRow = {
    action: 'demo.action',
    actor_id: 7,
    target: 'case:1',
    payload_hash: 'a'.repeat(64),
    occurred_at: '2026-06-09T00:00:00.000Z',
    tenant_id: 3,
  };

  afterEach(() => {
    delete process.env.AUDIT_HMAC_KEY;
  });

  it('produces an UNSEALED row (hmacSeal null) when AUDIT_HMAC_KEY is absent', async () => {
    delete process.env.AUDIT_HMAC_KEY;
    const { sha256Chain, hmacSeal, tenantId } = await computeAuditChainSealed(fakeClient([]), row);
    expect(hmacSeal).toBeNull();
    expect(tenantId).toBe(3);
    // The stored chain hash is identical to the unsealed writer's output.
    expect(sha256Chain).toBe(await computeAuditChain(fakeClient([]), row));
  });

  it('produces a verifiable seal when AUDIT_HMAC_KEY is set', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    const { sha256Chain, previousHash, hmacSeal } = await computeAuditChainSealed(fakeClient([]), row);
    expect(previousHash).toBe(GENESIS);
    expect(hmacSeal).not.toBeNull();
    expect(verifySeal({ recordHash: sha256Chain, previousHash, sequenceNumber: 0 }, hmacSeal!, KEY)).toBe(true);
    // A different key must not verify.
    expect(verifySeal({ recordHash: sha256Chain, previousHash, sequenceNumber: 0 }, hmacSeal!, 'other')).toBe(false);
  });

  function sealed(rows: ChainWalkRow[], skip: number[] = []): ChainWalkRow[] {
    const walk = walkAuditChain(rows);
    return rows.map((r, i) => ({
      ...r,
      hmac_seal: skip.includes(i)
        ? null
        : sealRecord({ recordHash: r.sha256_chain, previousHash: walk.links.get(r.id)!, sequenceNumber: 0 }, KEY),
    }));
  }

  it('verifies a correctly-sealed chain and tolerates interleaved unsealed rows', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    const rows = sealed(chainRows(baseRows.concat({ ...baseRows[0], occurred_at: at(3), chain_seq: 4 })), [1]);
    expect(await verifyAuditChainSeals(fakeClient(rows))).toEqual({ valid: true, brokenAt: null });
  });

  it('detects a tampered seal', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    const rows = sealed(chainRows(baseRows));
    rows[0].hmac_seal = 'd'.repeat(64); // tamper the first seal
    expect(await verifyAuditChainSeals(fakeClient(rows))).toEqual({ valid: false, brokenAt: 0 });
  });

  it('fails closed on a sealed row the chain walk cannot link', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    const rows = sealed(chainRows(baseRows));
    rows[1].payload_hash = 'TAMPERED'; // chain breaks at row 2; its seal cannot be checked
    expect(await verifyAuditChainSeals(fakeClient(rows))).toEqual({ valid: false, brokenAt: 1 });
  });
});
