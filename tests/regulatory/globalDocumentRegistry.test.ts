/**
 * Tests for the Global Document Registry and its query functions.
 */

import { describe, it, expect } from 'vitest';
import {
  GLOBAL_REGISTRY,
  getApplicationType,
  getByRegion,
  getByAgency,
  getByFamily,
  getByProductClass,
  search,
  resolveFromLegacy,
  getRegions,
  getCountByRegion,
} from '../../shared/regulatory/global-document-registry';

describe('Global Document Registry', () => {
  it('has entries for all required regions', () => {
    const regions = getRegions();
    expect(regions).toContain('US');
    expect(regions).toContain('EU');
    expect(regions).toContain('UK');
    expect(regions).toContain('CA');
    expect(regions).toContain('JP');
    expect(regions).toContain('CN');
    expect(regions).toContain('AU');
    expect(regions).toContain('CH');
    expect(regions).toContain('BR');
    expect(regions).toContain('IN');
    expect(regions).toContain('KR');
    expect(regions).toContain('SG');
  });

  it('has at least 60 active application types', () => {
    const active = GLOBAL_REGISTRY.filter(e => e.active);
    expect(active.length).toBeGreaterThanOrEqual(60);
  });

  it('every entry has required fields', () => {
    for (const entry of GLOBAL_REGISTRY) {
      expect(entry.id).toBeTruthy();
      expect(entry.region).toBeTruthy();
      expect(entry.country).toBeTruthy();
      expect(entry.agency).toBeTruthy();
      expect(entry.applicationFamily).toBeTruthy();
      expect(entry.applicationType).toBeTruthy();
      expect(entry.displayName).toBeTruthy();
      expect(entry.dossierStandard).toBeTruthy();
      expect(entry.stage).toBeTruthy();
      expect(Array.isArray(entry.productClass)).toBe(true);
      expect(Array.isArray(entry.synonyms)).toBe(true);
      expect(Array.isArray(entry.requiredArtifacts)).toBe(true);
      expect(Array.isArray(entry.lifecycleActions)).toBe(true);
    }
  });

  it('every entry has a unique ID', () => {
    const ids = GLOBAL_REGISTRY.map(e => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  describe('getApplicationType', () => {
    it('returns US_IND by ID', () => {
      const entry = getApplicationType('US_IND');
      expect(entry).toBeDefined();
      expect(entry!.region).toBe('US');
      expect(entry!.agency).toBe('FDA');
      expect(entry!.applicationFamily).toBe('clinical_trial');
    });

    it('returns EU_MAA by ID', () => {
      const entry = getApplicationType('EU_MAA');
      expect(entry).toBeDefined();
      expect(entry!.region).toBe('EU');
      expect(entry!.agency).toBe('EMA');
    });

    it('returns undefined for unknown ID', () => {
      expect(getApplicationType('FAKE_ID')).toBeUndefined();
    });
  });

  describe('getByRegion', () => {
    it('returns US entries', () => {
      const us = getByRegion('US');
      expect(us.length).toBeGreaterThan(5);
      expect(us.every(e => e.region === 'US')).toBe(true);
    });

    it('returns EU entries', () => {
      const eu = getByRegion('EU');
      expect(eu.length).toBeGreaterThan(5);
      expect(eu.every(e => e.region === 'EU')).toBe(true);
    });
  });

  describe('getByAgency', () => {
    it('returns FDA entries', () => {
      const fda = getByAgency('FDA');
      expect(fda.length).toBeGreaterThan(5);
      expect(fda.every(e => e.agency === 'FDA')).toBe(true);
    });
  });

  describe('getByFamily', () => {
    it('returns clinical trial entries across regions', () => {
      const ct = getByFamily('clinical_trial');
      expect(ct.length).toBeGreaterThan(5);
      const regions = new Set(ct.map(e => e.region));
      expect(regions.size).toBeGreaterThan(3);
    });
  });

  describe('getByProductClass', () => {
    it('returns medical device entries', () => {
      const devices = getByProductClass('medical_device');
      expect(devices.length).toBeGreaterThan(0);
      expect(devices.every(e => e.productClass.includes('medical_device'))).toBe(true);
    });
  });

  describe('search', () => {
    it('finds IND by name', () => {
      const results = search('IND');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(e => e.id === 'US_IND')).toBe(true);
    });

    it('finds 510k by synonym', () => {
      const results = search('510k');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(e => e.id === 'US_510K')).toBe(true);
    });

    it('finds MAA by display name', () => {
      const results = search('Marketing Authorisation');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for gibberish', () => {
      const results = search('xyzzy12345');
      expect(results.length).toBe(0);
    });
  });

  describe('resolveFromLegacy', () => {
    it('resolves IND to US_IND', () => {
      const entry = resolveFromLegacy('IND');
      expect(entry).toBeDefined();
      expect(entry!.id).toBe('US_IND');
    });

    it('resolves 510K to US_510K', () => {
      const entry = resolveFromLegacy('510K');
      expect(entry).toBeDefined();
      expect(entry!.id).toBe('US_510K');
    });

    it('resolves MAA to EU_MAA', () => {
      const entry = resolveFromLegacy('MAA');
      expect(entry).toBeDefined();
      expect(entry!.id).toBe('EU_MAA');
    });
  });

  describe('getCountByRegion', () => {
    it('returns counts for all regions', () => {
      const counts = getCountByRegion();
      expect(counts.US).toBeGreaterThan(5);
      expect(counts.EU).toBeGreaterThan(5);
    });
  });
});
