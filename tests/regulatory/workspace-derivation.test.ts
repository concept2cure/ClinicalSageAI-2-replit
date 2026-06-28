import { describe, it, expect } from 'vitest';
import {
  scopeFor,
  vocabularyFor,
  appsFor,
  personaFor,
} from '../../shared/regulatory/workspace-derivation';
import type { WorkspaceAppId } from '../../shared/regulatory/app-registry';

const appIds = (opts: Parameters<typeof appsFor>[0]): WorkspaceAppId[] =>
  appsFor(opts).map((a) => a.id);

describe('workspace-derivation — scopeFor', () => {
  it('null family → document', () => {
    expect(scopeFor(null)).toBe('document');
  });

  it('marketing_authorization → dossier', () => {
    expect(scopeFor('marketing_authorization')).toBe('dossier');
  });

  it('device_clearance → dossier', () => {
    expect(scopeFor('device_clearance')).toBe('dossier');
  });

  it('clinical_trial → dossier', () => {
    expect(scopeFor('clinical_trial')).toBe('dossier');
  });

  it('companion_diagnostic → dossier', () => {
    expect(scopeFor('companion_diagnostic')).toBe('dossier');
  });

  it('variation → dossier', () => {
    expect(scopeFor('variation')).toBe('dossier');
  });

  it('safety_report → record', () => {
    expect(scopeFor('safety_report')).toBe('record');
  });

  it('post_market → registration', () => {
    expect(scopeFor('post_market')).toBe('registration');
  });

  it('quality_system → document', () => {
    expect(scopeFor('quality_system')).toBe('document');
  });

  it('pre_submission stage overrides to document', () => {
    expect(scopeFor('companion_diagnostic', 'pre_submission')).toBe('document');
    expect(scopeFor('clinical_trial', 'pre_submission')).toBe('document');
  });
});

describe('workspace-derivation — vocabularyFor', () => {
  it('ivd product class → ivd', () => {
    expect(vocabularyFor(['ivd'])).toBe('ivd');
  });

  it('medical_device → device', () => {
    expect(vocabularyFor(['medical_device'])).toBe('device');
  });

  it('small_molecule → drug', () => {
    expect(vocabularyFor(['small_molecule'])).toBe('drug');
  });

  it('biologic → drug', () => {
    expect(vocabularyFor(['biologic'])).toBe('drug');
  });

  it('empty product classes → generic', () => {
    expect(vocabularyFor([])).toBe('generic');
  });

  it('segment fallback: medical_devices → device', () => {
    expect(vocabularyFor([], 'medical_devices')).toBe('device');
  });

  it('segment fallback: diagnostics_ivd → ivd', () => {
    expect(vocabularyFor([], 'diagnostics_ivd')).toBe('ivd');
  });
});

describe('workspace-derivation — appsFor', () => {
  const DOSSIER_DRUG = {
    scope: 'dossier' as const,
    vocabulary: 'drug' as const,
    family: 'marketing_authorization' as const,
    ctdModule: null,
    productClasses: ['small_molecule' as const],
  };

  const DOSSIER_DEVICE_CLEARANCE = {
    scope: 'dossier' as const,
    vocabulary: 'device' as const,
    family: 'device_clearance' as const,
    ctdModule: null,
    productClasses: ['medical_device' as const],
  };

  const CLINICAL_TRIAL = {
    scope: 'dossier' as const,
    vocabulary: 'drug' as const,
    family: 'clinical_trial' as const,
    ctdModule: null,
    productClasses: ['small_molecule' as const],
  };

  const BIOLOGIC_MARKETING = {
    scope: 'dossier' as const,
    vocabulary: 'drug' as const,
    family: 'marketing_authorization' as const,
    ctdModule: null,
    productClasses: ['biologic' as const],
  };

  const SINGLE_DOC = {
    scope: 'document' as const,
    vocabulary: 'quality' as const,
    family: 'quality_system' as const,
    ctdModule: null,
    productClasses: [] as const,
  };

  it('dossier scope gets submission_center', () => {
    expect(appIds(DOSSIER_DRUG)).toContain('submission_center');
    expect(appIds(DOSSIER_DEVICE_CLEARANCE)).toContain('submission_center');
  });

  it('document scope does NOT get submission_center', () => {
    expect(appIds(SINGLE_DOC)).not.toContain('submission_center');
  });

  it('drug dossier gets full M3-M5 app set', () => {
    const ids = appIds(DOSSIER_DRUG);
    expect(ids).toContain('cmc');
    expect(ids).toContain('nonclinical');
    expect(ids).toContain('clinical_csr');
    expect(ids).toContain('biostatistics');
    expect(ids).toContain('iacuc');
  });

  it('device clearance gets risk, human_factors, cybersecurity, substantial_equiv', () => {
    const ids = appIds(DOSSIER_DEVICE_CLEARANCE);
    expect(ids).toContain('risk');
    expect(ids).toContain('human_factors');
    expect(ids).toContain('cybersecurity');
    expect(ids).toContain('substantial_equiv');
  });

  it('device clearance does NOT get iacuc (device, not drug)', () => {
    expect(appIds(DOSSIER_DEVICE_CLEARANCE)).not.toContain('iacuc');
  });

  it('clinical trial gets study_protocol_design, irb, etmf', () => {
    const ids = appIds(CLINICAL_TRIAL);
    expect(ids).toContain('study_protocol_design');
    expect(ids).toContain('irb');
    expect(ids).toContain('etmf');
  });

  it('biologic marketing gets ibc (biosafety)', () => {
    expect(appIds(BIOLOGIC_MARKETING)).toContain('ibc');
  });

  it('drug marketing does NOT get ibc (no recombinant agents)', () => {
    expect(appIds(DOSSIER_DRUG)).not.toContain('ibc');
  });

  it('marketing_authorization gets pharmacovigilance and market_access', () => {
    const ids = appIds(DOSSIER_DRUG);
    expect(ids).toContain('pharmacovigilance');
    expect(ids).toContain('market_access');
  });

  it('dossier scope gets labeling', () => {
    expect(appIds(DOSSIER_DRUG)).toContain('labeling');
  });

  it('ctdModule M5 triggers clinical apps + study design', () => {
    const ids = appIds({
      scope: 'document',
      vocabulary: 'drug',
      family: null,
      ctdModule: 'M5 (5.3.5)',
      productClasses: ['small_molecule'],
    });
    expect(ids).toContain('clinical_csr');
    expect(ids).toContain('biostatistics');
    expect(ids).toContain('study_protocol_design');
    expect(ids).toContain('irb');
  });

  it('IVD dossier gets analytical_performance', () => {
    const ids = appIds({
      scope: 'dossier',
      vocabulary: 'ivd',
      family: 'companion_diagnostic',
      ctdModule: null,
      productClasses: ['ivd'],
    });
    expect(ids).toContain('analytical_performance');
    expect(ids).toContain('risk');
  });

  it('biosimilar gets analytical_similarity', () => {
    const ids = appIds({
      scope: 'dossier',
      vocabulary: 'drug',
      family: 'marketing_authorization',
      ctdModule: null,
      productClasses: ['biosimilar'],
    });
    expect(ids).toContain('analytical_similarity');
  });
});

describe('workspace-derivation — personaFor', () => {
  it('device → FDA CDRH / EU MDR', () => {
    expect(personaFor('device')).toContain('CDRH');
  });

  it('ivd → FDA CDRH / EU IVDR', () => {
    expect(personaFor('ivd')).toContain('IVDR');
  });

  it('drug → FDA CDER/CBER / ICH', () => {
    expect(personaFor('drug')).toContain('ICH');
  });

  it('quality → 21 CFR 820 / ICH Q10', () => {
    expect(personaFor('quality')).toContain('Q10');
  });

  it('generic → Regulatory co-author', () => {
    expect(personaFor('generic')).toBe('Regulatory co-author');
  });
});
