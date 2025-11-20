/**
 * REGULATORY DOCUMENT CONSTANTS
 * This file centralizes all constants and patterns related to regulatory
 * document processing. This ensures maintainability and consistency across
 * the application.
 */

// This is the primary regex for identifying specific, granular eCTD section headings
// within the body of a document. It is designed to capture the hierarchical numbering
// (e.g., 2.5, 3.2.S.1, 4.2.3.1) and the heading title.
// This pattern is derived from the official ICH M4 and FDA eCTD v4.0 guidance.
export const ECTD_HEADING_REGEX = new RegExp(
  // Matches the start of the line, allowing for optional whitespace
  '^\\s*' +
    // Captures the numeric eCTD section (e.g., "3.2.S.1.1")
    // It looks for a digit, followed by one or more groups of a period and more digits/letters.
    '(\\d(\\.\\w\\d]+)+)' +
    // Matches the whitespace between the number and the heading text
    '\\s+' +
    // Captures the heading text itself (e.g., "Nomenclature")
    '([A-Za-z].*)',
  'm' // multiline flag
);

// This dictionary maps user-friendly input document types to standardized,
// database-friendly enum values. This ensures data consistency in the doc_type field.
export const DOCUMENT_TYPE_MAP = {
  clinical_study_report: 'CSR',
  ich_guideline: 'ICH_Guideline',
  cmc_batch_record: 'CMC_Batch_Record',
  investigator_brochure: 'IB',
  protocol: 'Protocol',
  fda_guidance: 'FDA_Guidance',
  ema_guideline: 'EMA_Guideline',
};

// This dictionary defines regex patterns to perform a high-level classification
// of a document's content, which can be used as a fallback if specific
// eCTD headings are not found.
export const DOCUMENT_CONTENT_CLASSIFIERS = {
  module_1: new RegExp('administrative|form 1571|cover letter', 'i'),
  module_2: new RegExp('summary|overview', 'i'),
  module_3: new RegExp(
    'quality|cmc|chemistry|manufacturing|controls|drug substance|drug product',
    'i'
  ),
  module_4: new RegExp('nonclinical|non-clinical|toxicology|pharmacology', 'i'),
  module_5: new RegExp('clinical|study report|csr|patient', 'i'),
};

// Enhanced eCTD section mappings based on ICH M4 guidelines
export const ECTD_SECTION_MAPPINGS = {
  // Module 1: Administrative Information
  1.1: 'Forms and Application Letters',
  1.2: 'Cover Letters',
  1.3: 'Administrative Information',
  1.4: 'Prescribing Information',

  // Module 2: CTD Summaries
  2.1: 'Table of Contents',
  2.2: 'CTD Introduction',
  2.3: 'Quality Overall Summary',
  2.4: 'Nonclinical Overview',
  2.5: 'Clinical Overview',
  2.6: 'Nonclinical Summaries',
  2.7: 'Clinical Summary',

  // Module 3: Quality
  3.1: 'Quality Index',
  '3.2.S': 'Drug Substance',
  '3.2.S.1': 'General Information',
  '3.2.S.2': 'Manufacture',
  '3.2.S.3': 'Characterisation',
  '3.2.S.4': 'Control of Drug Substance',
  '3.2.S.5': 'Reference Standards',
  '3.2.S.6': 'Container Closure System',
  '3.2.S.7': 'Stability',
  '3.2.P': 'Drug Product',
  '3.2.P.1': 'Description and Composition',
  '3.2.P.2': 'Pharmaceutical Development',
  '3.2.P.3': 'Manufacture',
  '3.2.P.4': 'Control of Excipients',
  '3.2.P.5': 'Control of Drug Product',
  '3.2.P.6': 'Reference Standards',
  '3.2.P.7': 'Container Closure System',
  '3.2.P.8': 'Stability',

  // Module 4: Nonclinical
  4.1: 'Nonclinical Index',
  4.2: 'Nonclinical Study Reports',
  4.3: 'Nonclinical Literature',

  // Module 5: Clinical
  5.1: 'Clinical Index',
  5.2: 'Clinical Study Listings',
  5.3: 'Clinical Study Reports',
  '5.3.1': 'Reports of Biopharmaceutic Studies',
  '5.3.2': 'Reports of Studies Pertinent to Pharmacokinetics',
  '5.3.3': 'Reports of Human Pharmacokinetic Studies',
  '5.3.4': 'Reports of Human Pharmacodynamic Studies',
  '5.3.5': 'Reports of Efficacy and Safety Studies',
  '5.3.5.1': 'Study Reports of Controlled Clinical Studies',
  '5.3.5.2': 'Study Reports of Uncontrolled Clinical Studies',
  '5.3.5.3': 'Reports of Analyses of Data from More Than One Study',
  '5.3.5.4': 'Other Study Reports',
  '5.3.6': 'Reports of Post-marketing Experience',
  '5.3.7': 'Case Report Forms and Individual Patient Listings',
  5.4: 'Clinical Literature References',
};

// Document type classification patterns with improved accuracy
export const DOC_TYPE_CLASSIFICATION_PATTERNS = {
  CSR: [
    /clinical\s+study\s+report/i,
    /study\s+report/i,
    /protocol.*report/i,
    /final.*report.*study/i,
    /efficacy.*safety.*study/i,
  ],
  ICH_Guideline: [
    /ich.*guideline/i,
    /international.*harmonisation/i,
    /harmonization.*guideline/i,
    /ich\s+[a-z]\d+/i,
    /ich.*guidance/i,
  ],
  FDA_Guidance: [
    /fda.*guidance/i,
    /guidance.*document/i,
    /draft.*guidance/i,
    /final.*guidance/i,
    /center.*drug.*evaluation/i,
  ],
  EMA_Guideline: [
    /ema.*guideline/i,
    /european.*medicines.*agency/i,
    /emea.*guideline/i,
    /chmp.*guideline/i,
    /committee.*medicinal.*products/i,
  ],
  Protocol: [/protocol/i, /study.*protocol/i, /clinical.*protocol/i, /trial.*protocol/i],
  SAP: [/statistical.*analysis.*plan/i, /sap\b/i, /analysis.*plan/i, /statistical.*plan/i],
  IB: [
    /investigator.*brochure/i,
    /investigators.*brochure/i,
    /\bib\b/i,
    /investigational.*brochure/i,
  ],
  CMC_Batch_Record: [
    /batch.*record/i,
    /manufacturing.*record/i,
    /production.*record/i,
    /cmc.*batch/i,
  ],
};

// Regional regulatory authority patterns
export const REGION_CLASSIFICATION_PATTERNS = {
  FDA: [
    /fda/i,
    /food.*drug.*administration/i,
    /united\s+states/i,
    /\bus\b/i,
    /usa/i,
    /center.*drug.*evaluation/i,
  ],
  EMA: [/ema/i, /european.*medicines.*agency/i, /emea/i, /europe/i, /\beu\b/i, /chmp/i],
  PMDA: [/pmda/i, /pharmaceuticals.*medical.*devices.*agency/i, /japan/i, /\bjp\b/i],
  Health_Canada: [/health.*canada/i, /canada/i, /\bhc\b/i, /\bca\b/i],
  TGA: [/tga/i, /therapeutic.*goods.*administration/i, /australia/i, /\bau\b/i],
  NMPA: [/nmpa/i, /china.*drug.*administration/i, /china/i, /\bcn\b/i],
  ICH: [/ich/i, /international.*harmonisation/i, /harmonization/i],
};

/**
 * Extract eCTD section from document content using standardized regex
 */
export function extractEctdSectionFromContent(content) {
  const matches = content.match(ECTD_HEADING_REGEX);
  if (matches && matches[1]) {
    return matches[1];
  }

  // Fallback to module-level classification
  for (const [module, pattern] of Object.entries(DOCUMENT_CONTENT_CLASSIFIERS)) {
    if (pattern.test(content)) {
      switch (module) {
        case 'module_1':
          return '1.3';
        case 'module_2':
          return '2.5';
        case 'module_3':
          return '3.2';
        case 'module_4':
          return '4.2';
        case 'module_5':
          return '5.3';
        default:
          return null;
      }
    }
  }

  return null;
}

/**
 * Classify document type using standardized patterns
 */
export function classifyDocumentType(content, title = '') {
  const text = (title + ' ' + content).toLowerCase();

  for (const [docType, patterns] of Object.entries(DOC_TYPE_CLASSIFICATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return docType;
      }
    }
  }

  return 'Unknown';
}

/**
 * Extract regional authority tags using standardized patterns
 */
export function extractRegionTags(content, title = '') {
  const text = (title + ' ' + content).toLowerCase();
  const foundRegions = [];

  for (const [region, patterns] of Object.entries(REGION_CLASSIFICATION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        if (!foundRegions.includes(region)) {
          foundRegions.push(region);
        }
      }
    }
  }

  return foundRegions.length > 0 ? foundRegions : ['FDA']; // Default to FDA
}

/**
 * Map user-friendly document type to standardized enum
 */
export function mapDocumentType(userType) {
  return DOCUMENT_TYPE_MAP[userType.toLowerCase()] || userType;
}
