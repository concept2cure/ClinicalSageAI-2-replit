/**
 * `auditService.logAction` reports what actually happened.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * It returned `Promise<void>` and swallowed both persistence sections
 * internally, so the outcome was unknowable: a caller could not await a
 * guarantee (it resolves normally on DB failure) and could not catch a failure
 * (it never rejects). Seventeen call sites across sixteen files nevertheless
 * wrapped it in `try { await … } catch` — dead code that reads as handling.
 *
 * The swallow itself is deliberate and stays: an audit-trail outage must not
 * crash the user action it records. What changes is that the outcome is now
 * RETURNED, so a caller can say something true about it.
 *
 * ── What this suite is for ───────────────────────────────────────────────────
 * A result object nobody has seen be `false` is worth nothing. These tests
 * drive the failure path — a pool whose every query throws — and require
 * `persisted: false` with the reason attached, then drive the success path and
 * require the opposite. Without the second half, "always returns
 * persisted:false" would pass the first.
 *
 * A guarantee is still not available here by design; callers that need one use
 * `writeChainedAuditRow` on their own transaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { poolQuery, clientQuery, connect } = vi.hoisted(() => {
  const clientQuery = vi.fn();
  return {
    poolQuery: vi.fn(),
    clientQuery,
    connect: vi.fn(async () => ({ query: clientQuery, release: () => undefined })),
  };
});

vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => poolQuery(...a), connect: () => connect() },
  getPool: () => ({ query: (...a: unknown[]) => poolQuery(...a), connect: () => connect() }),
  query: (...a: unknown[]) => poolQuery(...a),
  db: {},
}));

import auditService from '../auditService';

const ENTRY = {
  tenantId: 3,
  userId: 7,
  action: 'test.action',
  resourceType: 'test_resource',
  resourceId: 'R1',
};

beforeEach(() => {
  poolQuery.mockReset();
  clientQuery.mockReset();
  connect.mockClear();
});

describe('logAction reports its own outcome', () => {
  it('does not reject when the store is unreachable — the policy is unchanged', async () => {
    poolQuery.mockRejectedValue(new Error('connection refused'));
    clientQuery.mockRejectedValue(new Error('connection refused'));

    // The whole point of the policy: a user action is not crashed by an audit
    // outage. If this ever throws, ~270 call sites start failing requests.
    await expect(auditService.logAction({ ...ENTRY })).resolves.toBeDefined();
  });

  it('reports persisted:false with a reason when nothing could be written', async () => {
    poolQuery.mockRejectedValue(new Error('connection refused'));
    clientQuery.mockRejectedValue(new Error('connection refused'));

    const result = await auditService.logAction({ ...ENTRY });

    expect(result.persisted).toBe(false);
    expect(result.chained).toBe(false);
    // The reason is for the caller's own log line — never for a user.
    expect(typeof result.error).toBe('string');
    expect(result.error).toMatch(/connection refused/i);
  });

  it('reports persisted:true when the chained row lands', async () => {
    // The chain write runs on a pooled client inside its own transaction.
    poolQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 1 }] });
    clientQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 1 }] });

    const result = await auditService.logAction({ ...ENTRY });

    // Guards against a result object that is simply always false — which would
    // satisfy the failure test above and mean nothing.
    expect(result.persisted).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
