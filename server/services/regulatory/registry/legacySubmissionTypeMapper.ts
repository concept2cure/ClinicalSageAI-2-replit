/**
 * Legacy Submission Type Mapper — Maps old hardcoded submission type strings
 * to canonical registry entries.
 *
 * This module delegates to the canonical submission-type-bridge in shared/,
 * which is the SINGLE source of truth for all submission type resolution.
 * This file preserves the existing API surface for backward compatibility.
 *
 * @module server/services/regulatory/registry/legacySubmissionTypeMapper
 */

import {
  resolveToRegistryId,
  resolveToRegistryEntry,
  isKnownSubmissionType,
  getAllAliases,
  getApplicationType,
} from '../../../../shared/regulatory/submission-type-bridge.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
} from '../../../../shared/regulatory/submission-type-bridge.js';
import type {
  ApplicationFamily,
  ProductClass,
  DossierStandard,
  LifecycleStage,
} from '../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NormalizedProjectMetadata {
  submissionType: string;
  registryId: string;
  region: Region;
  country: string;
  agency: Agency;
  applicationFamily: ApplicationFamily;
  applicationType: string;
  productClass: ProductClass[];
  dossierStandard: DossierStandard;
  lifecycleStage: LifecycleStage;
  displayName: string;
}

// ─── Mapper Functions (delegating to bridge) ─────────────────────────────────

export function resolveRegistryId(submissionType: string): string | null {
  return resolveToRegistryId(submissionType);
}

export function mapToNormalizedMetadata(submissionType: string): NormalizedProjectMetadata | null {
  const entry = resolveToRegistryEntry(submissionType);
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

export function isLegacyType(submissionType: string): boolean {
  return isKnownSubmissionType(submissionType);
}

export function resolveEntry(submissionTypeOrId: string): RegulatoryApplicationType | null {
  return resolveToRegistryEntry(submissionTypeOrId);
}

export function getAllLegacyMappings(): { legacy: string; registryId: string; displayName: string }[] {
  return getAllAliases().map(({ alias, registryId }) => {
    const entry = getApplicationType(registryId);
    return {
      legacy: alias,
      registryId,
      displayName: entry?.displayName ?? registryId,
    };
  });
}
