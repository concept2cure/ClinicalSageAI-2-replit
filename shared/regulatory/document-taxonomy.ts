/**
 * Document Taxonomy — Type definitions for the Global Regulatory Document System.
 *
 * These types define the canonical structure for all regulatory
 * application/document types across all regions and agencies worldwide.
 *
 * @module shared/regulatory/document-taxonomy
 */

// ─── Core Types ───────────────────────────────────────────────────────────────

export type Region =
  | 'US' | 'EU' | 'UK' | 'CA' | 'JP' | 'CN' | 'AU' | 'CH' | 'BR' | 'IN' | 'KR' | 'SG'
  | 'GLOBAL';

export type Agency =
  | 'FDA' | 'EMA' | 'MHRA' | 'Health_Canada' | 'PMDA' | 'NMPA' | 'TGA'
  | 'Swissmedic' | 'ANVISA' | 'CDSCO' | 'MFDS' | 'HSA'
  | 'ICH';

export type ApplicationFamily =
  | 'clinical_trial' | 'marketing_authorization' | 'variation' | 'renewal'
  | 'master_file' | 'pediatric' | 'orphan' | 'safety_report' | 'supplement'
  | 'pre_submission' | 'device_clearance' | 'device_approval'
  // Extended families introduced with the segment/category taxonomy buildout.
  | 'designation' | 'quality_cmc' | 'quality_system' | 'post_market'
  | 'software_documentation' | 'companion_diagnostic' | 'clinical_document';

export type ProductClass =
  | 'small_molecule' | 'biologic' | 'biosimilar' | 'generic' | 'otc'
  | 'medical_device' | 'ivd' | 'combination_product' | 'atmp' | 'vaccine'
  | 'any';

export type DossierStandard =
  | 'eCTD' | 'CTD' | 'ACTD' | 'NeeS' | 'eSTAR' | 'regional' | 'none';

export type LifecycleStage =
  | 'pre_submission' | 'initial' | 'amendment' | 'supplement'
  | 'annual_report' | 'renewal' | 'withdrawal' | 'post_approval';

// ─── Segment / Category Taxonomy ──────────────────────────────────────────────
// Mirrors the Concept2Cure Regulatory Filing & Document Taxonomy reference:
// 4 life-sciences segments, each split into ordered filing categories. This is
// the SECOND organizing axis (the first being region/agency). Every registry
// entry is classified on BOTH axes.

export type Segment =
  | 'pharma_biotech'
  | 'medical_devices'
  | 'diagnostics_ivd'
  | 'cross_cutting';

export type FilingCategory =
  // Pharma & Biotech
  | 'preclinical_pre_ind'
  | 'investigational'
  | 'marketing_authorization'
  | 'post_approval_lifecycle'
  | 'cmc_quality'
  // Medical Devices
  | 'device_classification_pre_sub'
  | 'device_market_auth_us'
  | 'device_market_auth_eu_intl'
  | 'device_post_market'
  | 'device_samd_ai'
  // Diagnostics & IVD
  | 'ivd_classification_pre_sub'
  | 'ivd_market_auth_us'
  | 'ivd_companion_dx'
  | 'ivd_market_auth_eu'
  | 'ivd_post_market'
  // Cross-Cutting
  | 'ctd_ectd'
  | 'qms'
  | 'safety_pv';

export interface SegmentMetadata {
  id: Segment;
  title: string;
  /** One-line scope description (from the taxonomy reference). */
  subtitle: string;
  /** Display/sort order. */
  order: number;
  /** lucide icon hint for the UI. */
  iconHint: string;
}

export interface FilingCategoryMetadata {
  id: FilingCategory;
  segment: Segment;
  title: string;
  /** Description of what this category covers (from the taxonomy reference). */
  description: string;
  /** Display/sort order within the segment. */
  order: number;
}

// ─── Registry Entry ───────────────────────────────────────────────────────────

export interface RegulatoryApplicationType {
  /** Unique identifier (e.g., 'US_IND', 'EU_MAA', 'JP_MKT_APPROVAL') */
  id: string;
  /** Region code */
  region: Region;
  /** Country name */
  country: string;
  /** Regulatory agency */
  agency: Agency;
  /** Application family */
  applicationFamily: ApplicationFamily;
  /** Specific application type name */
  applicationType: string;
  /** User-friendly display name */
  displayName: string;
  /** Alternative names users might search for */
  synonyms: string[];
  /** Lifecycle stage */
  stage: LifecycleStage;
  /** Segment classification (taxonomy axis 2) */
  segment?: Segment;
  /** Filing category within the segment (taxonomy axis 2) */
  category?: FilingCategory;
  /** Human-readable description of the filing (from the taxonomy reference) */
  description?: string;
  /** Submission format as published by the authority (eCTD, eSTAR, eCopy, eMDR, Letter, STED, MEDDEV 2.7/1, E2B(R3), …). Distinct from the broader dossierStandard. */
  submissionFormat?: string;
  /** CTD module/section location where the document lives, when applicable (e.g. 'M1–M5', '3.2.S', '2.3'). */
  ctdModule?: string;
  /** Product class(es) this applies to */
  productClass: ProductClass[];
  /** Dossier format standard */
  dossierStandard: DossierStandard;
  /** Parent application type (for amendments, supplements) */
  parentApplicationType?: string;
  /** Required artifact types (e.g., ['cover_letter', 'form_1571', 'clinical_overview']) */
  requiredArtifacts: string[];
  /** Default CTD/dossier section blueprint ID */
  defaultSectionBlueprint: string;
  /** Default milestone/task blueprint ID */
  defaultTaskBlueprint: string;
  /** Validation profile (what rules to check for readiness) */
  validationProfile: string;
  /** Lifecycle actions available (e.g., ['submit', 'amend', 'supplement', 'withdraw']) */
  lifecycleActions: string[];
  /** Whether this is currently active/supported */
  active: boolean;
}

// ─── Region Profile ───────────────────────────────────────────────────────────

export interface RegionProfile {
  region: Region;
  country: string;
  agency: Agency;
  agencyFullName: string;
  currency: string;
  language: string;
  dossierStandard: DossierStandard;
  /** URL for the agency's electronic submission gateway */
  submissionGateway?: string;
  /** Supported application families */
  supportedFamilies: ApplicationFamily[];
}

// ─── Section Blueprint ────────────────────────────────────────────────────────

export interface SectionBlueprint {
  id: string;
  name: string;
  sections: SectionDefinition[];
}

export interface SectionDefinition {
  code: string;
  title: string;
  module: number;
  required: boolean;
  contentType: 'narrative' | 'table' | 'form' | 'data' | 'list' | 'mixed';
  guidance?: string;
  templateId?: string;
}

// ─── Task Blueprint ───────────────────────────────────────────────────────────

export interface TaskBlueprint {
  id: string;
  name: string;
  milestones: MilestoneDefinition[];
}

export interface MilestoneDefinition {
  id: string;
  title: string;
  description: string;
  phase: string;
  order: number;
  tasks: TaskDefinition[];
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  assigneeRole?: string;
  estimatedDays?: number;
  dependencies?: string[];
}

// ─── Backward Compatibility ───────────────────────────────────────────────────

/** Maps old submission type strings to new registry IDs */
export type LegacySubmissionType =
  | '510K' | 'IND' | 'NDA' | 'BLA' | 'PMA' | 'MAA'
  | 'DE_NOVO' | 'EUA' | 'IVDR' | 'CER' | 'CTA' | 'ANDA';

export const LEGACY_TO_REGISTRY_ID: Record<LegacySubmissionType, string> = {
  '510K': 'US_510K',
  'IND': 'US_IND',
  'NDA': 'US_NDA',
  'BLA': 'US_BLA',
  'PMA': 'US_PMA',
  'MAA': 'EU_MAA',
  'DE_NOVO': 'US_DE_NOVO',
  'EUA': 'US_EUA',
  'IVDR': 'EU_IVDR',
  'CER': 'EU_CER',
  'CTA': 'EU_CTA',
  'ANDA': 'US_ANDA',
};
