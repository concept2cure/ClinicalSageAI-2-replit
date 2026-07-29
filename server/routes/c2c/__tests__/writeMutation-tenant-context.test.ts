/**
 * Regression: the flagship governed-write path (writeMutation) must stamp tenant
 * context inside its transaction, so the org-keyed governed-action inserts
 * (audit_logs, c2c_ana_actions) satisfy row-level security when RLS_ENFORCE=on.
 * Previously the transaction ran BEGIN → recordGovernedAction → COMMIT with no
 * setTenantContextTx, which would fail the RLS WITH CHECK once enforcement flips.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setTenantContextTx = vi.hoisted(() => vi.fn());
const queries: string[] = [];
const fakeClient = {
  query: vi.fn(async (sql: string) => {
    queries.push(sql.trim().split(/\s+/)[0].toUpperCase());
    return { rows: [] };
  }),
  release: vi.fn(),
};

vi.mock('../../../db.js', () => ({
  pool: {
    connect: vi.fn(async () => fakeClient),
    query: vi.fn(async () => ({ rows: [] })),
  },
}));
vi.mock('../../../services/tenant/governed-tenant-context.js', () => ({ setTenantContextTx }));
vi.mock('../../../services/audit/chain.js', () => ({
  computeAuditChainSealed: vi.fn(async () => ({ sha256Chain: 'chain', hmacSeal: null })),
  hashPayload: vi.fn(() => 'payloadhash'),
  verifyAuditChain: vi.fn(),
}));
vi.mock('../../../services/mfaService.js', () => ({ verifyToken: vi.fn() }));

import { writeMutation } from '../actions';

beforeEach(() => {
  queries.length = 0;
  setTenantContextTx.mockClear();
  fakeClient.query.mockClear();
});

describe('writeMutation — tenant context stamping', () => {
  it('stamps tenant context inside the committed transaction (org-scoped)', async () => {
    const res = await writeMutation('claim' as any, { target: 'work_item:1', reason: 'because' } as any, 7, 42);

    // The governed write committed…
    expect(queries).toContain('BEGIN');
    expect(queries).toContain('COMMIT');
    expect(queries).not.toContain('ROLLBACK');
    expect(res.state).toBe('executed');

    // …and tenant context was stamped for this org on the SAME client.
    expect(setTenantContextTx).toHaveBeenCalledTimes(1);
    expect(setTenantContextTx).toHaveBeenCalledWith(fakeClient, 42);

    // Ordering: stamped after BEGIN, before COMMIT.
    const beginIdx = queries.indexOf('BEGIN');
    const commitIdx = queries.indexOf('COMMIT');
    const stampOrder = setTenantContextTx.mock.invocationCallOrder[0];
    const beginOrder = fakeClient.query.mock.invocationCallOrder[beginIdx];
    const commitOrder = fakeClient.query.mock.invocationCallOrder[commitIdx];
    expect(stampOrder).toBeGreaterThan(beginOrder);
    expect(stampOrder).toBeLessThan(commitOrder);
  });
});
