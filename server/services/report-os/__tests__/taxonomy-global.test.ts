import { describe, it, expect } from 'vitest';
import { GLOBAL_REPORT_TYPE_SEED } from '../taxonomy-global';
import { REPORT_TYPE_SEED, type ReportTypeDefinition } from '../taxonomy';
import { reportScopeEnum } from '@shared/schema/report-os';

const REQUIRED_FIELDS: Array<keyof ReportTypeDefinition> = [
  'typeId',
  'label',
  'family',
  'allowedScopes',
  'allowedPersonas',
  'allowedClientSegments',
  'dataDependencies',
  'artifactDependencies',
  'workflowDependencies',
  'anaModules',
  'exportTemplate',
  'governanceRequirements',
  'truthfulnessRules',
];

describe('GLOBAL_REPORT_TYPE_SEED', () => {
  it('defines at least ~25 global report types', () => {
    expect(GLOBAL_REPORT_TYPE_SEED.length).toBeGreaterThanOrEqual(25);
  });

  it('every entry has all required ReportTypeDefinition fields', () => {
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry[field], `${entry.typeId} missing ${field}`).toBeDefined();
      }
      expect(typeof entry.typeId).toBe('string');
      expect(entry.typeId.length).toBeGreaterThan(0);
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.family).toBe('string');
      expect(entry.family.length).toBeGreaterThan(0);
      expect(typeof entry.exportTemplate).toBe('string');
      expect(entry.exportTemplate.length).toBeGreaterThan(0);
    }
  });

  it('every entry has non-empty allowedScopes and allowedPersonas', () => {
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      expect(Array.isArray(entry.allowedScopes)).toBe(true);
      expect(entry.allowedScopes.length, `${entry.typeId} allowedScopes`).toBeGreaterThan(0);
      expect(Array.isArray(entry.allowedPersonas)).toBe(true);
      expect(entry.allowedPersonas.length, `${entry.typeId} allowedPersonas`).toBeGreaterThan(0);
      expect(Array.isArray(entry.allowedClientSegments)).toBe(true);
      expect(entry.allowedClientSegments.length, `${entry.typeId} allowedClientSegments`).toBeGreaterThan(0);
    }
  });

  it('every allowedScope is a valid ReportScope', () => {
    const validScopes = new Set<string>(reportScopeEnum);
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      for (const scope of entry.allowedScopes) {
        expect(validScopes.has(scope), `${entry.typeId} has invalid scope ${scope}`).toBe(true);
      }
    }
  });

  it('all typeIds are unique within the global seed', () => {
    const ids = GLOBAL_REPORT_TYPE_SEED.map(e => e.typeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no typeId collides with the existing REPORT_TYPE_SEED', () => {
    const existing = new Set(REPORT_TYPE_SEED.map(e => e.typeId));
    const collisions = GLOBAL_REPORT_TYPE_SEED.filter(e => existing.has(e.typeId)).map(e => e.typeId);
    expect(collisions).toEqual([]);
  });

  it('every governanceRequirements has part11 === true', () => {
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      expect(entry.governanceRequirements.part11, `${entry.typeId} part11`).toBe(true);
    }
  });

  it('region-specific families include a region key in governanceRequirements', () => {
    const regionPrefixes = [
      'usa_fda.',
      'ema.',
      'eu_mdr.',
      'eu_ivdr.',
      'japan_pmda.',
      'canada_hc.',
      'uk_mhra.',
      'australia_tga.',
      'korea_mfds.',
      'switzerland_swissmedic.',
      'brazil_anvisa.',
    ];
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      const isRegionSpecific = regionPrefixes.some(p => entry.typeId.startsWith(p));
      if (isRegionSpecific) {
        expect(entry.governanceRequirements.region, `${entry.typeId} region key`).toBeDefined();
        expect(typeof entry.governanceRequirements.region).toBe('string');
      }
    }
  });

  it('every truthfulnessRules allows partial where appropriate and is an object', () => {
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      expect(typeof entry.truthfulnessRules).toBe('object');
      expect(entry.truthfulnessRules).not.toBeNull();
    }
  });

  it('every entry includes the ana-ri module', () => {
    for (const entry of GLOBAL_REPORT_TYPE_SEED) {
      expect(entry.anaModules, `${entry.typeId} anaModules`).toContain('ana-ri');
    }
  });

  it('spot-checks that specific expected typeIds exist', () => {
    const ids = new Set(GLOBAL_REPORT_TYPE_SEED.map(e => e.typeId));
    const expected = [
      'usa_fda.ind_safety_readiness',
      'usa_fda.nda_bla_filing_readiness',
      'usa_fda.crl_response_intelligence',
      'usa_fda.type_bcd_meeting_brief',
      'usa_fda.de_novo_classification_pack',
      'ema.maa_loq_response_pack',
      'ema.psur_pbrer_pack',
      'eu_mdr.cer_per_completeness',
      'eu_ivdr.performance_evaluation_readiness',
      'japan_pmda.jnda_shonin_readiness',
      'canada_hc.nds_snds_readiness',
      'uk_mhra.ilap_pathway_brief',
      'australia_tga.artg_device_inclusion_readiness',
      'korea_mfds.drug_registration_readiness',
      'switzerland_swissmedic.maa_readiness',
      'brazil_anvisa.registration_dossier_readiness',
      'global.cross_region_submission_comparison',
      'global.harmonization_gap_matrix',
      'global.label_currency_matrix',
      'pv.dsur_readiness',
      'pv.signal_management_report',
    ];
    for (const id of expected) {
      expect(ids.has(id), `missing expected typeId ${id}`).toBe(true);
    }
  });
});
