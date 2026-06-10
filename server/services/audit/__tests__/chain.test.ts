/**
 * Tests for the audit_logs SHA-256 hash chain — writer (computeAuditChain),
 * payload hashing (hashPayload), and the verifier (verifyAuditChain).
 *
 * These functions take an injectable PoolClient ({ query }), so no DB is
 * needed — a fake client returns the rows each test controls. The verifier
 * is the compliance-critical piece (CR-3): it must re-derive the chain with
 * the exact serialization the writer uses and flag the first tampered row.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  computeAuditChain,
  computeAuditChainSealed,
  hashPayload,
  verifyAuditChain,
  verifyAuditChainSeals,
  type ChainRow,
  type PoolClient,
} from '../chain';
import { sealRecord, verifySeal } from '../audit-hmac-seal';

const GENESIS = '0'.repeat(64);

/** A PoolClient that returns a fixed set of rows for any query. */
function fakeClient(rows: Record<string, unknown>[]): PoolClient {
  return { query: async () => ({ rows }) };
}

/**
 * Build a correctly-chained sequence of audit rows from a list of base rows,
 * computing each row's sha256_chain exactly as the writer would (genesis for
 * the first, previous stored hash thereafter). The verifier walks ASC, so we
 * return rows in ascending order.
 */
async function buildChain(bases: ChainRow[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let previous = GENESIS;
  for (let i = 0; i < bases.length; i++) {
    // computeAuditChain reads the latest prior hash via the client; feed it the
    // single previous row so it derives against the correct `previous`.
    const client = fakeClient(previous === GENESIS ? [] : [{ sha256_chain: previous }]);
    const hash = await computeAuditChain(client, bases[i]);
    out.push({ id: String(i + 1), ...bases[i], sha256_chain: hash });
    previous = hash;
  }
  return out;
}

const baseRows: ChainRow[] = [
  { action: 'c2c.work.claim', actor_id: 1, target: 'document:d1', payload_hash: 'p1', occurred_at: '2026-05-29T00:00:00.000Z' },
  { action: 'c2c.work.sign',  actor_id: 2, target: 'document:d1', payload_hash: 'p2', occurred_at: '2026-05-29T00:01:00.000Z' },
  { action: 'c2c.work.lock',  actor_id: 1, target: 'document:d1', payload_hash: 'p3', occurred_at: '2026-05-29T00:02:00.000Z' },
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

describe('computeAuditChain', () => {
  it('uses the genesis hash when no prior row exists', async () => {
    const h1 = await computeAuditChain(fakeClient([]), baseRows[0]);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    // Same row against genesis is stable.
    const again = await computeAuditChain(fakeClient([]), baseRows[0]);
    expect(again).toBe(h1);
  });

  it('chains onto the previous stored hash (order-sensitive)', async () => {
    const h1 = await computeAuditChain(fakeClient([]), baseRows[0]);
    const h2 = await computeAuditChain(fakeClient([{ sha256_chain: h1 }]), baseRows[1]);
    // Linking to a different previous hash changes the result.
    const h2Alt = await computeAuditChain(fakeClient([{ sha256_chain: GENESIS }]), baseRows[1]);
    expect(h2).not.toBe(h2Alt);
  });
});

describe('verifyAuditChain', () => {
  it('reports ok for an intact chain', async () => {
    const rows = await buildChain(baseRows);
    const result = await verifyAuditChain(fakeClient(rows));
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(3);
    expect(result.brokenAt).toBeUndefined();
  });

  it('treats an empty log as ok', async () => {
    const result = await verifyAuditChain(fakeClient([]));
    expect(result.ok).toBe(true);
    expect(result.rowsChecked).toBe(0);
  });

  it('detects a tampered middle row and stops at the first break', async () => {
    const rows = await buildChain(baseRows);
    // Tamper with row 2's content (payload_hash) while leaving its stored
    // hash unchanged — re-derivation must now mismatch.
    rows[1].payload_hash = 'TAMPERED';
    const result = await verifyAuditChain(fakeClient(rows));
    expect(result.ok).toBe(false);
    expect(result.rowsChecked).toBe(2); // stops at the broken row
    expect(result.brokenAt?.id).toBe('2');
    expect(result.brokenAt?.stored).not.toBe(result.brokenAt?.expected);
  });

  it('detects a tampered stored hash on the first row', async () => {
    const rows = await buildChain(baseRows);
    rows[0].sha256_chain = 'f'.repeat(64);
    const result = await verifyAuditChain(fakeClient(rows));
    expect(result.ok).toBe(false);
    expect(result.brokenAt?.id).toBe('1');
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
  };

  afterEach(() => {
    delete process.env.AUDIT_HMAC_KEY;
  });

  it('produces an UNSEALED row (hmacSeal null) when AUDIT_HMAC_KEY is absent', async () => {
    delete process.env.AUDIT_HMAC_KEY;
    const { sha256Chain, hmacSeal } = await computeAuditChainSealed(fakeClient([]), row);
    expect(hmacSeal).toBeNull();
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

  it('verifies a correctly-sealed chain and tolerates interleaved unsealed rows', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    // Build a real sha256 chain, then seal only rows 0 and 2 (row 1 is unsealed).
    const chained = await buildChain(baseRows.concat(baseRows[0]));
    let previous = GENESIS;
    const rows = chained.map((r, i) => {
      const recordHash = r.sha256_chain as string;
      const seal = i === 1 ? null : sealRecord({ recordHash, previousHash: previous, sequenceNumber: 0 }, KEY);
      previous = recordHash;
      return { sha256_chain: recordHash, hmac_seal: seal };
    });
    const ok = await verifyAuditChainSeals(fakeClient(rows));
    expect(ok.valid).toBe(true);
    expect(ok.brokenAt).toBeNull();
  });

  it('detects a tampered seal', async () => {
    process.env.AUDIT_HMAC_KEY = KEY;
    const chained = await buildChain(baseRows);
    let previous = GENESIS;
    const rows = chained.map((r) => {
      const recordHash = r.sha256_chain as string;
      const seal = sealRecord({ recordHash, previousHash: previous, sequenceNumber: 0 }, KEY);
      previous = recordHash;
      return { sha256_chain: recordHash, hmac_seal: seal };
    });
    (rows[0] as any).hmac_seal = 'd'.repeat(64); // tamper the first seal
    const result = await verifyAuditChainSeals(fakeClient(rows));
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });
});
