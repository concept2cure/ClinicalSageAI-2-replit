/**
 * Phase 15 — Submission Operations Domain Configuration
 *
 * Package families, document families, role taxonomy, blocker taxonomy,
 * stage model, and section templates for biotech, pharma, CRO,
 * medical device, diagnostics/IVD/IVDR.
 */

// ============================================================
// A. PACKAGE FAMILIES
// ============================================================

export interface PackageFamilyDef {
  key: string;
  label: string;
  industry: string;
  sections: SectionTemplateDef[];
}

export interface SectionTemplateDef {
  key: string;
  label: string;
  children?: SectionTemplateDef[];
}

export const PACKAGE_FAMILIES: PackageFamilyDef[] = [
  // --- Biotech / Pharma / Biologics / Cell & Gene ---
  {
    key: 'pre_ind',
    label: 'Pre-IND',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'module2', label: 'Module 2 — Summaries' },
      { key: 'module3_cmc', label: 'Module 3 — CMC' },
      { key: 'module4', label: 'Module 4 — Nonclinical' },
      { key: 'module5', label: 'Module 5 — Clinical' },
    ],
  },
  {
    key: 'interact',
    label: 'INTERACT',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'briefing', label: 'Briefing Package' },
      { key: 'cmc', label: 'CMC Overview' },
      { key: 'nonclinical', label: 'Nonclinical Summary' },
      { key: 'clinical', label: 'Clinical Rationale' },
    ],
  },
  {
    key: 'scientific_advice',
    label: 'Scientific Advice / Briefing',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'briefing_book', label: 'Briefing Book' },
      { key: 'questions', label: 'Questions for Agency' },
      { key: 'supporting', label: 'Supporting Data' },
    ],
  },
  {
    key: 'meeting_package',
    label: 'Type A/B/C Meeting Package',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Administrative / Request Letter' },
      { key: 'briefing_book', label: 'Briefing Book' },
      { key: 'questions', label: 'Questions' },
      { key: 'supporting', label: 'Supporting Data' },
    ],
  },
  {
    key: 'ind',
    label: 'IND',
    industry: 'pharma',
    sections: [
      { key: 'module1', label: 'Module 1 — Administrative' },
      { key: 'module2', label: 'Module 2 — Summaries / Overviews' },
      { key: 'module3_cmc', label: 'Module 3 — CMC' },
      { key: 'module4', label: 'Module 4 — Nonclinical' },
      { key: 'module5_clinical', label: 'Module 5 — Clinical' },
    ],
  },
  {
    key: 'cta',
    label: 'CTA',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'module2', label: 'Summaries / Overviews' },
      { key: 'module3_cmc', label: 'CMC' },
      { key: 'module4', label: 'Nonclinical' },
      { key: 'module5_clinical', label: 'Clinical' },
    ],
  },
  {
    key: 'amendment',
    label: 'Amendment Package',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Cover / Amendment Letter' },
      { key: 'amended_sections', label: 'Amended Sections' },
      { key: 'rationale', label: 'Rationale / Summary of Changes' },
    ],
  },
  {
    key: 'annual_report',
    label: 'Annual Report / DSUR',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'safety_summary', label: 'Safety Summary' },
      { key: 'clinical_update', label: 'Clinical Update' },
      { key: 'cmc_update', label: 'CMC Update' },
    ],
  },
  {
    key: 'ir_response',
    label: 'IR / Deficiency Response',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Cover Letter' },
      { key: 'response_body', label: 'Response to Questions' },
      { key: 'supporting', label: 'Supporting Data / Amendments' },
    ],
  },
  {
    key: 'nda_bla',
    label: 'NDA / BLA',
    industry: 'pharma',
    sections: [
      { key: 'module1', label: 'Module 1 — Administrative' },
      { key: 'module2', label: 'Module 2 — Summaries' },
      { key: 'module3_cmc', label: 'Module 3 — CMC' },
      { key: 'module4', label: 'Module 4 — Nonclinical' },
      { key: 'module5_clinical', label: 'Module 5 — Clinical' },
    ],
  },
  {
    key: 'cmc_readiness',
    label: 'CMC Package Readiness',
    industry: 'pharma',
    sections: [
      { key: 'drug_substance', label: '3.2.S — Drug Substance' },
      { key: 'drug_product', label: '3.2.P — Drug Product' },
      { key: 'specifications', label: 'Specifications' },
      { key: 'stability', label: 'Stability' },
      { key: 'manufacturing', label: 'Manufacturing' },
    ],
  },
  {
    key: 'clinical_readiness',
    label: 'Clinical Package Readiness',
    industry: 'pharma',
    sections: [
      { key: 'protocol', label: 'Protocol / SAP' },
      { key: 'ib', label: 'Investigator Brochure' },
      { key: 'csr', label: 'CSR' },
      { key: 'safety', label: 'Safety Narratives' },
      { key: 'integrated', label: 'Integrated Analyses' },
    ],
  },
  {
    key: 'response_package',
    label: 'Response Package',
    industry: 'pharma',
    sections: [
      { key: 'admin', label: 'Cover / Response Letter' },
      { key: 'responses', label: 'Responses to Deficiencies' },
      { key: 'amended_sections', label: 'Amended Sections' },
      { key: 'supporting', label: 'Supporting Evidence' },
    ],
  },

  // --- Medical Device ---
  {
    key: '510k',
    label: '510(k)',
    industry: 'medtech',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'device_description', label: 'Device Description' },
      { key: 'predicate_comparison', label: 'Predicate / Comparison' },
      { key: 'labeling_ifu', label: 'Labeling / IFU' },
      { key: 'risk_management', label: 'Risk Management' },
      { key: 'software_cyber', label: 'Software / Cybersecurity' },
      { key: 'vv_bench', label: 'V&V / Bench Testing' },
      { key: 'biocompat_sterilization', label: 'Biocompatibility / Sterilization' },
      { key: 'cer_clinical', label: 'CER / Clinical' },
      { key: 'standards', label: 'Standards Matrix' },
    ],
  },
  {
    key: 'special_510k',
    label: 'Special 510(k)',
    industry: 'medtech',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'design_control', label: 'Design Control Summary' },
      { key: 'risk_analysis', label: 'Risk Analysis Update' },
      { key: 'verification', label: 'Verification' },
      { key: 'labeling', label: 'Labeling' },
    ],
  },
  {
    key: 'de_novo',
    label: 'De Novo',
    industry: 'medtech',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'device_description', label: 'Device Description' },
      { key: 'classification', label: 'Classification Rationale' },
      { key: 'risk_benefit', label: 'Risk-Benefit Analysis' },
      { key: 'performance', label: 'Performance Data' },
      { key: 'labeling_ifu', label: 'Labeling / IFU' },
      { key: 'software_cyber', label: 'Software / Cybersecurity' },
    ],
  },
  {
    key: 'pma',
    label: 'PMA',
    industry: 'medtech',
    sections: [
      { key: 'admin', label: 'Administrative' },
      { key: 'device_description', label: 'Device Description' },
      { key: 'manufacturing', label: 'Manufacturing' },
      { key: 'nonclinical', label: 'Nonclinical / Bench' },
      { key: 'clinical', label: 'Clinical' },
      { key: 'labeling_ifu', label: 'Labeling / IFU' },
      { key: 'software_cyber', label: 'Software / Cybersecurity' },
      { key: 'risk_management', label: 'Risk Management' },
      { key: 'biocompat', label: 'Biocompatibility' },
    ],
  },
  {
    key: 'cer',
    label: 'CER',
    industry: 'medtech',
    sections: [
      { key: 'scope_plan', label: 'Scope & Plan' },
      { key: 'device_description', label: 'Device Description' },
      { key: 'state_of_art', label: 'State of the Art' },
      { key: 'clinical_data', label: 'Clinical Data' },
      { key: 'literature_review', label: 'Literature Review' },
      { key: 'benefit_risk', label: 'Benefit-Risk' },
      { key: 'conclusions', label: 'Conclusions' },
      { key: 'pmcf', label: 'PMCF Plan' },
    ],
  },
  {
    key: 'technical_file',
    label: 'Technical File / Technical Documentation',
    industry: 'medtech',
    sections: [
      { key: 'device_description', label: 'Device Description' },
      { key: 'design_manufacturing', label: 'Design & Manufacturing' },
      { key: 'gspr', label: 'GSPR / ER Checklist' },
      { key: 'risk_management', label: 'Risk Management' },
      { key: 'vv', label: 'Verification & Validation' },
      { key: 'labeling', label: 'Labeling' },
      { key: 'cer_clinical', label: 'CER / Clinical' },
      { key: 'pms', label: 'PMS / PMCF' },
    ],
  },
  {
    key: 'dhf_readiness',
    label: 'DHF Evidence Readiness',
    industry: 'medtech',
    sections: [
      { key: 'design_inputs', label: 'Design Inputs' },
      { key: 'design_outputs', label: 'Design Outputs' },
      { key: 'verification', label: 'Design Verification' },
      { key: 'validation', label: 'Design Validation' },
      { key: 'risk_file', label: 'Risk File' },
      { key: 'traceability', label: 'Traceability Matrix' },
    ],
  },
  {
    key: 'software_package',
    label: 'Software Package Readiness',
    industry: 'medtech',
    sections: [
      { key: 'architecture', label: 'Software Architecture' },
      { key: 'requirements', label: 'Requirements' },
      { key: 'testing', label: 'Testing / V&V' },
      { key: 'cybersecurity', label: 'Cybersecurity' },
      { key: 'documentation', label: 'Software Documentation Set' },
    ],
  },

  // --- Diagnostics / IVD / IVDR ---
  {
    key: 'perf_eval',
    label: 'Performance Evaluation Package',
    industry: 'ivd',
    sections: [
      { key: 'perf_eval_plan', label: 'PE Plan' },
      { key: 'analytical', label: 'Analytical Performance' },
      { key: 'clinical', label: 'Clinical Performance' },
      { key: 'scientific_validity', label: 'Scientific Validity' },
      { key: 'perf_eval_report', label: 'PE Report' },
    ],
  },
  {
    key: 'ivdr_td',
    label: 'IVDR Technical Documentation',
    industry: 'ivd',
    sections: [
      { key: 'device_description', label: 'Device Description' },
      { key: 'design_manufacturing', label: 'Design & Manufacturing' },
      { key: 'gspr', label: 'GSPR' },
      { key: 'perf_eval', label: 'Performance Evaluation' },
      { key: 'labeling', label: 'Labeling' },
      { key: 'pms', label: 'PMS / PMPF' },
    ],
  },
  {
    key: 'analytical_perf',
    label: 'Analytical Performance Package',
    industry: 'ivd',
    sections: [
      { key: 'sensitivity', label: 'Sensitivity / LoD' },
      { key: 'specificity', label: 'Specificity / Cross-reactivity' },
      { key: 'precision', label: 'Precision / Reproducibility' },
      { key: 'accuracy', label: 'Accuracy / Trueness' },
      { key: 'measuring_range', label: 'Measuring Range' },
    ],
  },
  {
    key: 'clinical_perf',
    label: 'Clinical Performance Package',
    industry: 'ivd',
    sections: [
      { key: 'study_design', label: 'Study Design' },
      { key: 'results', label: 'Results / Analysis' },
      { key: 'clinical_sens_spec', label: 'Clinical Sensitivity / Specificity' },
      { key: 'comparison', label: 'Comparator Method' },
    ],
  },
  {
    key: 'scientific_validity',
    label: 'Scientific Validity Package',
    industry: 'ivd',
    sections: [
      { key: 'biomarker', label: 'Biomarker Rationale' },
      { key: 'literature', label: 'Literature Review' },
      { key: 'evidence', label: 'Evidence Summary' },
    ],
  },
  {
    key: 'gspr_package',
    label: 'GSPR / Compliance Package',
    industry: 'ivd',
    sections: [
      { key: 'gspr_checklist', label: 'GSPR Checklist' },
      { key: 'standards', label: 'Standards / Harmonized' },
      { key: 'evidence_links', label: 'Evidence Links' },
    ],
  },
  {
    key: 'pms_pmpf',
    label: 'PMS / PMPF Evidence Package',
    industry: 'ivd',
    sections: [
      { key: 'pms_plan', label: 'PMS Plan' },
      { key: 'pmpf_plan', label: 'PMPF Plan' },
      { key: 'vigilance', label: 'Vigilance Data' },
      { key: 'trend', label: 'Trend Analysis' },
    ],
  },
];

// Lookup helpers
export function getPackageFamiliesByIndustry(industry: string): PackageFamilyDef[] {
  const normalized = industry === 'biotech' || industry === 'cro' ? 'pharma' : industry;
  return PACKAGE_FAMILIES.filter(f => f.industry === normalized);
}

export function getPackageFamily(key: string): PackageFamilyDef | undefined {
  return PACKAGE_FAMILIES.find(f => f.key === key);
}

// ============================================================
// B. DOCUMENT FAMILIES
// ============================================================

export interface DocumentFamilyDef {
  key: string;
  label: string;
  category: string;
  industry: string; // pharma | medtech | ivd | cross
}

export const DOCUMENT_FAMILIES: DocumentFamilyDef[] = [
  // --- Administrative / Regulatory Operations ---
  { key: 'cover_letter', label: 'Cover Letter', category: 'admin', industry: 'pharma' },
  { key: 'form_package', label: 'Form Package', category: 'admin', industry: 'pharma' },
  { key: 'investigator_forms', label: 'Investigator Forms', category: 'admin', industry: 'pharma' },
  {
    key: 'financial_disclosure',
    label: 'Financial Disclosure',
    category: 'admin',
    industry: 'pharma',
  },
  { key: 'loa', label: 'LOA Package', category: 'admin', industry: 'pharma' },
  { key: 'debarment', label: 'Debarment / Certification', category: 'admin', industry: 'pharma' },
  {
    key: 'meeting_request',
    label: 'Meeting Request Letter',
    category: 'admin',
    industry: 'pharma',
  },
  { key: 'briefing_book', label: 'Briefing Book', category: 'admin', industry: 'pharma' },
  {
    key: 'agency_response',
    label: 'Agency Response Package',
    category: 'admin',
    industry: 'pharma',
  },
  {
    key: 'commitment_tracking',
    label: 'Commitment Tracking',
    category: 'admin',
    industry: 'pharma',
  },
  {
    key: 'submission_manifest',
    label: 'Submission Manifest',
    category: 'admin',
    industry: 'pharma',
  },
  {
    key: 'publishing_checklist',
    label: 'Publishing Checklist',
    category: 'admin',
    industry: 'pharma',
  },
  { key: 'filing_plan', label: 'Filing Plan', category: 'admin', industry: 'pharma' },

  // --- Module 2 / Summaries ---
  { key: 'qos', label: 'Quality Overall Summary', category: 'module2', industry: 'pharma' },
  {
    key: 'nonclinical_overview',
    label: 'Nonclinical Overview',
    category: 'module2',
    industry: 'pharma',
  },
  { key: 'clinical_overview', label: 'Clinical Overview', category: 'module2', industry: 'pharma' },
  {
    key: 'nonclinical_summary',
    label: 'Nonclinical Written Summary',
    category: 'module2',
    industry: 'pharma',
  },
  { key: 'clinical_summary', label: 'Clinical Summary', category: 'module2', industry: 'pharma' },
  { key: 'benefit_risk', label: 'Benefit-Risk Summary', category: 'module2', industry: 'pharma' },

  // --- Module 3 / CMC ---
  { key: 'drug_substance', label: '3.2.S — Drug Substance', category: 'cmc', industry: 'pharma' },
  { key: 'drug_product', label: '3.2.P — Drug Product', category: 'cmc', industry: 'pharma' },
  {
    key: 'manufacturing_desc',
    label: 'Manufacturing Description',
    category: 'cmc',
    industry: 'pharma',
  },
  { key: 'control_strategy', label: 'Control Strategy', category: 'cmc', industry: 'pharma' },
  { key: 'specifications', label: 'Specifications', category: 'cmc', industry: 'pharma' },
  { key: 'methods', label: 'Analytical Methods', category: 'cmc', industry: 'pharma' },
  { key: 'method_validation', label: 'Method Validation', category: 'cmc', industry: 'pharma' },
  { key: 'comparability', label: 'Comparability', category: 'cmc', industry: 'pharma' },
  { key: 'stability_protocol', label: 'Stability Protocol', category: 'cmc', industry: 'pharma' },
  { key: 'stability_report', label: 'Stability Report', category: 'cmc', industry: 'pharma' },
  { key: 'batch_analysis', label: 'Batch Analysis', category: 'cmc', industry: 'pharma' },
  { key: 'container_closure', label: 'Container Closure', category: 'cmc', industry: 'pharma' },

  // --- Module 4 / Nonclinical ---
  {
    key: 'pharmacology',
    label: 'Pharmacology Report',
    category: 'nonclinical',
    industry: 'pharma',
  },
  { key: 'toxicology', label: 'Toxicology Report', category: 'nonclinical', industry: 'pharma' },
  {
    key: 'safety_pharmacology',
    label: 'Safety Pharmacology',
    category: 'nonclinical',
    industry: 'pharma',
  },
  { key: 'genotox', label: 'Genotoxicity', category: 'nonclinical', industry: 'pharma' },
  { key: 'tk_pk', label: 'TK/PK Report', category: 'nonclinical', industry: 'pharma' },

  // --- Module 5 / Clinical ---
  { key: 'protocol', label: 'Protocol', category: 'clinical', industry: 'pharma' },
  {
    key: 'protocol_amendment',
    label: 'Protocol Amendment',
    category: 'clinical',
    industry: 'pharma',
  },
  { key: 'ib', label: 'Investigator Brochure', category: 'clinical', industry: 'pharma' },
  { key: 'sap', label: 'SAP', category: 'clinical', industry: 'pharma' },
  { key: 'csr', label: 'CSR', category: 'clinical', industry: 'pharma' },
  {
    key: 'safety_narratives',
    label: 'Safety Narratives',
    category: 'clinical',
    industry: 'pharma',
  },
  {
    key: 'randomization_plan',
    label: 'Randomization / Blinding Plan',
    category: 'clinical',
    industry: 'pharma',
  },
  { key: 'monitoring_plan', label: 'Monitoring Plan', category: 'clinical', industry: 'pharma' },
  { key: 'dmp', label: 'DMP', category: 'clinical', industry: 'pharma' },
  { key: 'crf_specs', label: 'CRF/eCRF Specs', category: 'clinical', industry: 'pharma' },
  { key: 'dsmb_charter', label: 'DSMB/DMC Charter', category: 'clinical', industry: 'pharma' },
  {
    key: 'medical_monitoring',
    label: 'Medical Monitoring Plan',
    category: 'clinical',
    industry: 'pharma',
  },
  { key: 'interim_analysis', label: 'Interim Analysis', category: 'clinical', industry: 'pharma' },
  { key: 'response_memo', label: 'Response Memo', category: 'clinical', industry: 'pharma' },

  // --- Device ---
  {
    key: 'device_cover_admin',
    label: 'Cover / Admin Package',
    category: 'admin',
    industry: 'medtech',
  },
  { key: 'device_forms', label: 'Forms / Declarations', category: 'admin', industry: 'medtech' },
  {
    key: 'intended_use',
    label: 'Intended Use / Indications',
    category: 'device',
    industry: 'medtech',
  },
  {
    key: 'device_description',
    label: 'Device Description',
    category: 'device',
    industry: 'medtech',
  },
  {
    key: 'predicate_comparison',
    label: 'Predicate Comparison Matrix',
    category: 'device',
    industry: 'medtech',
  },
  {
    key: 'substantial_equivalence',
    label: 'Substantial Equivalence Rationale',
    category: 'device',
    industry: 'medtech',
  },
  { key: 'standards_matrix', label: 'Standards Matrix', category: 'device', industry: 'medtech' },
  { key: 'labeling', label: 'Labeling', category: 'device', industry: 'medtech' },
  { key: 'ifu', label: 'IFU', category: 'device', industry: 'medtech' },
  {
    key: 'software_architecture',
    label: 'Software Architecture',
    category: 'software',
    industry: 'medtech',
  },
  {
    key: 'software_doc_set',
    label: 'Software Documentation Set',
    category: 'software',
    industry: 'medtech',
  },
  {
    key: 'cybersecurity',
    label: 'Cybersecurity Package',
    category: 'software',
    industry: 'medtech',
  },
  {
    key: 'usability_hf',
    label: 'Usability / Human Factors',
    category: 'device',
    industry: 'medtech',
  },
  {
    key: 'risk_management',
    label: 'Risk Management File',
    category: 'device',
    industry: 'medtech',
  },
  {
    key: 'traceability_matrix',
    label: 'Traceability Matrix',
    category: 'device',
    industry: 'medtech',
  },
  { key: 'design_verification', label: 'Design Verification', category: 'vv', industry: 'medtech' },
  { key: 'design_validation', label: 'Design Validation', category: 'vv', industry: 'medtech' },
  { key: 'bench_testing', label: 'Bench Testing Package', category: 'vv', industry: 'medtech' },
  { key: 'electrical_emc', label: 'Electrical Safety / EMC', category: 'vv', industry: 'medtech' },
  {
    key: 'biocompatibility',
    label: 'Biocompatibility Package',
    category: 'device',
    industry: 'medtech',
  },
  { key: 'sterilization', label: 'Sterilization Package', category: 'device', industry: 'medtech' },
  {
    key: 'packaging_shelf_life',
    label: 'Packaging / Shelf Life',
    category: 'device',
    industry: 'medtech',
  },
  { key: 'cer_doc', label: 'CER', category: 'clinical', industry: 'medtech' },
  {
    key: 'clinical_evidence',
    label: 'Clinical Evidence Package',
    category: 'clinical',
    industry: 'medtech',
  },
  { key: 'pms_pmcf', label: 'PMS / PMCF Package', category: 'postmarket', industry: 'medtech' },
  { key: 'dhf_evidence', label: 'DHF Evidence Package', category: 'design', industry: 'medtech' },

  // --- Diagnostics / IVD / IVDR ---
  {
    key: 'ivd_sci_validity',
    label: 'Scientific Validity Package',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_analytical',
    label: 'Analytical Performance Package',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_clinical_perf',
    label: 'Clinical Performance Package',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_pe_plan',
    label: 'Performance Evaluation Plan',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_pe_report',
    label: 'Performance Evaluation Report',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_assay_validation',
    label: 'Assay Validation',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_instrument_validation',
    label: 'Instrument / Software Validation',
    category: 'performance',
    industry: 'ivd',
  },
  {
    key: 'ivd_specimen_stability',
    label: 'Specimen / Sample Stability',
    category: 'performance',
    industry: 'ivd',
  },
  { key: 'ivd_labeling', label: 'Labeling / IFU', category: 'admin', industry: 'ivd' },
  { key: 'ivd_gspr', label: 'GSPR Mapping', category: 'compliance', industry: 'ivd' },
  {
    key: 'ivd_td_sections',
    label: 'Technical Documentation Sections',
    category: 'td',
    industry: 'ivd',
  },
  { key: 'ivd_pms_pmpf', label: 'PMS / PMPF Package', category: 'postmarket', industry: 'ivd' },

  // --- Cross-cutting ---
  { key: 'review_memo', label: 'Review Memo', category: 'operational', industry: 'cross' },
  { key: 'approval_memo', label: 'Approval Memo', category: 'operational', industry: 'cross' },
  { key: 'issue_log', label: 'Issue Log', category: 'operational', industry: 'cross' },
  {
    key: 'change_control',
    label: 'Change-Control Note',
    category: 'operational',
    industry: 'cross',
  },
  {
    key: 'compliance_finding',
    label: 'Compliance Finding',
    category: 'operational',
    industry: 'cross',
  },
  {
    key: 'evidence_gap_log',
    label: 'Evidence Gap Log',
    category: 'operational',
    industry: 'cross',
  },
  {
    key: 'handoff_checklist',
    label: 'Handoff Checklist',
    category: 'operational',
    industry: 'cross',
  },
  {
    key: 'readiness_checklist',
    label: 'Readiness Checklist',
    category: 'operational',
    industry: 'cross',
  },
  {
    key: 'deficiency_tracker',
    label: 'Deficiency Response Tracker',
    category: 'operational',
    industry: 'cross',
  },
  { key: 'authoring_brief', label: 'Authoring Brief', category: 'operational', industry: 'cross' },
  {
    key: 'publishing_release',
    label: 'Publishing Release Memo',
    category: 'operational',
    industry: 'cross',
  },
  {
    key: 'milestone_gate_memo',
    label: 'Milestone Gate Memo',
    category: 'operational',
    industry: 'cross',
  },
];

export function getDocumentFamilies(industry?: string): DocumentFamilyDef[] {
  if (!industry) return DOCUMENT_FAMILIES;
  const cross = DOCUMENT_FAMILIES.filter(d => d.industry === 'cross');
  const specific = DOCUMENT_FAMILIES.filter(d => d.industry === industry);
  return [...specific, ...cross];
}

// ============================================================
// C. ROLE TAXONOMY
// ============================================================

export interface RoleDef {
  key: string;
  label: string;
  permissionClass: string;
  industry: string;
}

export const PERMISSION_CLASSES = [
  { key: 'drafter', label: 'Drafter / Author' },
  { key: 'functional_reviewer', label: 'Functional Reviewer' },
  { key: 'sme_reviewer', label: 'SME Reviewer' },
  { key: 'qa_compliance_reviewer', label: 'QA / Compliance Reviewer' },
  { key: 'sponsor_approver', label: 'Sponsor Approver' },
  { key: 'final_signatory', label: 'Final Signatory' },
  { key: 'publisher', label: 'Publisher / Release Controller' },
  { key: 'pm_lead', label: 'PM / Submission Lead' },
  { key: 'cro_contributor', label: 'CRO Contributor' },
  { key: 'observer', label: 'Observer / Executive' },
] as const;

export const ROLES: RoleDef[] = [
  // Sponsor / biotech / pharma
  {
    key: 'global_reg_lead',
    label: 'Global Regulatory Lead',
    permissionClass: 'sponsor_approver',
    industry: 'pharma',
  },
  {
    key: 'regional_reg_lead',
    label: 'Regional Regulatory Lead',
    permissionClass: 'sponsor_approver',
    industry: 'pharma',
  },
  {
    key: 'ra_manager',
    label: 'Regulatory Affairs Manager',
    permissionClass: 'sponsor_approver',
    industry: 'pharma',
  },
  {
    key: 'submission_manager',
    label: 'Submission Manager',
    permissionClass: 'pm_lead',
    industry: 'pharma',
  },
  {
    key: 'reg_ops_specialist',
    label: 'Regulatory Operations Specialist',
    permissionClass: 'pm_lead',
    industry: 'pharma',
  },
  {
    key: 'medical_writer',
    label: 'Medical Writer',
    permissionClass: 'drafter',
    industry: 'pharma',
  },
  {
    key: 'sr_medical_writer',
    label: 'Senior Medical Writer',
    permissionClass: 'drafter',
    industry: 'pharma',
  },
  {
    key: 'mw_lead',
    label: 'Medical Writing Lead',
    permissionClass: 'functional_reviewer',
    industry: 'pharma',
  },
  {
    key: 'clinical_scientist',
    label: 'Clinical Scientist',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'clinical_dev_lead',
    label: 'Clinical Development Lead',
    permissionClass: 'sponsor_approver',
    industry: 'pharma',
  },
  {
    key: 'biostatistician',
    label: 'Biostatistician',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'stat_programmer',
    label: 'Statistical Programmer',
    permissionClass: 'drafter',
    industry: 'pharma',
  },
  {
    key: 'clinical_data_lead',
    label: 'Clinical Data Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'safety_pv_lead',
    label: 'Safety / PV Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'medical_monitor',
    label: 'Medical Monitor',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  { key: 'cmc_lead', label: 'CMC Lead', permissionClass: 'sponsor_approver', industry: 'pharma' },
  {
    key: 'ds_lead',
    label: 'Drug Substance Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'dp_lead',
    label: 'Drug Product Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'analytical_dev_lead',
    label: 'Analytical Development Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'process_dev_lead',
    label: 'Process Development Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'manufacturing_lead',
    label: 'Manufacturing Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'qa_lead',
    label: 'Quality Assurance Lead',
    permissionClass: 'qa_compliance_reviewer',
    industry: 'pharma',
  },
  {
    key: 'quality_compliance',
    label: 'Quality Systems / Compliance Lead',
    permissionClass: 'qa_compliance_reviewer',
    industry: 'pharma',
  },
  {
    key: 'labeling_lead',
    label: 'Labeling Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'nonclinical_lead',
    label: 'Nonclinical Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'tox_lead',
    label: 'Toxicology Lead',
    permissionClass: 'sme_reviewer',
    industry: 'pharma',
  },
  {
    key: 'program_manager',
    label: 'Program Manager',
    permissionClass: 'pm_lead',
    industry: 'pharma',
  },
  {
    key: 'pmo_portfolio',
    label: 'PMO / Portfolio Manager',
    permissionClass: 'pm_lead',
    industry: 'pharma',
  },
  {
    key: 'publishing_specialist',
    label: 'Publishing Specialist',
    permissionClass: 'publisher',
    industry: 'pharma',
  },
  {
    key: 'ectd_publisher',
    label: 'eCTD Publishing Specialist',
    permissionClass: 'publisher',
    industry: 'pharma',
  },
  {
    key: 'exec_sponsor',
    label: 'Executive Sponsor / VP Regulatory',
    permissionClass: 'final_signatory',
    industry: 'pharma',
  },

  // CRO / Vendor
  {
    key: 'cro_pm',
    label: 'CRO Project Manager',
    permissionClass: 'cro_contributor',
    industry: 'cro',
  },
  {
    key: 'cro_reg_writer',
    label: 'CRO Regulatory Writer',
    permissionClass: 'cro_contributor',
    industry: 'cro',
  },
  {
    key: 'cro_med_writer',
    label: 'CRO Medical Writer',
    permissionClass: 'cro_contributor',
    industry: 'cro',
  },
  {
    key: 'cro_biostats',
    label: 'CRO Biostatistics Lead',
    permissionClass: 'cro_contributor',
    industry: 'cro',
  },
  {
    key: 'cro_clin_ops',
    label: 'CRO Clinical Operations Lead',
    permissionClass: 'cro_contributor',
    industry: 'cro',
  },
  {
    key: 'cro_qa',
    label: 'CRO QA Reviewer',
    permissionClass: 'qa_compliance_reviewer',
    industry: 'cro',
  },
  {
    key: 'ext_cmc_reviewer',
    label: 'External CMC Reviewer',
    permissionClass: 'sme_reviewer',
    industry: 'cro',
  },
  {
    key: 'ext_med_reviewer',
    label: 'External Medical Reviewer',
    permissionClass: 'sme_reviewer',
    industry: 'cro',
  },
  {
    key: 'ext_stats_reviewer',
    label: 'External Stats Reviewer',
    permissionClass: 'sme_reviewer',
    industry: 'cro',
  },
  {
    key: 'independent_consultant',
    label: 'Independent Consultant Reviewer',
    permissionClass: 'sme_reviewer',
    industry: 'cro',
  },
  {
    key: 'vendor_publisher',
    label: 'Vendor Publishing Specialist',
    permissionClass: 'publisher',
    industry: 'cro',
  },

  // Device
  {
    key: 'device_ra_manager',
    label: 'Device Regulatory Affairs Manager',
    permissionClass: 'sponsor_approver',
    industry: 'medtech',
  },
  { key: '510k_lead', label: '510(k) Lead', permissionClass: 'pm_lead', industry: 'medtech' },
  { key: 'de_novo_lead', label: 'De Novo Lead', permissionClass: 'pm_lead', industry: 'medtech' },
  { key: 'pma_lead', label: 'PMA Lead', permissionClass: 'pm_lead', industry: 'medtech' },
  { key: 'cer_writer', label: 'CER Writer', permissionClass: 'drafter', industry: 'medtech' },
  {
    key: 'cer_reviewer',
    label: 'CER Reviewer',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'clin_eval_lead',
    label: 'Clinical Evaluation Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'risk_mgmt_lead',
    label: 'Risk Management Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'quality_engineer',
    label: 'Quality Engineer',
    permissionClass: 'qa_compliance_reviewer',
    industry: 'medtech',
  },
  {
    key: 'design_assurance',
    label: 'Design Assurance Lead',
    permissionClass: 'qa_compliance_reviewer',
    industry: 'medtech',
  },
  {
    key: 'systems_engineer',
    label: 'Systems Engineer',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  { key: 'vv_lead', label: 'V&V Lead', permissionClass: 'sme_reviewer', industry: 'medtech' },
  {
    key: 'software_lead',
    label: 'Software Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'cyber_lead',
    label: 'Cybersecurity Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'device_labeling_lead',
    label: 'Labeling Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'hf_lead',
    label: 'Human Factors Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'biocompat_sme',
    label: 'Biocompatibility SME',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'sterilization_sme',
    label: 'Sterilization SME',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'mfg_process_eng',
    label: 'Manufacturing / Process Engineer',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },
  {
    key: 'postmarket_lead',
    label: 'Postmarket / Vigilance Lead',
    permissionClass: 'sme_reviewer',
    industry: 'medtech',
  },

  // Diagnostics / IVD / IVDR
  {
    key: 'ivdr_reg_lead',
    label: 'IVDR Regulatory Lead',
    permissionClass: 'sponsor_approver',
    industry: 'ivd',
  },
  {
    key: 'pe_lead',
    label: 'Performance Evaluation Lead',
    permissionClass: 'pm_lead',
    industry: 'ivd',
  },
  {
    key: 'sci_validity_lead',
    label: 'Scientific Validity Lead',
    permissionClass: 'sme_reviewer',
    industry: 'ivd',
  },
  {
    key: 'clin_perf_lead',
    label: 'Clinical Performance Lead',
    permissionClass: 'sme_reviewer',
    industry: 'ivd',
  },
  {
    key: 'analytical_perf_lead',
    label: 'Analytical Performance Lead',
    permissionClass: 'sme_reviewer',
    industry: 'ivd',
  },
  {
    key: 'assay_dev_lead',
    label: 'Assay Development Lead',
    permissionClass: 'sme_reviewer',
    industry: 'ivd',
  },
  {
    key: 'ivd_sw_validation',
    label: 'Instrument / Software Validation Lead',
    permissionClass: 'sme_reviewer',
    industry: 'ivd',
  },
  {
    key: 'ivd_pms_lead',
    label: 'PMS / PMPF Lead',
    permissionClass: 'sme_reviewer',
    industry: 'ivd',
  },
];

export function getRolesByIndustry(industry: string): RoleDef[] {
  const cross = ROLES.filter(r => r.industry === 'cro'); // CRO roles always available
  if (industry === 'pharma' || industry === 'biotech') {
    return [...ROLES.filter(r => r.industry === 'pharma'), ...cross];
  }
  if (industry === 'cro') {
    return [...ROLES.filter(r => r.industry === 'pharma'), ...cross];
  }
  return [...ROLES.filter(r => r.industry === industry), ...cross];
}

// ============================================================
// D. BLOCKER TAXONOMY
// ============================================================

export interface BlockerTypeDef {
  key: string;
  label: string;
  industries: string[]; // which industries this blocker applies to
}

export const BLOCKER_TYPES: BlockerTypeDef[] = [
  {
    key: 'drafting_incomplete',
    label: 'Drafting Incomplete',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  { key: 'missing_evidence', label: 'Missing Evidence', industries: ['pharma', 'medtech', 'ivd'] },
  {
    key: 'data_inconsistency',
    label: 'Data Inconsistency',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  { key: 'stats_issue', label: 'Statistics Issue', industries: ['pharma'] },
  { key: 'safety_issue', label: 'Safety Issue', industries: ['pharma'] },
  { key: 'cmc_gap', label: 'CMC Gap', industries: ['pharma'] },
  {
    key: 'manufacturing_issue',
    label: 'Manufacturing / Process Issue',
    industries: ['pharma', 'medtech'],
  },
  {
    key: 'quality_compliance',
    label: 'Quality / Compliance Finding',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  {
    key: 'labeling_discrepancy',
    label: 'Labeling Discrepancy',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  { key: 'predicate_weakness', label: 'Predicate Weakness', industries: ['medtech'] },
  {
    key: 'substantial_equiv_weakness',
    label: 'Substantial Equivalence Weakness',
    industries: ['medtech'],
  },
  {
    key: 'software_cyber_issue',
    label: 'Software / Cybersecurity Issue',
    industries: ['medtech', 'ivd'],
  },
  { key: 'verification_gap', label: 'Verification Gap', industries: ['medtech', 'ivd'] },
  { key: 'validation_gap', label: 'Validation Gap', industries: ['medtech', 'ivd'] },
  { key: 'risk_management_issue', label: 'Risk Management Issue', industries: ['medtech'] },
  { key: 'cer_literature_gap', label: 'CER Literature Gap', industries: ['medtech'] },
  { key: 'pmcf_pms_evidence', label: 'PMCF / PMS Evidence Issue', industries: ['medtech', 'ivd'] },
  {
    key: 'sponsor_approval_missing',
    label: 'Sponsor Approval Missing',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  { key: 'cro_handoff_incomplete', label: 'CRO Handoff Incomplete', industries: ['pharma'] },
  {
    key: 'reviewer_unassigned',
    label: 'Reviewer Unassigned',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  {
    key: 'open_critical_thread',
    label: 'Open Critical Thread',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  {
    key: 'unresolved_change_request',
    label: 'Unresolved Change Request',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  {
    key: 'stale_approved_version',
    label: 'Stale Approved Version',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  {
    key: 'publish_prerequisite',
    label: 'Publish Prerequisite Missing',
    industries: ['pharma', 'medtech', 'ivd'],
  },
  {
    key: 'missing_signature',
    label: 'Missing Signature / Attestation',
    industries: ['pharma', 'medtech', 'ivd'],
  },
];

export function getBlockerTypes(industry?: string): BlockerTypeDef[] {
  if (!industry) return BLOCKER_TYPES;
  return BLOCKER_TYPES.filter(b => b.industries.includes(industry));
}

// ============================================================
// E. STAGE MODEL
// ============================================================

export interface StageDef {
  key: string;
  label: string;
  deviceLabel?: string;
  group: string;
}

export const ARTIFACT_STAGES: StageDef[] = [
  { key: 'not_started', label: 'Not Started', deviceLabel: 'Not Started', group: 'authoring' },
  { key: 'drafting', label: 'Drafting', deviceLabel: 'Technical Drafting', group: 'authoring' },
  {
    key: 'author_self_check',
    label: 'Author Self-Check',
    deviceLabel: 'Author Self-Check',
    group: 'authoring',
  },
  {
    key: 'internal_functional_review',
    label: 'Internal Functional Review',
    deviceLabel: 'Evidence Review',
    group: 'active_review',
  },
  {
    key: 'sme_review',
    label: 'SME Review',
    deviceLabel: 'Evidence Review',
    group: 'active_review',
  },
  {
    key: 'qa_compliance_review',
    label: 'QA / Compliance Review',
    deviceLabel: 'Standards / Compliance Review',
    group: 'waiting_qa',
  },
  {
    key: 'sponsor_review',
    label: 'Sponsor Review',
    deviceLabel: 'Design / Risk Review',
    group: 'waiting_sponsor',
  },
  {
    key: 'sponsor_approval_pending',
    label: 'Sponsor Approval Pending',
    deviceLabel: 'Final RA Review',
    group: 'waiting_approval',
  },
  {
    key: 'final_approval',
    label: 'Final Approval',
    deviceLabel: 'Final RA Review',
    group: 'waiting_approval',
  },
  {
    key: 'publishing_prep',
    label: 'Publishing Prep',
    deviceLabel: 'Release Prep',
    group: 'ready_to_publish',
  },
  {
    key: 'publish_blocked',
    label: 'Publish Blocked',
    deviceLabel: 'Release Blocked',
    group: 'blocked',
  },
  {
    key: 'published',
    label: 'Published / Locked',
    deviceLabel: 'Submission Ready',
    group: 'published',
  },
  { key: 'reopened', label: 'Reopened for Changes', deviceLabel: 'Reopened', group: 'reopened' },
  { key: 'superseded', label: 'Superseded', deviceLabel: 'Superseded', group: 'published' },
];

export const STAGE_GROUPS = [
  { key: 'authoring', label: 'Authoring' },
  { key: 'active_review', label: 'Active Review' },
  { key: 'waiting_sponsor', label: 'Waiting on Sponsor' },
  { key: 'waiting_qa', label: 'Waiting on QA / Compliance' },
  { key: 'waiting_approval', label: 'Waiting on Approval' },
  { key: 'blocked', label: 'Blocked by Issues' },
  { key: 'ready_to_publish', label: 'Ready to Publish' },
  { key: 'published', label: 'Published / Locked' },
  { key: 'reopened', label: 'Reopened / Changed' },
] as const;

export function getStageLabel(stageKey: string, isDevice: boolean): string {
  const stage = ARTIFACT_STAGES.find(s => s.key === stageKey);
  if (!stage) return stageKey;
  return isDevice && stage.deviceLabel ? stage.deviceLabel : stage.label;
}

export function getStageGroup(stageKey: string): string {
  const stage = ARTIFACT_STAGES.find(s => s.key === stageKey);
  return stage?.group || 'authoring';
}

// ============================================================
// F. OWNERSHIP TYPES
// ============================================================

export const OWNERSHIP_TYPES = [
  { key: 'sponsor', label: 'Sponsor' },
  { key: 'cro', label: 'CRO' },
  { key: 'vendor', label: 'Vendor' },
] as const;

// ============================================================
// G. WAITING STATE LABELS
// ============================================================

export const WAITING_STATE_LABELS: Record<string, string> = {
  waiting_sme: 'Awaiting SME Review',
  waiting_qa: 'Awaiting QA Review',
  waiting_sponsor_approval: 'Awaiting Sponsor Approval',
  waiting_final_signatory: 'Awaiting Final Signatory',
  waiting_cro_author: 'Waiting on CRO Author',
  waiting_cmc_lead: 'Waiting on CMC Lead',
  waiting_device_verification: 'Waiting on Device Verification',
  waiting_cer_review: 'Waiting on CER Review',
  blocked_evidence_gap: 'Blocked by Evidence Gap',
  blocked_critical_findings: 'Blocked by Open Critical Findings',
  publish_blocked: 'Publish Blocked',
  response_at_risk: 'Response Package At Risk',
};

// ============================================================
// H. DIGEST TYPES
// ============================================================

export const DIGEST_TYPES = [
  { key: 'daily_review', label: 'My Daily Review Digest' },
  { key: 'sponsor_approval', label: 'Sponsor Approval Digest' },
  { key: 'cro_handoff', label: 'CRO Handoff Digest' },
  { key: 'cmc_exception', label: 'CMC Exception Digest' },
  { key: 'clinical_exception', label: 'Clinical / Stats Exception Digest' },
  { key: 'device_evidence', label: 'Device Evidence Exception Digest' },
  { key: 'executive_readiness', label: 'Executive Readiness Digest' },
  { key: 'package_exception', label: 'Package Exception Digest' },
] as const;

// ============================================================
// I. SEVERITY LEVELS
// ============================================================

export const SEVERITY_LEVELS = [
  { key: 'low', label: 'Low', color: 'gray' },
  { key: 'medium', label: 'Medium', color: 'yellow' },
  { key: 'high', label: 'High', color: 'orange' },
  { key: 'critical', label: 'Critical', color: 'red' },
] as const;

// ============================================================
// J. OVERALL STATE
// ============================================================

export const OVERALL_STATES = [
  { key: 'on_track', label: 'On Track', color: 'emerald' },
  { key: 'at_risk', label: 'At Risk', color: 'amber' },
  { key: 'blocked', label: 'Blocked', color: 'red' },
] as const;
