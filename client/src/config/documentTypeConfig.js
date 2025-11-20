
/**
 * Document Type Configuration for CERV2 Module
 * Drives section scaffolds, validation, and export for 510(k), PMA, CER
 */

export const DOCUMENT_TYPES = {
  '510K': {
    id: '510k',
    name: 'FDA 510(k) Premarket Notification',
    agency: 'FDA',
    sections: [
      // Administrative Documents (Required)
      { id: 'cover', title: 'Cover Letter', required: true, category: 'Administrative' },
      { id: 'table_contents', title: 'Table of Contents', required: true, category: 'Administrative' },
      { id: 'indications', title: 'Indications for Use Statement', required: true, category: 'Administrative' },
      { id: '510k_summary', title: '510(k) Summary', required: true, category: 'Administrative' },
      { id: 'declarations', title: 'Truthful and Accuracy Statement', required: true, category: 'Administrative' },
      { id: 'class_iii_cert', title: 'Class III Certification', required: false, category: 'Administrative', conditional: 'Class III to Class II' },
      { id: 'financial_cert', title: 'Financial Certification/Disclosure', required: false, category: 'Administrative', conditional: 'Clinical Studies' },
      
      // Device Information (Required)
      { id: 'device_desc', title: 'Device Description', required: true, category: 'Device Information' },
      { id: 'substantial_equiv', title: 'Substantial Equivalence Discussion', required: true, category: 'Device Information' },
      { id: 'predicate_comparison', title: 'Predicate Device Comparison Table', required: true, category: 'Device Information' },
      { id: 'differences_discussion', title: 'Discussion of Differences', required: true, category: 'Device Information' },
      
      // Performance Data (Conditional)
      { id: 'performance_testing', title: 'Performance Data - Bench Testing', required: false, category: 'Performance', conditional: 'Different Technology' },
      { id: 'biocompatibility', title: 'Biocompatibility Testing', required: false, category: 'Performance', conditional: 'Patient Contact' },
      { id: 'software', title: 'Software Documentation', required: false, category: 'Performance', conditional: 'Contains Software' },
      { id: 'electrical_safety', title: 'Electrical Safety and EMC', required: false, category: 'Performance', conditional: 'Electrical Device' },
      { id: 'sterility', title: 'Sterility Validation', required: false, category: 'Performance', conditional: 'Sterile Device' },
      { id: 'shelf_life', title: 'Shelf Life/Package Testing', required: false, category: 'Performance', conditional: 'Expiration Dating' },
      { id: 'reprocessing', title: 'Reprocessing Validation', required: false, category: 'Performance', conditional: 'Reusable Device' },
      
      // Clinical Data (When Required)
      { id: 'clinical_studies', title: 'Clinical Studies', required: false, category: 'Clinical', conditional: 'New Intended Use' },
      { id: 'literature_review', title: 'Clinical Literature Review', required: false, category: 'Clinical', conditional: 'Supporting Evidence' },
      
      // Labeling (Required)
      { id: 'labeling', title: 'Proposed Labeling', required: true, category: 'Labeling' },
      { id: 'instructions_use', title: 'Instructions for Use', required: true, category: 'Labeling' },
      { id: 'promotional_materials', title: 'Promotional Materials', required: false, category: 'Labeling', conditional: 'If Available' },
      
      // Standards and Guidance
      { id: 'standards_conformity', title: 'Declaration of Conformity to Standards', required: false, category: 'Standards', conditional: 'Using FDA Standards' },
      { id: 'guidance_documents', title: 'FDA Guidance Document Compliance', required: false, category: 'Standards' }
    ],
    validationRules: [
      { field: 'indications', rule: 'required', message: 'Indications for Use is mandatory' },
      { field: 'predicate_comparison', rule: 'min_predicates', value: 1, message: 'At least one predicate device required' },
      { field: 'substantial_equiv', rule: 'required', message: 'SE discussion required' }
    ],
    exportFormats: ['eSTAR', 'PDF', 'DOCX']
  },
  
  PMA: {
    id: 'pma',
    name: 'FDA Premarket Approval',
    agency: 'FDA',
    sections: [
      { id: 'cover', title: 'Cover Letter', required: true },
      { id: 'toc', title: 'Table of Contents', required: true },
      { id: 'summary', title: 'Summary', required: true },
      { id: 'device_desc', title: 'Device Description', required: true },
      { id: 'nonclinical', title: 'Nonclinical Studies', required: true },
      { id: 'clinical', title: 'Clinical Studies', required: true },
      { id: 'labeling', title: 'Proposed Labeling', required: true },
      { id: 'manufacturing', title: 'Manufacturing Information', required: true },
      { id: 'sterilization', title: 'Sterilization', required: false },
      { id: 'environmental', title: 'Environmental Assessment', required: false }
    ],
    validationRules: [
      { field: 'clinical', rule: 'required', message: 'Clinical data required for PMA' },
      { field: 'nonclinical', rule: 'required', message: 'Nonclinical studies required' }
    ],
    exportFormats: ['eCTD', 'PDF', 'DOCX']
  },
  
  CER: {
    id: 'cer',
    name: 'Clinical Evaluation Report (EU MDR)',
    agency: 'EU',
    sections: [
      { id: 'executive_summary', title: 'Executive Summary', required: true },
      { id: 'device_description', title: 'Device Description', required: true },
      { id: 'clinical_background', title: 'Clinical Background', required: true },
      { id: 'scope', title: 'Scope of Clinical Evaluation', required: true },
      { id: 'literature_review', title: 'Literature Review', required: true },
      { id: 'clinical_data', title: 'Clinical Data', required: true },
      { id: 'faers_analysis', title: 'Post-Market Surveillance (FAERS)', required: false },
      { id: 'state_of_art', title: 'State of the Art', required: true },
      { id: 'risk_benefit', title: 'Risk-Benefit Analysis', required: true },
      { id: 'conclusions', title: 'Conclusions', required: true }
    ],
    validationRules: [
      { field: 'literature_review', rule: 'required', message: 'Literature review mandatory per MEDDEV 2.7/1 Rev 4' },
      { field: 'state_of_art', rule: 'required', message: 'SOTA analysis required' }
    ],
    exportFormats: ['MEDDEV', 'PDF', 'DOCX']
  }
};

export const getDocumentTypeConfig = (docType) => {
  return DOCUMENT_TYPES[docType] || DOCUMENT_TYPES['510K'];
};

export const getValidationRules = (docType) => {
  const config = getDocumentTypeConfig(docType);
  return config.validationRules || [];
};

export const getSectionScaffold = (docType) => {
  const config = getDocumentTypeConfig(docType);
  return config.sections || [];
};
