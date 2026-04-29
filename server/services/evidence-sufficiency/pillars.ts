/**
 * Evidence-sufficiency pillar definitions for FDA pathways.
 *
 * Each pillar declares:
 *   - the evidence types it requires (mapped to evidenceObjects.evidenceType)
 *   - whether it requires a quantitative finding (statistical / performance)
 *   - severity weight (high pillars dominate the verdict)
 *   - applicable pathway scope
 *
 * Citations are conservative — public FDA guidance / 21 CFR section refs.
 */

import type { SubmissionPathway } from '../../../shared/schema/evidence-sufficiency';

export type PillarCode =
  // Common pillars
  | 'risk_management'
  | 'labeling_ifu'
  | 'biocompatibility'
  | 'sterilization'
  | 'electrical_safety'
  | 'software_lifecycle'
  | 'cybersecurity'
  | 'human_factors'
  // Performance / clinical
  | 'nonclinical_performance'
  | 'clinical_pivotal'
  | 'clinical_supportive'
  | 'statistical_analysis'
  // Manufacturing / quality
  | 'manufacturing_qsr'
  | 'design_controls'
  // Pathway-specific
  | 'benefit_risk_narrative'
  | 'post_approval_plan'
  | 'novel_classification_rationale'
  | 'special_controls_feasibility'
  | 'predicate_substantial_equivalence';

export interface Pillar {
  code: PillarCode;
  name: string;
  appliesTo: SubmissionPathway[];
  /** evidenceObjects.evidenceType values that satisfy this pillar */
  evidenceTypes: string[];
  /** Minimum number of approved evidence objects for the pillar to clear */
  minimumApprovedEvidence: number;
  /** Pillar weight in the overall score. Default 10. */
  weight: number;
  /** Severity when the pillar is missing. */
  missingSeverity: 'critical' | 'warning';
  /** Citation that applies when this pillar is missing. */
  citation: string;
  /** When true, requires at least one quantitative test result / endpoint */
  requiresQuantitative?: boolean;
}

const COMMON_PILLARS: Pillar[] = [
  {
    code: 'risk_management',
    name: 'Risk management file',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['risk_assessment', 'risk_mitigation'],
    minimumApprovedEvidence: 1,
    weight: 12,
    missingSeverity: 'critical',
    citation: '21 CFR 820.30(g); ISO 14971:2019',
  },
  {
    code: 'labeling_ifu',
    name: 'Labeling and IFU',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['device_profile', 'regulatory_compliance', 'generated_content'],
    minimumApprovedEvidence: 1,
    weight: 8,
    missingSeverity: 'critical',
    citation: '21 CFR 801; 21 CFR 814.20(b)(10)',
  },
  {
    code: 'biocompatibility',
    name: 'Biocompatibility (when patient contact)',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['biocompatibility_test'],
    minimumApprovedEvidence: 1,
    weight: 6,
    missingSeverity: 'warning',
    citation: 'ISO 10993-1:2018; FDA Biocompatibility Guidance (2023)',
  },
  {
    code: 'sterilization',
    name: 'Sterilization validation (when sterile)',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['sterilization_validation'],
    minimumApprovedEvidence: 1,
    weight: 5,
    missingSeverity: 'warning',
    citation: 'ISO 11135:2014/AMD 1:2018; ISO 11137-1:2006/AMD 2:2018',
  },
  {
    code: 'electrical_safety',
    name: 'Electrical safety + EMC (when electrical)',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['electrical_safety_test'],
    minimumApprovedEvidence: 1,
    weight: 5,
    missingSeverity: 'warning',
    citation: 'IEC 60601-1:2005/AMD 2:2020; IEC 60601-1-2:2014/AMD 1:2020',
  },
  {
    code: 'software_lifecycle',
    name: 'Software lifecycle (when software)',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['software_validation'],
    minimumApprovedEvidence: 1,
    weight: 7,
    missingSeverity: 'critical',
    citation: 'IEC 62304:2006/AMD 1:2015; FDA Software Functions Guidance (2023)',
  },
  {
    code: 'cybersecurity',
    name: 'Cybersecurity (when connected / software)',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['regulatory_compliance', 'software_validation'],
    minimumApprovedEvidence: 1,
    weight: 6,
    missingSeverity: 'warning',
    citation: 'FDA Cybersecurity Premarket Guidance (2023); IEC 81001-5-1:2021',
  },
  {
    code: 'human_factors',
    name: 'Human factors / usability',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['regulatory_compliance', 'generated_content'],
    minimumApprovedEvidence: 1,
    weight: 4,
    missingSeverity: 'warning',
    citation: 'IEC 62366-1:2015/AMD 1:2020; FDA HF Guidance (2016)',
  },
  {
    code: 'nonclinical_performance',
    name: 'Non-clinical / bench performance',
    appliesTo: ['PMA', 'DE_NOVO', '510K'],
    evidenceTypes: ['bench_test'],
    minimumApprovedEvidence: 1,
    weight: 8,
    missingSeverity: 'critical',
    citation: '21 CFR 814.20(b)(8); FDA "The 510(k) Program" §IV.D',
    requiresQuantitative: true,
  },
];

const PMA_SPECIFIC: Pillar[] = [
  {
    code: 'clinical_pivotal',
    name: 'Pivotal clinical study',
    appliesTo: ['PMA'],
    evidenceTypes: ['clinical_trial'],
    minimumApprovedEvidence: 1,
    weight: 18,
    missingSeverity: 'critical',
    citation: '21 CFR 814.20(b)(6); FDA "Acceptance and Filing Reviews for PMAs" (2019)',
    requiresQuantitative: true,
  },
  {
    code: 'clinical_supportive',
    name: 'Supportive clinical evidence (literature, registry, real-world)',
    appliesTo: ['PMA'],
    evidenceTypes: ['literature_article', 'clinical_trial'],
    minimumApprovedEvidence: 2,
    weight: 6,
    missingSeverity: 'warning',
    citation: 'FDA Real-World Evidence Guidance (2023)',
  },
  {
    code: 'statistical_analysis',
    name: 'Pre-specified statistical analysis plan',
    appliesTo: ['PMA'],
    evidenceTypes: ['statistical_analysis'],
    minimumApprovedEvidence: 1,
    weight: 10,
    missingSeverity: 'critical',
    citation: 'ICH E9(R1); 21 CFR 814.20(b)(6)(ii)',
    requiresQuantitative: true,
  },
  {
    code: 'manufacturing_qsr',
    name: 'Manufacturing + QSR conformance',
    appliesTo: ['PMA'],
    evidenceTypes: ['manufacturing_process', 'quality_control', 'supplier_audit'],
    minimumApprovedEvidence: 2,
    weight: 8,
    missingSeverity: 'critical',
    citation: '21 CFR 820; 21 CFR 814.20(b)(4)(i)',
  },
  {
    code: 'design_controls',
    name: 'Design controls / DHF',
    appliesTo: ['PMA'],
    evidenceTypes: ['regulatory_compliance', 'manufacturing_process'],
    minimumApprovedEvidence: 1,
    weight: 6,
    missingSeverity: 'warning',
    citation: '21 CFR 820.30; ISO 13485:2016 §7.3',
  },
  {
    code: 'benefit_risk_narrative',
    name: 'Benefit–risk determination narrative',
    appliesTo: ['PMA', 'DE_NOVO'],
    evidenceTypes: ['regulatory_compliance', 'ai_recommendation', 'generated_content'],
    minimumApprovedEvidence: 1,
    weight: 8,
    missingSeverity: 'critical',
    citation: 'FDA "Factors to Consider Regarding Benefit-Risk in Medical Device PMAs and De Novo Classifications" (2019)',
  },
  {
    code: 'post_approval_plan',
    name: 'Post-approval study plan / 522 study commitment',
    appliesTo: ['PMA'],
    evidenceTypes: ['regulatory_compliance', 'project_deliverable'],
    minimumApprovedEvidence: 1,
    weight: 4,
    missingSeverity: 'warning',
    citation: 'FDA PMA Post-Approval Studies Guidance (2009)',
  },
];

const DE_NOVO_SPECIFIC: Pillar[] = [
  {
    code: 'novel_classification_rationale',
    name: 'Novel device classification rationale',
    appliesTo: ['DE_NOVO'],
    evidenceTypes: ['regulatory_compliance', 'ai_recommendation', 'generated_content'],
    minimumApprovedEvidence: 1,
    weight: 14,
    missingSeverity: 'critical',
    citation: 'FDA Guidance "De Novo Classification Process" (2021); 21 CFR 860.220',
  },
  {
    code: 'special_controls_feasibility',
    name: 'Special controls feasibility',
    appliesTo: ['DE_NOVO'],
    evidenceTypes: ['regulatory_compliance', 'ai_recommendation'],
    minimumApprovedEvidence: 1,
    weight: 10,
    missingSeverity: 'critical',
    citation: 'FDA De Novo Guidance (2021) §VI; 21 CFR 860.220(b)(4)',
  },
];

const FIVE10K_SPECIFIC: Pillar[] = [
  {
    code: 'predicate_substantial_equivalence',
    name: 'Substantial equivalence predicate package',
    appliesTo: ['510K'],
    evidenceTypes: ['predicate_device', 'substantial_equivalence'],
    minimumApprovedEvidence: 1,
    weight: 14,
    missingSeverity: 'critical',
    citation: '21 CFR 807.92(a); FDA "The 510(k) Program" Guidance (2014)',
  },
];

export const ALL_PILLARS: Pillar[] = [
  ...COMMON_PILLARS,
  ...PMA_SPECIFIC,
  ...DE_NOVO_SPECIFIC,
  ...FIVE10K_SPECIFIC,
];

export function pillarsForPathway(pathway: SubmissionPathway): Pillar[] {
  return ALL_PILLARS.filter(p => p.appliesTo.includes(pathway));
}
