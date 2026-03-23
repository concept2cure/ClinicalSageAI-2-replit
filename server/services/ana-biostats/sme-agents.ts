/**
 * AnA Biostats — 5 Subject-Matter-Expert Sub-Agents
 *
 * Internal specialist intelligence profiles for biostatistics.
 * NOT separate visible products — internal routing assets used by AnA Biostats.
 *
 * 1. Clinical Trial Design & Power SME
 * 2. SAP / Analysis Strategy SME
 * 3. Regulatory & Submission Biostatistics SME
 * 4. Medical Device / Diagnostics Performance SME
 * 5. Adaptive / Advanced Methods & Sensitivity SME
 *
 * Each SME defines: scope, triggers, reasoning preferences, output preferences, escalation logic.
 */

import type {
  StatisticalInput,
  ComputationResult,
  JudgmentResult,
  DomainAdaptation,
  RegulatoryCustomization,
  StatisticalDocumentType,
  ClientTrack,
  RiskLevel,
  ActionRecommendation,
  RoleExplanations,
} from './types';

// ════════════════════════════════════════════════════════════════
// SME Identity Types
// ════════════════════════════════════════════════════════════════

export type SMEAgentId =
  | 'trial_design_power'
  | 'sap_analysis_strategy'
  | 'regulatory_submission'
  | 'device_diagnostics_performance'
  | 'adaptive_sensitivity';

export interface SMEAgentProfile {
  id: SMEAgentId;
  name: string;
  title: string;
  scope: string[];
  excludedScope: string[];
  triggerConditions: SMETriggerConditions;
  reasoningPreferences: SMEReasoningPreferences;
  outputPreferences: SMEOutputPreferences;
  escalationRules: SMEEscalationRules;
}

export interface SMETriggerConditions {
  workflowTypes: string[];
  studyTypes: string[];
  endpointTypes: string[];
  clientTracks: ClientTrack[];
  documentTypes: StatisticalDocumentType[];
  keywords: string[];
  /** Priority 1-10, higher = preferred when multiple SMEs match */
  priority: number;
}

export interface SMEReasoningPreferences {
  /** Which judgment dimensions this SME emphasizes (weighted higher) */
  emphasizedDimensions: string[];
  /** Which computation methods this SME prefers */
  preferredMethods: string[];
  /** Which risk factors this SME prioritizes */
  prioritizedRisks: string[];
  /** Confidence threshold below which SME marks output as provisional */
  confidenceThreshold: number;
  /** Whether this SME requires deterministic grounding for all claims */
  requiresDeterministicGrounding: boolean;
}

export interface SMEOutputPreferences {
  /** Primary document types this SME produces */
  primaryDocuments: StatisticalDocumentType[];
  /** Secondary/supporting documents */
  secondaryDocuments: StatisticalDocumentType[];
  /** Which role explanations to emphasize */
  roleEmphasis: (keyof RoleExplanations)[];
  /** Whether to automatically suggest document generation */
  autoSuggestDocument: boolean;
  /** Template modifiers specific to this SME */
  templateModifiers: Record<string, string>;
}

export interface SMEEscalationRules {
  /** When to mark output as provisional */
  provisionalWhen: string[];
  /** When to recommend human review */
  humanReviewWhen: string[];
  /** When to hand off to another SME */
  handoffTo: { smeId: SMEAgentId; when: string }[];
  /** Maximum confidence level this SME will claim */
  maxConfidenceClaim: 'high' | 'moderate' | 'low';
}

export interface SMERoutingResult {
  primarySME: SMEAgentId;
  secondarySMEs: SMEAgentId[];
  confidence: number;
  rationale: string;
}

export interface SMEEnhancement {
  smeId: SMEAgentId;
  smeName: string;
  additionalGuidance: string[];
  emphasizedFlags: string[];
  documentRecommendations: StatisticalDocumentType[];
  roleFraming: Partial<RoleExplanations>;
  provisionalNotes: string[];
  escalationNotes: string[];
}

// ════════════════════════════════════════════════════════════════
// SME Agent Definitions
// ════════════════════════════════════════════════════════════════

export const SME_AGENTS: Record<SMEAgentId, SMEAgentProfile> = {

  // ────────────────────────────────────────────────────────────────
  // 1. Clinical Trial Design & Power SME
  // ────────────────────────────────────────────────────────────────
  trial_design_power: {
    id: 'trial_design_power',
    name: 'Design & Power Specialist',
    title: 'Clinical Trial Design & Sample Size Expert',
    scope: [
      'study design selection and justification',
      'endpoint and statistical objective fit',
      'sample size and power calculations',
      'allocation ratio and randomization assumptions',
      'scenario comparison and sensitivity to effect size',
      'underpower risk detection',
      'design fragility assessment',
      'phase-appropriate design recommendations',
    ],
    excludedScope: [
      'SAP section drafting beyond sample size',
      'regulatory submission strategy',
      'adaptive interim analysis execution',
      'diagnostic performance metrics',
    ],
    triggerConditions: {
      workflowTypes: ['sample_size_rationale', 'scenario_comparison'],
      studyTypes: ['superiority', 'non_inferiority', 'equivalence', 'single_arm', 'dose_response'],
      endpointTypes: ['continuous', 'binary', 'time_to_event', 'ordinal', 'count', 'composite'],
      clientTracks: ['biotech_pharma', 'medical_device', 'diagnostics_ivd'],
      documentTypes: ['sample_size_rationale', 'design_assumption_note', 'scenario_comparison_brief', 'statistical_risk_memo'],
      keywords: ['sample size', 'power', 'design', 'endpoint', 'effect size', 'underpower', 'fragility', 'allocation'],
      priority: 9,
    },
    reasoningPreferences: {
      emphasizedDimensions: ['Power Adequacy', 'Sample Size Adequacy', 'Assumption Quality', 'Design Appropriateness'],
      preferredMethods: ['Two-sample t-test', 'Log-rank test', 'Two-proportion z-test', 'ANOVA'],
      prioritizedRisks: ['underpower', 'effect_size_overestimation', 'attrition_underestimation', 'design_fragility'],
      confidenceThreshold: 70,
      requiresDeterministicGrounding: true,
    },
    outputPreferences: {
      primaryDocuments: ['sample_size_rationale', 'scenario_comparison_brief'],
      secondaryDocuments: ['design_assumption_note', 'statistical_risk_memo'],
      roleEmphasis: ['technical', 'clinical'],
      autoSuggestDocument: true,
      templateModifiers: {
        section_focus: 'design_and_power',
        detail_level: 'comprehensive',
      },
    },
    escalationRules: {
      provisionalWhen: [
        'effect size based on limited pilot data',
        'variance estimate from different population',
        'no precedent for chosen design in indication',
      ],
      humanReviewWhen: [
        'power < 70% under any reasonable scenario',
        'fragility index > 65',
        'Phase III confirmatory with novel design',
      ],
      handoffTo: [
        { smeId: 'adaptive_sensitivity', when: 'adaptive design elements detected' },
        { smeId: 'sap_analysis_strategy', when: 'analysis method selection needed beyond power' },
      ],
      maxConfidenceClaim: 'high',
    },
  },

  // ────────────────────────────────────────────────────────────────
  // 2. SAP / Analysis Strategy SME
  // ────────────────────────────────────────────────────────────────
  sap_analysis_strategy: {
    id: 'sap_analysis_strategy',
    name: 'Analysis Strategy Specialist',
    title: 'SAP & Statistical Analysis Planning Expert',
    scope: [
      'SAP section structure and content',
      'analysis population definitions (ITT, PP, safety)',
      'primary and secondary endpoint analysis strategy',
      'multiplicity adjustment logic',
      'missing data handling strategy',
      'estimand framework per ICH E9(R1)',
      'sensitivity analysis planning',
      'analysis method rationale and justification',
    ],
    excludedScope: [
      'sample size calculation details',
      'regulatory submission strategy',
      'adaptive design operational decisions',
      'diagnostic performance cutoff selection',
    ],
    triggerConditions: {
      workflowTypes: ['track_aware_drafting', 'statistical_risk_review'],
      studyTypes: ['superiority', 'non_inferiority', 'equivalence', 'adaptive'],
      endpointTypes: ['continuous', 'binary', 'time_to_event', 'ordinal', 'composite'],
      clientTracks: ['biotech_pharma', 'medical_device'],
      documentTypes: ['sap_section_draft', 'statistical_risk_memo', 'protocol_statistical_section'],
      keywords: ['SAP', 'analysis plan', 'multiplicity', 'missing data', 'estimand', 'sensitivity analysis', 'analysis population', 'ITT', 'per protocol'],
      priority: 8,
    },
    reasoningPreferences: {
      emphasizedDimensions: ['Multiplicity Control', 'Estimand Clarity', 'Missing Data Risk', 'Design Appropriateness'],
      preferredMethods: ['MMRM', 'ANCOVA', 'stratified analysis', 'multiple imputation'],
      prioritizedRisks: ['multiplicity_inflation', 'missing_data_bias', 'estimand_ambiguity', 'method_mismatch'],
      confidenceThreshold: 65,
      requiresDeterministicGrounding: true,
    },
    outputPreferences: {
      primaryDocuments: ['sap_section_draft', 'protocol_statistical_section'],
      secondaryDocuments: ['statistical_risk_memo'],
      roleEmphasis: ['technical', 'regulatory'],
      autoSuggestDocument: true,
      templateModifiers: {
        section_focus: 'analysis_strategy',
        estimand_detail: 'comprehensive',
        multiplicity_detail: 'explicit',
      },
    },
    escalationRules: {
      provisionalWhen: [
        'estimand strategy not fully specified',
        'missing data method not validated for endpoint type',
        'multiplicity approach not established for indication',
      ],
      humanReviewWhen: [
        'Phase III with no estimand framework',
        'missing data rate > 25% expected',
        'novel multiplicity approach without precedent',
      ],
      handoffTo: [
        { smeId: 'trial_design_power', when: 'sample size recalculation needed after method change' },
        { smeId: 'regulatory_submission', when: 'regulatory defensibility of analysis approach questioned' },
      ],
      maxConfidenceClaim: 'high',
    },
  },

  // ────────────────────────────────────────────────────────────────
  // 3. Regulatory & Submission Biostatistics SME
  // ────────────────────────────────────────────────────────────────
  regulatory_submission: {
    id: 'regulatory_submission',
    name: 'Regulatory Biostats Specialist',
    title: 'Regulatory & Submission Biostatistics Expert',
    scope: [
      'statistical defensibility assessment for regulatory review',
      'anticipated reviewer questions and concerns',
      'health authority response support',
      'body-specific statistical expectations (FDA, EMA, PMDA, MHRA)',
      'track-aware regulatory risk framing',
      'submission-grade statistical justification',
      'CSR statistical section support',
    ],
    excludedScope: [
      'primary sample size calculation',
      'SAP structural decisions',
      'adaptive design operational planning',
      'diagnostic test development decisions',
    ],
    triggerConditions: {
      workflowTypes: ['statistical_risk_review', 'track_aware_drafting'],
      studyTypes: ['superiority', 'non_inferiority', 'equivalence', 'single_arm', 'adaptive', 'diagnostic_accuracy', 'performance'],
      endpointTypes: ['continuous', 'binary', 'time_to_event', 'sensitivity_specificity'],
      clientTracks: ['biotech_pharma', 'medical_device', 'diagnostics_ivd'],
      documentTypes: ['statistical_reviewer_response', 'submission_statistical_note', 'statistical_risk_memo'],
      keywords: ['regulatory', 'submission', 'reviewer', 'FDA', 'EMA', 'PMDA', 'MHRA', 'defensibility', 'health authority', 'response', 'CSR'],
      priority: 7,
    },
    reasoningPreferences: {
      emphasizedDimensions: ['Design Appropriateness', 'Comparator Appropriateness', 'Estimand Clarity', 'Multiplicity Control'],
      preferredMethods: ['established methods with regulatory precedent'],
      prioritizedRisks: ['regulatory_rejection', 'reviewer_concern', 'defensibility_weakness', 'body_specific_gap'],
      confidenceThreshold: 75,
      requiresDeterministicGrounding: true,
    },
    outputPreferences: {
      primaryDocuments: ['statistical_reviewer_response', 'submission_statistical_note'],
      secondaryDocuments: ['statistical_risk_memo'],
      roleEmphasis: ['regulatory', 'executive'],
      autoSuggestDocument: true,
      templateModifiers: {
        section_focus: 'regulatory_defensibility',
        body_specific: 'true',
        tone: 'formal_regulatory',
      },
    },
    escalationRules: {
      provisionalWhen: [
        'regulatory body not specified',
        'no precedent for statistical approach in target indication',
        'novel endpoint without regulatory qualification',
      ],
      humanReviewWhen: [
        'critical defensibility gaps identified',
        'response to active regulatory question',
        'pivotal study with unusual statistical approach',
      ],
      handoffTo: [
        { smeId: 'trial_design_power', when: 'design revision needed to address regulatory concern' },
        { smeId: 'sap_analysis_strategy', when: 'analysis plan modification needed for regulatory alignment' },
      ],
      maxConfidenceClaim: 'moderate',
    },
  },

  // ────────────────────────────────────────────────────────────────
  // 4. Medical Device / Diagnostics Performance SME
  // ────────────────────────────────────────────────────────────────
  device_diagnostics_performance: {
    id: 'device_diagnostics_performance',
    name: 'Device & Diagnostics Specialist',
    title: 'Medical Device & IVD Performance Statistics Expert',
    scope: [
      'device performance study design and statistics',
      'diagnostic accuracy: sensitivity, specificity, PPV, NPV',
      'agreement measures: kappa, Bland-Altman, method comparison',
      'AUC/ROC analysis and cutoff optimization',
      'prevalence dependence and enrichment strategies',
      'non-inferiority and equivalence for devices',
      'performance goal design and justification',
      'usability study statistical framing',
    ],
    excludedScope: [
      'pharma drug efficacy trial design',
      'SAP for large pharma trials',
      'regulatory submission strategy (defer to regulatory SME)',
      'adaptive/interim analysis design',
    ],
    triggerConditions: {
      workflowTypes: ['sample_size_rationale', 'statistical_risk_review', 'track_aware_drafting'],
      studyTypes: ['diagnostic_accuracy', 'agreement', 'performance', 'non_inferiority', 'equivalence', 'usability'],
      endpointTypes: ['sensitivity_specificity', 'agreement', 'auc_roc', 'binary', 'continuous'],
      clientTracks: ['medical_device', 'diagnostics_ivd'],
      documentTypes: ['sample_size_rationale', 'statistical_risk_memo', 'protocol_statistical_section', 'submission_statistical_note'],
      keywords: ['device', 'diagnostic', 'IVD', 'sensitivity', 'specificity', 'kappa', 'agreement', 'AUC', 'ROC', 'performance goal', 'MDR', 'IVDR', '510(k)', 'PMA', 'cutoff', 'prevalence'],
      priority: 10,
    },
    reasoningPreferences: {
      emphasizedDimensions: ['Design Appropriateness', 'Comparator Appropriateness', 'Sample Size Adequacy', 'Assumption Quality'],
      preferredMethods: ['Exact binomial CI', 'Clopper-Pearson', 'Cohen\'s kappa', 'DeLong AUC', 'Bland-Altman', 'performance goal test'],
      prioritizedRisks: ['prevalence_dependence', 'spectrum_bias', 'reference_standard_limitation', 'small_sample_device'],
      confidenceThreshold: 70,
      requiresDeterministicGrounding: true,
    },
    outputPreferences: {
      primaryDocuments: ['sample_size_rationale', 'protocol_statistical_section'],
      secondaryDocuments: ['statistical_risk_memo', 'submission_statistical_note'],
      roleEmphasis: ['technical', 'regulatory'],
      autoSuggestDocument: true,
      templateModifiers: {
        section_focus: 'device_diagnostics_performance',
        diagnostic_metrics: 'comprehensive',
        prevalence_analysis: 'required',
      },
    },
    escalationRules: {
      provisionalWhen: [
        'prevalence estimate uncertain',
        'reference standard has known limitations',
        'small sample size for rare condition',
      ],
      humanReviewWhen: [
        'novel diagnostic without comparator device',
        'companion diagnostic with therapeutic linkage',
        'performance goal derived from limited evidence',
      ],
      handoffTo: [
        { smeId: 'regulatory_submission', when: 'regulatory pathway advice needed' },
        { smeId: 'trial_design_power', when: 'randomized controlled design needed instead of single-arm' },
      ],
      maxConfidenceClaim: 'high',
    },
  },

  // ────────────────────────────────────────────────────────────────
  // 5. Adaptive / Advanced Methods & Sensitivity SME
  // ────────────────────────────────────────────────────────────────
  adaptive_sensitivity: {
    id: 'adaptive_sensitivity',
    name: 'Sensitivity & Advanced Methods Specialist',
    title: 'Adaptive Design, Sensitivity Analysis & Robustness Expert',
    scope: [
      'scenario sensitivity and stress testing',
      'fragility analysis under assumption changes',
      'adaptive design statistical considerations',
      'interim analysis reasoning',
      'alpha spending and stopping rules',
      'sample size re-estimation logic',
      'robustness and sensitivity analysis planning',
      'assumption breakpoint identification',
    ],
    excludedScope: [
      'primary study design selection',
      'SAP structural decisions',
      'regulatory submission framing',
      'diagnostic performance metrics',
    ],
    triggerConditions: {
      workflowTypes: ['scenario_comparison', 'statistical_risk_review'],
      studyTypes: ['adaptive', 'basket', 'platform', 'superiority', 'non_inferiority'],
      endpointTypes: ['continuous', 'binary', 'time_to_event'],
      clientTracks: ['biotech_pharma', 'medical_device'],
      documentTypes: ['scenario_comparison_brief', 'design_assumption_note', 'statistical_risk_memo'],
      keywords: ['sensitivity', 'fragility', 'adaptive', 'interim', 'robustness', 'stress test', 'breakpoint', 'alpha spending', 'stopping rule', 'scenario'],
      priority: 6,
    },
    reasoningPreferences: {
      emphasizedDimensions: ['Assumption Quality', 'Overinterpretation Risk', 'Power Adequacy', 'Missing Data Risk'],
      preferredMethods: ['sensitivity analysis', 'tipping point analysis', 'scenario modeling', 'conditional power'],
      prioritizedRisks: ['assumption_fragility', 'overinterpretation', 'conditional_power_too_low', 'alpha_spending_violation'],
      confidenceThreshold: 60,
      requiresDeterministicGrounding: true,
    },
    outputPreferences: {
      primaryDocuments: ['scenario_comparison_brief', 'design_assumption_note'],
      secondaryDocuments: ['statistical_risk_memo'],
      roleEmphasis: ['technical', 'clinical'],
      autoSuggestDocument: true,
      templateModifiers: {
        section_focus: 'sensitivity_robustness',
        scenario_detail: 'exhaustive',
        fragility_analysis: 'prominent',
      },
    },
    escalationRules: {
      provisionalWhen: [
        'limited scenarios tested',
        'assumption breakpoints not fully characterized',
        'adaptive rules not validated by simulation',
      ],
      humanReviewWhen: [
        'design is very fragile (index > 65)',
        'adaptive trial with complex stopping rules',
        'interim analysis governance not defined',
      ],
      handoffTo: [
        { smeId: 'trial_design_power', when: 'fundamental design revision recommended' },
        { smeId: 'sap_analysis_strategy', when: 'sensitivity analysis plan needs SAP integration' },
      ],
      maxConfidenceClaim: 'moderate',
    },
  },
};

// ════════════════════════════════════════════════════════════════
// SME Agent Array (for iteration)
// ════════════════════════════════════════════════════════════════

export const ALL_SME_AGENTS: SMEAgentProfile[] = Object.values(SME_AGENTS);
