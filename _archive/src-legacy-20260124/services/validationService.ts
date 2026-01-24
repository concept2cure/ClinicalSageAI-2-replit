/**
 * Validation Service
 *
 * This service provides functions to interact with the validation API endpoints,
 * allowing components to fetch validation profiles and submit validation requests.
 *
 * Enhanced with region-specific validation profile support for FDA, EMA, and PMDA.
 */

import { ValidationResults, ValidationIssue } from '../components/ValidationResultsPanel';

// Mapping of region codes to their display names
export const REGION_DISPLAY_NAMES: Record<string, string> = {
  FDA: 'U.S. Food and Drug Administration',
  EMA: 'European Medicines Agency',
  PMDA: 'Pharmaceuticals and Medical Devices Agency (Japan)',
};

// Mapping of region codes to their validation profiles
export const REGION_PROFILES: Record<string, string> = {
  FDA: 'FDA_eCTD_3.2.2',
  EMA: 'EU_eCTD_3.2.2',
  PMDA: 'JP_eCTD_4.0',
};

// Interface for validation results from the API
export interface ApiValidationResponse {
  status: string;
  documentId?: number;
  results?: {
    success: boolean;
    timestamp: string;
    profile: string;
    errors?: Array<{
      code: string;
      message: string;
      description?: string;
      severity: string;
      location?: string;
    }>;
    warnings?: Array<{
      code: string;
      message: string;
      description?: string;
      severity: string;
      location?: string;
    }>;
    details?: string;
  };
  error?: string;
}

// Function to map API validation response to our UI model
export function mapValidationResponse(
  response: ApiValidationResponse,
  region: string
): ValidationResults {
  if (!response.results) {
    // Handle error case
    return {
      region,
      profile: REGION_PROFILES[region] || 'Unknown',
      timestamp: new Date().toISOString(),
      status: 'invalid',
      passed: false,
      issues: response.error
        ? [
            {
              id: 'api-error',
              code: 'API-ERROR',
              message: 'API Error',
              description: response.error,
              severity: 'error',
            },
          ]
        : [],
      warnings: [],
    };
  }

  // Map errors to our format
  const issues: ValidationIssue[] = (response.results.errors || []).map((error, index) => ({
    id: `error-${index}`,
    code: error.code || `${region}-ERROR-${index}`,
    message: error.message || 'Unknown error',
    description: error.description || error.message || 'Unknown error',
    severity: 'error',
    location: error.location,
  }));

  // Map warnings to our format
  const warnings: ValidationIssue[] = (response.results.warnings || []).map((warning, index) => ({
    id: `warning-${index}`,
    code: warning.code || `${region}-WARNING-${index}`,
    message: warning.message || 'Unknown warning',
    description: warning.description || warning.message || 'Unknown warning',
    severity: 'warning',
    location: warning.location,
  }));

  return {
    region,
    profile: response.results.profile || REGION_PROFILES[region] || 'Unknown',
    timestamp: response.results.timestamp || new Date().toISOString(),
    status: response.results.success ? 'valid' : 'invalid',
    passed: response.results.success,
    issues,
    warnings,
  };
}

/**
 * Get validation profiles for all regions
 */
export async function getValidationProfiles() {
  try {
    const response = await fetch('/api/validation/profiles');
    return await response.json();
  } catch (error) {
    console.error('Error fetching validation profiles:', error);
    return { status: 'error', message: 'Failed to fetch validation profiles' };
  }
}

/**
 * Get validation profile for a specific region
 *
 * @param region - Region code (FDA, EMA, PMDA)
 */
export async function getRegionValidationProfile(region: string) {
  try {
    const response = await fetch(`/api/validation/profiles/${region}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching validation profile for ${region}:`, error);
    return { status: 'error', message: `Failed to fetch validation profile for ${region}` };
  }
}

/**
 * Get validation rules for a specific region
 *
 * @param region - Region code (FDA, EMA, PMDA)
 */
export async function getValidationRules(region: string) {
  try {
    const response = await fetch(`/api/validation/rules/${region}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching validation rules for ${region}:`, error);
    return { status: 'error', message: `Failed to fetch validation rules for ${region}` };
  }
}

/**
 * Validate a submission sequence
 *
 * @param sequencePath - Path to the sequence folder
 * @param region - Region code (FDA, EMA, PMDA)
 */
export async function validateSubmission(sequencePath: string, region: string) {
  try {
    const response = await fetch('/api/validation/validate-submission', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sequencePath,
        region,
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error validating submission:', error);
    return { status: 'error', message: 'Failed to validate submission' };
  }
}

/**
 * Validate a single document
 *
 * @param documentPath - Path to the document file
 * @param region - Region code (FDA, EMA, PMDA)
 * @param docType - Optional document type for context-specific validation
 */
export async function validateDocument(documentPath: string, region: string, docType?: string) {
  try {
    const response = await fetch('/api/validation/validate-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentPath,
        region,
        docType,
        profile: REGION_PROFILES[region], // Add profile information
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error validating document:', error);
    return { status: 'error', message: 'Failed to validate document' };
  }
}

/**
 * Validate multiple documents with region-specific profile
 *
 * @param documentIds - Array of document IDs to validate
 * @param region - Region code (FDA, EMA, PMDA)
 */
export async function validateMultipleDocuments(documentIds: number[], region: string) {
  try {
    const response = await fetch('/api/documents/bulk-approve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: documentIds,
        region,
        profile: REGION_PROFILES[region],
      }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error validating multiple documents:', error);
    return {
      status: 'error',
      message: 'Failed to validate documents',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get validation results for a document
 *
 * @param documentId - Document ID
 */
export async function getDocumentValidationResults(
  documentId: number
): Promise<ApiValidationResponse> {
  try {
    const response = await fetch(`/api/validation/document-results/${documentId}`);
    return await response.json();
  } catch (error) {
    console.error(`Error fetching validation results for document ${documentId}:`, error);
    return {
      status: 'error',
      error: `Failed to fetch validation results for document ${documentId}`,
    };
  }
}

/**
 * Parse the profile from validation results
 *
 * @param results - Validation results from API
 * @returns The profile name or null if not found
 */
export function getProfileFromResults(results: any): string | null {
  if (!results) return null;

  // Try to get profile from different possible locations in the results object
  return results.profile || results.results?.profile || results.validation?.profile || null;
}

/**
 * Get the region code from a profile name
 *
 * @param profile - Profile name (e.g. 'FDA_eCTD_3.2.2')
 * @returns The region code or null if not found
 */
export function getRegionFromProfile(profile: string): string | null {
  if (!profile) return null;

  // Check each region profile
  for (const [region, profileName] of Object.entries(REGION_PROFILES)) {
    if (profile === profileName || profile.startsWith(region)) {
      return region;
    }
  }

  // If profile starts with a common prefix, extract it
  if (profile.startsWith('FDA_')) return 'FDA';
  if (profile.startsWith('EU_')) return 'EMA';
  if (profile.startsWith('JP_')) return 'PMDA';

  return null;
}
