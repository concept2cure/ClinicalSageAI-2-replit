/**
 * The kernel hash-chain verifier must tell the truth (ledger C-42).
 *
 * `/kernel/hash-chain/verify` is a 21 CFR Part 11 tamper-evidence surface, and it
 * was a false assurance: `verifyPersistentKernelHashChain` returned `valid: true`
 * for THREE different situations — a verified chain, persistence disabled, AND an
 * empty table — so an operator reading `valid: true` could not tell an intact
 * audit chain from an absent one. Worse, the chain query selected `entry_hash` /
 * `prev_hash`, columns `ana_kernel_decision_log` does not actually have; the only
 * reason it never 500'd is that nothing writes the table, so the empty-table
 * early return fired first. It reported "hash chain valid" for a log that has no
 * chain, no data, and a query that could not run against a populated table.
 *
 * These cases pin the honest contract: `valid` is a real boolean ONLY when a
 * populated chain was actually checked, `null` otherwise, and a discriminated
 * `status` names which situation holds — including the current reality that the
 * table carries no chain columns (`unavailable`), which the old code masked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const h = vi.hoisted(() => ({ pool: null as unknown }));
vi.mock('../../server/db', () => ({
  getPool: () => h.pool,
  get pool() {
    return h.pool;
  },
}));

let pg: PGlite;
type Verify = typeof import('../../server/src/control-plane/persistent-queries');
let verifyPersistentKernelHashChain: Verify['verifyPersistentKernelHashChain'];

/** A node-pg-shaped shim: single-statement queries, which is all the verifier issues. */
function poolShim(db: PGlite) {
  return {
    query: async (text: string, params?: unknown[]) => {
      const r = await db.query(text, params);
      return { rows: r.rows, rowCount: r.rows.length };
    },
  };
}

beforeEach(async () => {
  pg = new PGlite();
  h.pool = poolShim(pg);
  process.env.ANA_KERNEL_PERSIST = 'true';
  vi.resetModules();
  ({ verifyPersistentKernelHashChain } = await import(
    '../../server/src/control-plane/persistent-queries'
  ));
});

afterEach(async () => {
  delete process.env.ANA_KERNEL_PERSIST;
  await pg.close();
});

/** The table WITH the chain columns a real tamper-evident log would carry. */
async function createChainTable() {
  await pg.exec(`
    CREATE TABLE ana_kernel_decision_log (
      id BIGSERIAL PRIMARY KEY,
      entry_hash TEXT,
      prev_hash TEXT,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

describe('C-42: never claims validity it did not establish', () => {
  it('persistence disabled → status "disabled", valid null (not true)', async () => {
    delete process.env.ANA_KERNEL_PERSIST;
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('disabled');
    expect(v.valid).toBeNull();
  });

  it('the CURRENT reality — table exists with no chain columns → "unavailable", valid null', async () => {
    // This is the exact production shape of ana_kernel_decision_log: it records
    // decisions but has no entry_hash/prev_hash. The old verifier reported this as
    // valid: true.
    await pg.exec(`CREATE TABLE ana_kernel_decision_log (id BIGSERIAL PRIMARY KEY, final_decision TEXT);`);
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('unavailable');
    expect(v.valid).toBeNull();
    expect(v.error).toMatch(/no entry_hash\/prev_hash|not a tamper-evident/i);
  });

  it('table absent entirely → "unavailable", valid null, names the missing table', async () => {
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('unavailable');
    expect(v.valid).toBeNull();
    expect(v.error).toMatch(/not provisioned/i);
  });

  it('empty populated-shape table → status "empty", valid null (not true)', async () => {
    await createChainTable();
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('empty');
    expect(v.valid).toBeNull();
    expect(v.totalRows).toBe(0);
  });
});

describe('C-42: real verification when a populated chain exists', () => {
  it('a well-formed chain → status "verified", valid true', async () => {
    await createChainTable();
    await pg.exec(`
      INSERT INTO ana_kernel_decision_log (entry_hash, prev_hash) VALUES
        ('h1', NULL),   -- genesis
        ('h2', 'h1'),
        ('h3', 'h2');
    `);
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('verified');
    expect(v.valid).toBe(true);
    expect(v.totalRows).toBe(3);
    expect(v.firstBrokenId).toBeNull();
  });

  it('a broken LINK → status "broken", valid false, points at the first bad row', async () => {
    await createChainTable();
    await pg.exec(`
      INSERT INTO ana_kernel_decision_log (entry_hash, prev_hash) VALUES
        ('h1', NULL),
        ('h2', 'h1'),
        ('h3', 'WRONG');  -- prev_hash does not match h2
    `);
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('broken');
    expect(v.valid).toBe(false);
    expect(v.firstBrokenId).toBe(3);
  });

  it('a broken GENESIS (front-deleted chain) → status "broken", valid false', async () => {
    // If rows are deleted from the front, the new earliest row still links to its
    // successor — only the genesis check catches it.
    await createChainTable();
    await pg.exec(`
      INSERT INTO ana_kernel_decision_log (entry_hash, prev_hash) VALUES
        ('h2', 'h1'),   -- earliest row, but prev_hash is a real hash, not genesis
        ('h3', 'h2');
    `);
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('broken');
    expect(v.valid).toBe(false);
  });

  it('accepts an all-zero-hex genesis marker', async () => {
    await createChainTable();
    await pg.exec(`
      INSERT INTO ana_kernel_decision_log (entry_hash, prev_hash) VALUES
        ('h1', '0000000000000000000000000000000000000000000000000000000000000000'),
        ('h2', 'h1');
    `);
    const v = await verifyPersistentKernelHashChain();
    expect(v.status).toBe('verified');
    expect(v.valid).toBe(true);
  });
});
