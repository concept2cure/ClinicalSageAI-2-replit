import { describe, it, expect } from 'vitest';
import {
  getHtaBody,
  allHtaBodies,
  htaBodiesForRegion,
  getEconomicAnalysis,
  allEconomicAnalyses,
  getPayerChannel,
  payerChannelsForRegion,
  getDossierSection,
  allDossierSections,
  requiredDossierSections,
  getPricingFramework,
  getMarketAccessProfile,
  isHtaGated,
  usesQalyThreshold,
  isPricingBinding,
  canAdvanceHtaAssessment,
  isTerminalHtaStatus,
  preferredAnalysisForBody,
  defaultPricingForRegion,
  HTA_ASSESSMENT_TRANSITIONS,
  type HtaBodyId,
  type EconomicAnalysisType,
  type PayerChannelId,
  type ValueDossierSectionId,
  type PricingFrameworkId,
  type HtaAssessmentStatus,
} from '../../shared/regulatory/health-economics';

describe('health-economics — HTA body catalog', () => {
  it('every body has required fields', () => {
    for (const b of allHtaBodies()) {
      expect(b.id).toBeTruthy();
      expect(b.label).toBeTruthy();
      expect(b.region).toBeTruthy();
      expect(b.decisionMetric).toBeTruthy();
      expect(b.threshold).toBeTruthy();
      expect(b.process).toBeTruthy();
      expect(typeof b.bindingOnPricing).toBe('boolean');
      expect(b.citation).toBeTruthy();
    }
  });

  it('catalogs all 11 HTA bodies', () => {
    const ids: HtaBodyId[] = [
      'nice', 'smc', 'gba_iqwig', 'has', 'aifa',
      'cadth', 'pbac', 'icer', 'tlv', 'zin', 'eu_jca',
    ];
    for (const id of ids) {
      expect(getHtaBody(id)).toBeDefined();
    }
  });

  it('getHtaBody returns correct body by id', () => {
    const nice = getHtaBody('nice');
    expect(nice).toBeDefined();
    expect(nice!.label).toBe('NICE');
    expect(nice!.region).toBe('UK');
    expect(nice!.decisionMetric).toBe('cost_per_qaly');
    expect(nice!.bindingOnPricing).toBe(true);
  });

  it('getHtaBody returns undefined for unknown id', () => {
    expect(getHtaBody('nonexistent' as HtaBodyId)).toBeUndefined();
  });

  it('htaBodiesForRegion returns only bodies for that region', () => {
    const eu = htaBodiesForRegion('EU');
    expect(eu.length).toBeGreaterThan(0);
    for (const b of eu) {
      expect(b.region).toBe('EU');
    }
  });

  it('US has ICER as the primary HTA body', () => {
    const us = htaBodiesForRegion('US');
    expect(us.some((b) => b.id === 'icer')).toBe(true);
  });

  it('UK has NICE and SMC', () => {
    const uk = htaBodiesForRegion('UK');
    expect(uk.some((b) => b.id === 'nice')).toBe(true);
    expect(uk.some((b) => b.id === 'smc')).toBe(true);
  });
});

describe('health-economics — economic analysis types', () => {
  it('catalogs all 5 analysis types', () => {
    const ids: EconomicAnalysisType[] = ['cea', 'cua', 'cba', 'cma', 'bia'];
    for (const id of ids) {
      expect(getEconomicAnalysis(id)).toBeDefined();
    }
  });

  it('every analysis has required fields', () => {
    for (const a of allEconomicAnalyses()) {
      expect(a.id).toBeTruthy();
      expect(a.label).toBeTruthy();
      expect(a.effectMetric).toBeTruthy();
      expect(a.perspective).toBeTruthy();
      expect(a.whenToUse).toBeTruthy();
    }
  });

  it('CUA uses QALYs as its effect metric', () => {
    const cua = getEconomicAnalysis('cua');
    expect(cua!.effectMetric).toContain('QALY');
  });

  it('BIA uses PMPM as part of its effect metric', () => {
    const bia = getEconomicAnalysis('bia');
    expect(bia!.effectMetric).toContain('PMPM');
  });
});

describe('health-economics — payer channels', () => {
  it('US payer channels include Medicare Part B, Part D, Medicaid, commercial, VA', () => {
    const us = payerChannelsForRegion('US');
    const ids = us.map((p) => p.id);
    expect(ids).toContain('medicare_b');
    expect(ids).toContain('medicare_d');
    expect(ids).toContain('medicaid');
    expect(ids).toContain('us_commercial');
    expect(ids).toContain('va_dod');
  });

  it('global channels appear for non-US regions', () => {
    const eu = payerChannelsForRegion('EU');
    expect(eu.some((p) => p.id === 'national_formulary')).toBe(true);
    expect(eu.some((p) => p.id === 'hospital_formulary')).toBe(true);
  });

  it('getPayerChannel returns correct channel by id', () => {
    const ch = getPayerChannel('medicare_b');
    expect(ch).toBeDefined();
    expect(ch!.label).toContain('Medicare Part B');
    expect(ch!.region).toBe('US');
  });

  it('getPayerChannel returns undefined for unknown id', () => {
    expect(getPayerChannel('nonexistent' as PayerChannelId)).toBeUndefined();
  });
});

describe('health-economics — value dossier sections', () => {
  it('catalogs all 10 dossier sections', () => {
    const ids: ValueDossierSectionId[] = [
      'product_overview', 'disease_burden', 'clinical_evidence',
      'comparative_evidence', 'economic_evaluation', 'budget_impact',
      'patient_value', 'coding_billing', 'coverage_landscape',
      'value_proposition',
    ];
    for (const id of ids) {
      expect(getDossierSection(id)).toBeDefined();
    }
  });

  it('required sections include clinical evidence and comparative evidence', () => {
    const required = requiredDossierSections();
    const ids = required.map((s) => s.id);
    expect(ids).toContain('clinical_evidence');
    expect(ids).toContain('comparative_evidence');
    expect(ids).toContain('economic_evaluation');
  });

  it('coding_billing and coverage_landscape are optional', () => {
    expect(getDossierSection('coding_billing')!.required).toBe(false);
    expect(getDossierSection('coverage_landscape')!.required).toBe(false);
  });

  it('every section has a label and htaRelevance', () => {
    for (const s of allDossierSections()) {
      expect(s.label).toBeTruthy();
      expect(s.htaRelevance).toBeTruthy();
      expect(typeof s.required).toBe('boolean');
    }
  });
});

describe('health-economics — pricing frameworks', () => {
  it('all framework ids resolve', () => {
    const ids: PricingFrameworkId[] = [
      'free_pricing', 'external_reference', 'internal_reference',
      'value_based', 'managed_entry', 'tendering',
    ];
    for (const id of ids) {
      const f = getPricingFramework(id);
      expect(f).toBeDefined();
      expect(f!.label).toBeTruthy();
      expect(f!.description).toBeTruthy();
    }
  });
});

describe('health-economics — market access profiles', () => {
  it('US has free pricing, no mandatory HTA, and ICER as primary body', () => {
    const us = getMarketAccessProfile('US');
    expect(us).toBeDefined();
    expect(us!.defaultPricingFramework).toBe('free_pricing');
    expect(us!.htaRequired).toBe(false);
    expect(us!.primaryHtaBodies).toContain('icer');
  });

  it('UK has NICE and value-based pricing', () => {
    const uk = getMarketAccessProfile('UK');
    expect(uk).toBeDefined();
    expect(uk!.primaryHtaBodies).toContain('nice');
    expect(uk!.defaultPricingFramework).toBe('value_based');
    expect(uk!.htaRequired).toBe(true);
  });

  it('EU has external reference pricing and multiple HTA bodies', () => {
    const eu = getMarketAccessProfile('EU');
    expect(eu).toBeDefined();
    expect(eu!.defaultPricingFramework).toBe('external_reference');
    expect(eu!.primaryHtaBodies.length).toBeGreaterThan(3);
    expect(eu!.htaRequired).toBe(true);
  });

  it('all profiled regions have payer channels', () => {
    for (const region of ['US', 'UK', 'EU', 'CA', 'AU', 'JP'] as const) {
      const profile = getMarketAccessProfile(region);
      expect(profile).toBeDefined();
      expect(profile!.payerChannels.length).toBeGreaterThan(0);
    }
  });
});

describe('health-economics — predicates', () => {
  it('isHtaGated is true for UK, EU, CA, AU', () => {
    expect(isHtaGated('UK')).toBe(true);
    expect(isHtaGated('EU')).toBe(true);
    expect(isHtaGated('CA')).toBe(true);
    expect(isHtaGated('AU')).toBe(true);
  });

  it('isHtaGated is false for US and JP', () => {
    expect(isHtaGated('US')).toBe(false);
    expect(isHtaGated('JP')).toBe(false);
  });

  it('usesQalyThreshold for NICE, PBAC, CADTH, ICER', () => {
    expect(usesQalyThreshold('nice')).toBe(true);
    expect(usesQalyThreshold('pbac')).toBe(true);
    expect(usesQalyThreshold('cadth')).toBe(true);
    expect(usesQalyThreshold('icer')).toBe(true);
  });

  it('usesQalyThreshold is false for G-BA (added_benefit) and EU JCA (relative_effectiveness)', () => {
    expect(usesQalyThreshold('gba_iqwig')).toBe(false);
    expect(usesQalyThreshold('eu_jca')).toBe(false);
  });

  it('isPricingBinding is true for NICE, G-BA, CADTH, PBAC and false for ICER, EU JCA', () => {
    expect(isPricingBinding('nice')).toBe(true);
    expect(isPricingBinding('gba_iqwig')).toBe(true);
    expect(isPricingBinding('cadth')).toBe(true);
    expect(isPricingBinding('pbac')).toBe(true);
    expect(isPricingBinding('icer')).toBe(false);
    expect(isPricingBinding('eu_jca')).toBe(false);
  });

  it('preferredAnalysisForBody returns CUA for QALY-based bodies and CEA for added-benefit bodies', () => {
    expect(preferredAnalysisForBody('nice')).toBe('cua');
    expect(preferredAnalysisForBody('pbac')).toBe('cua');
    expect(preferredAnalysisForBody('icer')).toBe('cua');
    expect(preferredAnalysisForBody('gba_iqwig')).toBe('cea');
    expect(preferredAnalysisForBody('has')).toBe('cea');
  });

  it('defaultPricingForRegion matches market profiles', () => {
    expect(defaultPricingForRegion('US')).toBe('free_pricing');
    expect(defaultPricingForRegion('UK')).toBe('value_based');
    expect(defaultPricingForRegion('EU')).toBe('external_reference');
    expect(defaultPricingForRegion('CA')).toBe('value_based');
    expect(defaultPricingForRegion('AU')).toBe('value_based');
  });
});

describe('health-economics — HTA assessment lifecycle', () => {
  it('planning can advance to dossier_prep', () => {
    expect(canAdvanceHtaAssessment('planning', 'dossier_prep')).toBe(true);
  });

  it('planning cannot skip to submitted', () => {
    expect(canAdvanceHtaAssessment('planning', 'submitted')).toBe(false);
  });

  it('appraisal can advance to recommended or not_recommended', () => {
    expect(canAdvanceHtaAssessment('appraisal', 'recommended')).toBe(true);
    expect(canAdvanceHtaAssessment('appraisal', 'not_recommended')).toBe(true);
  });

  it('not_recommended can loop back to dossier_prep or planning', () => {
    expect(canAdvanceHtaAssessment('not_recommended', 'dossier_prep')).toBe(true);
    expect(canAdvanceHtaAssessment('not_recommended', 'planning')).toBe(true);
  });

  it('recommended can advance to price_negotiation or listed', () => {
    expect(canAdvanceHtaAssessment('recommended', 'price_negotiation')).toBe(true);
    expect(canAdvanceHtaAssessment('recommended', 'listed')).toBe(true);
  });

  it('delisted is a terminal state', () => {
    expect(isTerminalHtaStatus('delisted')).toBe(true);
    const targets: HtaAssessmentStatus[] = [
      'planning', 'dossier_prep', 'submitted', 'under_assessment',
      'appraisal', 'recommended', 'not_recommended', 'price_negotiation',
      'listed', 'restricted', 'delisted',
    ];
    for (const t of targets) {
      expect(canAdvanceHtaAssessment('delisted', t)).toBe(false);
    }
  });

  it('listed can transition to restricted or delisted', () => {
    expect(canAdvanceHtaAssessment('listed', 'restricted')).toBe(true);
    expect(canAdvanceHtaAssessment('listed', 'delisted')).toBe(true);
  });

  it('non-terminal states have at least one valid transition', () => {
    for (const [status, targets] of Object.entries(HTA_ASSESSMENT_TRANSITIONS)) {
      if (status !== 'delisted') {
        expect(targets.length).toBeGreaterThan(0);
      }
    }
  });
});
