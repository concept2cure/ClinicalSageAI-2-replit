/**
 * Registry Validation — Validates project metadata against the registry.
 *
 * Ensures that project creation requests, metadata updates, and readiness
 * checks are consistent with the canonical registry definitions.
 *
 * @module server/services/regulatory/registry/registryValidation
 */

import { getApplicationType, GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry.js';
import { getRegionProfile } from '../../../../shared/regulatory/region-profiles.js';
import { resolveRegistryId } from './legacySubmissionTypeMapper.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  ProductClass,
} from '../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  resolvedEntry?: RegulatoryApplicationType;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface ProjectCreationInput {
  submissionType?: string;
  registryId?: string;
  region?: string;
  agency?: string;
  productClass?: string;
  applicationFamily?: string;
}

// ─── Validation Functions ─────────────────────────────────────────────────────

/**
 * Validate a project creation request against the registry.
 * Accepts either a registryId or a legacy submissionType.
 */
export function validateProjectCreation(input: ProjectCreationInput): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Must have at least one identifying field
  if (!input.registryId && !input.submissionType) {
    errors.push({
      field: 'registryId',
      message: 'Either registryId or submissionType is required',
      code: 'MISSING_TYPE',
    });
    return { valid: false, errors, warnings };
  }

  // Resolve entry
  let entry: RegulatoryApplicationType | undefined;

  if (input.registryId) {
    entry = getApplicationType(input.registryId);
    if (!entry) {
      errors.push({
        field: 'registryId',
        message: `Unknown registry ID: ${input.registryId}`,
        code: 'UNKNOWN_REGISTRY_ID',
      });
    }
  } else if (input.submissionType) {
    const resolvedId = resolveRegistryId(input.submissionType);
    if (resolvedId) {
      entry = getApplicationType(resolvedId);
    }
    if (!entry) {
      warnings.push({
        field: 'submissionType',
        message: `Submission type "${input.submissionType}" not found in registry; project will use generic bootstrap`,
        code: 'UNRESOLVED_SUBMISSION_TYPE',
      });
    }
  }

  if (entry) {
    // Validate region consistency
    if (input.region && input.region !== entry.region) {
      warnings.push({
        field: 'region',
        message: `Specified region "${input.region}" differs from registry entry region "${entry.region}"`,
        code: 'REGION_MISMATCH',
      });
    }

    // Validate agency consistency
    if (input.agency && input.agency !== entry.agency) {
      warnings.push({
        field: 'agency',
        message: `Specified agency "${input.agency}" differs from registry entry agency "${entry.agency}"`,
        code: 'AGENCY_MISMATCH',
      });
    }

    // Validate product class compatibility
    if (input.productClass && !entry.productClass.includes(input.productClass as ProductClass) && !entry.productClass.includes('any')) {
      warnings.push({
        field: 'productClass',
        message: `Product class "${input.productClass}" may not be compatible with ${entry.displayName}`,
        code: 'PRODUCT_CLASS_MISMATCH',
      });
    }

    // Check if entry is active
    if (!entry.active) {
      warnings.push({
        field: 'registryId',
        message: `Registry entry "${entry.id}" is marked as inactive`,
        code: 'INACTIVE_ENTRY',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    resolvedEntry: entry,
  };
}

/**
 * Validate that a region-agency pair is consistent.
 */
export function validateRegionAgency(region: string, agency: string): boolean {
  const profile = getRegionProfile(region);
  return profile?.agency === agency;
}

/**
 * Validate that a section code exists in the expected blueprint.
 */
export function validateSectionCode(registryId: string, sectionCode: string): boolean {
  const entry = getApplicationType(registryId);
  if (!entry) return false;

  // Import bootstrap to check sections
  const { bootstrapProject } = require('../../../../shared/regulatory/project-bootstrap.js');
  const bootstrap = bootstrapProject(entry);

  return bootstrap.sections.some((s: { code: string }) => s.code === sectionCode);
}

/**
 * Get a list of all valid registry IDs.
 */
export function getAllValidRegistryIds(): string[] {
  return GLOBAL_REGISTRY.filter(e => e.active).map(e => e.id);
}

/**
 * Check if a given string is a valid registry ID or resolvable legacy type.
 */
export function isResolvable(typeString: string): boolean {
  return resolveRegistryId(typeString) !== null;
}
