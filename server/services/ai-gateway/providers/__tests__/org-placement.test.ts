import { describe, it, expect, afterEach } from 'vitest';
import {
  mergeOrgPolicyDefaults,
  getOrgPlacementResolver,
  setOrgPlacementResolver,
  resetOrgPlacementResolver,
  type OrgPlacementResolver,
  type OrgPlacementPolicy,
} from '../org-placement';

afterEach(() => {
  resetOrgPlacementResolver();
});

describe('mergeOrgPolicyDefaults', () => {
  it('returns the request unchanged when there is no policy', () => {
    expect(mergeOrgPolicyDefaults({ dataResidency: 'us' }, null)).toEqual({ dataResidency: 'us' });
  });

  it('fills residency/ZDR from policy when the request omits them', () => {
    const policy: OrgPlacementPolicy = { residency: 'eu', zeroDataRetention: true };
    expect(mergeOrgPolicyDefaults({}, policy)).toEqual({
      dataResidency: 'eu',
      zeroDataRetention: true,
    });
  });

  // Until 2026-09-25 these two cases asserted the opposite ("request wins"):
  // an explicit request value overrode the org's residency and zero-retention
  // requirement at model selection. That was the defect, not the contract.
  it('an explicit request value never lowers the org floor', () => {
    const policy: OrgPlacementPolicy = { residency: 'eu', zeroDataRetention: true };
    expect(
      mergeOrgPolicyDefaults({ dataResidency: 'us', zeroDataRetention: false }, policy),
    ).toEqual({ dataResidency: 'eu', zeroDataRetention: true, residencyConflict: true });
  });

  it('a request that names only a residency still inherits the org zero-retention floor', () => {
    const policy: OrgPlacementPolicy = { residency: 'eu', zeroDataRetention: true };
    expect(mergeOrgPolicyDefaults({ dataResidency: 'eu' }, policy)).toEqual({
      dataResidency: 'eu',
      zeroDataRetention: true,
    });
  });
});

describe('mergeOrgPolicyDefaults — the org policy is a floor (D6)', () => {
  it('a request cannot lower the org zero-retention floor', () => {
    const merged = mergeOrgPolicyDefaults({ zeroDataRetention: false }, { zeroDataRetention: true });
    expect(merged.zeroDataRetention).toBe(true);
  });

  it('a request residency that contradicts the org residency is flagged as a conflict', () => {
    const merged = mergeOrgPolicyDefaults({ dataResidency: 'us' }, { residency: 'eu' });
    expect(merged.residencyConflict).toBe(true);
  });

  it('a request residency that agrees with the org residency is no conflict', () => {
    const merged = mergeOrgPolicyDefaults({ dataResidency: 'eu' }, { residency: 'eu' });
    expect(merged).toEqual({ dataResidency: 'eu', zeroDataRetention: undefined });
  });

  it('a request may add a constraint the org did not set', () => {
    expect(mergeOrgPolicyDefaults({ dataResidency: 'us', zeroDataRetention: true }, {})).toEqual({
      dataResidency: 'us',
      zeroDataRetention: true,
    });
  });
});

describe('org placement resolver registry', () => {
  it('defaults to a null resolver (no policy → explicit-only behavior)', async () => {
    const policy = await getOrgPlacementResolver().resolve(1);
    expect(policy).toBeNull();
  });

  it('honors an injected resolver and resets cleanly', async () => {
    const stub: OrgPlacementResolver = {
      async resolve(orgId) {
        return orgId === 42 ? { residency: 'eu', zeroDataRetention: true } : null;
      },
    };
    setOrgPlacementResolver(stub);
    expect(await getOrgPlacementResolver().resolve(42)).toEqual({
      residency: 'eu',
      zeroDataRetention: true,
    });
    expect(await getOrgPlacementResolver().resolve(7)).toBeNull();

    resetOrgPlacementResolver();
    expect(await getOrgPlacementResolver().resolve(42)).toBeNull();
  });
});
