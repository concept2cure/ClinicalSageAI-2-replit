/**
 * Tests for the regulatory catalog API endpoints in concept2cure.ts.
 *
 * These test the endpoint handlers directly rather than making HTTP requests,
 * since we validate the service layer that powers them.
 */

import { describe, it, expect } from 'vitest';
import {
  getCatalog,
  getApplicationTypes,
  resolve,
  getBootstrapPreview,
  getRegionsWithCounts,
  getAgenciesWithCounts,
} from '../../server/services/regulatory/registry/globalDocumentRegistryService';
import { rankedSearch, typeahead, getFacetCounts } from '../../server/services/regulatory/registry/registrySearch';

describe('Regulatory Catalog Endpoints (service-level)', () => {
  describe('GET /regulatory-catalog/regions (getRegionsWithCounts)', () => {
    it('returns all 12 regions with counts', () => {
      const regions = getRegionsWithCounts();
      expect(regions.length).toBe(12);
      for (const r of regions) {
        expect(r).toHaveProperty('region');
        expect(r).toHaveProperty('country');
        expect(r).toHaveProperty('agency');
        expect(r).toHaveProperty('count');
        expect(r.count).toBeGreaterThan(0);
      }
    });

    it('US has the most application types', () => {
      const regions = getRegionsWithCounts();
      const us = regions.find(r => r.region === 'US');
      expect(us).toBeDefined();
      expect(us!.count).toBeGreaterThanOrEqual(10);
    });
  });

  describe('GET /regulatory-catalog/agencies (getAgenciesWithCounts)', () => {
    it('returns agencies with correct structure', () => {
      const agencies = getAgenciesWithCounts();
      expect(agencies.length).toBeGreaterThan(0);
      for (const a of agencies) {
        expect(a).toHaveProperty('agency');
        expect(a).toHaveProperty('region');
        expect(a).toHaveProperty('fullName');
        expect(a).toHaveProperty('count');
      }
    });

    it('includes FDA', () => {
      const agencies = getAgenciesWithCounts();
      expect(agencies.some(a => a.agency === 'FDA')).toBe(true);
    });
  });

  describe('GET /regulatory-catalog/application-types (getApplicationTypes)', () => {
    it('returns all active types when no filter', () => {
      const types = getApplicationTypes();
      expect(types.length).toBeGreaterThan(50);
    });

    it('filters by region', () => {
      const eu = getApplicationTypes({ region: 'EU' });
      expect(eu.length).toBeGreaterThan(0);
      expect(eu.every(e => e.region === 'EU')).toBe(true);
    });

    it('filters by agency', () => {
      const fda = getApplicationTypes({ agency: 'FDA' });
      expect(fda.every(e => e.agency === 'FDA')).toBe(true);
    });

    it('filters by family', () => {
      const ct = getApplicationTypes({ family: 'clinical_trial' });
      expect(ct.every(e => e.applicationFamily === 'clinical_trial')).toBe(true);
    });

    it('filters by product class', () => {
      const devices = getApplicationTypes({ productClass: 'medical_device' });
      expect(devices.every(e => e.productClass.includes('medical_device'))).toBe(true);
    });

    it('filters by text query', () => {
      const results = getApplicationTypes({ query: 'biologics' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('combines multiple filters', () => {
      const results = getApplicationTypes({ region: 'US', family: 'marketing_authorization' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(e => e.region === 'US' && e.applicationFamily === 'marketing_authorization')).toBe(true);
    });
  });

  describe('POST /regulatory-catalog/resolve (resolve)', () => {
    it('resolves US_IND by registry ID', () => {
      const result = resolve('US_IND');
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('US_IND');
      expect(result!.sectionBlueprint).toBeDefined();
      expect(result!.taskBlueprint).toBeDefined();
    });

    it('resolves IND by legacy type', () => {
      const result = resolve('IND');
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('US_IND');
    });

    it('resolves MAA by legacy type', () => {
      const result = resolve('MAA');
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('EU_MAA');
    });

    it('resolves 510K by legacy type', () => {
      const result = resolve('510K');
      expect(result).not.toBeNull();
      expect(result!.entry.id).toBe('US_510K');
    });

    it('returns null for unknown', () => {
      const result = resolve('NONEXISTENT_TYPE');
      expect(result).toBeNull();
    });

    it('includes region profile when available', () => {
      const result = resolve('US_IND');
      expect(result!.regionProfile).toBeDefined();
      expect(result!.regionProfile!.region).toBe('US');
    });
  });

  describe('POST /regulatory-catalog/bootstrap-preview (getBootstrapPreview)', () => {
    it('returns preview for US_IND', () => {
      const preview = getBootstrapPreview('US_IND');
      expect(preview).not.toBeNull();
      expect(preview!.sections.length).toBeGreaterThan(0);
      expect(preview!.milestones.length).toBeGreaterThan(0);
      expect(preview!.dossierStandard).toBe('eCTD');
    });

    it('returns preview for EU_MAA', () => {
      const preview = getBootstrapPreview('EU_MAA');
      expect(preview).not.toBeNull();
      expect(preview!.entry.agency).toBe('EMA');
    });

    it('returns preview for US_510K', () => {
      const preview = getBootstrapPreview('US_510K');
      expect(preview).not.toBeNull();
      expect(preview!.dossierStandard).toBe('eSTAR');
    });

    it('returns null for unknown ID', () => {
      expect(getBootstrapPreview('FAKE')).toBeNull();
    });

    it('each section has required fields', () => {
      const preview = getBootstrapPreview('US_NDA');
      expect(preview).not.toBeNull();
      for (const s of preview!.sections) {
        expect(s).toHaveProperty('code');
        expect(s).toHaveProperty('title');
        expect(s).toHaveProperty('module');
        expect(typeof s.required).toBe('boolean');
      }
    });
  });

  describe('GET /regulatory-catalog/search (rankedSearch)', () => {
    it('returns ranked results for IND', () => {
      const results = rankedSearch('IND');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
      expect(results.some(r => r.entry.id === 'US_IND')).toBe(true);
    });

    it('returns empty for no match', () => {
      expect(rankedSearch('zzzzzzz').length).toBe(0);
    });

    it('respects limit', () => {
      const results = rankedSearch('application', undefined, 5);
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('filters by region', () => {
      const results = rankedSearch('approval', { region: 'JP' });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.entry.region === 'JP')).toBe(true);
    });
  });

  describe('typeahead', () => {
    it('returns results for partial input', () => {
      const results = typeahead('mar');
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects limit', () => {
      const results = typeahead('a', undefined, 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getFacetCounts', () => {
    it('returns counts for all facets', () => {
      const facets = getFacetCounts();
      expect(Object.keys(facets.regions).length).toBeGreaterThan(0);
      expect(Object.keys(facets.agencies).length).toBeGreaterThan(0);
      expect(Object.keys(facets.families).length).toBeGreaterThan(0);
    });
  });

  describe('getCatalog', () => {
    it('returns full catalog summary', () => {
      const catalog = getCatalog();
      expect(catalog.regions.length).toBe(12);
      expect(catalog.agencies.length).toBeGreaterThan(0);
      expect(catalog.families.length).toBe(12);
      expect(catalog.totalApplicationTypes).toBeGreaterThan(50);
    });
  });
});
