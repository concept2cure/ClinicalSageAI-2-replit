/**
 * AnA Biostats — Layer 5: Regulatory-Body Customization
 *
 * Adapts statistical outputs, risk framing, and document content
 * by regulatory body / region. Designed for extensibility.
 *
 * Supported bodies: FDA, EMA, MHRA, PMDA
 * Architecture supports adding NMPA, TGA, Health Canada, etc.
 */

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  DomainAdaptation,
  RegulatoryCustomization,
  RegulatoryBody,
} from './types';

export class RegulatoryCustomizer {

  customize(
    input: StatisticalInput,
    computation: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): RegulatoryCustomization {
    const body = input.regulatoryBody ?? 'FDA';

    switch (body) {
      case 'FDA': return this.customizeFDA(input, computation, judgment, domain);
      case 'EMA': return this.customizeEMA(input, computation, judgment, domain);
      case 'MHRA': return this.customizeMHRA(input, computation, judgment, domain);
      case 'PMDA': return this.customizePMDA(input, computation, judgment, domain);
      default: return this.customizeFDA(input, computation, judgment, domain);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // FDA
  // ════════════════════════════════════════════════════════════════

  private customizeFDA(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): RegulatoryCustomization {
    const expectations: string[] = [];
    const documentRequirements: string[] = [];
    const riskFraming: string[] = [];
    const guidance: string[] = [];
    const constraints: string[] = [];
    const templateVariations: Record<string, string> = {};

    // General FDA expectations
    expectations.push('Prospective statistical planning required in protocol and separate SAP');
    expectations.push('Two-sided significance level of 0.05 unless justified');
    expectations.push('Power ≥80% is standard; ≥90% preferred for confirmatory trials');

    // Track-specific FDA requirements
    if (input.clientTrack === 'biotech_pharma') {
      expectations.push('ICH E9/E9(R1) compliance expected');
      expectations.push('Pre-specified multiplicity adjustment for co-primary endpoints');
      expectations.push('Sensitivity analyses for missing data handling');
      guidance.push('FDA Guidance: Adaptive Designs for Clinical Trials of Drugs and Biologics (2019)');
      guidance.push('FDA Guidance: Multiple Endpoints in Clinical Trials (2022)');
      if (input.endpointType === 'time_to_event') {
        guidance.push('FDA Guidance: Clinical Trial Endpoints for the Approval of Cancer Drugs and Biologics');
      }
    }

    if (input.clientTrack === 'medical_device') {
      expectations.push('Statistical methods appropriate for device risk classification');
      expectations.push('Performance goal derivation with supporting literature');
      guidance.push('FDA Guidance: Design Considerations for Pivotal Clinical Investigations for Medical Devices');
      guidance.push('FDA Guidance: Bayesian Statistics in Medical Device Clinical Trials');
      if (input.studyType === 'non_inferiority') {
        guidance.push('FDA Guidance: Non-Inferiority Clinical Trials to Establish Effectiveness');
      }
    }

    if (input.clientTrack === 'diagnostics_ivd') {
      expectations.push('Clinical sensitivity and specificity with exact binomial confidence intervals');
      expectations.push('Adequate representation of disease spectrum and demographics');
      guidance.push('FDA Guidance: Statistical Guidance on Reporting Results from Studies Evaluating Diagnostic Tests');
      guidance.push('FDA Guidance: In Vitro Companion Diagnostic Devices (if applicable)');
      constraints.push('Prevalence-adjusted performance reporting required');
    }

    // Risk framing
    if (judgment.overallRisk === 'high' || judgment.overallRisk === 'critical') {
      riskFraming.push('FDA review is likely to identify the statistical concerns flagged in this analysis');
      riskFraming.push('Consider pre-submission meeting (Pre-IND, Pre-Sub) to align on statistical approach');
    }
    if (judgment.fragility.category === 'fragile' || judgment.fragility.category === 'very_fragile') {
      riskFraming.push('Statistical reviewer may question robustness of assumptions — prepare sensitivity analysis justification');
    }

    // Document requirements
    documentRequirements.push('Sample size justification with full assumptions listed');
    documentRequirements.push('Statistical Analysis Plan (separate from protocol for Phase II/III)');
    if (input.interimAnalyses && input.interimAnalyses > 0) {
      documentRequirements.push('Alpha spending function specification');
      documentRequirements.push('IDMC charter and statistical monitoring plan');
    }

    templateVariations['header_format'] = 'FDA';
    templateVariations['regulatory_reference_style'] = 'CFR/Federal Register';
    templateVariations['confidence_interval_style'] = 'two-sided 95% CI';

    return {
      body: 'FDA',
      statisticalExpectations: expectations,
      documentRequirements,
      riskFramingNotes: riskFraming,
      guidanceReferences: guidance,
      specificConstraints: constraints,
      templateVariations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // EMA
  // ════════════════════════════════════════════════════════════════

  private customizeEMA(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): RegulatoryCustomization {
    const expectations: string[] = [];
    const documentRequirements: string[] = [];
    const riskFraming: string[] = [];
    const guidance: string[] = [];
    const constraints: string[] = [];
    const templateVariations: Record<string, string> = {};

    expectations.push('EMA expects compliance with ICH E9(R1) estimand framework');
    expectations.push('Scientific advice from CHMP/SAWP available for novel designs');
    expectations.push('Points to Consider on multiplicity (CPMP/EWP/908/99)');

    if (input.clientTrack === 'biotech_pharma') {
      guidance.push('EMA Guideline on the Investigation of Bioequivalence (if applicable)');
      guidance.push('EMA Reflection Paper on Methodological Issues in Confirmatory Clinical Trials');
      guidance.push('EMA Guideline on Multiplicity Issues in Clinical Trials');
      if (input.studyType === 'adaptive') {
        guidance.push('EMA Reflection Paper on Methodological Issues with Adaptive Designs');
      }
    }

    if (input.clientTrack === 'medical_device') {
      expectations.push('EU MDR 2017/745 clinical evaluation requirements');
      guidance.push('MDCG Guidance on Clinical Evaluation');
      constraints.push('Notified Body may have additional statistical requirements');
    }

    if (input.clientTrack === 'diagnostics_ivd') {
      expectations.push('EU IVDR 2017/746 performance evaluation requirements');
      guidance.push('MDCG Guidance on Performance Evaluation of IVD Medical Devices');
      constraints.push('Classification-dependent evidence requirements under IVDR');
    }

    // Risk framing
    if (judgment.overallRisk === 'high' || judgment.overallRisk === 'critical') {
      riskFraming.push('CHMP/SAWP scientific advice recommended to mitigate statistical design risks');
    }

    documentRequirements.push('ICH E9(R1) compliant estimand description');
    documentRequirements.push('SAP per EMA requirements');
    documentRequirements.push('Sensitivity analysis framework');

    templateVariations['header_format'] = 'EMA';
    templateVariations['regulatory_reference_style'] = 'EMA/CHMP Guidelines';
    templateVariations['estimand_section'] = 'prominent';

    return {
      body: 'EMA',
      statisticalExpectations: expectations,
      documentRequirements,
      riskFramingNotes: riskFraming,
      guidanceReferences: guidance,
      specificConstraints: constraints,
      templateVariations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // MHRA (UK)
  // ════════════════════════════════════════════════════════════════

  private customizeMHRA(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): RegulatoryCustomization {
    const expectations: string[] = [];
    const guidance: string[] = [];
    const riskFraming: string[] = [];
    const templateVariations: Record<string, string> = {};

    expectations.push('MHRA follows ICH guidelines with UK-specific adaptations post-Brexit');
    expectations.push('Clinical trial authorization under UK Medicines and Healthcare products Regulatory Agency');

    guidance.push('MHRA Guidance: Real World Data and Real World Evidence');
    guidance.push('MHRA Innovative Licensing and Access Pathway (ILAP)');

    if (input.clientTrack === 'diagnostics_ivd') {
      guidance.push('UK IVDR transition requirements for performance evaluation');
    }

    if (judgment.overallRisk === 'high') {
      riskFraming.push('Consider MHRA Scientific Advice for complex statistical designs');
    }

    templateVariations['header_format'] = 'MHRA';
    templateVariations['regulatory_reference_style'] = 'UK Regulations / MHRA Guidance';

    return {
      body: 'MHRA',
      statisticalExpectations: expectations,
      documentRequirements: ['SAP per ICH E9', 'Sample size justification'],
      riskFramingNotes: riskFraming,
      guidanceReferences: guidance,
      specificConstraints: ['Post-Brexit UK-specific requirements may differ from EU'],
      templateVariations,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // PMDA (Japan)
  // ════════════════════════════════════════════════════════════════

  private customizePMDA(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult,
    domain: DomainAdaptation
  ): RegulatoryCustomization {
    const expectations: string[] = [];
    const guidance: string[] = [];
    const riskFraming: string[] = [];
    const templateVariations: Record<string, string> = {};

    expectations.push('PMDA follows ICH guidelines with Japanese-specific considerations');
    expectations.push('Ethnic sensitivity assessment may be required for global studies');
    expectations.push('Japanese bridging study data may be required');

    guidance.push('PMDA Guidance: Biostatistics for Clinical Trials');
    guidance.push('PMDA Points to Consider: Master Protocols');
    guidance.push('PMDA Guidance: Oncology Phase I Statistical Considerations');

    if (input.clientTrack === 'medical_device') {
      guidance.push('PMDA Device review guidance with Japanese clinical data expectations');
    }

    if (judgment.overallRisk === 'high') {
      riskFraming.push('PMDA consultation meeting recommended for novel statistical approaches');
    }

    templateVariations['header_format'] = 'PMDA';
    templateVariations['regulatory_reference_style'] = 'PMDA Notifications / J-Guidelines';
    templateVariations['ethnic_sensitivity_section'] = 'recommended';

    return {
      body: 'PMDA',
      statisticalExpectations: expectations,
      documentRequirements: ['SAP per ICH E9', 'Ethnic sensitivity assessment where applicable', 'Bridging study rationale if global program'],
      riskFramingNotes: riskFraming,
      guidanceReferences: guidance,
      specificConstraints: ['Japanese subgroup analysis may be required', 'Ethnic factor considerations for foreign data'],
      templateVariations,
    };
  }
}

export const regulatoryCustomizer = new RegulatoryCustomizer();
