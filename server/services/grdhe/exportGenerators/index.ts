/**
 * GRDHE Export Generators Index
 * 
 * Exports all regulatory format generators for the GRDHE service.
 * Each generator transforms canonical data models to jurisdiction-specific formats.
 * 
 * @version 1.0.0
 */

// FDA MedWatch 3500A for US Adverse Event Reporting
export { validateForFDA, generateFDA3500AXML } from './fdaAE3500A';

// EMA E2B(R3) for EU Adverse Event Reporting
export { validateForE2BR3, generateE2BR3XML } from './emaAEE2BR3';

// Export types
export type { ExportResult } from '../types';

/**
 * Supported export formats
 */
export const SUPPORTED_FORMATS = {
  // Adverse Event Formats
  'FDA_AE_3500A': {
    name: 'FDA MedWatch 3500A',
    jurisdiction: 'FDA',
    entityType: 'adverse_event',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'FDA MedWatch Form 3500A for mandatory adverse event reporting'
  },
  'EMA_AE_E2B_R3': {
    name: 'EMA E2B(R3)',
    jurisdiction: 'EMA',
    entityType: 'adverse_event',
    mimeType: 'application/xml',
    extension: '.xml',
    description: 'ICH E2B(R3) format for EudraVigilance adverse event reporting'
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
