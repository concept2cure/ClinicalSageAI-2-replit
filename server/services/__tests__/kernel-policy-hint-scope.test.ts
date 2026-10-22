/**
 * The adaptive routing hint is computed from ONE organisation's outcomes.
 *
 * `getKernelPolicyHint` read
 * `WHERE … AND ($3::int IS NULL OR organization_id = $3)` and both of its
 * callers pass `organizationId: … || null` (chat/send-message.ts:744,
 * ana-kernel-orchestrator.ts:29). So a turn whose organisation could not be
 * resolved picked its routing strategy from the average quality scores of
 * EVERY tenant's recorded outcomes — one organisation's results steering
 * another's routing, and a cross-tenant aggregate (avgQualityScore,
 * sampleSize) handed back to the caller.
 *
 * With no organisation there is no hint. Both callers already read
 * `policyHint?.preferredStrategy || routingPlan.strategy`, so the turn falls
 * back to the router's own strategy — the deterministic answer, not another
 * tenant's.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const poolQuery = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));

import { getKernelPolicyHint } from '../kernel-adaptive-policy';

beforeEach(() => {
  poolQuery.mockReset();
  // A hint that would only exist across tenants: if it is ever returned for a
  // call that named no organisation, this is what the caller would route on.
  poolQuery.mockResolvedValue({ rows: [{ strategy: 'another-tenants-strategy', avg_quality: 0.99, samples: 4242 }] });
});

const call = (organizationId: unknown) =>
  getKernelPolicyHint({
    organizationId: organizationId as number | null | undefined,
    route: '/api/chat',
    taskType: 'draft' as never,
  });

describe('getKernelPolicyHint is scoped to one organisation', () => {
  it('reads nothing and hints nothing when no organisation is named', async () => {
    for (const org of [null, undefined, 0, -1, Number.NaN]) {
      expect(await call(org), String(org)).toBeNull();
    }
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it('scopes the read unconditionally when one is', async () => {
    const hint = await call(7);
    expect(hint).toMatchObject({ preferredStrategy: 'another-tenants-strategy' });
    const [sql, params] = poolQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('organization_id = $3');
    expect(sql, 'a conditional tenant predicate is not a predicate').not.toMatch(/IS\s+NULL\s+OR\s+organization_id/i);
    expect(params[2]).toBe(7);
  });
});
