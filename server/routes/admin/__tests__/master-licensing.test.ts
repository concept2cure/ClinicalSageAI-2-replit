/**
 * Master Admin licensing control — the pure decision logic.
 *
 * The load-bearing test here is the LAST one. `effectiveVerdict` in
 * master-licensing.ts and `decideNavEntitlement` in
 * server/services/entitlements/navigation-entitlements.ts answer the same
 * question — "may this organization open this module, and if not, why" — for
 * two different audiences: the customer's nav rail and the operator's admin
 * console. Two implementations of one question is exactly the shape that drifts
 * silently, and the failure is nasty in a specific way: an operator would see a
 * different answer from the customer, "fix" something the customer never saw as
 * broken, or fail to reproduce a lock the customer is looking at.
 *
 * They are separate functions on purpose (they take different row shapes, and
 * reshaping one to fit the other would hide the coupling rather than surface
 * it). So the agreement is asserted here, across the whole cross-product of
 * inputs, rather than assumed.
 */
import { describe, expect, it } from 'vitest';
import {
  TIERS,
  effectiveVerdict,
  lowestTier,
  normalizeReason,
  type Tier,
} from '../master-licensing';
import { decideNavEntitlement } from '../../../services/entitlements/navigation-entitlements';
import type { ModuleCatalogEntry } from '../../../services/license-manager';

describe('normalizeReason — the governed-action floor', () => {
  it('accepts a reason of at least 3 characters, trimmed', () => {
    expect(normalizeReason('  moved to professional  ')).toBe('moved to professional');
    expect(normalizeReason('abc')).toBe('abc');
  });

  it('rejects anything shorter, blank, or not a string', () => {
    // Same floor ./master-admin already applies to suspending a tenant. An
    // operator must not learn one rule for one governed action and a looser
    // one for repricing the platform.
    for (const bad of ['', '  ', 'ab', '  a  ', null, undefined, 3, {}]) {
      expect(normalizeReason(bad)).toBeNull();
    }
  });
});

describe('lowestTier — reading packaging out of metadata', () => {
  it('returns the lowest tier named, not the first', () => {
    expect(lowestTier(['enterprise', 'standard', 'professional'])).toBe('standard');
  });

  it('treats an empty array, a missing value and a non-array as unrestricted', () => {
    // All three occur in the wild: the catalog seeds `"tiers": []`, older rows
    // have no key at all, and a hand-edited row can hold anything.
    expect(lowestTier([])).toBeNull();
    expect(lowestTier(undefined)).toBeNull();
    expect(lowestTier(null)).toBeNull();
    expect(lowestTier('standard')).toBeNull();
    expect(lowestTier({ tiers: ['free'] })).toBeNull();
  });

  it('ignores tier names it does not recognise', () => {
    // A typo must not become a silent entitlement. 'startup' is not a tier.
    expect(lowestTier(['startup'])).toBeNull();
    expect(lowestTier(['startup', 'professional'])).toBe('professional');
  });
});

describe('effectiveVerdict', () => {
  const base = {
    subscriptionState: 'none' as const,
    minTier: null as Tier | null,
    orgTier: 'standard' as Tier | null,
    industries: [] as string[],
    orgIndustry: 'biotech' as string | null,
  };

  it('an explicit grant outranks everything, including a tier the org has not reached', () => {
    // Invariant 1: re-tiering a module never repossesses it from an org that
    // already holds a grant. If this inverts, a packaging change silently cuts
    // off paying customers.
    expect(
      effectiveVerdict({ ...base, subscriptionState: 'enabled', minTier: 'enterprise', orgTier: 'free' }),
    ).toEqual({ effective: true, source: 'subscribed' });
  });

  it('an explicit revocation locks a module the plan would otherwise include', () => {
    expect(
      effectiveVerdict({ ...base, subscriptionState: 'disabled', minTier: 'free' }),
    ).toEqual({ effective: false, source: 'disabled' });
  });

  it('an unrestricted module with no subscription row is included', () => {
    // The state of every module today. If this ever flips to locked, every
    // un-provisioned tenant's rail goes dark at once.
    expect(effectiveVerdict(base)).toEqual({ effective: true, source: 'included' });
  });

  it('is inclusive up the ladder — professional gets standard modules', () => {
    expect(
      effectiveVerdict({ ...base, minTier: 'standard', orgTier: 'professional' }),
    ).toEqual({ effective: true, source: 'included' });
  });

  it('locks with source "tier" when the plan is below the module', () => {
    expect(
      effectiveVerdict({ ...base, minTier: 'professional', orgTier: 'standard' }),
    ).toEqual({ effective: false, source: 'tier' });
  });

  it('locks with source "industry" — and industry is checked BEFORE tier', () => {
    // The order matters commercially: an org told to upgrade when the real
    // reason is their industry mode would buy a plan that changes nothing.
    expect(
      effectiveVerdict({
        ...base,
        minTier: 'professional',
        orgTier: 'free',
        industries: ['medtech'],
        orgIndustry: 'biotech',
      }),
    ).toEqual({ effective: false, source: 'industry' });
  });

  it('does not grant on an unknown org tier', () => {
    expect(
      effectiveVerdict({ ...base, minTier: 'standard', orgTier: null }),
    ).toEqual({ effective: false, source: 'tier' });
  });
});

describe('the admin console agrees with the customer rail', () => {
  /** Build the ModuleCatalogEntry decideNavEntitlement expects. */
  function asCatalogEntry(
    subscriptionState: 'enabled' | 'disabled' | 'none',
    minTier: Tier | null,
    isAvailable: boolean,
  ): ModuleCatalogEntry {
    return {
      moduleId: 'm',
      name: 'M',
      description: null,
      category: null,
      icon: null,
      path: null,
      isEnabled: subscriptionState === 'enabled',
      subscriptionState,
      isAvailable,
      requiredTier: minTier,
      sortOrder: 0,
      // Perpetual: these cases are about packaging, not about time-limited
      // grants. A grant with no expiry behaves exactly as it did before the
      // column existed, which is what makes these comparisons still valid.
      grantExpiresAt: null,
      grantExpired: false,
    };
  }

  const states = ['enabled', 'disabled', 'none'] as const;
  const minTiers: (Tier | null)[] = [null, ...TIERS];
  const orgTiers: (Tier | null)[] = [...TIERS];

  it('returns the same effective answer for every combination of state, module tier and plan', () => {
    let compared = 0;
    for (const subscriptionState of states) {
      for (const minTier of minTiers) {
        for (const orgTier of orgTiers) {
          const mine = effectiveVerdict({
            subscriptionState,
            minTier,
            orgTier,
            industries: [],
            orgIndustry: 'biotech',
          });
          // `isAvailable` is how getModuleCatalog expresses tier+industry, and
          // with no industry restriction it reduces to the tier test alone.
          const isAvailable = minTier == null || TIERS.indexOf(orgTier as Tier) >= TIERS.indexOf(minTier);
          const rail = decideNavEntitlement(asCatalogEntry(subscriptionState, minTier, isAvailable), {
            masterAdmin: false,
            tier: orgTier,
          });
          expect(
            mine.effective,
            `disagreement at state=${subscriptionState} minTier=${minTier} orgTier=${orgTier}: ` +
              `console said ${mine.effective} (${mine.source}), rail said ${rail.entitled} (${rail.source})`,
          ).toBe(rail.entitled);
          expect(mine.source).toBe(rail.source);
          compared += 1;
        }
      }
    }
    // Guard the loop itself: a bug that collapsed the cross-product would make
    // this suite pass vacuously.
    expect(compared).toBe(states.length * minTiers.length * orgTiers.length);
    expect(compared).toBeGreaterThan(50);
  });
});
