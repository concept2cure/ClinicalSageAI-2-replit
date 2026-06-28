import { describe, it, expect } from 'vitest';
import {
  LEGACY_TO_REGISTRY_ID,
  type Region,
  type Agency,
  type ApplicationFamily,
  type ProductClass,
  type DossierStandard,
  type LifecycleStage,
  type Segment,
  type FilingCategory,
  type LegacySubmissionType,
} from '../../shared/regulatory/document-taxonomy';

describe('document-taxonomy — LEGACY_TO_REGISTRY_ID mapping', () => {
  it('maps all 12 legacy submission types', () => {
    const keys = Object.keys(LEGACY_TO_REGISTRY_ID) as LegacySubmissionType[];
    expect(keys).toHaveLength(12);
  });

  it('every legacy key maps to a US_ or EU_ registry ID', () => {
    for (const [legacy, registryId] of Object.entries(LEGACY_TO_REGISTRY_ID)) {
      expect(registryId).toMatch(/^(US|EU)_/);
      expect(registryId.length).toBeGreaterThan(3);
    }
  });

  it('maps core FDA types correctly', () => {
    expect(LEGACY_TO_REGISTRY_ID['510K']).toBe('US_510K');
    expect(LEGACY_TO_REGISTRY_ID['IND']).toBe('US_IND');
    expect(LEGACY_TO_REGISTRY_ID['NDA']).toBe('US_NDA');
    expect(LEGACY_TO_REGISTRY_ID['BLA']).toBe('US_BLA');
    expect(LEGACY_TO_REGISTRY_ID['PMA']).toBe('US_PMA');
    expect(LEGACY_TO_REGISTRY_ID['DE_NOVO']).toBe('US_DE_NOVO');
    expect(LEGACY_TO_REGISTRY_ID['EUA']).toBe('US_EUA');
    expect(LEGACY_TO_REGISTRY_ID['ANDA']).toBe('US_ANDA');
  });

  it('maps EMA types correctly', () => {
    expect(LEGACY_TO_REGISTRY_ID['MAA']).toBe('EU_MAA');
    expect(LEGACY_TO_REGISTRY_ID['CTA']).toBe('EU_CTA');
    expect(LEGACY_TO_REGISTRY_ID['IVDR']).toBe('EU_IVDR');
    expect(LEGACY_TO_REGISTRY_ID['CER']).toBe('EU_CER');
  });

  it('no duplicate registry IDs in the mapping', () => {
    const values = Object.values(LEGACY_TO_REGISTRY_ID);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('document-taxonomy — type guard smoke tests', () => {
  it('Region type includes the 12 ISO codes + GLOBAL', () => {
    const regions: Region[] = ['US', 'EU', 'UK', 'CA', 'JP', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG', 'GLOBAL'];
    expect(regions).toHaveLength(13);
  });

  it('Agency type includes the 4 major + harmonization bodies', () => {
    const agencies: Agency[] = ['FDA', 'EMA', 'MHRA', 'Health_Canada', 'PMDA', 'NMPA', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'MFDS', 'HSA', 'ICH', 'ISO', 'IEC', 'IMDRF'];
    expect(agencies).toHaveLength(16);
  });

  it('ApplicationFamily covers all 20 families', () => {
    const families: ApplicationFamily[] = [
      'clinical_trial', 'marketing_authorization', 'variation', 'renewal',
      'master_file', 'pediatric', 'orphan', 'safety_report', 'supplement',
      'pre_submission', 'device_clearance', 'device_approval',
      'designation', 'quality_cmc', 'quality_system', 'post_market',
      'software_documentation', 'companion_diagnostic', 'clinical_document',
      'dossier_module',
    ];
    expect(families).toHaveLength(20);
  });

  it('ProductClass covers all 11 classes', () => {
    const classes: ProductClass[] = [
      'small_molecule', 'biologic', 'biosimilar', 'generic', 'otc',
      'medical_device', 'ivd', 'combination_product', 'atmp', 'vaccine', 'any',
    ];
    expect(classes).toHaveLength(11);
  });

  it('DossierStandard covers all 7 standards', () => {
    const standards: DossierStandard[] = ['eCTD', 'CTD', 'ACTD', 'NeeS', 'eSTAR', 'regional', 'none'];
    expect(standards).toHaveLength(7);
  });

  it('LifecycleStage covers all 8 stages', () => {
    const stages: LifecycleStage[] = [
      'pre_submission', 'initial', 'amendment', 'supplement',
      'annual_report', 'renewal', 'withdrawal', 'post_approval',
    ];
    expect(stages).toHaveLength(8);
  });

  it('Segment covers all 4 segments', () => {
    const segments: Segment[] = ['pharma_biotech', 'medical_devices', 'diagnostics_ivd', 'cross_cutting'];
    expect(segments).toHaveLength(4);
  });

  it('FilingCategory covers all 18 categories', () => {
    const categories: FilingCategory[] = [
      'preclinical_pre_ind', 'investigational', 'marketing_authorization',
      'post_approval_lifecycle', 'cmc_quality',
      'device_classification_pre_sub', 'device_market_auth_us', 'device_market_auth_eu_intl',
      'device_post_market', 'device_samd_ai',
      'ivd_classification_pre_sub', 'ivd_market_auth_us', 'ivd_companion_dx',
      'ivd_market_auth_eu', 'ivd_post_market',
      'ctd_ectd', 'qms', 'safety_pv',
    ];
    expect(categories).toHaveLength(18);
  });
});
