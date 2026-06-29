import { describe, it, expect } from 'vitest';
import {
  REGION_PROFILES,
  getRegionProfile,
  getRegionsByAgency,
} from '../../shared/regulatory/region-profiles';
import type { Region } from '../../shared/regulatory/document-taxonomy';

const ALL_REGIONS: Region[] = ['US', 'EU', 'UK', 'CA', 'JP', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG'];

describe('region-profiles — catalog completeness', () => {
  it('defines profiles for all 12 canonical regions', () => {
    expect(REGION_PROFILES).toHaveLength(12);
    const regionCodes = REGION_PROFILES.map((p) => p.region);
    for (const r of ALL_REGIONS) {
      expect(regionCodes).toContain(r);
    }
  });

  it('every profile has all required fields', () => {
    for (const p of REGION_PROFILES) {
      expect(p.region).toBeTruthy();
      expect(p.country).toBeTruthy();
      expect(p.agency).toBeTruthy();
      expect(p.agencyFullName).toBeTruthy();
      expect(p.currency).toBeTruthy();
      expect(p.language).toBeTruthy();
      expect(p.dossierStandard).toBeTruthy();
      expect(p.supportedFamilies.length).toBeGreaterThan(0);
    }
  });

  it('no duplicate region codes', () => {
    const codes = REGION_PROFILES.map((p) => p.region);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('region-profiles — agency mapping', () => {
  it('US maps to FDA', () => {
    expect(getRegionProfile('US')!.agency).toBe('FDA');
  });

  it('EU maps to EMA', () => {
    expect(getRegionProfile('EU')!.agency).toBe('EMA');
  });

  it('JP maps to PMDA', () => {
    expect(getRegionProfile('JP')!.agency).toBe('PMDA');
  });

  it('CN maps to NMPA', () => {
    expect(getRegionProfile('CN')!.agency).toBe('NMPA');
  });
});

describe('region-profiles — dossier standards', () => {
  it('US, EU, UK, CA, JP, KR, AU, CH use eCTD', () => {
    for (const r of ['US', 'EU', 'UK', 'CA', 'JP', 'KR', 'AU', 'CH']) {
      expect(getRegionProfile(r)!.dossierStandard).toBe('eCTD');
    }
  });

  it('CN, BR, IN use CTD (non-electronic)', () => {
    for (const r of ['CN', 'BR', 'IN']) {
      expect(getRegionProfile(r)!.dossierStandard).toBe('CTD');
    }
  });

  it('SG uses ACTD', () => {
    expect(getRegionProfile('SG')!.dossierStandard).toBe('ACTD');
  });
});

describe('region-profiles — languages', () => {
  it('JP language is ja', () => {
    expect(getRegionProfile('JP')!.language).toBe('ja');
  });

  it('CN language is zh', () => {
    expect(getRegionProfile('CN')!.language).toBe('zh');
  });

  it('KR language is ko', () => {
    expect(getRegionProfile('KR')!.language).toBe('ko');
  });

  it('BR language is pt', () => {
    expect(getRegionProfile('BR')!.language).toBe('pt');
  });

  it('US, EU, UK, CA, AU, IN, SG language is en', () => {
    for (const r of ['US', 'EU', 'UK', 'CA', 'AU', 'IN', 'SG']) {
      expect(getRegionProfile(r)!.language).toBe('en');
    }
  });
});

describe('region-profiles — query functions', () => {
  it('getRegionProfile returns undefined for unknown region', () => {
    expect(getRegionProfile('XX')).toBeUndefined();
  });

  it('getRegionsByAgency returns exactly 1 result for FDA', () => {
    const fda = getRegionsByAgency('FDA');
    expect(fda).toHaveLength(1);
    expect(fda[0].region).toBe('US');
  });

  it('getRegionsByAgency returns empty for unknown agency', () => {
    expect(getRegionsByAgency('FAKE')).toHaveLength(0);
  });

  it('every region supports marketing_authorization', () => {
    for (const p of REGION_PROFILES) {
      expect(p.supportedFamilies).toContain('marketing_authorization');
    }
  });

  it('US supports the widest set of families', () => {
    const us = getRegionProfile('US')!;
    expect(us.supportedFamilies.length).toBeGreaterThanOrEqual(5);
    expect(us.supportedFamilies).toContain('device_clearance');
    expect(us.supportedFamilies).toContain('device_approval');
    expect(us.supportedFamilies).toContain('pre_submission');
  });
});
