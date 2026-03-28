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
  | 'pre_submission' | 'device_clearance' | 'device_approval';

export type ProductClass =
  | 'small_molecule' | 'biologic' | 'biosimilar' | 'generic' | 'otc'
  | 'medical_device' | 'ivd' | 'combination_product' | 'atmp' | 'vaccine'
  | 'any';

export type DossierStandard =
  | 'eCTD' | 'CTD' | 'ACTD' | 'NeeS' | 'eSTAR' | 'regional' | 'none';

export type LifecycleStage =
  | 'pre_submission' | 'initial' | 'amendment' | 'supplement'
  | 'annual_report' | 'renewal' | 'withdrawal' | 'post_approval';

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
