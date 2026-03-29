/**
 * Project Metadata Normalizer — Converts project creation input into
 * normalized metadata that includes registry-derived fields.
 *
 * This ensures that every project, whether created with a legacy submissionType
 * or a new registryId, gets consistent normalized metadata stored in the DB.
 *
 * @module server/services/regulatory/projectMetadataNormalizer
 */

import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { getRegionProfile } from '../../../shared/regulatory/region-profiles.js';
import { resolveRegistryId, mapToNormalizedMetadata } from './registry/legacySubmissionTypeMapper.js';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjectCreationInput {
  name: string;
  submissionType?: string;
  registryId?: string;
  description?: string;
  customInstructions?: string;
  targetSubmissionDate?: string;
  sponsor?: string;
  product?: string;
  region?: string;
  pinned?: boolean;
  targetAgency?: string;
  color?: string;
  /** New fields for registry-driven creation */
  applicationFamily?: string;
  applicationType?: string;
  agency?: string;
  country?: string;
  productClass?: string;
  dossierStandard?: string;
  lifecycleStage?: string;
}

export interface NormalizedProjectMetadata {
  /** Legacy submission type (preserved for backward compat) */
  submissionType: string;
  /** Canonical registry ID */
  registryId: string | null;
  /** All registry-derived fields */
  region: string | null;
  country: string | null;
  agency: string | null;
  applicationFamily: string | null;
  applicationType: string | null;
  productClass: string[];
  dossierStandard: string | null;
  lifecycleStage: string | null;
  displayName: string | null;
  /** Original input fields preserved */
  targetSubmissionDate: string | null;
  sponsor: string | null;
  product: string | null;
  pinned: boolean;
  targetAgency: string | null;
  color: string | null;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Normalize project creation input into consistent metadata.
 * Resolves registry entry from either registryId or legacy submissionType.
 */
export function normalizeProjectMetadata(input: ProjectCreationInput): NormalizedProjectMetadata {
  let entry: RegulatoryApplicationType | undefined;

  // Try registryId first
  if (input.registryId) {
    entry = getApplicationType(input.registryId);
  }

  // Fall back to legacy submission type mapping
  if (!entry && input.submissionType) {
    const resolvedId = resolveRegistryId(input.submissionType);
    if (resolvedId) {
      entry = getApplicationType(resolvedId);
    }
  }

  // Build metadata
  if (entry) {
    return {
      submissionType: input.submissionType || entry.applicationType,
      registryId: entry.id,
      region: input.region || entry.region,
      country: input.country || entry.country,
      agency: input.agency || entry.agency,
      applicationFamily: input.applicationFamily || entry.applicationFamily,
      applicationType: input.applicationType || entry.applicationType,
      productClass: entry.productClass,
      dossierStandard: input.dossierStandard || entry.dossierStandard,
      lifecycleStage: input.lifecycleStage || entry.stage,
      displayName: entry.displayName,
      targetSubmissionDate: input.targetSubmissionDate ?? null,
      sponsor: input.sponsor ?? null,
      product: input.product ?? null,
      pinned: input.pinned ?? false,
      targetAgency: input.targetAgency ?? entry.agency,
      color: input.color ?? null,
    };
  }

  // Unresolvable type — preserve what was given
  return {
    submissionType: input.submissionType || 'UNKNOWN',
    registryId: null,
    region: input.region ?? null,
    country: input.country ?? null,
    agency: input.agency ?? input.targetAgency ?? null,
    applicationFamily: input.applicationFamily ?? null,
    applicationType: input.applicationType ?? input.submissionType ?? null,
    productClass: input.productClass ? [input.productClass] : [],
    dossierStandard: input.dossierStandard ?? null,
    lifecycleStage: input.lifecycleStage ?? null,
    displayName: null,
    targetSubmissionDate: input.targetSubmissionDate ?? null,
    sponsor: input.sponsor ?? null,
    product: input.product ?? null,
    pinned: input.pinned ?? false,
    targetAgency: input.targetAgency ?? null,
    color: input.color ?? null,
  };
}

/**
 * Merge normalized metadata into existing project metadata object.
 * Used when updating a project to add registry fields without losing existing data.
 */
export function mergeRegistryMetadata(
  existing: Record<string, unknown>,
  normalized: NormalizedProjectMetadata
): Record<string, unknown> {
  return {
    ...existing,
    registryId: normalized.registryId,
    applicationFamily: normalized.applicationFamily,
    applicationType: normalized.applicationType,
    agency: normalized.agency,
    country: normalized.country,
    productClass: normalized.productClass,
    dossierStandard: normalized.dossierStandard,
    lifecycleStage: normalized.lifecycleStage,
    displayName: normalized.displayName,
  };
}
