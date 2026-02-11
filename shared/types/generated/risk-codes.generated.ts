/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Source: shadow_service/shadow_service/predicate_intel/risk_codes.lock.json
 * Generator: scripts/generate-risk-code-types.ts
 * Lock version: 2.0.0
 * Lock hash: b5342c26fbaf2ffec210acfed5fbd869b4ed08013a77f0146f9fb2f97cb8824d
 * Generated: 2026-02-11
 *
 * To regenerate: npx tsx scripts/generate-risk-code-types.ts
 * CI check:      npx tsx scripts/generate-risk-code-types.ts --check
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Lock file metadata
// ═══════════════════════════════════════════════════════════════════════════════

/** SHA-256 hash of risk_codes.lock.json (for manifest comparison). */
export const RISK_CODES_LOCK_HASH = 'b5342c26fbaf2ffec210acfed5fbd869b4ed08013a77f0146f9fb2f97cb8824d' as const;

/** Lock file version string. */
export const RISK_CODES_LOCK_VERSION = '2.0.0' as const;

// ═══════════════════════════════════════════════════════════════════════════════
// RiskCode union type (24 canonical codes)
// ═══════════════════════════════════════════════════════════════════════════════

export type RiskCode =
  | 'IU_MISMATCH'
  | 'INDICATIONS_EXPANDED'
  | 'TECH_DIFFERENCE'
  | 'ENERGY_SOURCE_CHANGE'
  | 'DESIGN_ARCH_CHANGE'
  | 'MATERIAL_CHANGE'
  | 'TISSUE_CONTACT_CHANGE'
  | 'CONTACT_DURATION_CHANGE'
  | 'STERILIZATION_METHOD_CHANGE'
  | 'PACKAGING_SYSTEM_CHANGE'
  | 'SHELF_LIFE_CHANGE'
  | 'SOFTWARE_PRESENT_NEW'
  | 'SOFTWARE_SAFETY_CLASS_DIFF'
  | 'CYBERSECURITY_SURFACE_INCREASED'
  | 'INTEROPERABILITY_CLAIM'
  | 'ML_ADAPTIVITY'
  | 'PERFORMANCE_CLAIM_CHANGE'
  | 'CLINICAL_EVIDENCE_GAP'
  | 'HUMAN_FACTORS_CHANGE'
  | 'STANDARDS_GAP'
  | 'LABELING_IFU_GAP'
  | 'PMS_SIGNAL_RISK'
  | 'PREDICATE_TOXICITY_HIGH'
  | 'PREDICATE_LINEAGE_COMPROMISED';

// ═══════════════════════════════════════════════════════════════════════════════
// Canonical arrays
// ═══════════════════════════════════════════════════════════════════════════════

/** All 24 canonical risk codes in lock file order. */
export const ALL_RISK_CODES: readonly RiskCode[] = [
  'IU_MISMATCH',
  'INDICATIONS_EXPANDED',
  'TECH_DIFFERENCE',
  'ENERGY_SOURCE_CHANGE',
  'DESIGN_ARCH_CHANGE',
  'MATERIAL_CHANGE',
  'TISSUE_CONTACT_CHANGE',
  'CONTACT_DURATION_CHANGE',
  'STERILIZATION_METHOD_CHANGE',
  'PACKAGING_SYSTEM_CHANGE',
  'SHELF_LIFE_CHANGE',
  'SOFTWARE_PRESENT_NEW',
  'SOFTWARE_SAFETY_CLASS_DIFF',
  'CYBERSECURITY_SURFACE_INCREASED',
  'INTEROPERABILITY_CLAIM',
  'ML_ADAPTIVITY',
  'PERFORMANCE_CLAIM_CHANGE',
  'CLINICAL_EVIDENCE_GAP',
  'HUMAN_FACTORS_CHANGE',
  'STANDARDS_GAP',
  'LABELING_IFU_GAP',
  'PMS_SIGNAL_RISK',
  'PREDICATE_TOXICITY_HIGH',
  'PREDICATE_LINEAGE_COMPROMISED',
] as const;

/** Risk codes that promote diff flag to SIGNIFICANT. */
export const SIGNIFICANT_RISK_CODES: readonly RiskCode[] = [
  'ENERGY_SOURCE_CHANGE',
  'IU_MISMATCH',
  'TECH_DIFFERENCE',
  'PREDICATE_TOXICITY_HIGH',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// Severity
// ═══════════════════════════════════════════════════════════════════════════════

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

// ═══════════════════════════════════════════════════════════════════════════════
// Human-readable labels
// ═══════════════════════════════════════════════════════════════════════════════

export const RISK_CODE_LABELS: Readonly<Record<RiskCode, string>> = {
  'IU_MISMATCH': 'Intended Use Mismatch',
  'INDICATIONS_EXPANDED': 'Expanded Indications',
  'TECH_DIFFERENCE': 'Technology Difference',
  'ENERGY_SOURCE_CHANGE': 'Energy Source Change',
  'DESIGN_ARCH_CHANGE': 'Design Architecture Change',
  'MATERIAL_CHANGE': 'Material Change',
  'TISSUE_CONTACT_CHANGE': 'Tissue Contact Change',
  'CONTACT_DURATION_CHANGE': 'Contact Duration Change',
  'STERILIZATION_METHOD_CHANGE': 'Sterilization Method Change',
  'PACKAGING_SYSTEM_CHANGE': 'Packaging System Change',
  'SHELF_LIFE_CHANGE': 'Shelf Life Change',
  'SOFTWARE_PRESENT_NEW': 'New Software Component',
  'SOFTWARE_SAFETY_CLASS_DIFF': 'Software Safety Class Difference',
  'CYBERSECURITY_SURFACE_INCREASED': 'Increased Cybersecurity Surface',
  'INTEROPERABILITY_CLAIM': 'New Interoperability Claim',
  'ML_ADAPTIVITY': 'ML/AI Adaptivity',
  'PERFORMANCE_CLAIM_CHANGE': 'Performance Claim Change',
  'CLINICAL_EVIDENCE_GAP': 'Clinical Evidence Gap',
  'HUMAN_FACTORS_CHANGE': 'Human Factors Change',
  'STANDARDS_GAP': 'Standards Conformance Gap',
  'LABELING_IFU_GAP': 'Labeling / IFU Gap',
  'PMS_SIGNAL_RISK': 'Post-Market Signal Risk',
  'PREDICATE_TOXICITY_HIGH': 'High Predicate Toxicity',
  'PREDICATE_LINEAGE_COMPROMISED': 'Compromised Predicate Lineage',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Default severity per risk code
// ═══════════════════════════════════════════════════════════════════════════════

export const RISK_CODE_SEVERITY: Readonly<Record<RiskCode, RiskSeverity>> = {
  'IU_MISMATCH': 'HIGH',
  'INDICATIONS_EXPANDED': 'HIGH',
  'TECH_DIFFERENCE': 'MEDIUM',
  'ENERGY_SOURCE_CHANGE': 'HIGH',
  'DESIGN_ARCH_CHANGE': 'MEDIUM',
  'MATERIAL_CHANGE': 'HIGH',
  'TISSUE_CONTACT_CHANGE': 'HIGH',
  'CONTACT_DURATION_CHANGE': 'MEDIUM',
  'STERILIZATION_METHOD_CHANGE': 'MEDIUM',
  'PACKAGING_SYSTEM_CHANGE': 'LOW',
  'SHELF_LIFE_CHANGE': 'LOW',
  'SOFTWARE_PRESENT_NEW': 'HIGH',
  'SOFTWARE_SAFETY_CLASS_DIFF': 'MEDIUM',
  'CYBERSECURITY_SURFACE_INCREASED': 'HIGH',
  'INTEROPERABILITY_CLAIM': 'MEDIUM',
  'ML_ADAPTIVITY': 'HIGH',
  'PERFORMANCE_CLAIM_CHANGE': 'MEDIUM',
  'CLINICAL_EVIDENCE_GAP': 'HIGH',
  'HUMAN_FACTORS_CHANGE': 'MEDIUM',
  'STANDARDS_GAP': 'MEDIUM',
  'LABELING_IFU_GAP': 'LOW',
  'PMS_SIGNAL_RISK': 'MEDIUM',
  'PREDICATE_TOXICITY_HIGH': 'HIGH',
  'PREDICATE_LINEAGE_COMPROMISED': 'HIGH',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Canned discussion templates (no LLM — deterministic)
// ═══════════════════════════════════════════════════════════════════════════════

export const RISK_CODE_DISCUSSION_TEMPLATES: Readonly<Record<RiskCode, string>> = {
  'IU_MISMATCH': 'Intended use misalignment increases regulatory risk; consider alternate predicate or clinical/bench bridging rationale.',
  'INDICATIONS_EXPANDED': 'Broader indications require clinical evidence supporting expanded patient population or use environment.',
  'TECH_DIFFERENCE': 'Core technology difference requires bench testing and risk analysis to demonstrate substantial equivalence.',
  'ENERGY_SOURCE_CHANGE': 'Energy source difference may change safety profile; provide verification/validation evidence and applicable standards testing.',
  'DESIGN_ARCH_CHANGE': 'Design architecture change requires verification/validation demonstrating equivalent performance and safety.',
  'MATERIAL_CHANGE': 'Material difference requires biocompatibility assessment per ISO 10993-1 and justification of equivalence.',
  'TISSUE_CONTACT_CHANGE': 'Change in tissue contact type requires updated biocompatibility evaluation per ISO 10993-1.',
  'CONTACT_DURATION_CHANGE': 'Change in contact duration category may require additional biocompatibility endpoints per ISO 10993-1.',
  'STERILIZATION_METHOD_CHANGE': 'Sterilization method change requires revalidation and review of residual/bioburden limits.',
  'PACKAGING_SYSTEM_CHANGE': 'Packaging system change requires integrity testing and may affect sterile barrier claims.',
  'SHELF_LIFE_CHANGE': 'New shelf-life claim requires accelerated and/or real-time aging study data.',
  'SOFTWARE_PRESENT_NEW': 'Subject introduces software not present in predicate; full IEC 62304 lifecycle documentation and cybersecurity review required.',
  'SOFTWARE_SAFETY_CLASS_DIFF': 'Software safety classification differs; provide classification justification and appropriate V&V evidence per IEC 62304.',
  'CYBERSECURITY_SURFACE_INCREASED': 'Increased network/cloud/mobile connectivity increases cybersecurity attack surface; provide SBOM, threat model, and vulnerability assessment.',
  'INTEROPERABILITY_CLAIM': 'New interoperability claims require interface testing and data integrity evidence.',
  'ML_ADAPTIVITY': 'ML/AI model adaptivity requires predetermined change control plan ',
  'PERFORMANCE_CLAIM_CHANGE': 'Performance claim changes require bench testing with defined acceptance criteria and may require clinical bridging.',
  'CLINICAL_EVIDENCE_GAP': 'Bench data alone may not support claim differences; clinical evidence or literature review likely needed.',
  'HUMAN_FACTORS_CHANGE': 'Changes to user interface or workflow require human factors validation and updated IFU.',
  'STANDARDS_GAP': 'No recognized consensus standard covers the identified differences; provide rationale or alternative test evidence.',
  'LABELING_IFU_GAP': 'Labeling or IFU requires updates to reflect device differences, warnings, or contraindications.',
  'PMS_SIGNAL_RISK': 'Post-market signals suggest heightened scrutiny; provide complaint trending and CAPA documentation.',
  'PREDICATE_TOXICITY_HIGH': 'Predicate has elevated safety signals; provide risk justification or consider alternate predicate.',
  'PREDICATE_LINEAGE_COMPROMISED': 'Predicate family tree shows safety concerns; document risk controls and consider alternate lineage.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Recommended artifacts per risk code
// ═══════════════════════════════════════════════════════════════════════════════

export const RISK_CODE_ARTIFACTS: Readonly<Record<RiskCode, readonly string[]>> = {
  'IU_MISMATCH': [
    'Clinical Rationale Memo',
    'IFU Draft',
    'Warnings / Precautions Update',
  ],
  'INDICATIONS_EXPANDED': [
    'Clinical Rationale Memo',
    'Literature Review',
    'Clinical Bridging Analysis',
    'Clinical Protocol / Study Plan',
  ],
  'TECH_DIFFERENCE': [
    'Bench Test Protocol',
    'Bench Test Report',
    'ISO 14971 Risk Management Plan',
  ],
  'ENERGY_SOURCE_CHANGE': [
    'Electrical Safety / EMC Report',
    'Bench Test Report',
    'FMEA / Hazard Analysis',
  ],
  'DESIGN_ARCH_CHANGE': [
    'Bench Test Protocol',
    'Bench Test Report',
    'FMEA / Hazard Analysis',
  ],
  'MATERIAL_CHANGE': [
    'ISO 10993-1 Biological Evaluation Plan',
    'Cytotoxicity/Sensitization/Irritation Summary',
    'Chemical Characterization Report',
  ],
  'TISSUE_CONTACT_CHANGE': [
    'ISO 10993-1 Biological Evaluation Plan',
    'Residual Risk / Benefit-Risk Justification',
  ],
  'CONTACT_DURATION_CHANGE': [
    'ISO 10993-1 Biological Evaluation Plan',
    'Cytotoxicity/Sensitization/Irritation Summary',
  ],
  'STERILIZATION_METHOD_CHANGE': [
    'Sterilization Validation (SAL)',
    'EO Residuals Report',
  ],
  'PACKAGING_SYSTEM_CHANGE': [
    'Packaging Integrity / Seal Strength',
    'Bench Test Report',
  ],
  'SHELF_LIFE_CHANGE': [
    'Bench Test Protocol',
    'Bench Test Report',
    'Performance Verification Summary',
  ],
  'SOFTWARE_PRESENT_NEW': [
    'IEC 62304 Software Development Plan',
    'SOUP List',
    'SBOM',
    'Threat Model',
  ],
  'SOFTWARE_SAFETY_CLASS_DIFF': [
    'IEC 62304 Software Development Plan',
    'Verification & Validation Evidence',
  ],
  'CYBERSECURITY_SURFACE_INCREASED': [
    'SBOM',
    'Vulnerability Assessment Summary',
    'Patch / Update Process',
  ],
  'INTEROPERABILITY_CLAIM': [
    'Bench Test Report',
    'Performance Verification Summary',
    'Vulnerability Assessment Summary',
  ],
  'ML_ADAPTIVITY': [
    'IEC 62304 Software Development Plan',
    'Verification & Validation Evidence',
    'ISO 14971 Risk Management Plan',
  ],
  'PERFORMANCE_CLAIM_CHANGE': [
    'Bench Test Protocol',
    'Bench Test Report',
    'Performance Verification Summary',
    'Clinical Bridging Analysis',
  ],
  'CLINICAL_EVIDENCE_GAP': [
    'Clinical Protocol / Study Plan',
    'Clinical Rationale Memo',
    'Literature Review',
  ],
  'HUMAN_FACTORS_CHANGE': [
    'Human Factors Validation Summary',
    'IFU Draft',
    'Warnings / Precautions Update',
  ],
  'STANDARDS_GAP': [
    'Standards Matrix',
    'Standards Gap Rationale',
    'Conformance Test Summary',
  ],
  'LABELING_IFU_GAP': [
    'IFU Draft',
    'Warnings / Precautions Update',
  ],
  'PMS_SIGNAL_RISK': [
    'CAPA Summary',
    'Complaint Trending',
    'PSUR / PMCF Trigger Memo',
  ],
  'PREDICATE_TOXICITY_HIGH': [
    'Recall / Safety Signal Summary',
    'CAPA Summary',
  ],
  'PREDICATE_LINEAGE_COMPROMISED': [
    'Recall / Safety Signal Summary',
    'ISO 14971 Risk Management Plan',
    'CAPA Summary',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// Regulatory Objection Library — "Shadow Reviewer" anticipated questions
// ═══════════════════════════════════════════════════════════════════════════════

export interface RegulatoryObjection {
  readonly question: string;
  readonly severity: RiskSeverity;
  readonly recommended_artifacts: readonly string[];
  readonly ectd_location: string;
}

export const REGULATORY_OBJECTION_LIBRARY: Readonly<Record<RiskCode, RegulatoryObjection>> = {
  'IU_MISMATCH': {
    question: 'How does your device maintain the same intended use as the predicate when the indications differ?',
    severity: 'HIGH',
    recommended_artifacts: [
      'Clinical Rationale Memo',
      'IFU Draft',
      'Warnings / Precautions Update',
    ],
    ectd_location: '510(k) Summary, Section 11 — Substantial Equivalence Discussion',
  },
  'INDICATIONS_EXPANDED': {
    question: 'What clinical evidence supports your expanded indications for use?',
    severity: 'HIGH',
    recommended_artifacts: [
      'Clinical Rationale Memo',
      'Literature Review',
      'Clinical Bridging Analysis',
      'Clinical Protocol / Study Plan',
    ],
    ectd_location: '510(k) Summary, Section 11 — Clinical Evidence + Appendix',
  },
  'TECH_DIFFERENCE': {
    question: 'How does your technological change maintain equivalence to the predicate device?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Bench Test Protocol',
      'Bench Test Report',
      'ISO 14971 Risk Management Plan',
    ],
    ectd_location: '510(k) Summary, Section 12 — Performance Data',
  },
  'ENERGY_SOURCE_CHANGE': {
    question: 'How does the energy source change affect the safety and performance profile of your device?',
    severity: 'HIGH',
    recommended_artifacts: [
      'Electrical Safety / EMC Report',
      'Bench Test Report',
      'FMEA / Hazard Analysis',
    ],
    ectd_location: '510(k) Summary, Section 12 — Electrical Safety + EMC',
  },
  'DESIGN_ARCH_CHANGE': {
    question: 'What verification and validation evidence demonstrates equivalent function despite the design change?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Bench Test Protocol',
      'Bench Test Report',
      'FMEA / Hazard Analysis',
    ],
    ectd_location: '510(k) Summary, Section 12 — Performance Data',
  },
  'MATERIAL_CHANGE': {
    question: 'Why does your material change not impact biocompatibility?',
    severity: 'HIGH',
    recommended_artifacts: [
      'ISO 10993-1 Biological Evaluation Plan',
      'Cytotoxicity/Sensitization/Irritation Summary',
      'Chemical Characterization Report',
    ],
    ectd_location: '510(k) Section 11, biocompatibility summary + test reports in appendix',
  },
  'TISSUE_CONTACT_CHANGE': {
    question: 'How does the change in tissue contact affect the biocompatibility evaluation?',
    severity: 'HIGH',
    recommended_artifacts: [
      'ISO 10993-1 Biological Evaluation Plan',
      'Residual Risk / Benefit-Risk Justification',
    ],
    ectd_location: '510(k) Section 11, biocompatibility summary',
  },
  'CONTACT_DURATION_CHANGE': {
    question: 'Does the change in contact duration require additional biocompatibility endpoints?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'ISO 10993-1 Biological Evaluation Plan',
      'Cytotoxicity/Sensitization/Irritation Summary',
    ],
    ectd_location: '510(k) Section 11, biocompatibility summary',
  },
  'STERILIZATION_METHOD_CHANGE': {
    question: 'How was the new sterilization method validated and what are the residual limits?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Sterilization Validation (SAL)',
      'EO Residuals Report',
    ],
    ectd_location: '510(k) Section 12 — Sterilization',
  },
  'PACKAGING_SYSTEM_CHANGE': {
    question: 'How does the packaging change maintain sterile barrier integrity?',
    severity: 'LOW',
    recommended_artifacts: [
      'Packaging Integrity / Seal Strength',
      'Bench Test Report',
    ],
    ectd_location: '510(k) Section 12 — Packaging / Shelf Life',
  },
  'SHELF_LIFE_CHANGE': {
    question: 'What accelerated or real-time aging data supports your new shelf-life claim?',
    severity: 'LOW',
    recommended_artifacts: [
      'Bench Test Protocol',
      'Bench Test Report',
      'Performance Verification Summary',
    ],
    ectd_location: '510(k) Section 12 — Shelf Life',
  },
  'SOFTWARE_PRESENT_NEW': {
    question: 'Your device introduces software not present in the predicate — provide full IEC 62304 lifecycle documentation.',
    severity: 'HIGH',
    recommended_artifacts: [
      'IEC 62304 Software Development Plan',
      'SOUP List',
      'SBOM',
      'Threat Model',
    ],
    ectd_location: '510(k) Section 14 — Software Documentation',
  },
  'SOFTWARE_SAFETY_CLASS_DIFF': {
    question: 'How do you justify the software safety classification difference from the predicate?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'IEC 62304 Software Development Plan',
      'Verification & Validation Evidence',
    ],
    ectd_location: '510(k) Section 14 — Software Documentation',
  },
  'CYBERSECURITY_SURFACE_INCREASED': {
    question: 'What cybersecurity controls address the increased attack surface?',
    severity: 'HIGH',
    recommended_artifacts: [
      'SBOM',
      'Vulnerability Assessment Summary',
      'Patch / Update Process',
    ],
    ectd_location: '510(k) Section 14 — Cybersecurity',
  },
  'INTEROPERABILITY_CLAIM': {
    question: 'What testing supports your new interoperability claims?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Bench Test Report',
      'Performance Verification Summary',
      'Vulnerability Assessment Summary',
    ],
    ectd_location: '510(k) Section 12 + 14 — Interoperability',
  },
  'ML_ADAPTIVITY': {
    question: 'What predetermined change control plan governs ML/AI model updates?',
    severity: 'HIGH',
    recommended_artifacts: [
      'IEC 62304 Software Development Plan',
      'Verification & Validation Evidence',
      'ISO 14971 Risk Management Plan',
    ],
    ectd_location: '510(k) Section 14 — AI/ML Documentation',
  },
  'PERFORMANCE_CLAIM_CHANGE': {
    question: 'What bench or clinical data supports your changed performance claims?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Bench Test Protocol',
      'Bench Test Report',
      'Performance Verification Summary',
      'Clinical Bridging Analysis',
    ],
    ectd_location: '510(k) Section 12 — Performance Data',
  },
  'CLINICAL_EVIDENCE_GAP': {
    question: 'Why is bench data alone sufficient to support the claimed differences?',
    severity: 'HIGH',
    recommended_artifacts: [
      'Clinical Protocol / Study Plan',
      'Clinical Rationale Memo',
      'Literature Review',
    ],
    ectd_location: '510(k) Section 11 — Clinical Evidence',
  },
  'HUMAN_FACTORS_CHANGE': {
    question: 'What human factors validation evidence demonstrates safe use despite interface changes?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Human Factors Validation Summary',
      'IFU Draft',
      'Warnings / Precautions Update',
    ],
    ectd_location: '510(k) Section 12 — Human Factors',
  },
  'STANDARDS_GAP': {
    question: 'No recognized standard covers the identified differences — what alternative evidence is provided?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'Standards Matrix',
      'Standards Gap Rationale',
      'Conformance Test Summary',
    ],
    ectd_location: '510(k) Section 13 — Standards',
  },
  'LABELING_IFU_GAP': {
    question: 'How does your labeling reflect the identified device differences?',
    severity: 'LOW',
    recommended_artifacts: [
      'IFU Draft',
      'Warnings / Precautions Update',
    ],
    ectd_location: '510(k) Section 9 — Labeling',
  },
  'PMS_SIGNAL_RISK': {
    question: 'What post-market signals exist for this predicate and how are they addressed?',
    severity: 'MEDIUM',
    recommended_artifacts: [
      'CAPA Summary',
      'Complaint Trending',
      'PSUR / PMCF Trigger Memo',
    ],
    ectd_location: '510(k) Section 11 — Post-Market Surveillance',
  },
  'PREDICATE_TOXICITY_HIGH': {
    question: 'The predicate has elevated safety signals — justify why this predicate is still appropriate.',
    severity: 'HIGH',
    recommended_artifacts: [
      'Recall / Safety Signal Summary',
      'CAPA Summary',
    ],
    ectd_location: '510(k) Section 11 — SE Discussion + Risk Justification',
  },
  'PREDICATE_LINEAGE_COMPROMISED': {
    question: 'The predicate family tree shows safety concerns — document risk controls and consider alternate lineage.',
    severity: 'HIGH',
    recommended_artifacts: [
      'Recall / Safety Signal Summary',
      'ISO 14971 Risk Management Plan',
      'CAPA Summary',
    ],
    ectd_location: '510(k) Section 11 — SE Discussion + Risk Justification',
  },
};
