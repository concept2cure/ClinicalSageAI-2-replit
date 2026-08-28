/**
 * Navigation entitlements — what the left rail is allowed to claim.
 *
 * WHY THESE TESTS EXIST. A lock badge on the rail is a claim about a paying
 * customer's contract, so both directions of a wrong verdict are real damage:
 * an over-permissive rail shows a destination nobody bought (route-level
 * `requireModule` still blocks it, so this is presentation drift), while an
 * over-strict rail tells a customer they do not own something they DO own and
 * hides the product they are paying for.
 *
 * Two branches carry almost all of that risk and are the reason
 * `decideNavEntitlement` is exported as a pure function at all:
 *
 *   1. subscriptionState 'none' + isAvailable true → ENTITLED ('included').
 *      An organization whose plan covers a module but which has no
 *      `module_subscriptions` row yet must NOT go dark. Every test against a
 *      fully-provisioned org passes whether this branch is right or wrong,
 *      which is exactly why it gets a direct unit test here.
 *   2. The tier-vs-industry explanation. `isAvailable` collapses two different
 *      facts; naming the wrong one sends a customer to buy a plan upgrade that
 *      changes nothing.
 *
 * And the failure contract: when the catalog cannot be read, `resolved` is
 * false and `surfaces` is EMPTY. No verdicts at all beats invented ones.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModuleCatalogEntry, ModuleSubscriptionState } from '../../license-manager.js';

// ── license-manager is mocked so resolveNavEntitlements can be driven without
// a database. The path must be the one that RESOLVES to the same module the
// implementation imports: navigation-entitlements.ts says '../license-manager.js'
// from server/services/entitlements/, which is this file's '../../license-manager.js'
// from server/services/entitlements/__tests__/ — the same file on disk, which is
// what vitest keys the mock registry on.
const getLicenseInfo = vi.fn();
const getModuleCatalog = vi.fn();
vi.mock('../../license-manager.js', () => ({
  getLicenseInfo: (...args: unknown[]) => getLicenseInfo(...args),
  getModuleCatalog: (...args: unknown[]) => getModuleCatalog(...args),
}));

import { decideNavEntitlement, resolveNavEntitlements } from '../navigation-entitlements';

/**
 * A literal catalog entry. Defaults describe the ordinary case — a module the
 * org's plan covers, with no subscription row — so each test states only the
 * fields whose combination it is actually about.
 */
function entry(overrides: Partial<ModuleCatalogEntry> = {}): ModuleCatalogEntry {
  return {
    moduleId: 'labeling',
    name: 'Labeling',
    description: 'Structured product labeling',
    category: 'regulatory',
    icon: 'tag',
    path: '/labeling',
    isEnabled: false,
    subscriptionState: 'none' as ModuleSubscriptionState,
    isAvailable: true,
    requiredTier: 'standard',
    sortOrder: 10,
    // Perpetual by default — the ordinary case these defaults describe. A test
    // about a lapsed trial overrides both.
    grantExpiresAt: null,
    grantExpired: false,
    ...overrides,
  };
}

beforeEach(() => {
  getLicenseInfo.mockReset();
  getModuleCatalog.mockReset();
});

describe('decideNavEntitlement — master admin', () => {
  it('wins over everything, including a disabled and unavailable module', () => {
    // The platform owner is not a customer, so no packaging applies. This is
    // the most hostile input available: an admin-disabled module the org's
    // plan does not cover, on a free tier. It must still resolve entitled, and
    // the SOURCE must say why so the UI never explains it as a purchase.
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'disabled', isAvailable: false, requiredTier: 'enterprise' }),
      { masterAdmin: true, tier: 'free' },
    );
    expect(verdict.entitled).toBe(true);
    expect(verdict.source).toBe('master_admin');
    expect(verdict.id).toBe('labeling');
    expect(verdict.label).toBe('Labeling');
    expect(verdict.requiredTier).toBe('enterprise');
  });

  it('reports master_admin even for a module that would have been entitled anyway', () => {
    // The reason must be the real one — not the one that happens to agree.
    const verdict = decideNavEntitlement(entry({ subscriptionState: 'enabled' }), {
      masterAdmin: true,
      tier: 'enterprise',
    });
    expect(verdict.source).toBe('master_admin');
  });
});

describe('decideNavEntitlement — subscription row', () => {
  it("an 'enabled' row entitles, with source 'subscribed'", () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'enabled', isAvailable: false, requiredTier: 'enterprise' }),
      { masterAdmin: false, tier: 'free' },
    );
    // An explicit grant outranks tier/industry packaging: someone sold them
    // this, and the rail must not argue with the contract.
    expect(verdict.entitled).toBe(true);
    expect(verdict.source).toBe('subscribed');
  });

  it("a 'disabled' row locks, with source 'disabled' (not an upsell)", () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'disabled', isAvailable: true, requiredTier: 'standard' }),
      { masterAdmin: false, tier: 'enterprise' },
    );
    expect(verdict.entitled).toBe(false);
    // Distinct from 'tier'/'industry' on purpose: nobody needs to buy
    // anything — a workspace admin switched it off, and telling them to
    // upgrade would be a lie about their own decision.
    expect(verdict.source).toBe('disabled');
    expect(verdict.requiredTier).toBe('standard');
  });

  it("a 'disabled' row locks even on an enterprise plan that includes the module", () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'disabled', isAvailable: true, requiredTier: 'free' }),
      { masterAdmin: false, tier: 'enterprise' },
    );
    expect(verdict.entitled).toBe(false);
    expect(verdict.source).toBe('disabled');
  });
});

describe("decideNavEntitlement — 'none' + available: the un-provisioned org", () => {
  it("entitles a plan-included module with NO subscription row, source 'included'", () => {
    // ─────────────────────────────────────────────────────────────────────
    // THE CRITICAL ONE. `module_subscriptions` rows are written by
    // provisioning, and plenty of real organizations have none — a fresh
    // signup, a tenant created before the toggle existed, a seed that only
    // writes rows for opt-in modules. If this branch fails closed, that
    // customer's ENTIRE rail locks: every module they are paying for renders
    // a lock badge, because "no row" is the normal state, not an exception.
    // An integration test against a fully-provisioned org cannot see this.
    // ─────────────────────────────────────────────────────────────────────
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: true, requiredTier: 'standard' }),
      { masterAdmin: false, tier: 'professional' },
    );
    expect(verdict.entitled).toBe(true);
    expect(verdict.source).toBe('included');
  });

  it('holds even when the org tier could not be read', () => {
    // `isAvailable` was already computed upstream with the real license; a
    // null tier here must not retroactively lock a module the catalog says is
    // available.
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: true }),
      { masterAdmin: false, tier: null },
    );
    expect(verdict.entitled).toBe(true);
    expect(verdict.source).toBe('included');
  });
});

describe("decideNavEntitlement — 'none' + unavailable: naming the real cause", () => {
  it("blames the TIER when the org's plan is below the module's minimum", () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: false, requiredTier: 'enterprise' }),
      { masterAdmin: false, tier: 'standard' },
    );
    expect(verdict.entitled).toBe(false);
    expect(verdict.source).toBe('tier');
    // Carried through so the locked-state panel can name the plan to buy.
    expect(verdict.requiredTier).toBe('enterprise');
  });

  it('blames the tier across every genuinely-below pairing', () => {
    const below: Array<[string, string]> = [
      ['free', 'standard'],
      ['free', 'professional'],
      ['free', 'enterprise'],
      ['standard', 'professional'],
      ['standard', 'enterprise'],
      ['professional', 'enterprise'],
    ];
    for (const [tier, requiredTier] of below) {
      const verdict = decideNavEntitlement(
        entry({ subscriptionState: 'none', isAvailable: false, requiredTier }),
        { masterAdmin: false, tier },
      );
      expect(verdict.source, `${tier} < ${requiredTier}`).toBe('tier');
    }
  });

  it('blames the INDUSTRY when the tier already reaches the minimum', () => {
    // The plan is fine, so the only thing `isAvailable: false` can still mean
    // is industry mode. Saying 'tier' here would send the customer to buy an
    // upgrade that changes nothing — the defect this branch exists to avoid.
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: false, requiredTier: 'standard' }),
      { masterAdmin: false, tier: 'enterprise' },
    );
    expect(verdict.entitled).toBe(false);
    expect(verdict.source).toBe('industry');
  });

  it('blames the industry when the tier sits EXACTLY at the minimum', () => {
    // The boundary case: at-tier is not below-tier.
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: false, requiredTier: 'professional' }),
      { masterAdmin: false, tier: 'professional' },
    );
    expect(verdict.source).toBe('industry');
  });

  it("blames the industry when requiredTier is null (no tier restriction to fail)", () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: false, requiredTier: null }),
      { masterAdmin: false, tier: 'free' },
    );
    expect(verdict.entitled).toBe(false);
    expect(verdict.source).toBe('industry');
    expect(verdict.requiredTier).toBeNull();
  });

  it('falls back to industry (never throws) for a tier string outside the rank table', () => {
    // A tier value the billing code does not know about is unrankable, so a
    // tier claim would be fabricated. Degrade to the generic explanation
    // rather than crashing the whole rail resolution over one bad row.
    for (const tier of ['platinum', '', 'FREE', 'trial']) {
      let verdict!: ReturnType<typeof decideNavEntitlement>;
      expect(() => {
        verdict = decideNavEntitlement(
          entry({ subscriptionState: 'none', isAvailable: false, requiredTier: 'enterprise' }),
          { masterAdmin: false, tier },
        );
      }, `tier=${tier}`).not.toThrow();
      expect(verdict.source, `tier=${tier}`).toBe('industry');
      expect(verdict.entitled).toBe(false);
    }
  });

  it('falls back to industry for an unknown requiredTier string', () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: false, requiredTier: 'platinum' }),
      { masterAdmin: false, tier: 'free' },
    );
    expect(verdict.source).toBe('industry');
    expect(verdict.requiredTier).toBe('platinum');
  });

  it('falls back to industry when the org tier is null', () => {
    const verdict = decideNavEntitlement(
      entry({ subscriptionState: 'none', isAvailable: false, requiredTier: 'enterprise' }),
      { masterAdmin: false, tier: null },
    );
    expect(verdict.source).toBe('industry');
  });
});

describe('resolveNavEntitlements — honesty under failure', () => {
  const license = {
    organizationId: 42,
    tier: 'professional',
    industryMode: 'pharma',
    enabledModules: [],
    maxUsers: 10,
    maxProjects: 10,
    maxStorageGB: 10,
  };

  it('an EMPTY catalog reports no verdict at all (resolved: false, surfaces: [])', () => {
    // getModuleCatalog swallows its own errors and returns [], so an empty
    // catalog is indistinguishable from a failed read — and a deployment whose
    // catalog migration has not run lands here too. Emitting a clean sheet of
    // "not entitled" verdicts would lock every rail in that deployment.
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockResolvedValue([]);

    return resolveNavEntitlements(42, { masterAdmin: false }).then((res) => {
      expect(res.resolved).toBe(false);
      expect(res.surfaces).toEqual([]);
      expect(res.organizationId).toBe(42);
      // Nothing was read, so nothing may be claimed about the plan either.
      expect(res.tier).toBeNull();
      expect(res.industryMode).toBeNull();
      expect(res.masterAdmin).toBe(false);
    });
  });

  it('a THROWING catalog read degrades — it must not reject', async () => {
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockRejectedValue(new Error('relation "available_modules" does not exist'));

    const res = await resolveNavEntitlements(42, { masterAdmin: false });
    expect(res.resolved).toBe(false);
    expect(res.surfaces).toEqual([]);
    expect(res.tier).toBeNull();
  });

  it('a throwing license read degrades the same way', async () => {
    getLicenseInfo.mockRejectedValue(new Error('connection terminated'));
    getModuleCatalog.mockResolvedValue([entry()]);

    const res = await resolveNavEntitlements(42, { masterAdmin: false });
    expect(res.resolved).toBe(false);
    expect(res.surfaces).toEqual([]);
  });

  it('a failed read stays honest even for a master admin', async () => {
    // The owner grant widens verdicts; it does not manufacture them. With no
    // catalog there is nothing to widen.
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockResolvedValue([]);

    const res = await resolveNavEntitlements(42, { masterAdmin: true });
    expect(res.resolved).toBe(false);
    expect(res.surfaces).toEqual([]);
    expect(res.masterAdmin).toBe(true);
  });
});

describe('resolveNavEntitlements — healthy catalog', () => {
  const license = {
    organizationId: 42,
    tier: 'standard',
    industryMode: 'biotech',
    enabledModules: ['ind'],
    maxUsers: 10,
    maxProjects: 10,
    maxStorageGB: 10,
  };

  const catalog: ModuleCatalogEntry[] = [
    entry({ moduleId: 'ind', name: 'IND', subscriptionState: 'enabled', isAvailable: true }),
    entry({ moduleId: 'risk', name: 'Risk', subscriptionState: 'disabled', isAvailable: true }),
    // No row, plan covers it — the un-provisioned case, end to end.
    entry({
      moduleId: 'labeling',
      name: 'Labeling',
      subscriptionState: 'none',
      isAvailable: true,
      requiredTier: 'standard',
    }),
    entry({
      moduleId: 'pdev',
      name: 'Product Development',
      subscriptionState: 'none',
      isAvailable: false,
      requiredTier: 'enterprise',
    }),
  ];

  it('returns resolved: true with exactly one verdict per catalog entry', async () => {
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockResolvedValue(catalog);

    const res = await resolveNavEntitlements(42, { masterAdmin: false });
    expect(res.resolved).toBe(true);
    expect(res.surfaces).toHaveLength(catalog.length);
    expect(res.surfaces.map((s) => s.id)).toEqual(['ind', 'risk', 'labeling', 'pdev']);
    expect(res.tier).toBe('standard');
    expect(res.industryMode).toBe('biotech');
    expect(res.organizationId).toBe(42);
  });

  it('each verdict matches the pure decision for its entry', async () => {
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockResolvedValue(catalog);

    const res = await resolveNavEntitlements(42, { masterAdmin: false });
    expect(res.surfaces).toEqual(
      catalog.map((e) => decideNavEntitlement(e, { masterAdmin: false, tier: 'standard' })),
    );
    // Spelled out, so the expectation is readable without running the SUT:
    expect(res.surfaces.map((s) => s.source)).toEqual([
      'subscribed',
      'disabled',
      'included',
      'tier',
    ]);
    expect(res.surfaces.map((s) => s.entitled)).toEqual([true, false, true, false]);
  });

  it('a master admin gets every surface entitled with source master_admin', async () => {
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockResolvedValue(catalog);

    const res = await resolveNavEntitlements(42, { masterAdmin: true });
    expect(res.resolved).toBe(true);
    expect(res.surfaces).toHaveLength(catalog.length);
    expect(res.surfaces.every((s) => s.entitled)).toBe(true);
    expect(res.surfaces.every((s) => s.source === 'master_admin')).toBe(true);
  });

  it('passes the organization id through to both reads (no cross-tenant widening)', async () => {
    getLicenseInfo.mockResolvedValue(license);
    getModuleCatalog.mockResolvedValue(catalog);

    await resolveNavEntitlements(7, { masterAdmin: true });
    expect(getLicenseInfo).toHaveBeenCalledWith(7);
    expect(getModuleCatalog).toHaveBeenCalledWith(7);
  });

  it('tolerates a null license while the catalog is readable (tier reported as null)', async () => {
    // getLicenseInfo returns null on a missing org rather than throwing. The
    // catalog is still real, so verdicts are still real — the tier claim just
    // has to be null instead of invented.
    getLicenseInfo.mockResolvedValue(null);
    getModuleCatalog.mockResolvedValue(catalog);

    const res = await resolveNavEntitlements(42, { masterAdmin: false });
    expect(res.resolved).toBe(true);
    expect(res.tier).toBeNull();
    expect(res.industryMode).toBeNull();
    expect(res.surfaces).toHaveLength(catalog.length);
    // pdev is unavailable with an unrankable (null) tier → industry, not tier.
    expect(res.surfaces.find((s) => s.id === 'pdev')?.source).toBe('industry');
  });
});
