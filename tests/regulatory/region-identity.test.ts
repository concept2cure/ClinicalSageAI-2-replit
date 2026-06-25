import { describe, it, expect } from 'vitest';
import {
  REGION_IDENTITY,
  getRegionIdentity,
  toGatewaySlug,
  toAgency,
  toMarket,
  toRuleRegion,
  m1BackbonePath,
  regionForAgency,
  regionForGatewaySlug,
  listCanonicalRegions,
  type CanonicalRegion,
} from '../../shared/regulatory/region-identity';
import { REGION_PROFILES } from '../../shared/regulatory/region-profiles';
import { listGateways } from '../../server/services/submission-gateways';
import { REGIONAL_MODULE1_REQUIREMENTS } from '../../server/services/global-ri/regional-module1-requirements';

describe('region-identity — canonical reconciliation', () => {
  it('has 12 regions, each with code matching its key', () => {
    expect(listCanonicalRegions()).toHaveLength(12);
    for (const [key, id] of Object.entries(REGION_IDENTITY)) {
      expect(id.code).toBe(key);
    }
  });

  it('maps to the gateway slug vocabulary', () => {
    expect(toGatewaySlug('US')).toBe('fda');
    expect(toGatewaySlug('EU')).toBe('ema');
    expect(toGatewaySlug('JP')).toBe('pmda');
    expect(toGatewaySlug('CA')).toBe('ca');
    expect(toGatewaySlug('KR')).toBe('kr');
  });

  it('maps to the rule-region vocabulary (subset; undefined elsewhere)', () => {
    expect(toRuleRegion('US')).toBe('fda');
    expect(toRuleRegion('EU')).toBe('eu');
    expect(toRuleRegion('JP')).toBe('jp');
    expect(toRuleRegion('CH')).toBe('ch');
    expect(toRuleRegion('UK')).toBeUndefined(); // no UK-specific corpus rules
    expect(toRuleRegion('SG')).toBeUndefined();
  });

  it('reverse lookups round-trip', () => {
    expect(regionForAgency('FDA')).toBe('US');
    expect(regionForAgency('MFDS')).toBe('KR');
    expect(regionForGatewaySlug('ema')).toBe('EU');
    expect(regionForGatewaySlug('pmda')).toBe('JP');
    expect(getRegionIdentity('xx')).toBeUndefined();
  });
});

describe('region-identity — verified against existing sources of truth', () => {
  it('agency + language profile agrees with region-profiles for every region', () => {
    for (const profile of REGION_PROFILES) {
      if (profile.region === 'GLOBAL') continue;
      const id = getRegionIdentity(profile.region);
      expect(id, `region-profiles has ${profile.region}; region-identity must too`).toBeDefined();
      expect(toAgency(profile.region)).toBe(profile.agency);
    }
  });

  it('every region default gateway exists in the live gateway registry', () => {
    const live = new Set(listGateways().map((g) => `${g.region}:${g.gateway}`));
    for (const id of Object.values(REGION_IDENTITY)) {
      expect(live.has(`${id.gatewaySlug}:${id.defaultGateway}`), `${id.code} → ${id.gatewaySlug}:${id.defaultGateway} must be a registered gateway`).toBe(true);
    }
  });

  it('every region market key (when present) exists in the Module 1 requirements registry', () => {
    for (const id of Object.values(REGION_IDENTITY)) {
      if (id.market) {
        expect(REGIONAL_MODULE1_REQUIREMENTS[id.market], `${id.code} → market ${id.market}`).toBeDefined();
      }
    }
  });
});

describe('region-identity — preserves the legacy submission-resolver values', () => {
  it('reproduces the old AGENCY_GATEWAY + AGENCY_MODULE1 literals for US/EU/JP', () => {
    const expected: Record<string, { slug: string; gw: string; m1: string }> = {
      US: { slug: 'fda', gw: 'esg', m1: '/m1/us/us-regional.xml' },
      EU: { slug: 'ema', gw: 'cesp', m1: '/m1/eu/eu-regional.xml' },
      JP: { slug: 'pmda', gw: 'pmda_gateway', m1: '/m1/jp/jp-regional.xml' },
    };
    for (const [code, e] of Object.entries(expected)) {
      const id = REGION_IDENTITY[code as CanonicalRegion];
      expect(id.gatewaySlug).toBe(e.slug);
      expect(id.defaultGateway).toBe(e.gw);
      expect(`/${m1BackbonePath(code)}`).toBe(e.m1);
    }
  });
});
