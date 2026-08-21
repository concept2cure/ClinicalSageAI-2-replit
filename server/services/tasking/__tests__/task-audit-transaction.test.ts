/**
 * The task lineage write holds ONE transaction across the whole chain write.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `auditTaskAction` called `recordGovernedAction(pool, …)`. That function runs
 * three statements: `computeAuditChainSealed` takes the chain lock with
 *
 *     SELECT sha256_chain FROM audit_logs … LIMIT 1 FOR UPDATE
 *
 * then INSERTs into `audit_logs`, then into `c2c_ana_actions`. Its contract, in
 * server/services/audit/chain.ts, is explicit:
 *
 *     "A pool client that is already inside the caller's transaction. The
 *      SELECT FOR UPDATE is issued here; the caller must not release the
 *      transaction until after the INSERT."
 *
 * On the pool each statement is its own implicit single-statement transaction,
 * so the FOR UPDATE lock is released the instant the SELECT commits — before
 * the INSERT. Two concurrent task mutations can then read the same previous
 * hash and both write a row claiming it as their predecessor: a forked chain,
 * which is the tamper-evidence the ledger exists to provide, broken by ordinary
 * concurrency rather than by an attacker. The two INSERTs are also non-atomic,
 * so a half-written pair is possible.
 *
 * ── What this test proves, and what it does not ──────────────────────────────
 * It proves the CONTRACT is now honoured: the executor handed to
 * recordGovernedAction is a single client, and BEGIN precedes the call while
 * COMMIT follows it. Reverting to `pool` fails it.
 *
 * It does NOT prove the fork empirically. That needs a real transaction manager
 * — `FOR UPDATE` means nothing to a mock — and could not be demonstrated here:
 * `audit_logs` is append-only by trigger (correctly), so a clean baseline
 * cannot be established in a shared database, the chain in the dev database was
 * already broken by this session's own tests, and `deriveChainHash` is private
 * so probe rows cannot be re-derived without duplicating the hash logic. A test
 * that passed under those conditions would be passing for the wrong reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  const clientQuery = vi.fn(async (..._a: unknown[]) => ({ rows: [] }));
  const client = { query: clientQuery, release: vi.fn() };
  return {
    clientQuery,
    client,
    poolQuery: vi.fn(async (..._a: unknown[]) => ({ rows: [] })),
    connect: vi.fn(async () => client),
    recordGovernedAction: vi.fn(async (..._a: unknown[]) => ({ actionId: 'act_1', auditId: 'aud_1' })),
  };
});

vi.mock('../../../db.js', () => ({
  pool: { query: (...a: unknown[]) => h.poolQuery(...a), connect: () => h.connect() },
}));
vi.mock('../../../routes/c2c/actions.js', () => ({
  recordGovernedAction: (...a: unknown[]) => h.recordGovernedAction(...a),
}));

import { auditTaskAction } from '../task-audit';

const PARAMS = {
  orgId: 3,
  userId: 7,
  command: 'task.transition' as const,
  taskId: 'T1',
  reason: 'moved to in-review after QC',
  payload: { from: 'open', to: 'in_review' },
};

beforeEach(() => {
  h.clientQuery.mockClear();
  h.poolQuery.mockClear();
  h.connect.mockClear();
  h.recordGovernedAction.mockClear();
});

describe('auditTaskAction — the chain write owns a transaction', () => {
  it('brackets recordGovernedAction in BEGIN … COMMIT on one client', async () => {
    await auditTaskAction(PARAMS);

    const sql = h.clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sql).toContain('BEGIN');
    expect(sql).toContain('COMMIT');
    expect(sql.indexOf('BEGIN')).toBe(0);
    expect(sql.indexOf('COMMIT')).toBe(sql.length - 1);
    expect(h.client.release).toHaveBeenCalled();
  });

  it('hands recordGovernedAction the TRANSACTION client, never the pool', async () => {
    await auditTaskAction(PARAMS);

    expect(h.recordGovernedAction).toHaveBeenCalledTimes(1);
    const executor = h.recordGovernedAction.mock.calls[0]?.[0] as { query?: unknown };
    // Identity, not shape. `recordGovernedAction(pool, …)` would still "write an
    // audit row" and would still release the chain lock before the INSERT.
    expect(executor?.query).toBe(h.clientQuery);
    expect(executor?.query).not.toBe(h.poolQuery);
  });

  it('ROLLs BACK rather than leaving half a pair when the chain write fails', async () => {
    h.recordGovernedAction.mockRejectedValueOnce(new Error('chain lock timeout'));

    // Still non-fatal: a lineage failure must not break the task mutation.
    await expect(auditTaskAction(PARAMS)).resolves.toBeUndefined();

    const sql = h.clientQuery.mock.calls.map((c) => String(c[0]));
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(h.client.release).toHaveBeenCalled();
  });

  it('enlists in the CALLER’s transaction when one is supplied, and propagates', async () => {
    const callerQuery = vi.fn(async () => ({ rows: [] }));
    const caller = { query: callerQuery };

    await auditTaskAction(PARAMS, caller);

    // No transaction of its own — the caller owns it, so the lineage row commits
    // or rolls back with the mutation it records.
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.recordGovernedAction.mock.calls[0]?.[0]).toBe(caller);

    // And a failure must reach the caller, whose rollback is the right outcome.
    h.recordGovernedAction.mockRejectedValueOnce(new Error('nope'));
    await expect(auditTaskAction(PARAMS, caller)).rejects.toThrow('nope');
  });
});
