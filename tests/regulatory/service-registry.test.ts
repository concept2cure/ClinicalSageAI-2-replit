import { describe, it, expect } from 'vitest';
import {
  getService,
  servicesFor,
  type WorkspaceServiceId,
} from '../../shared/regulatory/service-registry';

const svcIds = (opts: Parameters<typeof servicesFor>[0]): WorkspaceServiceId[] =>
  servicesFor(opts).map((s) => s.id);

describe('service-registry — catalog', () => {
  it('getService returns the service with the correct id and label', () => {
    const kb = getService('knowledge_base');
    expect(kb.id).toBe('knowledge_base');
    expect(kb.label).toBeTruthy();
    expect(kb.feeds).toBe('both');
  });

  it('every service id in the catalog has a non-empty label', () => {
    const ALL: WorkspaceServiceId[] = [
      'knowledge_base', 'regulatory_intelligence', 'cross_artifact_intelligence',
      'readiness_assessment', 'precedent_intelligence', 'literature_search',
      'evidence_search', 'cdisc_validation', 'statistical_defensibility',
      'substantial_equivalence_check', 'external_intelligence', 'compliance_calendar',
      'change_control', 'health_economics', 'special_designations',
      'pediatric_intelligence', 'inspection_readiness', 'controlled_substances',
      'cdx_intelligence', 'financial_disclosures', 'cmc_consistency',
      'dose_optimization', 'effort_certification',
      'study_design_judgment', 'nonclinical_send', 'estimand_framework',
      'endpoint_intelligence', 'contradiction_detection', 'biologics_pathway',
      'combination_product', 'rwe_analytics', 'external_control_arm',
      'outcome_prediction',
    ];
    for (const id of ALL) {
      const svc = getService(id);
      expect(svc.label.length).toBeGreaterThan(0);
      expect(['ana', 'inline', 'both']).toContain(svc.feeds);
    }
  });
});

describe('service-registry — servicesFor selection logic', () => {
  const drug_dossier = {
    scope: 'dossier' as const,
    vocabulary: 'drug' as const,
    family: 'marketing_authorization' as const,
    ctdModule: null,
    productClasses: ['small_molecule' as const],
    isRegulatory: true,
  };

  const device_clearance = {
    scope: 'dossier' as const,
    vocabulary: 'device' as const,
    family: 'device_clearance' as const,
    ctdModule: null,
    productClasses: ['medical_device' as const],
    isRegulatory: true,
  };

  const clinical_trial = {
    scope: 'dossier' as const,
    vocabulary: 'drug' as const,
    family: 'clinical_trial' as const,
    ctdModule: null,
    productClasses: ['small_molecule' as const],
    isRegulatory: true,
  };

  const non_regulatory = {
    scope: 'document' as const,
    vocabulary: 'quality' as const,
    family: null,
    ctdModule: null,
    productClasses: [] as const,
    isRegulatory: false,
  };

  it('non-regulatory docs get only knowledge_base and cross_artifact_intelligence', () => {
    const ids = svcIds(non_regulatory);
    expect(ids).toContain('knowledge_base');
    expect(ids).toContain('cross_artifact_intelligence');
    expect(ids).toHaveLength(2);
  });

  it('all regulatory configs include the baseline four services', () => {
    for (const opts of [drug_dossier, device_clearance, clinical_trial]) {
      const ids = svcIds(opts);
      expect(ids).toContain('knowledge_base');
      expect(ids).toContain('cross_artifact_intelligence');
      expect(ids).toContain('regulatory_intelligence');
      expect(ids).toContain('readiness_assessment');
    }
  });

  it('drug dossier gets clinical, CMC, and dose optimization services', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('literature_search');
    expect(ids).toContain('cdisc_validation');
    expect(ids).toContain('cmc_consistency');
    expect(ids).toContain('dose_optimization');
    expect(ids).toContain('financial_disclosures');
    expect(ids).toContain('controlled_substances');
  });

  it('device clearance gets predicate/equivalence services but not drug-specific', () => {
    const ids = svcIds(device_clearance);
    expect(ids).toContain('substantial_equivalence_check');
    expect(ids).toContain('precedent_intelligence');
    expect(ids).not.toContain('dose_optimization');
    expect(ids).not.toContain('controlled_substances');
  });

  it('clinical trial gets effort_certification', () => {
    const ids = svcIds(clinical_trial);
    expect(ids).toContain('effort_certification');
  });

  it('marketing authorization does NOT get effort_certification', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).not.toContain('effort_certification');
  });

  it('dossier scope triggers external_intelligence', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('external_intelligence');
  });

  it('dossier scope triggers compliance_calendar and change_control', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('compliance_calendar');
    expect(ids).toContain('change_control');
  });

  it('drug dossier gets study_design_judgment, nonclinical_send, estimand_framework', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('study_design_judgment');
    expect(ids).toContain('nonclinical_send');
    expect(ids).toContain('estimand_framework');
  });

  it('clinical trial gets endpoint_intelligence', () => {
    const ids = svcIds(clinical_trial);
    expect(ids).toContain('endpoint_intelligence');
  });

  it('dossier scope triggers contradiction_detection', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('contradiction_detection');
  });

  it('device clearance does NOT get drug-specific new services', () => {
    const ids = svcIds(device_clearance);
    expect(ids).not.toContain('study_design_judgment');
    expect(ids).not.toContain('nonclinical_send');
    expect(ids).not.toContain('estimand_framework');
  });

  it('device clearance DOES get endpoint_intelligence and contradiction_detection', () => {
    const ids = svcIds(device_clearance);
    expect(ids).toContain('endpoint_intelligence');
    expect(ids).toContain('contradiction_detection');
  });

  it('biologic product gets biologics_pathway', () => {
    const ids = svcIds({
      scope: 'dossier',
      vocabulary: 'drug',
      family: 'marketing_authorization',
      ctdModule: null,
      productClasses: ['biologic'],
      isRegulatory: true,
    });
    expect(ids).toContain('biologics_pathway');
  });

  it('non-biologic drug does NOT get biologics_pathway', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).not.toContain('biologics_pathway');
  });

  it('combination product (drug+device) gets combination_product', () => {
    const ids = svcIds({
      scope: 'dossier',
      vocabulary: 'drug',
      family: 'marketing_authorization',
      ctdModule: null,
      productClasses: ['small_molecule', 'medical_device'],
      isRegulatory: true,
    });
    expect(ids).toContain('combination_product');
  });

  it('single-class product does NOT get combination_product', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).not.toContain('combination_product');
  });

  it('non-regulatory docs do NOT get any new services', () => {
    const ids = svcIds(non_regulatory);
    expect(ids).not.toContain('study_design_judgment');
    expect(ids).not.toContain('nonclinical_send');
    expect(ids).not.toContain('estimand_framework');
    expect(ids).not.toContain('endpoint_intelligence');
    expect(ids).not.toContain('contradiction_detection');
    expect(ids).not.toContain('biologics_pathway');
    expect(ids).not.toContain('combination_product');
    expect(ids).not.toContain('rwe_analytics');
    expect(ids).not.toContain('external_control_arm');
    expect(ids).not.toContain('outcome_prediction');
  });

  it('drug dossier gets rwe_analytics and external_control_arm', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('rwe_analytics');
    expect(ids).toContain('external_control_arm');
  });

  it('dossier scope gets outcome_prediction', () => {
    const ids = svcIds(drug_dossier);
    expect(ids).toContain('outcome_prediction');
  });

  it('device clearance gets outcome_prediction but not external_control_arm', () => {
    const ids = svcIds(device_clearance);
    expect(ids).toContain('outcome_prediction');
    expect(ids).not.toContain('external_control_arm');
  });

  it('clinical trial gets all three analytical services', () => {
    const ids = svcIds(clinical_trial);
    expect(ids).toContain('rwe_analytics');
    expect(ids).toContain('external_control_arm');
    expect(ids).toContain('outcome_prediction');
  });
});
