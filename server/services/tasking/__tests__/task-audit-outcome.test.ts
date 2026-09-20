/**
 * `auditTaskAction` had three outcomes and one observable result.
 *
 * WO-16C #133, in the second of at least eight audit-writing mechanisms this
 * repository has. The first five tranches of this work made
 * `auditService.logAction`'s outcome observable and built a gate for it. That
 * gate knows two mechanisms. This one returned `Promise<void>`, so its callers
 * could not report an outcome even if they wanted to — a deeper defect than a
 * discarded one, because there was nothing to discard.
 *
 * The three outcomes, all indistinguishable to a caller before this:
 *
 *   WRITTEN     — recordGovernedAction committed the lineage row.
 *   SKIPPED     — orgId, userId or taskId was missing, so the function returned
 *                 early to avoid writing an attributionless row. A defensible
 *                 policy, and the caller was told nothing: a task mutation with
 *                 no resolvable actor produced no lineage and no signal.
 *   FAILED      — the owned-transaction branch caught, warned to the console and
 *                 returned normally.
 *
 * The enlisted branch (a caller's own client) is deliberately different and stays
 * so: it lets the failure propagate, because the caller's rollback is the correct
 * outcome there. That is the one case where a failed audit row SHOULD fail the
 * action, and the outcome type says so rather than flattening it.
 *
 * Failure is injected at the dependency: recordGovernedAction rejects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const recordGovernedAction = vi.hoisted(() => vi.fn());
const CLIENT = vi.hoisted(() => ({ queries: [] as string[] }));

vi.mock('../../../db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(async () => ({
      query: vi.fn(async (sql: string) => {
        CLIENT.queries.push(sql);
        return { rows: [] };
      }),
      release: vi.fn(),
    })),
  },
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction }));

import { auditTaskAction } from '../task-audit';

const PARAMS = {
  orgId: 2,
  userId: 7,
  command: 'task.transition' as const,
  taskId: 'TASK-1',
  payload: { from: 'pending', to: 'completed' },
};

beforeEach(() => {
  vi.clearAllMocks();
  CLIENT.queries.length = 0;
});

describe('auditTaskAction reports which of its three outcomes happened', () => {
  it('a committed row is reported as recorded, and says it owned the transaction', async () => {
    recordGovernedAction.mockResolvedValue({ actionId: 'a', auditId: 'b', sha256Chain: 'c' });

    const out = await auditTaskAction(PARAMS);

    expect(out.recorded).toBe(true);
    expect(out.enlisted).toBe(false);
    expect(CLIENT.queries).toContain('COMMIT');
  });

  it('an enlisted row says so, because there a failure is the caller’s to roll back', async () => {
    recordGovernedAction.mockResolvedValue({ actionId: 'a' });
    const executor = { query: vi.fn(async () => ({ rows: [] })) } as never;

    const out = await auditTaskAction(PARAMS, executor);

    expect(out.recorded).toBe(true);
    expect(out.enlisted).toBe(true);
    // It did NOT open its own transaction.
    expect(CLIENT.queries).not.toContain('BEGIN');
  });

  it('a silent skip is reported as NOT_ATTRIBUTABLE, not as a recorded row', async () => {
    // The policy stays: no attributionless lineage row is written. What changes
    // is that the caller can tell this apart from a row that landed.
    for (const bad of [
      { ...PARAMS, userId: null as never },
      { ...PARAMS, orgId: 0 },
      { ...PARAMS, taskId: '' },
    ]) {
      const out = await auditTaskAction(bad);
      expect(out.recorded).toBe(false);
      expect(out).toMatchObject({ reason: 'NOT_ATTRIBUTABLE' });
    }
    expect(recordGovernedAction).not.toHaveBeenCalled();
  });

  it('a failed owned write is reported as WRITE_FAILED, and still does not throw', async () => {
    recordGovernedAction.mockRejectedValue(new Error('relation "audit_logs" does not exist'));

    const out = await auditTaskAction(PARAMS);

    // The task mutation must not break on an audit failure — unchanged policy.
    expect(out.recorded).toBe(false);
    expect(out).toMatchObject({ reason: 'WRITE_FAILED' });
    // The ROLLBACK still runs, so no half-written pair is left behind.
    expect(CLIENT.queries).toContain('ROLLBACK');
    // The store's own text does not travel in the outcome.
    expect(JSON.stringify(out)).not.toContain('does not exist');
  });

  it('an enlisted failure still propagates — that is the one case a caller must fail on', async () => {
    recordGovernedAction.mockRejectedValue(new Error('chain lock timeout'));
    const executor = { query: vi.fn(async () => ({ rows: [] })) } as never;

    await expect(auditTaskAction(PARAMS, executor)).rejects.toThrow(/chain lock timeout/);
  });
});
