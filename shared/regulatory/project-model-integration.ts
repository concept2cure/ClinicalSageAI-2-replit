/**
 * Project Model Integration — Connects projects to the Global Regulatory Registry.
 *
 * Provides:
 * 1. Normalized regulatory metadata for projects
 * 2. Backward-compatible mapping from old submissionType values
 * 3. Helper functions for project creation using registry entries
 *
 * @module shared/regulatory/project-model-integration
 */

import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  ApplicationFamily,
  ProductClass,
  DossierStandard,
  LifecycleStage,
  LegacySubmissionType,
} from './document-taxonomy';
import { LEGACY_TO_REGISTRY_ID } from './document-taxonomy';

// ─── Normalized Project Regulatory Metadata ───────────────────────────────────

export interface ProjectRegulatoryMetadata {
  /** Registry entry ID (e.g., 'US_IND', 'EU_MAA') */
  registryId: string;
  /** Application family */
  applicationFamily: ApplicationFamily;
  /** Specific application type */
  applicationType: string;
  /** Regulatory agency */
  agency: Agency;
  /** Region */
  region: Region;
  /** Country */
  country: string;
  /** Product class */
  productClass: ProductClass;
  /** Dossier format standard */
  dossierStandard: DossierStandard;
  /** Lifecycle stage */
  lifecycleStage: LifecycleStage;
  /** Parent application (for amendments/supplements) */
  parentApplicationId?: string;
  /** Display name for the application type */
  displayName: string;
}

// ─── Backward Compatibility ───────────────────────────────────────────────────

/**
 * Convert a legacy submissionType string to normalized regulatory metadata.
 * This allows existing projects to work with the new registry.
 */
export function legacyToMetadata(submissionType: string): ProjectRegulatoryMetadata | null {
  const registryId = LEGACY_TO_REGISTRY_ID[submissionType as LegacySubmissionType];
  if (!registryId) return null;

  // Import the registry lazily to avoid circular deps
  try {
    const { getApplicationType } = require('./global-document-registry');
    const entry = getApplicationType(registryId);
    if (!entry) return null;

    return {
      registryId: entry.id,
      applicationFamily: entry.applicationFamily,
      applicationType: entry.applicationType,
      agency: entry.agency,
      region: entry.region,
      country: entry.country,
      productClass: entry.productClass[0] || 'any',
      dossierStandard: entry.dossierStandard,
      lifecycleStage: entry.stage,
      displayName: entry.displayName,
    };
  } catch {
    return null;
  }
}

/**
 * Create project regulatory metadata from a registry entry.
 */
export function entryToMetadata(
  entry: RegulatoryApplicationType,
  productClass?: ProductClass
): ProjectRegulatoryMetadata {
  return {
    registryId: entry.id,
    applicationFamily: entry.applicationFamily,
    applicationType: entry.applicationType,
    agency: entry.agency,
    region: entry.region,
    country: entry.country,
    productClass: productClass || entry.productClass[0] || 'any',
    dossierStandard: entry.dossierStandard,
    lifecycleStage: entry.stage,
    displayName: entry.displayName,
  };
}

/**
 * Get the best legacy submissionType for a registry ID (for backward compat).
 */
export function registryIdToLegacy(registryId: string): string | null {
  for (const [legacy, id] of Object.entries(LEGACY_TO_REGISTRY_ID)) {
    if (id === registryId) return legacy;
  }
  return null;
}

/**
 * Enrich existing project metadata with registry data.
 * Call this on project load to add normalized fields without breaking existing data.
 */
export function enrichProjectMetadata(
  existingMetadata: Record<string, unknown>
): Record<string, unknown> & { regulatory?: ProjectRegulatoryMetadata } {
  const submissionType = existingMetadata.submissionType as string;
  if (!submissionType) return existingMetadata;

  const regulatory = legacyToMetadata(submissionType);
  if (!regulatory) return existingMetadata;

  return {
    ...existingMetadata,
    regulatory,
  };
}
