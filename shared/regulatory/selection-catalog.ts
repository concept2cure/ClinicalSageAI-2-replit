/**
 * Selection catalog — the "select your need" picker for project creation.
 *
 * The catalog is the UNION of the canonical filing registry (NDA, IND, CSR,
 * 510(k), …) and a supplementary non-filing catalog (SOP, work instruction).
 * Every option's `value` feeds straight into `resolveWorkspaceConfig` —
 * selection IS configuration.
 *
 * Extracted from workspace-config.ts to keep each module focused on a single
 * concern: workspace-config owns the resolver; this module owns the picker data.
 *
 * @module shared/regulatory/selection-catalog
 */

import { scopeFor, vocabularyFor, appsFor } from './workspace-derivation.js';
import { getAllActiveSubmissionTypes } from './submission-type-bridge.js';
import { servicesFor, type WorkspaceScope, type WorkspaceVocabulary } from './service-registry.js';
import type { ApplicationFamily } from './document-taxonomy.js';

// ─── Supplementary (non-filing) document catalog ─────────────────────────────

/**
 * Document types a client can select that are NOT regulatory filings — they
 * live in the QMS or are cross-cutting authored documents — so the registry
 * (which is a *filing* registry) does not carry them. The "select your need"
 * catalog is the UNION of the filing registry and this list. Same contract.
 */
export interface SupplementaryDoc {
  id: string;
  displayName: string;
  family: ApplicationFamily;
  vocabulary: WorkspaceVocabulary;
  validationProfile: string;
  requiredArtifacts: string[];
  persona: string;
  context: string;
}

export const SUPPLEMENTARY_CATALOG: Record<string, SupplementaryDoc> = {
  SOP: {
    id: 'QMS_SOP',
    displayName: 'Standard Operating Procedure',
    family: 'quality_system',
    vocabulary: 'quality',
    validationProfile: 'qms_controlled_document',
    requiredArtifacts: ['purpose_scope', 'responsibilities', 'procedure', 'revision_history'],
    persona: 'Quality systems author (21 CFR 820 / ICH Q10)',
    context: 'Controlled QMS procedure: effective-dated, version-controlled, e-signed, training-gated.',
  },
  WORK_INSTRUCTION: {
    id: 'QMS_WI',
    displayName: 'Work Instruction',
    family: 'quality_system',
    vocabulary: 'quality',
    validationProfile: 'qms_controlled_document',
    requiredArtifacts: ['scope', 'steps', 'revision_history'],
    persona: 'Quality systems author (21 CFR 820 / ICH Q10)',
    context: 'Controlled work instruction subordinate to a parent SOP.',
  },
};

// ─── The "select your need" catalog ──────────────────────────────────────────

/** One selectable option in the project-creation picker. */
export interface SelectionOption {
  /** The key to hand to resolveWorkspaceConfig once chosen. */
  value: string;
  label: string;
  scope: WorkspaceScope;
  vocabulary: WorkspaceVocabulary;
  agency: string | null;
  region: string | null;
}

/** A labeled group of options in the picker. */
export interface SelectionGroup {
  id: string;
  label: string;
  options: SelectionOption[];
}

/** Friendly group order + labels, keyed by the structural scope. */
const SELECTION_GROUPS: ReadonlyArray<readonly [string, string]> = [
  ['submissions', 'Submissions — full applications'],
  ['documents', 'Documents'],
  ['records', 'Safety & post-market records'],
  ['registration', 'Product registration & labeling'],
  ['qms', 'Quality system documents'],
];

function groupForScope(scope: WorkspaceScope): string {
  switch (scope) {
    case 'dossier': return 'submissions';
    case 'record': return 'records';
    case 'registration': return 'registration';
    default: return 'documents';
  }
}

/**
 * The unified picker a client uses at project creation. It is the UNION of the
 * canonical filing registry (NDA, IND, CSR, 510(k), …) and the supplementary
 * non-filing catalog (SOP, work instruction). Every option's `value` feeds
 * straight into resolveWorkspaceConfig — selection IS configuration.
 *
 * Grouped by structural scope so a client sees "full submissions" separately
 * from "single documents" and "QMS documents" — the same distinction that
 * decides how the workspace renders.
 */
export function buildSelectionCatalog(): SelectionGroup[] {
  const byGroup = new Map<string, SelectionOption[]>();
  for (const [id] of SELECTION_GROUPS) byGroup.set(id, []);

  // Filing registry (158 canonical types).
  for (const e of getAllActiveSubmissionTypes()) {
    const scope = scopeFor(e.applicationFamily ?? null, e.stage ?? null);
    const option: SelectionOption = {
      value: e.id,
      label: e.displayName,
      scope,
      vocabulary: vocabularyFor(e.productClass ?? [], e.segment),
      agency: e.agency ?? null,
      region: e.region ?? null,
    };
    byGroup.get(groupForScope(scope))!.push(option);
  }

  // Supplementary non-filing documents (QMS).
  for (const [key, doc] of Object.entries(SUPPLEMENTARY_CATALOG)) {
    const scope = scopeFor(doc.family);
    byGroup.get('qms')!.push({
      value: key,
      label: doc.displayName,
      scope,
      vocabulary: doc.vocabulary,
      agency: null,
      region: null,
    });
  }

  // Deterministic order within each group: region, then label.
  for (const opts of byGroup.values()) {
    opts.sort(
      (a, b) => (a.region ?? '').localeCompare(b.region ?? '') || a.label.localeCompare(b.label),
    );
  }

  return SELECTION_GROUPS
    .map(([id, label]) => ({ id, label, options: byGroup.get(id)! }))
    .filter((g) => g.options.length > 0);
}
