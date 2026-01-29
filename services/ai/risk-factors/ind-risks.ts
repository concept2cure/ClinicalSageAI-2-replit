/**
 * IND Risk Factor Definitions
 * Phase 3.1 - Predictive Intelligence Engine
 * 
 * Defines all risk factors specific to IND (Investigational New Drug) submissions
 * with detection methods, weights, and severity levels.
 */

import { RiskFactor, RiskSeverity, RiskCategory, DetectedRisk } from './510k-risks';

/**
 * IND Specific Risk Factors
 * Total: 18 risk factors for IND submissions
 */
export const IND_RISK_FACTORS: RiskFactor[] = [
  // CMC (Chemistry, Manufacturing, and Controls) Risks
  {
    id: 'IND-R001',
    name: 'CMC Package Incomplete',
    description: 'Chemistry, Manufacturing, and Controls information is insufficient for Phase 1 clinical trial',
    category: 'TECHNICAL',
    severity: 'CRITICAL',
    weight: 0.95,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Complete CMC sections per FDA guidance for INDs - focus on drug substance, drug product, and stability data',
    dataRequirements: ['cmc_sections_complete', 'drug_substance_info', 'drug_product_info', 'stability_data']
  },
  {
    id: 'IND-R002',
    name: 'Manufacturing Process Undefined',
    description: 'Manufacturing process is not adequately described or controlled',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Document manufacturing process with appropriate controls and specifications',
    relatedRisks: ['IND-R001'],
    dataRequirements: ['manufacturing_process_docs', 'batch_records', 'specifications']
  },
  {
    id: 'IND-R003',
    name: 'Stability Data Insufficient',
    description: 'Stability data does not support proposed clinical trial duration',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Conduct additional stability studies or limit trial duration based on available data',
    relatedRisks: ['IND-R001'],
    dataRequirements: ['stability_protocol', 'stability_results', 'trial_duration']
  },

  // Pharmacology/Toxicology Risks
  {
    id: 'IND-R004',
    name: 'Preclinical Safety Package Inadequate',
    description: 'Preclinical safety studies do not support proposed clinical dosing',
    category: 'TECHNICAL',
    severity: 'CRITICAL',
    weight: 0.95,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Conduct additional preclinical studies or adjust clinical dosing strategy',
    dataRequirements: ['tox_studies', 'noael_data', 'safety_margins', 'proposed_clinical_dose']
  },
  {
    id: 'IND-R005',
    name: 'Species Selection Concerns',
    description: 'Preclinical species may not be pharmacologically relevant to humans',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Justify species selection or conduct studies in more relevant species',
    relatedRisks: ['IND-R004'],
    dataRequirements: ['species_justification', 'pharmacology_data', 'target_expression']
  },
  {
    id: 'IND-R006',
    name: 'Genotoxicity Testing Gap',
    description: 'Required genotoxicity studies are missing or incomplete',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Complete standard battery of genotoxicity tests per ICH S2',
    dataRequirements: ['genotox_studies', 'ich_s2_compliance']
  },
  {
    id: 'IND-R007',
    name: 'Safety Pharmacology Incomplete',
    description: 'Core safety pharmacology battery is incomplete (CNS, CV, respiratory)',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Complete ICH S7A core battery studies before IND submission',
    relatedRisks: ['IND-R004'],
    dataRequirements: ['safety_pharm_studies', 'ich_s7_compliance']
  },

  // Clinical Protocol Risks
  {
    id: 'IND-R008',
    name: 'Protocol Design Deficiency',
    description: 'Clinical protocol has significant design issues affecting safety monitoring',
    category: 'REGULATORY',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Revise protocol with adequate safety monitoring and stopping rules',
    dataRequirements: ['protocol_document', 'safety_monitoring_plan', 'stopping_rules']
  },
  {
    id: 'IND-R009',
    name: 'Dose Escalation Strategy Risk',
    description: 'Dose escalation scheme may not adequately protect subjects from toxicity',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Revise dose escalation with appropriate safety margins and review periods',
    relatedRisks: ['IND-R008', 'IND-R004'],
    dataRequirements: ['dose_escalation_scheme', 'safety_margins', 'dlts_defined']
  },
  {
    id: 'IND-R010',
    name: 'Inclusion/Exclusion Criteria Risk',
    description: 'Inclusion/exclusion criteria may not adequately protect vulnerable populations',
    category: 'COMPLIANCE',
    severity: 'MEDIUM',
    weight: 0.65,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Review and strengthen eligibility criteria based on preclinical findings',
    relatedRisks: ['IND-R008'],
    dataRequirements: ['eligibility_criteria', 'target_population', 'preclinical_findings']
  },

  // Sponsor Experience Risks
  {
    id: 'IND-R011',
    name: 'Sponsor Inexperience',
    description: 'Sponsor has limited experience with FDA IND process',
    category: 'RESOURCE',
    severity: 'MEDIUM',
    weight: 0.55,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Engage experienced regulatory consultants or CRO partnership',
    dataRequirements: ['sponsor_ind_history', 'regulatory_team_experience']
  },
  {
    id: 'IND-R012',
    name: 'Investigator Site Concerns',
    description: 'Proposed clinical sites have compliance history concerns',
    category: 'COMPLIANCE',
    severity: 'MEDIUM',
    weight: 0.60,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Review site inspection history and consider alternative sites',
    dataRequirements: ['investigator_sites', 'site_inspection_history', 'fda_483s']
  },

  // Regulatory Strategy Risks
  {
    id: 'IND-R013',
    name: 'Pre-IND Meeting Not Conducted',
    description: 'Complex program proceeding without FDA feedback via Pre-IND meeting',
    category: 'REGULATORY',
    severity: 'MEDIUM',
    weight: 0.60,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Consider requesting Pre-IND meeting before submission',
    dataRequirements: ['pre_ind_meeting_status', 'program_complexity']
  },
  {
    id: 'IND-R014',
    name: 'Clinical Hold Risk Indicators',
    description: 'Multiple risk factors present that historically correlate with clinical holds',
    category: 'REGULATORY',
    severity: 'CRITICAL',
    weight: 0.90,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Address all identified deficiencies before IND submission',
    relatedRisks: ['IND-R001', 'IND-R004', 'IND-R008'],
    dataRequirements: ['all_risk_factors', 'historical_hold_data']
  },

  // Documentation Risks
  {
    id: 'IND-R015',
    name: 'Investigator Brochure Deficiency',
    description: 'Investigator Brochure is incomplete or does not meet FDA requirements',
    category: 'COMPLIANCE',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Complete IB per ICH E6(R2) and FDA guidance requirements',
    dataRequirements: ['ib_document', 'ib_checklist_status']
  },
  {
    id: 'IND-R016',
    name: 'Form FDA 1571 Errors',
    description: 'Form 1571 contains errors or inconsistencies with submission content',
    category: 'COMPLIANCE',
    severity: 'LOW',
    weight: 0.40,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Review and correct Form 1571 before submission',
    dataRequirements: ['form_1571', 'submission_content']
  },

  // Timeline Risks
  {
    id: 'IND-R017',
    name: 'Aggressive Timeline Risk',
    description: 'Timeline does not allow for adequate preparation or FDA review cycles',
    category: 'TIMELINE',
    severity: 'MEDIUM',
    weight: 0.55,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Adjust timeline to include buffer for information requests',
    dataRequirements: ['target_submission_date', 'document_readiness', 'target_fpi_date']
  },
  {
    id: 'IND-R018',
    name: 'Annual Report Compliance Risk',
    description: 'Historical annual reports have been late or incomplete',
    category: 'COMPLIANCE',
    severity: 'LOW',
    weight: 0.35,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Establish robust annual reporting processes',
    dataRequirements: ['annual_report_history', 'compliance_tracking']
  }
];

/**
 * Get IND risk factor by ID
 */
export function getINDRiskFactorById(id: string): RiskFactor | undefined {
  return IND_RISK_FACTORS.find(rf => rf.id === id);
}

/**
 * Get IND risk factors by category
 */
export function getINDRiskFactorsByCategory(category: RiskCategory): RiskFactor[] {
  return IND_RISK_FACTORS.filter(rf => rf.category === category);
}

/**
 * Get IND risk factors by severity
 */
export function getINDRiskFactorsBySeverity(severity: RiskSeverity): RiskFactor[] {
  return IND_RISK_FACTORS.filter(rf => rf.severity === severity);
}

/**
 * Get CMC-related risks
 */
export function getCMCRisks(): RiskFactor[] {
  return IND_RISK_FACTORS.filter(rf => 
    rf.id.includes('R001') || rf.id.includes('R002') || rf.id.includes('R003')
  );
}

/**
 * Get preclinical safety risks
 */
export function getPreclinicalSafetyRisks(): RiskFactor[] {
  return IND_RISK_FACTORS.filter(rf => 
    rf.id.includes('R004') || rf.id.includes('R005') || 
    rf.id.includes('R006') || rf.id.includes('R007')
  );
}

/**
 * Get protocol-related risks
 */
export function getProtocolRisks(): RiskFactor[] {
  return IND_RISK_FACTORS.filter(rf => 
    rf.id.includes('R008') || rf.id.includes('R009') || rf.id.includes('R010')
  );
}

/**
 * Get clinical hold predictors (high correlation with clinical holds)
 */
export function getClinicalHoldPredictors(): RiskFactor[] {
  return IND_RISK_FACTORS.filter(rf => 
    rf.severity === 'CRITICAL' || 
    (rf.severity === 'HIGH' && rf.category === 'TECHNICAL')
  );
}

export default IND_RISK_FACTORS;
