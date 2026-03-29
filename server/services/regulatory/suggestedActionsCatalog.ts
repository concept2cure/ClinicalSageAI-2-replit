/**
 * Suggested Actions Catalog — Registry-driven suggested actions for projects.
 *
 * Extracted from hardcoded getSuggestedActionsForType() in concept2cure.ts.
 * Now driven by registry metadata (application family, product class, etc.).
 *
 * @module server/services/regulatory/suggestedActionsCatalog
 */

import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import type { RegulatoryApplicationType } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuggestedAction {
  id: string;
  label: string;
  command: string;
  /** When this action becomes relevant */
  phase?: string;
  /** Priority for ordering */
  priority: number;
}

// ─── Base Actions ─────────────────────────────────────────────────────────────

const BASE_ACTIONS: SuggestedAction[] = [
  { id: 'dossier-map', label: 'Start Dossier Map', command: '/dossier', priority: 1 },
  { id: 'add-docs', label: 'Add Documents', command: '/upload', priority: 2 },
  { id: 'readiness', label: 'Run Readiness Check', command: '/readiness', priority: 3 },
];

// ─── Family-Specific Actions ──────────────────────────────────────────────────

const FAMILY_ACTIONS: Record<string, SuggestedAction[]> = {
  clinical_trial: [
    { id: 'protocol-review', label: 'Review Protocol', command: '/protocol', priority: 4 },
    { id: 'site-planning', label: 'Plan Clinical Sites', command: '/sites', priority: 5 },
  ],
  marketing_authorization: [
    { id: 'clinical-review', label: 'Review Clinical Data', command: '/clinical', priority: 4 },
    { id: 'labeling', label: 'Draft Labeling', command: '/labeling', priority: 5 },
  ],
  device_clearance: [
    { id: 'predicates', label: 'Find Predicates', command: '/predicates', priority: 4 },
    { id: 'se-analysis', label: 'Substantial Equivalence', command: '/equivalence', priority: 5 },
  ],
  device_approval: [
    { id: 'clinical-evidence', label: 'Review Clinical Evidence', command: '/clinical', priority: 4 },
  ],
  supplement: [
    { id: 'change-assessment', label: 'Assess Change Impact', command: '/impact', priority: 4 },
  ],
  variation: [
    { id: 'variation-class', label: 'Classify Variation', command: '/variation-type', priority: 4 },
  ],
  safety_report: [
    { id: 'signal-review', label: 'Review Safety Signals', command: '/signals', priority: 4 },
  ],
  pre_submission: [
    { id: 'meeting-prep', label: 'Prepare Meeting', command: '/meeting', priority: 4 },
    { id: 'questions', label: 'Draft Questions', command: '/questions', priority: 5 },
  ],
};

// ─── Region-Specific Actions ──────────────────────────────────────────────────

const REGION_ACTIONS: Record<string, SuggestedAction[]> = {
  EU: [
    { id: 'regulatory-path', label: 'Map Regulatory Path', command: '/pathway', priority: 6 },
  ],
  JP: [
    { id: 'bridging-strategy', label: 'Bridging Strategy', command: '/bridging', priority: 6 },
  ],
};

// ─── Query Functions ──────────────────────────────────────────────────────────

/**
 * Get suggested actions for a registry entry or legacy submission type.
 */
export function getSuggestedActions(registryIdOrLegacy: string): SuggestedAction[] {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  const entry = getApplicationType(registryId);

  if (!entry) {
    // Fallback: legacy behavior
    return getSuggestedActionsLegacy(registryIdOrLegacy);
  }

  return getSuggestedActionsForEntry(entry);
}

/**
 * Get suggested actions from a resolved registry entry.
 */
export function getSuggestedActionsForEntry(entry: RegulatoryApplicationType): SuggestedAction[] {
  const actions = [...BASE_ACTIONS];

  // Add family-specific actions
  const familyActions = FAMILY_ACTIONS[entry.applicationFamily];
  if (familyActions) {
    actions.push(...familyActions);
  }

  // Add region-specific actions
  const regionActions = REGION_ACTIONS[entry.region];
  if (regionActions) {
    actions.push(...regionActions);
  }

  // Sort by priority
  return actions.sort((a, b) => a.priority - b.priority);
}

/**
 * Legacy fallback for unresolved submission types.
 * Preserves exact behavior from the old hardcoded function.
 */
function getSuggestedActionsLegacy(submissionType: string): SuggestedAction[] {
  const actions = [...BASE_ACTIONS];
  const upper = (submissionType ?? '').toUpperCase();

  if (['510K', 'PMA', 'DE_NOVO'].includes(upper)) {
    actions.push({ id: 'predicates', label: 'Find Predicates', command: '/predicates', priority: 4 });
  } else if (['IND', 'NDA', 'BLA', 'ANDA'].includes(upper)) {
    actions.push({ id: 'clinical-review', label: 'Review Clinical Data', command: '/clinical', priority: 4 });
  } else if (['MAA', 'IVDR'].includes(upper)) {
    actions.push({ id: 'regulatory-path', label: 'Map Regulatory Path', command: '/pathway', priority: 4 });
  } else {
    actions.push({ id: 'strategy', label: 'Define Strategy', command: '/strategy', priority: 4 });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}
