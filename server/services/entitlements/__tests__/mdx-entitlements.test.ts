/**
 * Tests for the MDX/global entitlements module.
 *
 * Covers: each feature maps to a real tier; isEntitled is monotonic across
 * tiers; entitlementsForTier is correct and grows with tier; unknown inputs are
 * handled honestly (no throw, no fabricated tier).
 */

import { describe, it, expect } from 'vitest';
import {
  TIERS,
  isTier,
  isFeatureKey,
  featureTier,
  isEntitled,
  entitlementsForTier,
  entitlementMatrix,
  allFeatures,
} from '../mdx-entitlements';
import type { FeatureKey, Tier } from '../types';

/** The real tiers, ascending — must match billing.ts / usage-metering.ts. */
const REAL_TIERS: Tier[] = ['free', 'standard', 'professional', 'enterprise'];

const TIER_RANK: Record<Tier, number> = {
  free: 0,
  standard: 1,
  professional: 2,
  enterprise: 3,
};

describe('tier fidelity', () => {
  it('exposes exactly the four real tiers in ascending order', () => {
    expect([...TIERS]).toEqual(REAL_TIERS);
  });

  it('isTier recognises every real tier and rejects fabricated ones', () => {
    for (const t of REAL_TIERS) expect(isTier(t)).toBe(true);
    for (const bad of ['premium', 'team', 'pro', 'FREE', '', undefined, null, 3]) {
      expect(isTier(bad)).toBe(false);
    }
  });
});

describe('featureTier', () => {
  it('maps every known feature to a real tier', () => {
    for (const feature of allFeatures()) {
      const tier = featureTier(feature);
      expect(tier).not.toBeNull();
      expect(REAL_TIERS).toContain(tier as Tier);
    }
  });

  it('uses the documented minimum tiers', () => {
    const expected: Record<FeatureKey, Tier> = {
      report_families: 'standard',
      device_assembly_readiness: 'standard',
      global_market_planner: 'standard',
      ana_advisory: 'standard',
      prediction_forecast_report: 'professional',
      crl_rtf_premortem: 'professional',
      scheduled_reports: 'professional',
      ana_live_drive: 'professional',
      portfolio_rollup: 'enterprise',
    };
    for (const [feature, tier] of Object.entries(expected)) {
      expect(featureTier(feature)).toBe(tier);
    }
  });

  it('returns null for an unknown feature', () => {
    expect(featureTier('nonexistent_feature')).toBeNull();
    expect(featureTier('')).toBeNull();
  });
});

describe('isEntitled', () => {
  it('entitles a tier exactly at and above the feature minimum', () => {
    for (const feature of allFeatures()) {
      const min = featureTier(feature) as Tier;
      for (const tier of REAL_TIERS) {
        const expected = TIER_RANK[tier] >= TIER_RANK[min];
        expect(isEntitled(feature, tier)).toBe(expected);
      }
    }
  });

  it('is monotonic across tiers: once entitled, never revoked at a higher tier', () => {
    for (const feature of allFeatures()) {
      let seenEntitled = false;
      for (const tier of REAL_TIERS) {
        const entitled = isEntitled(feature, tier);
        if (seenEntitled) {
          expect(entitled).toBe(true);
        }
        if (entitled) seenEntitled = true;
      }
    }
  });

  it('enterprise is entitled to every feature', () => {
    for (const feature of allFeatures()) {
      expect(isEntitled(feature, 'enterprise')).toBe(true);
    }
  });

  it('free is not entitled to any of the new paid capabilities', () => {
    for (const feature of allFeatures()) {
      expect(isEntitled(feature, 'free')).toBe(false);
    }
  });

  it('returns false (never throws) for unknown feature or tier', () => {
    expect(isEntitled('nope', 'enterprise')).toBe(false);
    expect(isEntitled('report_families', 'platinum')).toBe(false);
    expect(isEntitled('nope', 'platinum')).toBe(false);
    expect(() => isEntitled('', '')).not.toThrow();
  });
});

describe('entitlementsForTier', () => {
  it('returns the correct entitled set per tier', () => {
    expect(entitlementsForTier('free')).toEqual([]);

    expect(new Set(entitlementsForTier('standard'))).toEqual(
      new Set<FeatureKey>([
        'report_families',
        'device_assembly_readiness',
        'global_market_planner',
        'ana_advisory',
      ]),
    );

    expect(new Set(entitlementsForTier('professional'))).toEqual(
      new Set<FeatureKey>([
        'report_families',
        'device_assembly_readiness',
        'global_market_planner',
        'ana_advisory',
        'prediction_forecast_report',
        'crl_rtf_premortem',
        'scheduled_reports',
        'ana_live_drive',
      ]),
    );

    expect(new Set(entitlementsForTier('enterprise'))).toEqual(new Set(allFeatures()));
  });

  it('is consistent with isEntitled for every feature/tier pair', () => {
    for (const tier of REAL_TIERS) {
      const set = new Set(entitlementsForTier(tier));
      for (const feature of allFeatures()) {
        expect(set.has(feature)).toBe(isEntitled(feature, tier));
      }
    }
  });

  it('grows monotonically with tier rank (each tier is a superset of the prior)', () => {
    for (let i = 1; i < REAL_TIERS.length; i++) {
      const lower = new Set(entitlementsForTier(REAL_TIERS[i - 1]));
      const higher = new Set(entitlementsForTier(REAL_TIERS[i]));
      for (const f of lower) expect(higher.has(f)).toBe(true);
      expect(higher.size).toBeGreaterThanOrEqual(lower.size);
    }
  });

  it('returns an empty array for an unknown tier', () => {
    expect(entitlementsForTier('platinum')).toEqual([]);
    expect(entitlementsForTier('')).toEqual([]);
  });
});

describe('matrix + introspection', () => {
  it('entitlementMatrix covers every feature exactly once with a real tier', () => {
    const matrix = entitlementMatrix();
    expect(matrix.length).toBe(allFeatures().length);
    const seen = new Set<string>();
    for (const row of matrix) {
      expect(seen.has(row.feature)).toBe(false);
      seen.add(row.feature);
      expect(REAL_TIERS).toContain(row.minTier);
      expect(row.label.length).toBeGreaterThan(0);
      expect(featureTier(row.feature)).toBe(row.minTier);
    }
  });

  it('entitlementMatrix returns a defensive copy (mutation does not leak)', () => {
    const a = entitlementMatrix();
    a[0].minTier = 'enterprise';
    const b = entitlementMatrix();
    expect(b[0].minTier).not.toBe('enterprise');
  });

  it('isFeatureKey recognises known features and rejects others', () => {
    for (const f of allFeatures()) expect(isFeatureKey(f)).toBe(true);
    for (const bad of ['', 'report', 'forecast', undefined, null, 42]) {
      expect(isFeatureKey(bad)).toBe(false);
    }
  });
});
