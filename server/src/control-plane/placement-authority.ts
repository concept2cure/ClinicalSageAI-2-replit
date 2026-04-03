/**
 * Placement Authority
 *
 * Determines canonical placement for governed documents within the CTD/dossier hierarchy.
 * Evaluates whether a requested placement is valid, identifies missing metadata,
 * and decides whether fallback placement is acceptable.
 *
 * Part of the Governed Document Decision Fabric.
 */

import type {
  GovernedDocumentContext,
  PlacementAuthorityDecision,
  PlacementDecisionOutcome,
  GovernedBlockingReason,
} from '../../../shared/types/governed-document-fabric';

export const PLACEMENT_AUTHORITY_VERSION = '1.0.0';

/**
 * Known CTD module structure for validation
 */
const VALID_CTD_MODULES = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;

const CTD_MODULE_SECTIONS: Record<string, string[]> = {
  m1: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.11', '1.12', '1.13', '1.14', '1.15'],
  m2: ['2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'],
  m3: ['3.1', '3.2', '3.2.S', '3.2.P', '3.2.A', '3.2.R', '3.3'],
  m4: ['4.1', '4.2', '4.3'],
  m5: ['5.1', '5.2', '5.3', '5.4'],
};

/**
 * Document type to expected CTD section mapping
 * Maps common document types to their canonical CTD placement
 */
const DOCUMENT_TYPE_PLACEMENT_MAP: Record<string, string[]> = {
  // Module 2 summaries
  clinical_overview: ['m2.5'],
  clinical_summary: ['m2.7'],
  nonclinical_overview: ['m2.4'],
  nonclinical_summary: ['m2.6'],
  quality_overall_summary: ['m2.3'],
  introduction: ['m2.1'],

  // Module 3 CMC
  drug_substance: ['m3.2.S'],
  drug_product: ['m3.2.P'],
  cmc_section: ['m3.2'],
  specification: ['m3.2.S', 'm3.2.P'],
  stability: ['m3.2.S', 'm3.2.P'],
  batch_record: ['m3.2.P'],

  // Module 4
  nonclinical_study: ['m4.2', 'm4.3'],
  toxicology: ['m4.2'],
  pharmacology: ['m4.3'],

  // Module 5
  clinical_study: ['m5.3'],
  clinical_study_report: ['m5.3'],
  csr: ['m5.3'],

  // Module 1 administrative
  cover_letter: ['m1.1'],
  application_form: ['m1.2'],
  labeling: ['m1.14'],
};

/**
 * Evaluate placement authority for a governed document.
 */
export function evaluatePlacementAuthority(
  context: GovernedDocumentContext
): PlacementAuthorityDecision {
  const blockingReasons: GovernedBlockingReason[] = [];
  const missingMetadata: string[] = [];

  // Determine canonical destination based on document type
  let canonicalDestination: string | undefined;
  let allowedDestinations: string[] = [];

  if (context.documentType) {
    const canonical = DOCUMENT_TYPE_PLACEMENT_MAP[context.documentType];
    if (canonical && canonical.length > 0) {
      canonicalDestination = canonical[0];
      allowedDestinations = [...canonical];
    }
  }

  // If CTD section is already specified, use it
  if (context.ctdSection) {
    if (!canonicalDestination) {
      canonicalDestination = context.ctdSection;
    }
    if (!allowedDestinations.includes(context.ctdSection)) {
      allowedDestinations.push(context.ctdSection);
    }
  }

  // Check for missing metadata that affects placement
  if (!context.documentType) {
    missingMetadata.push('documentType');
  }
  if (!context.regulatorBody) {
    missingMetadata.push('regulatorBody');
  }
  if (!context.submissionType) {
    missingMetadata.push('submissionType');
  }

  // === Determine outcome ===
  let outcome: PlacementDecisionOutcome;

  // Case 1: No placement intent — report current state
  if (context.intendedAction !== 'place' && context.intendedAction !== 'relocate') {
    outcome = canonicalDestination ? 'allowed' : 'insufficient_context';
    return {
      outcome,
      canonicalDestination,
      allowedDestinations: allowedDestinations.length > 0 ? allowedDestinations : undefined,
      currentPlacement: context.currentPlacement,
      missingMetadata: missingMetadata.length > 0 ? missingMetadata : undefined,
      fallbackAcceptable: true,
    };
  }

  // Case 2: Placement intent with target
  if (context.intendedPlacementTarget) {
    // Validate CTD format
    if (!isValidCtdReference(context.intendedPlacementTarget)) {
      blockingReasons.push({
        id: `plc_${Date.now()}_1`,
        category: 'missing_placement',
        severity: 'major',
        message: `Invalid CTD section reference: ${context.intendedPlacementTarget}`,
        source: 'placement-authority',
        remediationHint: 'Provide a valid CTD section reference (e.g., m2.5, m3.2.P.1)',
      });
      outcome = 'blocked';
    } else if (allowedDestinations.length > 0 && !allowedDestinations.some(d => context.intendedPlacementTarget!.startsWith(d))) {
      // Target doesn't match known canonical destinations — warn but allow with fallback
      outcome = 'fallback_allowed';
    } else {
      outcome = 'allowed';
    }

    // Relocation: check if moving from current placement
    if (context.intendedAction === 'relocate' && !context.currentPlacement) {
      blockingReasons.push({
        id: `plc_${Date.now()}_2`,
        category: 'missing_placement',
        severity: 'major',
        message: 'Cannot relocate: no current placement on record',
        source: 'placement-authority',
        remediationHint: 'Use "place" action instead of "relocate" for unplaced documents',
      });
      outcome = 'blocked';
    }
  } else {
    // Case 3: Placement intent without target
    if (canonicalDestination) {
      outcome = 'fallback_allowed';
    } else {
      outcome = 'insufficient_context';
      missingMetadata.push('intendedPlacementTarget');
    }
  }

  return {
    outcome,
    canonicalDestination,
    allowedDestinations: allowedDestinations.length > 0 ? allowedDestinations : undefined,
    currentPlacement: context.currentPlacement,
    missingMetadata: missingMetadata.length > 0 ? missingMetadata : undefined,
    blockingReasons: blockingReasons.length > 0 ? blockingReasons : undefined,
    fallbackAcceptable: outcome !== 'blocked',
  };
}

/**
 * Validate that a CTD reference has a plausible format.
 * Accepts patterns like: m1.1, m2.5, m3.2.S, m3.2.P.1, m3.2.S.1.1, etc.
 */
export function isValidCtdReference(ref: string): boolean {
  if (!ref || ref.length < 2) return false;
  // Accepts m followed by module number, then dotted sub-sections with S/P/A/R letters
  return /^m[1-5](\.\d+)*(\.[A-Z](\.\d+)*)*$/i.test(ref);
}

/**
 * Get canonical CTD placement for a document type
 */
export function getCanonicalPlacement(documentType: string): string | undefined {
  const placements = DOCUMENT_TYPE_PLACEMENT_MAP[documentType];
  return placements?.[0];
}
