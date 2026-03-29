/**
 * Legacy Submission Type Mapper — Maps old hardcoded submission type strings
 * to canonical registry entries.
 *
 * This is the backward-compatibility bridge. Existing projects store
 * submissionType as strings like 'IND', '510K', 'MAA'. This mapper
 * translates those into the new registry-driven model without breaking
 * any existing project or workflow.
 *
 * @module server/services/regulatory/registry/legacySubmissionTypeMapper
 */

import {
  LEGACY_TO_REGISTRY_ID,
  type LegacySubmissionType,
  type Region,
  type Agency,
  type ApplicationFamily,
  type ProductClass,
  type DossierStandard,
  type LifecycleStage,
} from '../../../../shared/regulatory/document-taxonomy.js';
import { getApplicationType } from '../../../../shared/regulatory/global-document-registry.js';
import type { RegulatoryApplicationType } from '../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NormalizedProjectMetadata {
  /** Original submission type string (preserved for backward compat) */
  submissionType: string;
  /** Canonical registry ID */
  registryId: string;
  /** Resolved region */
  region: Region;
  /** Resolved country */
  country: string;
  /** Resolved agency */
  agency: Agency;
  /** Application family */
  applicationFamily: ApplicationFamily;
  /** Specific application type name */
  applicationType: string;
  /** Product class(es) */
  productClass: ProductClass[];
  /** Dossier standard */
  dossierStandard: DossierStandard;
  /** Lifecycle stage */
  lifecycleStage: LifecycleStage;
  /** Display name for UI */
  displayName: string;
}

// ─── Extended Legacy Map ──────────────────────────────────────────────────────

/**
 * Extended mapping that covers additional legacy strings that may appear
 * in older projects or API calls.
 */
const EXTENDED_LEGACY_MAP: Record<string, string> = {
  // Core legacy types (from LEGACY_TO_REGISTRY_ID)
  ...LEGACY_TO_REGISTRY_ID,

  // Additional aliases
  'FDA_510K': 'US_510K',
  '510(k)': 'US_510K',
  '510k': 'US_510K',
  'Pre-IND': 'US_PRE_IND',
  'PRE_IND': 'US_PRE_IND',
  'pre_ind': 'US_PRE_IND',
  'sNDA': 'US_NDA_SUPP',
  'NDA_SUPPLEMENT': 'US_NDA_SUPP',
  'sBLA': 'US_BLA_SUPP',
  'BLA_SUPPLEMENT': 'US_BLA_SUPP',
  '505(b)(2)': 'US_505B2',
  '505B2': 'US_505B2',
  'DMF': 'US_DMF',
  'CTA': 'EU_CTA',
  'EU_CTA': 'EU_CTA',
  'CER': 'EU_CER',
  'IVDR': 'EU_IVDR',
  'EU_MAA': 'EU_MAA',
  'UK_CTA': 'UK_CTA',
  'UK_MA': 'UK_MA',
  'NDS': 'CA_NDS',
  'CA_NDS': 'CA_NDS',
  'SNDS': 'CA_SNDS',
  'ANDS': 'CA_ANDS',
  'JP_CTN': 'JP_CTN',
  'JP_MAA': 'JP_MKT_APPROVAL',
  'CN_CTA': 'CN_CTA',
  'CN_MAA': 'CN_MAA',
  'AU_CTN': 'AU_CTN',
  'AU_CTA': 'AU_CTA',
  'CH_CTA': 'CH_CTA',
  'CH_MA': 'CH_MA',
  'BR_DDCM': 'BR_DDCM',
  'IN_CT04': 'IN_CT04',
  'KR_IND': 'KR_IND',
  'SG_NDA': 'SG_NDA',
};

// ─── Mapper Functions ─────────────────────────────────────────────────────────

/**
 * Resolve a legacy submission type string to a canonical registry ID.
 */
export function resolveRegistryId(submissionType: string): string | null {
  // Direct match in extended map
  const mapped = EXTENDED_LEGACY_MAP[submissionType] || EXTENDED_LEGACY_MAP[submissionType.toUpperCase()];
  if (mapped) return mapped;

  // Already a valid registry ID?
  const direct = getApplicationType(submissionType);
  if (direct) return submissionType;

  return null;
}

/**
 * Map a legacy submission type to normalized project metadata.
 * Returns null if the type cannot be resolved.
 */
export function mapToNormalizedMetadata(submissionType: string): NormalizedProjectMetadata | null {
  const registryId = resolveRegistryId(submissionType);
  if (!registryId) return null;

  const entry = getApplicationType(registryId);
  if (!entry) return null;

  return {
    submissionType,
    registryId: entry.id,
    region: entry.region,
    country: entry.country,
    agency: entry.agency,
    applicationFamily: entry.applicationFamily,
    applicationType: entry.applicationType,
    productClass: entry.productClass,
    dossierStandard: entry.dossierStandard,
    lifecycleStage: entry.stage,
    displayName: entry.displayName,
  };
}

/**
 * Check if a submission type string is a known legacy type.
 */
export function isLegacyType(submissionType: string): boolean {
  return submissionType in EXTENDED_LEGACY_MAP || submissionType.toUpperCase() in EXTENDED_LEGACY_MAP;
}

/**
 * Get the full registry entry for a legacy or new-style type string.
 * Unified resolution: tries legacy map, direct ID, then search.
 */
export function resolveEntry(submissionTypeOrId: string): RegulatoryApplicationType | null {
  const registryId = resolveRegistryId(submissionTypeOrId);
  if (registryId) {
    return getApplicationType(registryId) ?? null;
  }
  return null;
}

/**
 * Get all known legacy type strings and their mappings.
 * Useful for validation and documentation.
 */
export function getAllLegacyMappings(): { legacy: string; registryId: string; displayName: string }[] {
  return Object.entries(EXTENDED_LEGACY_MAP).map(([legacy, registryId]) => {
    const entry = getApplicationType(registryId);
    return {
      legacy,
      registryId,
      displayName: entry?.displayName ?? registryId,
    };
  });
}
