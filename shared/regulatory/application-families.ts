/**
 * Application Families — Metadata definitions for regulatory application families.
 *
 * Each family represents a category of regulatory submission (clinical trial,
 * marketing authorization, variation, etc.) with metadata about typical
 * lifecycle, dossier expectations, and cross-region commonalities.
 *
 * @module shared/regulatory/application-families
 */

import type { ApplicationFamily, DossierStandard, LifecycleStage } from './document-taxonomy';

// ─── Family Metadata ──────────────────────────────────────────────────────────

export interface ApplicationFamilyMetadata {
  /** Family identifier */
  id: ApplicationFamily;
  /** Display name */
  displayName: string;
  /** Short description */
  description: string;
  /** Typical dossier standard(s) used across regions */
  typicalDossierStandards: DossierStandard[];
  /** Typical lifecycle stages */
  typicalStages: LifecycleStage[];
  /** Whether this family typically requires CTD Module 1-5 structure */
  usesCTDStructure: boolean;
  /** Whether this family typically requires clinical data */
  requiresClinicalData: boolean;
  /** Whether this family typically requires CMC/quality data */
  requiresQualityData: boolean;
  /** Sort order for UI display */
  sortOrder: number;
  /** Icon hint for UI (lucide icon name) */
  iconHint: string;
}

export const APPLICATION_FAMILY_METADATA: ApplicationFamilyMetadata[] = [
  {
    id: 'clinical_trial',
    displayName: 'Clinical Trial Authorization',
    description: 'Applications to conduct clinical investigations of drugs, biologics, or devices in human subjects.',
    typicalDossierStandards: ['eCTD', 'CTD'],
    typicalStages: ['initial', 'amendment'],
    usesCTDStructure: true,
    requiresClinicalData: true,
    requiresQualityData: true,
    sortOrder: 1,
    iconHint: 'flask-conical',
  },
  {
    id: 'marketing_authorization',
    displayName: 'Marketing Authorization',
    description: 'Applications to obtain approval/authorization to market a drug, biologic, or device.',
    typicalDossierStandards: ['eCTD', 'CTD', 'ACTD'],
    typicalStages: ['initial'],
    usesCTDStructure: true,
    requiresClinicalData: true,
    requiresQualityData: true,
    sortOrder: 2,
    iconHint: 'shield-check',
  },
  {
    id: 'supplement',
    displayName: 'Supplement / Post-Approval Change',
    description: 'Applications to modify an already-approved product (new indication, formulation change, etc.).',
    typicalDossierStandards: ['eCTD'],
    typicalStages: ['supplement'],
    usesCTDStructure: true,
    requiresClinicalData: false,
    requiresQualityData: true,
    sortOrder: 3,
    iconHint: 'file-plus',
  },
  {
    id: 'variation',
    displayName: 'Variation',
    description: 'Post-approval changes to marketing authorizations (EU/MHRA terminology).',
    typicalDossierStandards: ['eCTD', 'NeeS'],
    typicalStages: ['amendment'],
    usesCTDStructure: true,
    requiresClinicalData: false,
    requiresQualityData: true,
    sortOrder: 4,
    iconHint: 'git-branch',
  },
  {
    id: 'renewal',
    displayName: 'Renewal',
    description: 'Periodic renewal of marketing authorizations.',
    typicalDossierStandards: ['eCTD'],
    typicalStages: ['renewal'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: false,
    sortOrder: 5,
    iconHint: 'rotate-cw',
  },
  {
    id: 'master_file',
    displayName: 'Master File',
    description: 'Confidential files for drug substances, excipients, or packaging materials.',
    typicalDossierStandards: ['eCTD', 'CTD'],
    typicalStages: ['initial', 'amendment'],
    usesCTDStructure: true,
    requiresClinicalData: false,
    requiresQualityData: true,
    sortOrder: 6,
    iconHint: 'file-lock',
  },
  {
    id: 'pediatric',
    displayName: 'Pediatric Plan',
    description: 'Plans or waivers for pediatric development (PIP, PSP).',
    typicalDossierStandards: ['regional'],
    typicalStages: ['initial'],
    usesCTDStructure: false,
    requiresClinicalData: true,
    requiresQualityData: false,
    sortOrder: 7,
    iconHint: 'baby',
  },
  {
    id: 'orphan',
    displayName: 'Orphan Designation',
    description: 'Applications for orphan/rare disease product designation.',
    typicalDossierStandards: ['regional'],
    typicalStages: ['initial'],
    usesCTDStructure: false,
    requiresClinicalData: true,
    requiresQualityData: false,
    sortOrder: 8,
    iconHint: 'heart-pulse',
  },
  {
    id: 'safety_report',
    displayName: 'Safety Report',
    description: 'Periodic safety reports (PSUR, PBRER, RMP) and signal management.',
    typicalDossierStandards: ['regional'],
    typicalStages: ['post_approval'],
    usesCTDStructure: false,
    requiresClinicalData: true,
    requiresQualityData: false,
    sortOrder: 9,
    iconHint: 'alert-triangle',
  },
  {
    id: 'pre_submission',
    displayName: 'Pre-Submission',
    description: 'Pre-submission meetings, scientific advice, or pre-IND/pre-NDA interactions.',
    typicalDossierStandards: ['none'],
    typicalStages: ['pre_submission'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: false,
    sortOrder: 10,
    iconHint: 'message-square',
  },
  {
    id: 'device_clearance',
    displayName: 'Device Clearance',
    description: 'Premarket clearance for medical devices (510(k), De Novo, etc.).',
    typicalDossierStandards: ['eSTAR', 'regional'],
    typicalStages: ['initial'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: true,
    sortOrder: 11,
    iconHint: 'cpu',
  },
  {
    id: 'device_approval',
    displayName: 'Device Approval',
    description: 'Premarket approval for high-risk medical devices (PMA, CER).',
    typicalDossierStandards: ['regional'],
    typicalStages: ['initial'],
    usesCTDStructure: false,
    requiresClinicalData: true,
    requiresQualityData: true,
    sortOrder: 12,
    iconHint: 'shield-plus',
  },
  {
    id: 'designation',
    displayName: 'Designation',
    description: 'Expedited-program and special-status designations (Breakthrough Therapy, Fast Track, PRIME, RMAT, Breakthrough Device, Orphan).',
    typicalDossierStandards: ['eCTD', 'none'],
    typicalStages: ['pre_submission', 'initial'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: false,
    sortOrder: 13,
    iconHint: 'badge-check',
  },
  {
    id: 'quality_cmc',
    displayName: 'CMC / Quality',
    description: 'Chemistry, Manufacturing and Controls quality documents (Module 3 drug substance/product, QOS, comparability protocols).',
    typicalDossierStandards: ['eCTD', 'CTD'],
    typicalStages: ['initial', 'supplement'],
    usesCTDStructure: true,
    requiresClinicalData: false,
    requiresQualityData: true,
    sortOrder: 14,
    iconHint: 'flask-round',
  },
  {
    id: 'quality_system',
    displayName: 'Quality Management System',
    description: 'QMS documentation required across product types (Quality Manual, Design Controls/DHF, DMR, DHR, MDSAP, Risk Management File).',
    typicalDossierStandards: ['none'],
    typicalStages: ['initial', 'post_approval'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: true,
    sortOrder: 15,
    iconHint: 'clipboard-check',
  },
  {
    id: 'post_market',
    displayName: 'Post-Market & Surveillance',
    description: 'Ongoing post-market obligations (device/IVD reporting, PMCF/PMPF, FSCA, recalls, trend reporting, annual device reports).',
    typicalDossierStandards: ['none'],
    typicalStages: ['post_approval', 'annual_report'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: false,
    sortOrder: 16,
    iconHint: 'activity',
  },
  {
    id: 'software_documentation',
    displayName: 'Software / AI Documentation',
    description: 'SaMD and AI/ML regulatory documentation (PCCP, IEC 62304 software lifecycle, cybersecurity, SaMD pre-submissions).',
    typicalDossierStandards: ['none'],
    typicalStages: ['pre_submission', 'initial', 'post_approval'],
    usesCTDStructure: false,
    requiresClinicalData: false,
    requiresQualityData: false,
    sortOrder: 17,
    iconHint: 'code',
  },
  {
    id: 'companion_diagnostic',
    displayName: 'Companion Diagnostic',
    description: 'Diagnostics co-developed with a therapeutic product (CDx PMA/510(k), complementary diagnostics, co-development agreements).',
    typicalDossierStandards: ['eSTAR', 'regional'],
    typicalStages: ['initial'],
    usesCTDStructure: false,
    requiresClinicalData: true,
    requiresQualityData: true,
    sortOrder: 18,
    iconHint: 'dna',
  },
  {
    id: 'clinical_document',
    displayName: 'Clinical Document',
    description: 'GCP clinical development documents (Protocol, Investigator’s Brochure, ICF, CSR, SAP).',
    typicalDossierStandards: ['eCTD', 'none'],
    typicalStages: ['initial', 'amendment'],
    usesCTDStructure: false,
    requiresClinicalData: true,
    requiresQualityData: false,
    sortOrder: 19,
    iconHint: 'file-text',
  },
  {
    id: 'dossier_module',
    displayName: 'CTD Dossier Module',
    description: 'Structural ICH CTD/eCTD modules (Module 1–5) that organize a submission dossier.',
    typicalDossierStandards: ['eCTD', 'CTD'],
    typicalStages: ['initial'],
    usesCTDStructure: true,
    requiresClinicalData: false,
    requiresQualityData: false,
    sortOrder: 20,
    iconHint: 'folder-tree',
  },
];

// ─── Query Functions ──────────────────────────────────────────────────────────

export function getFamilyMetadata(family: ApplicationFamily): ApplicationFamilyMetadata | undefined {
  return APPLICATION_FAMILY_METADATA.find(f => f.id === family);
}

export function getFamiliesByDossierStandard(standard: DossierStandard): ApplicationFamilyMetadata[] {
  return APPLICATION_FAMILY_METADATA.filter(f => f.typicalDossierStandards.includes(standard));
}

export function getCTDFamilies(): ApplicationFamilyMetadata[] {
  return APPLICATION_FAMILY_METADATA.filter(f => f.usesCTDStructure);
}

export function getAllFamiliesSorted(): ApplicationFamilyMetadata[] {
  return [...APPLICATION_FAMILY_METADATA].sort((a, b) => a.sortOrder - b.sortOrder);
}
