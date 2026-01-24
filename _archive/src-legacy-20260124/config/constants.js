/**
 * Global application constants
 */

// API base URL - uses the current origin for deployment flexibility
export const API_BASE_URL = '';

// Status constants for various application entities
export const STATUS = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

// Document types
export const DOCUMENT_TYPES = {
  CER: 'cer',
  FDA_510K: 'fda_510k',
  LITERATURE_REVIEW: 'literature_review',
  QMS: 'qms',
  CLINICAL_EVALUATION: 'clinical_evaluation',
};

// Validation levels for document quality
export const VALIDATION_LEVELS = {
  NONE: 'none',
  BASIC: 'basic',
  STANDARD: 'standard',
  ENHANCED: 'enhanced',
  COMPREHENSIVE: 'comprehensive',
};

// Device classes for FDA classifications
export const DEVICE_CLASSES = {
  CLASS_I: 'I',
  CLASS_II: 'II',
  CLASS_III: 'III',
};

// Medical specialty codes
export const MEDICAL_SPECIALTIES = [
  { code: 'AN', name: 'Anesthesiology' },
  { code: 'CV', name: 'Cardiovascular' },
  { code: 'DE', name: 'Dental' },
  { code: 'EN', name: 'Ear, Nose, & Throat' },
  { code: 'GU', name: 'Gastroenterology & Urology' },
  { code: 'HO', name: 'Hematology' },
  { code: 'IM', name: 'Immunology' },
  { code: 'MI', name: 'Microbiology' },
  { code: 'NE', name: 'Neurology' },
  { code: 'OB', name: 'Obstetrics/Gynecology' },
  { code: 'OP', name: 'Ophthalmic' },
  { code: 'OR', name: 'Orthopedic' },
  { code: 'PA', name: 'Pathology' },
  { code: 'PM', name: 'Physical Medicine' },
  { code: 'RA', name: 'Radiology' },
  { code: 'SU', name: 'General & Plastic Surgery' },
  { code: 'TX', name: 'Clinical Toxicology' },
  { code: 'HE', name: 'Clinical Chemistry' },
  { code: 'CH', name: 'Clinical Chemistry' },
];

// Regulatory submission types
export const SUBMISSION_TYPES = {
  TRADITIONAL: 'traditional',
  ABBREVIATED: 'abbreviated',
  SPECIAL: 'special',
  EXEMPT: 'exempt',
};

// 510(k) Section Keys
export const FDA_510K_SECTIONS = {
  DEVICE_DESCRIPTION: 'device_description',
  INDICATIONS_FOR_USE: 'indications_for_use',
  SUBSTANTIAL_EQUIVALENCE: 'substantial_equivalence',
  PERFORMANCE_DATA: 'performance_data',
  STERILIZATION: 'sterilization',
  BIOCOMPATIBILITY: 'biocompatibility',
  SOFTWARE: 'software',
  EMC_TESTING: 'emc_testing',
  CLINICAL_TESTING: 'clinical_testing',
  LABELING: 'labeling',
  STANDARDS: 'standards',
  DECLARATIONS: 'declarations',
};

// Application modules
export const MODULES = {
  CER: 'cer',
  FDA_510K: 'fda_510k',
  IND: 'ind',
  QMS: 'qms',
  DASHBOARD: 'dashboard',
};

export default {
  API_BASE_URL,
  STATUS,
  DOCUMENT_TYPES,
  VALIDATION_LEVELS,
  DEVICE_CLASSES,
  MEDICAL_SPECIALTIES,
  SUBMISSION_TYPES,
  FDA_510K_SECTIONS,
  MODULES,
};
