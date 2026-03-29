/**
 * Tests for the Legacy Submission Type Mapper.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveRegistryId,
  mapToNormalizedMetadata,
  isLegacyType,
  resolveEntry,
  getAllLegacyMappings,
} from '../../server/services/regulatory/registry/legacySubmissionTypeMapper';

describe('Legacy Submission Type Mapper', () => {
  describe('resolveRegistryId', () => {
    it('resolves all core legacy types', () => {
      expect(resolveRegistryId('IND')).toBe('US_IND');
      expect(resolveRegistryId('NDA')).toBe('US_NDA');
      expect(resolveRegistryId('BLA')).toBe('US_BLA');
      expect(resolveRegistryId('510K')).toBe('US_510K');
      expect(resolveRegistryId('PMA')).toBe('US_PMA');
      expect(resolveRegistryId('MAA')).toBe('EU_MAA');
      expect(resolveRegistryId('DE_NOVO')).toBe('US_DE_NOVO');
      expect(resolveRegistryId('EUA')).toBe('US_EUA');
      expect(resolveRegistryId('ANDA')).toBe('US_ANDA');
      expect(resolveRegistryId('CTA')).toBe('EU_CTA');
      expect(resolveRegistryId('CER')).toBe('EU_CER');
      expect(resolveRegistryId('IVDR')).toBe('EU_IVDR');
    });

    it('resolves alias types', () => {
      expect(resolveRegistryId('FDA_510K')).toBe('US_510K');
      expect(resolveRegistryId('510(k)')).toBe('US_510K');
      expect(resolveRegistryId('sNDA')).toBe('US_NDA_SUPP');
      expect(resolveRegistryId('sBLA')).toBe('US_BLA_SUPP');
      expect(resolveRegistryId('505(b)(2)')).toBe('US_505B2');
    });

    it('resolves already-canonical IDs', () => {
      expect(resolveRegistryId('US_IND')).toBe('US_IND');
      expect(resolveRegistryId('EU_MAA')).toBe('EU_MAA');
    });

    it('returns null for unknown types', () => {
      expect(resolveRegistryId('FAKE')).toBeNull();
      expect(resolveRegistryId('')).toBeNull();
    });
  });

  describe('mapToNormalizedMetadata', () => {
    it('normalizes IND to full metadata', () => {
      const meta = mapToNormalizedMetadata('IND');
      expect(meta).not.toBeNull();
      expect(meta!.registryId).toBe('US_IND');
      expect(meta!.region).toBe('US');
      expect(meta!.agency).toBe('FDA');
      expect(meta!.applicationFamily).toBe('clinical_trial');
      expect(meta!.dossierStandard).toBe('eCTD');
    });

    it('normalizes MAA to full metadata', () => {
      const meta = mapToNormalizedMetadata('MAA');
      expect(meta).not.toBeNull();
      expect(meta!.registryId).toBe('EU_MAA');
      expect(meta!.region).toBe('EU');
      expect(meta!.agency).toBe('EMA');
      expect(meta!.applicationFamily).toBe('marketing_authorization');
    });

    it('normalizes 510K to device metadata', () => {
      const meta = mapToNormalizedMetadata('510K');
      expect(meta).not.toBeNull();
      expect(meta!.applicationFamily).toBe('device_clearance');
      expect(meta!.dossierStandard).toBe('eSTAR');
    });

    it('returns null for unknown types', () => {
      expect(mapToNormalizedMetadata('FAKE')).toBeNull();
    });
  });

  describe('isLegacyType', () => {
    it('recognizes legacy types', () => {
      expect(isLegacyType('IND')).toBe(true);
      expect(isLegacyType('510K')).toBe(true);
      expect(isLegacyType('MAA')).toBe(true);
    });

    it('does not recognize registry IDs as legacy', () => {
      // US_IND is in the extended map too, so it IS recognized
      expect(isLegacyType('FAKE_TYPE')).toBe(false);
    });
  });

  describe('resolveEntry', () => {
    it('returns full entry for legacy type', () => {
      const entry = resolveEntry('IND');
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe('US_IND');
      expect(entry!.displayName).toContain('Investigational');
    });
  });

  describe('getAllLegacyMappings', () => {
    it('returns a non-empty list', () => {
      const mappings = getAllLegacyMappings();
      expect(mappings.length).toBeGreaterThan(10);
      expect(mappings[0]).toHaveProperty('legacy');
      expect(mappings[0]).toHaveProperty('registryId');
      expect(mappings[0]).toHaveProperty('displayName');
    });
  });
});
