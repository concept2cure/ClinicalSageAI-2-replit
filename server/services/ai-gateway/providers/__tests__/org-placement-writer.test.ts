/**
 * The governed writer of a tenant's AI placement policy (D6).
 *
 * Until 2026-09-25 nothing in the application wrote ai_placement_policies:
 * the gateway enforced a policy only hand-run SQL could set, with no record of
 * who set it or why. These cases pin what a change must be — complete,
 * reasoned, satisfiable, recorded in the same transaction, and effective on
 * the next dispatch rather than after a stale cache expires.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The spy records calls; the outcome comes from a plain function, because a
// rejecting vi.fn reached through a module-mock wrapper is reported as a test
// failure by this harness even when the code under test catches it.
const writeChainedAuditRow = vi.fn();
let auditOutcome: () => Promise<void> = async () => undefined;
vi.mock('../../../auditService', () => ({
  writeChainedAuditRow: (...a: unknown[]) => {
    writeChainedAuditRow(...a);
    return auditOutcome();
  },
}));

let tableRow: Record<string, unknown> | null = null;
vi.mock('../../../../db/runtime', () => ({
  getPool: () => ({
    query: async () => ({ rows: tableRow ? [tableRow] : [] }),
  }),
}));

import {
  parsePlacementPolicyInput,
  placementPolicyContradiction,
  writeOrgPlacementPolicy,
  type StoredPlacementPolicy,
} from '../org-placement-writer';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../org-placement';
import { DbOrgPlacementResolver } from '../org-placement-db';

const REASON = 'Order Form 2026-09 limits this tenant to its own AWS account.';
const OPEN: Omit<StoredPlacementPolicy, never> = {
  residency: null,
  zeroDataRetention: false,
  allowedSubstrates: null,
  allowedProviders: null,
  publicSourceFrontier: false,
  publicSourceEgress: true,
};
const PRIVATE_ONLY: StoredPlacementPolicy = {
  residency: 'us',
  zeroDataRetention: true,
  allowedSubstrates: ['frontier_private'],
  allowedProviders: ['bedrock'],
  publicSourceFrontier: false,
  publicSourceEgress: true,
};

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...PRIVATE_ONLY, reasonForChange: REASON, ...overrides };
}

describe('parsePlacementPolicyInput', () => {
  it('accepts a complete, reasoned, satisfiable policy', () => {
    const r = parsePlacementPolicyInput(body({ allowedProviders: ['bedrock', 'bedrock'] }));
    expect(r).toEqual({ ok: true, policy: { ...PRIVATE_ONLY }, reasonForChange: REASON });
  });

  it('refuses a partial policy — an omitted field must never reset a constraint', () => {
    const { zeroDataRetention: _omit, ...partial } = body();
    const r = parsePlacementPolicyInput(partial);
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/missing: zeroDataRetention/) });
  });

  it('refuses an unknown key, including a client-supplied organizationId', () => {
    expect(parsePlacementPolicyInput(body({ organizationId: 99 }))).toMatchObject({
      ok: false,
      message: 'Unknown policy key: organizationId.',
    });
  });

  it('requires a reason for change', () => {
    expect(parsePlacementPolicyInput(body({ reasonForChange: '  ok  ' }))).toMatchObject({ ok: false });
    const { reasonForChange: _r, ...unreasoned } = body();
    expect(parsePlacementPolicyInput(unreasoned)).toMatchObject({ ok: false });
  });

  it('refuses an empty allow-list — null says "no constraint", [] would refuse everything', () => {
    expect(parsePlacementPolicyInput(body({ allowedSubstrates: [] }))).toMatchObject({
      ok: false,
      message: expect.stringMatching(/allowedSubstrates must be null/),
    });
  });

  it('refuses values this build does not know, rather than dropping them', () => {
    expect(parsePlacementPolicyInput(body({ allowedProviders: ['bedrock', 'kimi'] }))).toMatchObject({
      ok: false,
      message: 'allowedProviders names unknown values: kimi.',
    });
    expect(parsePlacementPolicyInput(body({ residency: 'any' }))).toMatchObject({ ok: false });
    expect(parsePlacementPolicyInput(body({ zeroDataRetention: 'true' }))).toMatchObject({ ok: false });
  });

  it('refuses a policy no AI service could satisfy', () => {
    expect(
      parsePlacementPolicyInput(body({ allowedSubstrates: ['self_hosted'], allowedProviders: ['anthropic', 'moonshot'] })),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/No AI service is on both/) });
    expect(
      placementPolicyContradiction({ ...OPEN, residency: 'on_prem', allowedSubstrates: ['frontier_private'] }),
    ).toMatch(/self-hosted/);
    expect(placementPolicyContradiction({ ...OPEN, residency: 'on_prem', allowedProviders: ['local'] })).toBeNull();
  });
});

function fakePool(opts: { failAudit?: boolean; existing?: Record<string, unknown> | null } = {}) {
  const statements: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      const head = sql.trim().split(/\s+/).slice(0, 1)[0];
      statements.push(/FOR UPDATE/.test(sql) ? 'SELECT … FOR UPDATE' : head);
      if (/FOR UPDATE/.test(sql)) return { rows: opts.existing ? [opts.existing] : [] };
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  auditOutcome = async () => {
    statements.push('audit');
    if (opts.failAudit) throw new Error('audit_logs unavailable');
  };
  return { pool: { query: client.query, connect: async () => client }, client, statements };
}

describe('writeOrgPlacementPolicy', () => {
  beforeEach(() => writeChainedAuditRow.mockReset());
  afterEach(() => resetOrgPlacementResolver());

  it('writes the policy and its audit row (before, after, reason) in one transaction, then invalidates', async () => {
    const invalidate = vi.fn();
    setOrgPlacementResolver({ resolve: async () => null, invalidate });
    const existing = {
      required_data_residency: null,
      zero_data_retention: false,
      allowed_substrates: null,
      allowed_providers: null,
      public_source_frontier: false,
      public_source_egress: true,
    };
    const { pool, client, statements } = fakePool({ existing });

    const result = await writeOrgPlacementPolicy(pool, 42, PRIVATE_ONLY, REASON, { userId: 5, ipAddress: '10.0.0.1' });

    expect(statements).toEqual(['BEGIN', 'SELECT … FOR UPDATE', 'INSERT', 'audit', 'COMMIT']);
    const [auditClient, entry] = writeChainedAuditRow.mock.calls[0];
    expect(auditClient).toBe(client); // same connection, same transaction
    expect(entry).toMatchObject({
      tenantId: 42,
      userId: 5,
      action: 'ai_placement_policy.update',
      resourceType: 'ai_placement_policies',
      resourceId: '42',
      details: { previousPolicy: OPEN, newPolicy: PRIVATE_ONLY, reasonForChange: REASON },
    });
    expect(result).toEqual({ previousPolicy: OPEN, policy: PRIVATE_ONLY });
    expect(invalidate).toHaveBeenCalledWith(42);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('commits nothing and invalidates nothing when the audit row cannot be written', async () => {
    const invalidate = vi.fn();
    setOrgPlacementResolver({ resolve: async () => null, invalidate });
    const { pool, client, statements } = fakePool({ failAudit: true });

    await expect(writeOrgPlacementPolicy(pool, 42, PRIVATE_ONLY, REASON, { userId: 5 })).rejects.toThrow(
      /audit_logs unavailable/,
    );
    expect(statements).toEqual(['BEGIN', 'SELECT … FOR UPDATE', 'INSERT', 'audit', 'ROLLBACK']);
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('the next dispatch sees a tightened policy at once, not after the cache expires', async () => {
    const resolver = new DbOrgPlacementResolver();
    setOrgPlacementResolver(resolver);
    tableRow = null; // no policy yet
    expect(await resolver.resolve(42)).toBeNull(); // now cached as "no policy"

    const { pool } = fakePool();
    await writeOrgPlacementPolicy(pool, 42, PRIVATE_ONLY, REASON, { userId: 5 });
    tableRow = {
      required_data_residency: 'us',
      zero_data_retention: true,
      allowed_substrates: ['frontier_private'],
      allowed_providers: ['bedrock'],
      public_source_frontier: false,
      public_source_egress: true,
    };

    expect(await resolver.resolve(42)).toMatchObject({
      residency: 'us',
      zeroDataRetention: true,
      allowedSubstrates: ['frontier_private'],
      allowedProviders: ['bedrock'],
    });
    tableRow = null;
  });
});
