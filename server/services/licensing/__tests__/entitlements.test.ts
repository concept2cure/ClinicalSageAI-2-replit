import { describe, it, expect } from 'vitest';
import {
  tierLevel,
  nextTier,
  buildFeatureCatalog,
  computeRecommendations,
  type FeatureEntitlement,
  type QuotaUsage,
} from '../entitlements-service';
import { computeOutstanding, buildAcceptanceHash, type LicenseAgreement } from '../eula-service';

describe('tier model', () => {
  it('orders tiers free < standard < professional < enterprise', () => {
    expect(tierLevel('free')).toBeLessThan(tierLevel('standard'));
    expect(tierLevel('standard')).toBeLessThan(tierLevel('professional'));
    expect(tierLevel('professional')).toBeLessThan(tierLevel('enterprise'));
  });

  it('treats unknown tiers as the floor', () => {
    expect(tierLevel('bogus')).toBe(0);
  });

  it('returns the next tier up, null at the ceiling', () => {
    expect(nextTier('free')).toBe('standard');
    expect(nextTier('professional')).toBe('enterprise');
    expect(nextTier('enterprise')).toBeNull();
  });
});

describe('buildFeatureCatalog', () => {
  it('marks standard-tier features unavailable on free', () => {
    const catalog = buildFeatureCatalog('free');
    const deepResearch = catalog.find(f => f.key === 'deep_research');
    expect(deepResearch?.available).toBe(false);
    expect(deepResearch?.module).toBe('Evidence');
  });

  it('unlocks everything at enterprise', () => {
    const catalog = buildFeatureCatalog('enterprise');
    expect(catalog.every(f => f.available)).toBe(true);
    expect(catalog.find(f => f.key === 'electronic_signatures')?.available).toBe(true);
  });

  it('keeps free features available on free', () => {
    const catalog = buildFeatureCatalog('free');
    expect(catalog.find(f => f.key === 'chat')?.available).toBe(true);
  });
});

describe('computeRecommendations', () => {
  const features: FeatureEntitlement[] = [
    { key: 'deep_research', label: 'Deep Research', module: 'Evidence', requiredTier: 'standard', value: 'high', available: false },
    { key: 'csr_builder', label: 'CSR Builder', module: 'Specialist', requiredTier: 'standard', value: 'high', available: false },
    { key: 'ctd_builder', label: 'CTD Builder', module: 'Submissions', requiredTier: 'professional', value: 'high', available: false },
  ];
  const healthyQuotas: QuotaUsage[] = [
    { key: 'projects', label: 'Projects', current: 2, max: 10, pct: 20, withinQuota: true },
    { key: 'users', label: 'Users', current: 1, max: 5, pct: 20, withinQuota: true },
  ];

  it('flags outstanding agreements as critical and first', () => {
    const recs = computeRecommendations({
      tier: 'standard',
      features,
      quotas: healthyQuotas,
      outstandingAgreements: [{ id: 'a1', title: 'EULA' }],
    });
    expect(recs[0].type).toBe('license_acceptance');
    expect(recs[0].severity).toBe('critical');
  });

  it('emits a critical quota warning when over the limit', () => {
    const recs = computeRecommendations({
      tier: 'standard',
      features,
      quotas: [{ key: 'projects', label: 'Projects', current: 10, max: 10, pct: 100, withinQuota: false }],
      outstandingAgreements: [],
    });
    const q = recs.find(r => r.type === 'quota_warning');
    expect(q?.severity).toBe('critical');
  });

  it('emits a warning when approaching the limit (>=80%)', () => {
    const recs = computeRecommendations({
      tier: 'standard',
      features,
      quotas: [{ key: 'users', label: 'Users', current: 4, max: 5, pct: 80, withinQuota: true }],
      outstandingAgreements: [],
    });
    const q = recs.find(r => r.type === 'quota_warning');
    expect(q?.severity).toBe('warning');
  });

  it('recommends the next tier and counts what it unlocks', () => {
    const recs = computeRecommendations({
      tier: 'free',
      features,
      quotas: healthyQuotas,
      outstandingAgreements: [],
    });
    const upgrade = recs.find(r => r.type === 'upgrade_tier');
    expect(upgrade).toBeDefined();
    expect(upgrade?.meta?.targetTier).toBe('standard');
    // free -> standard unlocks the two standard features, not the professional one.
    expect(upgrade?.meta?.unlockCount).toBe(2);
  });

  it('does not recommend an upgrade at the ceiling', () => {
    const recs = computeRecommendations({
      tier: 'enterprise',
      features: features.map(f => ({ ...f, available: true })),
      quotas: healthyQuotas,
      outstandingAgreements: [],
    });
    expect(recs.find(r => r.type === 'upgrade_tier')).toBeUndefined();
  });
});

describe('EULA pure helpers', () => {
  const agreements: LicenseAgreement[] = [
    { id: 'eula-1', agreementKey: 'eula', version: '1', title: 'EULA', summary: null, body: null, url: null, scope: 'user', required: true, status: 'active', effectiveAt: 'x' },
    { id: 'tos-1', agreementKey: 'tos', version: '1', title: 'ToS', summary: null, body: null, url: null, scope: 'organization', required: true, status: 'active', effectiveAt: 'x' },
    { id: 'opt-1', agreementKey: 'beta', version: '1', title: 'Beta', summary: null, body: null, url: null, scope: 'user', required: false, status: 'active', effectiveAt: 'x' },
  ];

  it('returns required, unaccepted agreements only', () => {
    const outstanding = computeOutstanding(agreements, new Set(['eula-1']));
    expect(outstanding.map(a => a.id)).toEqual(['tos-1']); // eula accepted, beta not required
  });

  it('returns empty when all required are accepted', () => {
    expect(computeOutstanding(agreements, new Set(['eula-1', 'tos-1']))).toEqual([]);
  });

  it('produces a stable, deterministic acceptance hash', () => {
    const args = { userId: 7, organizationId: 3, agreementKey: 'eula', agreementVersion: '2026.06', acceptedAt: '2026-06-21T00:00:00.000Z' };
    const h1 = buildAcceptanceHash(args);
    const h2 = buildAcceptanceHash(args);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
    // Changing any field changes the hash.
    expect(buildAcceptanceHash({ ...args, userId: 8 })).not.toBe(h1);
  });
});
