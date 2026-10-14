import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../../../db', () => ({ pool: { query } }));

import { evaluate, can, resolveGrants, whoCan, type Grant } from '../permissions';

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
});

describe('evaluate — pure, deny-by-default, explicit-deny-wins', () => {
  const grants: Grant[] = [
    { role: 'approver', action: 'sign', resourceType: null, ctdModule: null, classification: null, effect: 'allow' },
    { role: 'approver', action: 'sign', resourceType: 'document', ctdModule: null, classification: 'Regulatory', effect: 'deny' },
  ];

  it('denies when no grant matches', () => {
    expect(evaluate(grants, 'approver', { action: 'lock' })).toBe(false);
  });
  it('allows when an allow grant matches', () => {
    expect(evaluate(grants, 'approver', { action: 'sign', resourceType: 'document' })).toBe(true);
  });
  it('explicit deny wins over allow', () => {
    expect(
      evaluate(grants, 'approver', { action: 'sign', resourceType: 'document', classification: 'Regulatory' }),
    ).toBe(false);
  });
  it('a null grant dimension is a wildcard matching any query value', () => {
    expect(evaluate(grants, 'approver', { action: 'sign', resourceType: 'section' })).toBe(true);
  });
  it('role mismatch denies', () => {
    expect(evaluate(grants, 'viewer', { action: 'sign' })).toBe(false);
  });
});

describe('can — default policy (DB empty)', () => {
  it('applies the canonical defaults per role', async () => {
    expect(await can(1, 'admin', { action: 'sign' })).toBe(true);
    expect(await can(1, 'viewer', { action: 'sign' })).toBe(false);
    expect(await can(1, 'viewer', { action: 'view' })).toBe(true);
    expect(await can(1, 'member', { action: 'author' })).toBe(true);
    expect(await can(1, 'member', { action: 'sign' })).toBe(false);
    expect(await can(1, 'regulatory_lead', { action: 'submit' })).toBe(true);
    expect(await can(1, 'reviewer', { action: 'approve' })).toBe(false);
  });

  it('a per-org DB deny override wins over the default allow', async () => {
    query.mockResolvedValueOnce({
      rows: [{ role: 'manager', action: 'sign', resource_type: null, ctd_module: null, classification: null, effect: 'deny' }],
    });
    expect(await can(1, 'manager', { action: 'sign' })).toBe(false);
  });
});

describe('whoCan — the projection of RBAC', () => {
  it('returns the org users whose role grants the action', async () => {
    query.mockImplementation((sql: string) => {
      if (/organization_users/.test(sql)) {
        return Promise.resolve({
          rows: [
            { user_id: 1, role: 'admin' },
            { user_id: 2, role: 'viewer' },
            { user_id: 3, role: 'manager' },
          ],
        });
      }
      return Promise.resolve({ rows: [] }); // grant overrides
    });
    const signers = await whoCan(1, { action: 'sign' });
    expect(signers.sort()).toEqual([1, 3]); // admin + manager can sign; viewer cannot
  });
});

describe('strict grant resolution on an owned transaction', () => {
  it('uses only the supplied executor and applies its explicit deny', async () => {
    const transactionQuery = vi.fn(async () => ({ rows: [
      { role: 'reviewer', action: 'sign', resource_type: 'protocol-document', ctd_module: null,
        classification: null, effect: 'deny' },
    ] }));
    expect(await can(42, 'reviewer', { action: 'sign', resourceType: 'protocol-document' },
      { executor: { query: transactionQuery }, strict: true })).toBe(false);
    expect(query).not.toHaveBeenCalled();
    expect(transactionQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE org_id = $1 AND role = $2'), [42, 'reviewer']);
  });

  it.each(['42P01', '57P01'])('refuses an unavailable grant store (%s) instead of using a default allow', async code => {
    const executor = { query: vi.fn(async () => { throw Object.assign(new Error('private grant-store failure'), { code }); }) };
    await expect(can(42, 'admin', { action: 'sign' }, { executor, strict: true }))
      .rejects.toMatchObject({ name: 'GovernanceGrantStoreUnavailableError' });
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    { role: 'admin', action: 'sign', effect: 'unknown' },
    { role: 'admin', action: 'sign', effect: 'allow', resource_type: 3 },
    { role: 'admin', action: null, effect: 'allow' },
    { role: 'foreign-role', action: 'sign', effect: 'deny' },
    { role: 'admin', action: 'sign', effect: 'allow', resource_type: null, ctd_module: null },
  ])('refuses malformed grant data without inventing an allow: %j', async row => {
    const executor = { query: vi.fn(async () => ({ rows: [row] })) };
    await expect(resolveGrants(42, 'admin', { executor, strict: true }))
      .rejects.toMatchObject({ name: 'GovernanceGrantStoreUnavailableError' });
    expect(query).not.toHaveBeenCalled();
  });

  it('retains valid custom action and dimension strings with null wildcards', async () => {
    const executor = { query: vi.fn(async () => ({ rows: [
      { role: 'custom-quality', action: '*', resource_type: 'protocol-document', ctd_module: 'M2',
        classification: 'Sponsor restricted', effect: 'allow' },
    ] })) };
    const grants = await resolveGrants(42, 'custom-quality', { executor, strict: true });
    expect(evaluate(grants, 'custom-quality', { action: 'sign', resourceType: 'protocol-document',
      ctdModule: 'M2', classification: 'Sponsor restricted' })).toBe(true);
    expect(evaluate(grants, 'custom-quality', { action: 'sign', resourceType: 'protocol-document' })).toBe(false);
  });

  it('preserves ordinary callers’ defaults-only fallback for an unmigrated store', async () => {
    query.mockRejectedValue(Object.assign(new Error('table absent'), { code: '42P01' }));
    expect(await can(42, 'admin', { action: 'sign' })).toBe(true);
  });
});
