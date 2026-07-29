/**
 * Agency × Product class → valid filing types and requirements.
 * @module shared/constants/domain/mappings/agency-filing-requirements
 */

export type AgencyCode = 'FDA' | 'EMA' | 'PMDA' | 'Health_Canada' | 'MHRA' | 'NMPA' | 'TGA';

export interface FilingRequirement {
  agency: AgencyCode;
  productClass: string;
  /** Valid filing types for this combination. */
  filingTypes: string[];
  /** Dossier format expected. */
  dossierFormat: string;
  /** Typical review timeline (months). */
  standardReviewMonths: number;
  /** Priority/accelerated review timeline (months), if available. */
  priorityReviewMonths?: number;
  /** Key regulatory notes. */
  notes?: string;
}

export const AGENCY_FILING_REQUIREMENTS: FilingRequirement[] = [
  // FDA — Small Molecule
  { agency: 'FDA', productClass: 'small_molecule', filingTypes: ['NDA (505(b)(1))', 'NDA (505(b)(2))'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, priorityReviewMonths: 8, notes: 'PDUFA user fee required' },
  { agency: 'FDA', productClass: 'generic', filingTypes: ['ANDA'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 10, notes: 'GDUFA user fee required' },
  { agency: 'FDA', productClass: 'biologic', filingTypes: ['BLA'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, priorityReviewMonths: 8, notes: 'PDUFA user fee; CBER review' },
  { agency: 'FDA', productClass: 'biosimilar', filingTypes: ['351(k) BLA'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, notes: 'BPCIA pathway; analytical similarity package critical' },
  { agency: 'FDA', productClass: 'vaccine', filingTypes: ['BLA'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, priorityReviewMonths: 8, notes: 'CBER review; lot release required' },
  { agency: 'FDA', productClass: 'medical_device', filingTypes: ['510(k)', 'De Novo', 'PMA', 'HDE'], dossierFormat: 'eSTAR', standardReviewMonths: 3, priorityReviewMonths: 2, notes: '510(k): 90 days SE review; PMA: 180 days' },
  { agency: 'FDA', productClass: 'ivd', filingTypes: ['510(k)', 'De Novo', 'PMA'], dossierFormat: 'eSTAR', standardReviewMonths: 3, notes: 'CLIA waiver may be needed' },
  // EMA
  { agency: 'EMA', productClass: 'small_molecule', filingTypes: ['MAA (Centralized)', 'MAA (DCP)', 'MAA (National)'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 15, priorityReviewMonths: 9, notes: 'Accelerated assessment available' },
  { agency: 'EMA', productClass: 'biologic', filingTypes: ['MAA (Centralized)'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 15, priorityReviewMonths: 9, notes: 'Centralized procedure mandatory for biologics' },
  { agency: 'EMA', productClass: 'biosimilar', filingTypes: ['MAA (Centralized)'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 15, notes: 'EMA biosimilar guideline; analytical similarity is pivotal' },
  { agency: 'EMA', productClass: 'medical_device', filingTypes: ['CE Mark (MDR)'], dossierFormat: 'EU MDR Tech Doc', standardReviewMonths: 12, notes: 'Notified Body review; MDR 2017/745' },
  // PMDA
  { agency: 'PMDA', productClass: 'small_molecule', filingTypes: ['Marketing Approval Application'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, priorityReviewMonths: 6, notes: 'Sakigake designation for priority' },
  { agency: 'PMDA', productClass: 'biologic', filingTypes: ['Marketing Approval Application'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, priorityReviewMonths: 6, notes: 'Bridging study may be required (ICH E5)' },
  // Health Canada
  { agency: 'Health_Canada', productClass: 'small_molecule', filingTypes: ['NDS', 'SNDS'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12, priorityReviewMonths: 6, notes: 'Priority review available' },
  { agency: 'Health_Canada', productClass: 'biologic', filingTypes: ['NDS'], dossierFormat: 'eCTD v3.2.2', standardReviewMonths: 12 },
];

export function getFilingRequirements(agency: AgencyCode, productClass: string): FilingRequirement[] {
  return AGENCY_FILING_REQUIREMENTS.filter(r => r.agency === agency && r.productClass === productClass);
}
