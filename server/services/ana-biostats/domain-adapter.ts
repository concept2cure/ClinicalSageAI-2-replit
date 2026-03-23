/**
 * AnA Biostats — Layer 4: Domain Track Adaptation
 *
 * Adapts statistical behavior, method suggestions, judgment logic,
 * artifact templates, and risk framing by client track:
 * - biotech_pharma
 * - medical_device
 * - diagnostics_ivd
 *
 * One platform experience, three domain-aware operating tracks.
 */

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  DomainAdaptation,
  ClientTrack,
} from './types';

export class DomainAdapter {

  adapt(input: StatisticalInput, computation: ComputationResult, judgment: JudgmentResult): DomainAdaptation {
    switch (input.clientTrack) {
      case 'biotech_pharma':
        return this.adaptBiotechPharma(input, computation, judgment);
      case 'medical_device':
        return this.adaptMedicalDevice(input, computation, judgment);
      case 'diagnostics_ivd':
        return this.adaptDiagnosticsIVD(input, computation, judgment);
      default:
        return this.adaptBiotechPharma(input, computation, judgment);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // Biotech / Pharma
  // ════════════════════════════════════════════════════════════════

  private adaptBiotechPharma(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult
  ): DomainAdaptation {
    const methodSuggestions: string[] = [];
    const designConsiderations: string[] = [];
    const endpointGuidance: string[] = [];
    const regulatoryNotes: string[] = [];
    const riskFactors: string[] = [];
    const templateModifiers: Record<string, string> = {};

    // Method suggestions based on endpoint and phase
    if (input.endpointType === 'time_to_event') {
      methodSuggestions.push('Consider stratified log-rank test for key prognostic factors');
      methodSuggestions.push('Cox PH model with pre-specified covariates for sensitivity analysis');
      if (input.phase === 'III') {
        methodSuggestions.push('Consider RMST as supportive analysis per recent FDA guidance');
      }
    }

    if (input.endpointType === 'continuous') {
      methodSuggestions.push('MMRM may be preferred over LOCF for longitudinal endpoints');
      methodSuggestions.push('Consider ANCOVA with baseline adjustment as primary analysis');
    }

    // Estimand considerations (ICH E9(R1))
    designConsiderations.push('Define estimand framework per ICH E9(R1): population, variable, intercurrent events, summary measure');
    designConsiderations.push('Pre-specify handling of intercurrent events (treatment policy, hypothetical, composite, principal stratum, while-on-treatment)');

    if (input.phase === 'III') {
      designConsiderations.push('Confirmatory Phase III — consider multiplicity strategy for co-primary or hierarchical endpoints');
      designConsiderations.push('Pre-specify sensitivity analyses for primary endpoint');
    }

    if (input.phase === 'II') {
      designConsiderations.push('Phase II — consider adaptive design elements for dose selection or futility');
    }

    // Endpoint guidance
    if (input.objectiveType === 'efficacy') {
      endpointGuidance.push('Ensure primary endpoint is clinically meaningful and regulatorily accepted for the indication');
      endpointGuidance.push('Consider patient-reported outcomes (PROs) as key secondary endpoints');
    }

    // Regulatory notes
    regulatoryNotes.push('FDA/EMA expect prospective statistical planning in protocol and SAP');
    if (input.interimAnalyses && input.interimAnalyses > 0) {
      regulatoryNotes.push('Alpha spending must be pre-specified for all planned interim analyses');
      regulatoryNotes.push('IDMC charter and reporting conventions should be documented');
    }

    // Risk factors
    if (judgment.fragility.category === 'fragile' || judgment.fragility.category === 'very_fragile') {
      riskFactors.push('Statistical fragility may undermine confirmatory evidence — consider larger N or more conservative assumptions');
    }

    // Template modifiers for document generation
    templateModifiers['section_header_prefix'] = 'Statistical Analysis Plan';
    templateModifiers['regulatory_framework'] = 'ICH E9/E9(R1), ICH E6(R2)';
    templateModifiers['estimand_section'] = 'required';
    templateModifiers['sensitivity_analysis_section'] = 'required';
    templateModifiers['missing_data_section'] = 'required';

    return {
      track: 'biotech_pharma',
      methodSuggestions,
      designConsiderations,
      endpointGuidance,
      regulatoryNotes,
      riskFactors,
      templateModifiers,
      trackSpecificFields: {
        estimandRequired: true,
        multiplicityHandling: input.phase === 'III' ? 'required' : 'recommended',
        missingDataStrategy: 'required',
        interimAnalysisPlanned: (input.interimAnalyses ?? 0) > 0,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Medical Device
  // ════════════════════════════════════════════════════════════════

  private adaptMedicalDevice(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult
  ): DomainAdaptation {
    const methodSuggestions: string[] = [];
    const designConsiderations: string[] = [];
    const endpointGuidance: string[] = [];
    const regulatoryNotes: string[] = [];
    const riskFactors: string[] = [];
    const templateModifiers: Record<string, string> = {};

    // Device-specific method suggestions
    if (input.studyType === 'non_inferiority' || input.studyType === 'equivalence') {
      methodSuggestions.push('Non-inferiority margin must be clinically justified and pre-specified');
      methodSuggestions.push('Consider FDA guidance on choosing NI margins for device studies');
      methodSuggestions.push('Performance goal approach may be acceptable for single-arm designs');
    }

    if (input.studyType === 'performance') {
      methodSuggestions.push('Performance goal should be based on published literature or predicate device data');
      methodSuggestions.push('One-sided test with exact binomial CI recommended');
    }

    // Design considerations
    designConsiderations.push('Consider whether Bayesian methods are appropriate and have regulatory precedent for this device class');
    designConsiderations.push('Evaluate if a performance goal design is sufficient vs. randomized controlled trial');
    designConsiderations.push('User variability and learning curve effects should be addressed in statistical design');

    // Endpoint guidance
    if (input.objectiveType === 'performance') {
      endpointGuidance.push('Performance endpoints should directly reflect intended use claims');
      endpointGuidance.push('Consider both effectiveness and safety endpoints');
    }
    endpointGuidance.push('Usability endpoints may be needed for user-facing devices');

    // Regulatory notes
    regulatoryNotes.push('FDA 510(k) may accept less rigorous evidence than PMA');
    regulatoryNotes.push('EU MDR requires clinical evaluation with adequate statistical methodology');
    regulatoryNotes.push('Predicate comparison data can support performance goal derivation');

    // Risk factors
    if (comp.sampleSize.total < 50) {
      riskFactors.push('Small device study — ensure regulatory pathway supports limited evidence');
    }
    if (input.studyType === 'single_arm') {
      riskFactors.push('Single-arm device study — performance goal must be well-justified');
    }

    // Template modifiers
    templateModifiers['section_header_prefix'] = 'Statistical Analysis Plan — Device Study';
    templateModifiers['regulatory_framework'] = 'FDA Device Guidance, EU MDR 2017/745';
    templateModifiers['estimand_section'] = 'optional';
    templateModifiers['performance_goal_section'] = input.studyType === 'performance' ? 'required' : 'optional';
    templateModifiers['bayesian_section'] = 'optional';

    return {
      track: 'medical_device',
      methodSuggestions,
      designConsiderations,
      endpointGuidance,
      regulatoryNotes,
      riskFactors,
      templateModifiers,
      trackSpecificFields: {
        deviceClass: 'to_be_specified',
        regulatoryPathway: 'to_be_specified',
        predicateDevice: 'to_be_specified',
        performanceGoal: input.controlRate,
        bayesianApproach: false,
        usabilityComponent: false,
      },
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Diagnostics / IVD
  // ════════════════════════════════════════════════════════════════

  private adaptDiagnosticsIVD(
    input: StatisticalInput,
    comp: ComputationResult,
    judgment: JudgmentResult
  ): DomainAdaptation {
    const methodSuggestions: string[] = [];
    const designConsiderations: string[] = [];
    const endpointGuidance: string[] = [];
    const regulatoryNotes: string[] = [];
    const riskFactors: string[] = [];
    const templateModifiers: Record<string, string> = {};

    // Diagnostic-specific methods
    methodSuggestions.push('Use Clopper-Pearson exact binomial CIs for sensitivity/specificity');
    methodSuggestions.push('Report PPV/NPV with prevalence adjustment');

    if (input.endpointType === 'agreement') {
      methodSuggestions.push('Cohen\'s kappa for inter-rater agreement');
      methodSuggestions.push('Bland-Altman analysis for quantitative agreement');
      methodSuggestions.push('Passing-Bablok regression for method comparison');
    }

    if (input.endpointType === 'auc_roc') {
      methodSuggestions.push('DeLong\'s method for AUC comparison');
      methodSuggestions.push('Bootstrap confidence intervals for AUC');
    }

    // Design considerations
    designConsiderations.push('Prospective specimen collection preferred over retrospective');
    designConsiderations.push('Include spectrum of disease severity to avoid spectrum bias');
    designConsiderations.push('Define reference standard and its limitations');
    if (input.prevalence && input.prevalence < 0.10) {
      designConsiderations.push('Low prevalence — consider enrichment strategy or case-control design');
    }

    // Endpoint guidance
    endpointGuidance.push('Clinical sensitivity and specificity are primary performance endpoints');
    endpointGuidance.push('Consider positive/negative percent agreement (PPA/NPA) for comparator studies');
    endpointGuidance.push('Analytical performance (LoD, LoQ, precision) should be established separately');

    // Regulatory notes
    regulatoryNotes.push('FDA requires diagnostic accuracy data per intended use population');
    regulatoryNotes.push('EU IVDR classification affects clinical evidence requirements');
    regulatoryNotes.push('CLSI standards (EP09, EP12, EP15) may apply for analytical studies');

    // Risk factors
    if (!input.prevalence) {
      riskFactors.push('Prevalence not specified — PPV/NPV estimates are provisional');
    }
    if (input.sensitivity && input.sensitivity > 0.95) {
      riskFactors.push('Very high sensitivity target (>95%) — sample size for lower CI bound must be adequate');
    }

    // Template modifiers
    templateModifiers['section_header_prefix'] = 'Statistical Analysis Plan — Diagnostic Study';
    templateModifiers['regulatory_framework'] = 'FDA IVD Guidance, EU IVDR 2017/746, CLSI Standards';
    templateModifiers['diagnostic_accuracy_section'] = 'required';
    templateModifiers['prevalence_section'] = 'required';
    templateModifiers['reference_standard_section'] = 'required';
    templateModifiers['specimen_handling_section'] = 'recommended';

    return {
      track: 'diagnostics_ivd',
      methodSuggestions,
      designConsiderations,
      endpointGuidance,
      regulatoryNotes,
      riskFactors,
      templateModifiers,
      trackSpecificFields: {
        sensitivityTarget: input.sensitivity,
        specificityTarget: input.specificity,
        prevalence: input.prevalence,
        referenceStandard: 'to_be_specified',
        specimenType: 'to_be_specified',
        cutoffStrategy: 'to_be_specified',
        analyticalPerformanceEstablished: false,
        companionDiagnostic: false,
      },
    };
  }
}

export const domainAdapter = new DomainAdapter();
