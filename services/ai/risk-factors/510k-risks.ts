/**
 * 510(k) Risk Factor Definitions
 * Phase 3.1 - Predictive Intelligence Engine
 * 
 * Defines all risk factors specific to 510(k) submissions
 * with detection methods, weights, and severity levels.
 */

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskCategory = 'REGULATORY' | 'TECHNICAL' | 'TIMELINE' | 'RESOURCE' | 'COMPLIANCE';

export interface RiskFactor {
  id: string;
  name: string;
  description: string;
  category: RiskCategory;
  severity: RiskSeverity;
  weight: number; // 0.0 - 1.0
  detectionMethod: 'AUTOMATED' | 'MANUAL' | 'HYBRID';
  mitigationGuidance: string;
  relatedRisks?: string[];
  dataRequirements: string[];
}

export interface DetectedRisk {
  factorId: string;
  factor: RiskFactor;
  detected: boolean;
  confidence: number; // 0.0 - 1.0
  evidence: string[];
  detectedAt: Date;
  mitigationRecommendations: string[];
}

/**
 * 510(k) Specific Risk Factors
 * Total: 15 risk factors for 510(k) submissions
 */
export const K510_RISK_FACTORS: RiskFactor[] = [
  // Predicate Device Risks
  {
    id: '510K-R001',
    name: 'Predicate Device Unavailable',
    description: 'The identified predicate device has been recalled, discontinued, or is otherwise unavailable for reference',
    category: 'REGULATORY',
    severity: 'CRITICAL',
    weight: 0.95,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Identify alternative predicate devices or consider requesting a pre-submission meeting with FDA',
    relatedRisks: ['510K-R002', '510K-R003'],
    dataRequirements: ['predicate_device_id', 'fda_recall_database', 'device_market_status']
  },
  {
    id: '510K-R002',
    name: 'Predicate Technological Characteristics Gap',
    description: 'Significant technological differences exist between subject device and predicate that may require additional testing',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Conduct gap analysis and prepare additional performance testing data',
    relatedRisks: ['510K-R001', '510K-R004'],
    dataRequirements: ['device_specifications', 'predicate_specifications', 'technology_comparison']
  },
  {
    id: '510K-R003',
    name: 'Multiple Predicate Strategy Risk',
    description: 'Submission relies on multiple predicates which may complicate substantial equivalence argument',
    category: 'REGULATORY',
    severity: 'MEDIUM',
    weight: 0.65,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Strengthen justification for each predicate reference or consolidate to single predicate',
    dataRequirements: ['predicate_count', 'predicate_rationale']
  },

  // Indications for Use Risks
  {
    id: '510K-R004',
    name: 'IFU Expansion Beyond Predicate',
    description: 'Indications for Use expand beyond the cleared indications of the predicate device',
    category: 'REGULATORY',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Consider separate 510(k) for expanded indications or provide clinical data supporting new claims',
    relatedRisks: ['510K-R002', '510K-R005'],
    dataRequirements: ['subject_ifu', 'predicate_ifu', 'ifu_comparison']
  },
  {
    id: '510K-R005',
    name: 'IFU Ambiguity',
    description: 'Indications for Use statement is vague, overly broad, or inconsistent with device labeling',
    category: 'COMPLIANCE',
    severity: 'MEDIUM',
    weight: 0.60,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Revise IFU for clarity and consistency with all labeling documents',
    dataRequirements: ['ifu_statement', 'device_labeling', 'user_manual']
  },

  // Testing and Data Risks
  {
    id: '510K-R006',
    name: 'Insufficient Performance Testing',
    description: 'Performance testing data is incomplete or does not adequately demonstrate device safety and effectiveness',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Conduct additional bench testing per applicable guidance documents',
    dataRequirements: ['test_protocols', 'test_results', 'applicable_standards']
  },
  {
    id: '510K-R007',
    name: 'Biocompatibility Data Gap',
    description: 'Biocompatibility testing is missing or does not align with ISO 10993 requirements',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Conduct biological evaluation per ISO 10993-1 and applicable parts',
    relatedRisks: ['510K-R006'],
    dataRequirements: ['patient_contact_type', 'contact_duration', 'biocompat_tests_performed']
  },
  {
    id: '510K-R008',
    name: 'Software Documentation Deficiency',
    description: 'Software documentation does not meet FDA software guidance requirements for device class',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Review and complete software documentation per FDA guidance for software-contained devices',
    dataRequirements: ['software_level', 'software_documentation_checklist', 'cybersecurity_assessment']
  },

  // Regulatory Pathway Risks
  {
    id: '510K-R009',
    name: 'Classification Uncertainty',
    description: 'Device classification is uncertain and may require De Novo or PMA pathway instead',
    category: 'REGULATORY',
    severity: 'CRITICAL',
    weight: 0.90,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Request FDA pre-submission meeting to confirm appropriate pathway',
    relatedRisks: ['510K-R001', '510K-R002'],
    dataRequirements: ['device_class', 'product_code', 'regulation_number']
  },
  {
    id: '510K-R010',
    name: 'Special Controls Non-Compliance',
    description: 'Class II device does not meet applicable special controls',
    category: 'COMPLIANCE',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Review and address all special controls in classification regulation',
    dataRequirements: ['special_controls', 'compliance_matrix']
  },

  // Timeline and Resource Risks
  {
    id: '510K-R011',
    name: 'FDA RTA Risk',
    description: 'Submission may fail Refuse to Accept criteria due to missing elements',
    category: 'REGULATORY',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Complete RTA checklist review before submission',
    dataRequirements: ['rta_checklist_status', 'submission_elements']
  },
  {
    id: '510K-R012',
    name: 'Additional Information Request Likely',
    description: 'Submission quality indicators suggest high probability of AI letter',
    category: 'TIMELINE',
    severity: 'MEDIUM',
    weight: 0.65,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Proactively address common deficiency areas before submission',
    relatedRisks: ['510K-R006', '510K-R007', '510K-R008'],
    dataRequirements: ['submission_completeness_score', 'historical_deficiencies']
  },

  // Labeling Risks
  {
    id: '510K-R013',
    name: 'Labeling Inconsistency',
    description: 'Inconsistencies exist between device labeling, IFU, and submission statements',
    category: 'COMPLIANCE',
    severity: 'MEDIUM',
    weight: 0.55,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Conduct comprehensive labeling review for consistency',
    relatedRisks: ['510K-R005'],
    dataRequirements: ['all_labeling_documents']
  },
  {
    id: '510K-R014',
    name: 'Missing Contraindications',
    description: 'Device labeling missing important contraindications or warnings',
    category: 'COMPLIANCE',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Review predicate labeling and risk analysis for missing warnings',
    dataRequirements: ['risk_analysis', 'predicate_labeling', 'subject_labeling']
  },

  // Manufacturing Risks
  {
    id: '510K-R015',
    name: 'Manufacturing Site Compliance Risk',
    description: 'Manufacturing site has recent FDA warning letters or inspection findings',
    category: 'COMPLIANCE',
    severity: 'HIGH',
    weight: 0.70,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Address any outstanding compliance issues before submission',
    dataRequirements: ['manufacturing_site', 'fda_inspection_database', 'warning_letters']
  }
];

/**
 * Get risk factor by ID
 */
export function getRiskFactorById(id: string): RiskFactor | undefined {
  return K510_RISK_FACTORS.find(rf => rf.id === id);
}

/**
 * Get risk factors by category
 */
export function getRiskFactorsByCategory(category: RiskCategory): RiskFactor[] {
  return K510_RISK_FACTORS.filter(rf => rf.category === category);
}

/**
 * Get risk factors by severity
 */
export function getRiskFactorsBySeverity(severity: RiskSeverity): RiskFactor[] {
  return K510_RISK_FACTORS.filter(rf => rf.severity === severity);
}

/**
 * Get high-priority risk factors (HIGH or CRITICAL)
 */
export function getHighPriorityRisks(): RiskFactor[] {
  return K510_RISK_FACTORS.filter(rf => 
    rf.severity === 'HIGH' || rf.severity === 'CRITICAL'
  );
}

/**
 * Calculate weighted risk score for a set of detected risks
 */
export function calculateWeightedRiskScore(detectedRisks: DetectedRisk[]): number {
  if (detectedRisks.length === 0) return 0;
  
  const totalWeight = detectedRisks.reduce((sum, dr) => 
    sum + (dr.detected ? dr.factor.weight * dr.confidence : 0), 0
  );
  
  const maxPossibleWeight = detectedRisks.reduce((sum, dr) => 
    sum + dr.factor.weight, 0
  );
  
  return maxPossibleWeight > 0 ? totalWeight / maxPossibleWeight : 0;
}

export default K510_RISK_FACTORS;
