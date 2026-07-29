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

  it('never overrides an explicit request value (request wins)', () => {
    const policy: OrgPlacementPolicy = { residency: 'eu', zeroDataRetention: true };
    expect(
      mergeOrgPolicyDefaults({ dataResidency: 'us', zeroDataRetention: false }, policy),
    ).toEqual({ dataResidency: 'us', zeroDataRetention: false });
  });

  it('fills only the unspecified field (partial override)', () => {
    const policy: OrgPlacementPolicy = { residency: 'eu', zeroDataRetention: true };
    expect(mergeOrgPolicyDefaults({ dataResidency: 'us' }, policy)).toEqual({
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
