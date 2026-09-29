/**
 * DbOrgPlacementResolver — the tenant floor's source of truth must fail closed.
 *
 * Before this change the resolver caught every database error, returned null
 * ("this org has no policy") and cached that answer for five minutes. The
 * gateway's own "lookup failed → unknown → refuse" branch was therefore
 * unreachable, and one transient error — or one unscoped query under
 * RLS_ENFORCE=on — lifted an org's residency / zero-retention / substrate floor
 * for every request in the next five minutes. There was no test of this class.
 *
 * Launch row D6. The red run against the pre-change resolver is filed under
 * docs/evidence/D6/.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQuery = vi.hoisted(() => vi.fn());
const logSpies = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

vi.mock('../../../../db/runtime', () => ({ getPool: () => ({ query: poolQuery }) }));
vi.mock('../../../../utils/logger', () => ({
  createScopedLogger: () => logSpies,
  createContextLogger: () => logSpies,
  logger: logSpies,
  default: logSpies,
}));

import { DbOrgPlacementResolver } from '../org-placement-db';
import { getTenantScope, runWithTenantScope } from '../../../../db/tenantStore';

const ROW = {
  required_data_residency: 'eu',
  zero_data_retention: true,
  allowed_substrates: ['frontier_private', 'self_hosted'],
  allowed_providers: ['bedrock', 'local'],
  public_source_frontier: false,
  public_source_egress: true,
};

describe('DbOrgPlacementResolver', () => {
  beforeEach(() => {
    poolQuery.mockReset();
  });

  it('a lookup failure throws — it never reads as "this org has no policy"', async () => {
    poolQuery.mockRejectedValueOnce(new Error('connection terminated'));
    const resolver = new DbOrgPlacementResolver();

    await expect(resolver.resolve(42)).rejects.toThrow('connection terminated');
  });

  it('a failure is not cached: the next call looks the policy up again', async () => {
    poolQuery
      .mockRejectedValueOnce(new Error('connection terminated'))
      .mockResolvedValueOnce({ rows: [ROW] });
    const resolver = new DbOrgPlacementResolver();

    await expect(resolver.resolve(42)).rejects.toThrow();
    const policy = await resolver.resolve(42);

    expect(poolQuery).toHaveBeenCalledTimes(2);
    expect(policy).toMatchObject({ residency: 'eu', zeroDataRetention: true });
  });

  it('a missing row is "no policy" and is cached', async () => {
    poolQuery.mockResolvedValue({ rows: [] });
    const resolver = new DbOrgPlacementResolver();

    expect(await resolver.resolve(42)).toBeNull();
    expect(await resolver.resolve(42)).toBeNull();
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it('reads the vendor allow-list and the public-source switches', async () => {
    poolQuery.mockResolvedValueOnce({ rows: [ROW] });
    const resolver = new DbOrgPlacementResolver();

    expect(await resolver.resolve(42)).toEqual({
      residency: 'eu',
      zeroDataRetention: true,
      allowedSubstrates: ['frontier_private', 'self_hosted'],
      allowedProviders: ['bedrock', 'local'],
      publicSourceFrontier: false,
      publicSourceEgress: true,
    });
  });

  it('an allow-list that names nothing valid allows nothing (fail closed), rather than everything', async () => {
    poolQuery.mockResolvedValueOnce({
      rows: [{ ...ROW, allowed_substrates: ['frontier-shared'], allowed_providers: ['kimi'] }],
    });
    const resolver = new DbOrgPlacementResolver();

    const policy = await resolver.resolve(42);
    expect(policy?.allowedSubstrates).toEqual([]);
    expect(policy?.allowedProviders).toEqual([]);
  });

  it('looks the policy up in the scope of the org it resolves, not the caller\'s ambient scope', async () => {
    let scopeSeen: string | undefined;
    poolQuery.mockImplementationOnce(async () => {
      scopeSeen = getTenantScope()?.tenantId;
      return { rows: [ROW] };
    });
    const resolver = new DbOrgPlacementResolver();

    // A caller running in tenant 7's scope asks about org 42: under RLS a
    // lookup in tenant 7's scope would see no row and read as "no policy".
    await runWithTenantScope({ tenantId: '7', role: null, source: 'request' }, () => resolver.resolve(42));
    expect(scopeSeen).toBe('42');
  });

  it('a lookup in flight when the policy changes does not put the superseded policy back (D6 review)', async () => {
    // Until 2026-09-26 the in-flight read cached its pre-commit row after the
    // writer's invalidate(), for a full TTL, in the process that made the change.
    let release!: (v: { rows: unknown[] }) => void;
    poolQuery.mockImplementationOnce(() => new Promise(r => (release = r)));
    const resolver = new DbOrgPlacementResolver();

    const inFlight = resolver.resolve(42);
    await Promise.resolve();
    resolver.invalidate(42); // the writer committed a tightened policy
    release({ rows: [] }); // the old read comes back: "no policy"
    expect(await inFlight).toBeNull();

    poolQuery.mockResolvedValueOnce({ rows: [ROW] });
    expect(await resolver.resolve(42)).toMatchObject({ residency: 'eu', allowedSubstrates: ['frontier_private', 'self_hosted'] });
    expect(poolQuery).toHaveBeenCalledTimes(2);
  });
});
