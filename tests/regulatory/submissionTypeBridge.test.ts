/**
 * Tests for the submission-type-bridge — canonical resolution layer that all
 * services converge on instead of defining their own SubmissionType enums.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveToRegistryId,
  resolveToRegistryEntry,
  isKnownSubmissionType,
  getSubmissionTypeLabel,
  getSubmissionTypeContext,
  getAllActiveSubmissionTypes,
  getAllAliases,
  getSubmissionTypeOptions,
} from '../../shared/regulatory/submission-type-bridge';

describe('Submission Type Bridge', () => {
  describe('resolveToRegistryId', () => {
    it('resolves uppercase legacy types', () => {
      expect(resolveToRegistryId('IND')).toBe('US_IND');
      expect(resolveToRegistryId('NDA')).toBe('US_NDA');
      expect(resolveToRegistryId('BLA')).toBe('US_BLA');
      expect(resolveToRegistryId('510K')).toBe('US_510K');
      expect(resolveToRegistryId('PMA')).toBe('US_PMA');
      expect(resolveToRegistryId('MAA')).toBe('EU_MAA');
      expect(resolveToRegistryId('DE_NOVO')).toBe('US_DE_NOVO');
      expect(resolveToRegistryId('EUA')).toBe('US_EUA');
    });

    it('resolves registry IDs to themselves', () => {
      expect(resolveToRegistryId('US_IND')).toBe('US_IND');
      expect(resolveToRegistryId('EU_MAA')).toBe('EU_MAA');
      expect(resolveToRegistryId('JP_MKT_APPROVAL')).toBe('JP_MKT_APPROVAL');
      expect(resolveToRegistryId('UK_CTA')).toBe('UK_CTA');
    });

    it('resolves case-insensitively', () => {
      expect(resolveToRegistryId('ind')).toBe('US_IND');
      expect(resolveToRegistryId('nda')).toBe('US_NDA');
      expect(resolveToRegistryId('510k')).toBe('US_510K');
      expect(resolveToRegistryId('maa')).toBe('EU_MAA');
      expect(resolveToRegistryId('us_ind')).toBe('US_IND');
    });

    it('resolves curated aliases', () => {
      expect(resolveToRegistryId('FDA_510K')).toBe('US_510K');
      expect(resolveToRegistryId('JNDA')).toBe('JP_MKT_APPROVAL');
      expect(resolveToRegistryId('DENOVO')).toBe('US_DE_NOVO');
      expect(resolveToRegistryId('SNDA')).toBe('US_NDA_SUPP');
      expect(resolveToRegistryId('505B2')).toBe('US_505B2');
      expect(resolveToRegistryId('DMF')).toBe('US_DMF');
      expect(resolveToRegistryId('MDR_TD')).toBe('EU_MDR_TECHDOC');
      expect(resolveToRegistryId('IVDR_TD')).toBe('EU_IVDR_TECHDOC');
    });

    it('resolves international types', () => {
      expect(resolveToRegistryId('CA_NDS')).toBe('CA_NDS');
      expect(resolveToRegistryId('NDS')).toBe('CA_NDS');
      expect(resolveToRegistryId('CN_CTA')).toBe('CN_CTA');
      expect(resolveToRegistryId('AU_CTN')).toBe('AU_CTN');
      expect(resolveToRegistryId('KR_IND')).toBe('KR_IND');
      expect(resolveToRegistryId('SG_NDA')).toBe('SG_NDA');
      expect(resolveToRegistryId('BR_DDCM')).toBe('BR_DDCM');
    });

    it('returns null for unknown types', () => {
      expect(resolveToRegistryId('NONEXISTENT')).toBeNull();
      expect(resolveToRegistryId('')).toBeNull();
    });
  });

  describe('resolveToRegistryEntry', () => {
    it('returns full entry for legacy type', () => {
      const entry = resolveToRegistryEntry('IND');
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe('US_IND');
      expect(entry!.agency).toBe('FDA');
      expect(entry!.segment).toBe('pharma_biotech');
      expect(entry!.category).toBe('investigational');
    });

    it('returns full entry for registry ID', () => {
      const entry = resolveToRegistryEntry('EU_MAA');
      expect(entry).not.toBeNull();
      expect(entry!.agency).toBe('EMA');
      expect(entry!.region).toBe('EU');
    });

    it('returns null for unknown', () => {
      expect(resolveToRegistryEntry('ZZZZZ')).toBeNull();
    });
  });

  describe('isKnownSubmissionType', () => {
    it('recognizes legacy types', () => {
      expect(isKnownSubmissionType('IND')).toBe(true);
      expect(isKnownSubmissionType('510K')).toBe(true);
      expect(isKnownSubmissionType('maa')).toBe(true);
    });

    it('recognizes registry IDs', () => {
      expect(isKnownSubmissionType('US_IND')).toBe(true);
      expect(isKnownSubmissionType('JP_MKT_APPROVAL')).toBe(true);
    });

    it('rejects unknown', () => {
      expect(isKnownSubmissionType('FAKE')).toBe(false);
    });
  });

  describe('getSubmissionTypeLabel', () => {
    it('returns display name for known types', () => {
      expect(getSubmissionTypeLabel('IND')).toBe('Investigational New Drug Application');
      expect(getSubmissionTypeLabel('US_510K')).toContain('510(k)');
    });

    it('falls back to input for unknown', () => {
      expect(getSubmissionTypeLabel('MYSTERY')).toBe('MYSTERY');
    });
  });

  describe('getSubmissionTypeContext', () => {
    it('returns structured context', () => {
      const ctx = getSubmissionTypeContext('IND');
      expect(ctx).not.toBeNull();
      expect(ctx!.registryId).toBe('US_IND');
      expect(ctx!.region).toBe('US');
      expect(ctx!.agency).toBe('FDA');
      expect(ctx!.segment).toBe('pharma_biotech');
      expect(ctx!.category).toBe('investigational');
      expect(ctx!.dossierStandard).toBe('eCTD');
      expect(ctx!.applicationFamily).toBe('clinical_trial');
    });

    it('returns null for unknown', () => {
      expect(getSubmissionTypeContext('FAKE')).toBeNull();
    });
  });

  describe('getAllActiveSubmissionTypes', () => {
    it('returns all active entries', () => {
      const active = getAllActiveSubmissionTypes();
      expect(active.length).toBeGreaterThan(100);
      expect(active.every(e => e.active)).toBe(true);
    });
  });

  describe('getAllAliases', () => {
    it('returns a comprehensive alias list', () => {
      const aliases = getAllAliases();
      expect(aliases.length).toBeGreaterThan(50);
      const aliasMap = new Map(aliases.map(a => [a.alias, a.registryId]));
      expect(aliasMap.get('IND')).toBe('US_IND');
      expect(aliasMap.get('US_IND')).toBe('US_IND');
    });
  });

  describe('getSubmissionTypeOptions', () => {
    it('returns options with segment classification', () => {
      const opts = getSubmissionTypeOptions();
      expect(opts.length).toBeGreaterThan(100);
      const usInd = opts.find(o => o.value === 'US_IND');
      expect(usInd).toBeDefined();
      expect(usInd!.segment).toBe('pharma_biotech');
    });
  });

  describe('cross-service convergence: all local types resolve', () => {
    const complianceTypes = ['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'];
    const pyramidTypes = ['510K', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'JNDA', 'DE_NOVO'];
    const marketSpecTypes = ['ind', 'nda', 'bla', 'anda', '510k', 'de_novo', 'pma', 'maa', 'cta', 'jnda', 'mdr_td', 'ivdr_td'];
    const patternTypes = ['NDA', 'BLA', '510k', 'PMA', 'ANDA', 'IND', 'MAA', 'CTD'];
    const deficiencyTypes = ['ind', 'nda', 'bla', '510k', 'pma', 'de_novo', 'cer'];
    const reasoningTypes = ['ind', 'nda', 'bla', 'maa', 'cta', 'anda', '510k', 'pma'];
    const fdaDeviceTypes = ['510k', 'pma', 'denovo', 'ide'];

    const allLocalTypes = [
      ...complianceTypes,
      ...pyramidTypes,
      ...marketSpecTypes,
      ...patternTypes,
      ...deficiencyTypes,
      ...reasoningTypes,
      ...fdaDeviceTypes,
    ];

    const unique = [...new Set(allLocalTypes)];

    it.each(unique)('"%s" resolves to a registry entry', (type) => {
      const id = resolveToRegistryId(type);
      expect(id, `"${type}" should resolve to a registry ID`).not.toBeNull();
    });
  });
});
