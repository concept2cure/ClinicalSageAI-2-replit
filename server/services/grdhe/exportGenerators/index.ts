/**
 * GRDHE Export Generators Index
 * 
 * Exports all regulatory format generators for the GRDHE service.
 * Each generator transforms canonical data models to jurisdiction-specific formats.
 * 
 * @version 1.0.0
 */

// HL7 v3 ICSR-style XML for FDA export jobs (the names say 3500A; it is not the form)
export { validateForFDA, generateFDA3500AXML } from './fdaAE3500A';

// ICH E2B(R2) ICSR for EMA export jobs (the names say R3; the output is R2)
export { validateForE2BR3, generateE2BR3XML } from './emaAEE2BR3';

// Export types
export type { ExportResult } from '../types';

/**
 * Supported export formats
 */
export const SUPPORTED_FORMATS = {
  // Adverse Event Formats. The key is the format stored on export jobs.
  // 2026-10-15: this HL7 v3 message was named "FDA MedWatch 3500A" and
  // described as MedWatch Form 3500A, which is a paper/PDF form.
  'FDA_AE_3500A': {
    name: 'HL7 v3 ICSR XML for FDA',
    jurisdiction: 'FDA',
    entityType: 'adverse_event',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'One case as HL7 v3 ICSR-style XML (MCCI_IN200100UV01), carrying the content a 3500A reports. It is not MedWatch Form 3500A, not FDA\'s E2B(R3) implementation, and not validated against a schema.'
  },
  // The key is the format stored on export jobs. 2026-10-15: this was named and
  // described as ICH E2B(R3); the generator writes the E2B(R2) vocabulary.
  'EMA_AE_E2B_R3': {
    name: 'ICH E2B(R2) ICSR for EMA',
    jurisdiction: 'EMA',
    entityType: 'adverse_event',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'One case as ICH E2B(R2) ichicsr 2.1 XML. Not an E2B(R3) HL7 v3 message, and not validated against a schema.'
  },
  
  // Future formats - placeholders for expansion
  'PMDA_AE_E2B': {
    name: 'PMDA E2B',
    jurisdiction: 'PMDA',
    entityType: 'adverse_event',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'Japan PMDA E2B format for adverse event reporting',
    implemented: false
  },
  'HC_AE_CIOMS': {
    name: 'Health Canada CIOMS',
    jurisdiction: 'Health_Canada',
    entityType: 'adverse_event',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'Health Canada CIOMS form for adverse event reporting',
    implemented: false
  },
  'FDA_510K': {
    name: 'FDA 510(k)',
    jurisdiction: 'FDA',
    entityType: '510k_submission',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'FDA 510(k) Premarket Notification',
    implemented: false
  },
  'FDA_PMA': {
    name: 'FDA PMA',
    jurisdiction: 'FDA',
    entityType: 'pma_submission',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'FDA Premarket Approval Application',
    implemented: false
  },
  'EMA_ECTD_32': {
    name: 'EMA eCTD 3.2',
    jurisdiction: 'EMA',
    entityType: 'ectd_submission',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'ICH eCTD 3.2.2 format for EMA submissions',
    implemented: false
  }
} as const;

export type SupportedFormat = keyof typeof SUPPORTED_FORMATS;
