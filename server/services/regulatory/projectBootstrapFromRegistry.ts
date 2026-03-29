/**
 * Project Bootstrap from Registry — Registry-driven project initialization.
 *
 * Replaces the hardcoded section bootstrap in concept2cure.ts with
 * registry-driven logic that:
 * 1. Resolves the registry entry (from registryId or legacy submissionType)
 * 2. Gets the appropriate section blueprint
 * 3. Generates section rows for DB insertion
 * 4. Generates task/milestone rows
 * 5. Builds default instructions
 *
 * For US IND specifically, delegates to the existing deep IND eCTD map
 * via the adapter. For all other types, uses registry blueprints.
 *
 * @module server/services/regulatory/projectBootstrapFromRegistry
 */

import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { bootstrapProject, getSectionBlueprintForEntry, getTaskBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { buildDefaultInstructions } from './defaultInstructionBuilder.js';
import type { RegulatoryApplicationType, SectionDefinition, MilestoneDefinition } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BootstrapInput {
  /** New-style registry ID (e.g., 'US_IND') */
  registryId?: string;
  /** Legacy submission type (e.g., 'IND', '510K') */
  submissionType?: string;
  /** Product name for instruction generation */
  product?: string;
  /** Project name for instruction generation */
  projectName?: string;
}

export interface BootstrapResult {
  /** Resolved registry entry */
  entry: RegulatoryApplicationType;
  /** Sections to insert into project_sections table */
  sections: SectionRow[];
  /** Milestones/tasks for project initialization */
  milestones: MilestoneDefinition[];
  /** Generated default custom instructions */
  defaultInstructions: string;
  /** Required artifact types */
  requiredArtifacts: string[];
  /** Dossier standard */
  dossierStandard: string;
  /** Whether this used the deep IND adapter */
  usedDeepAdapter: boolean;
}

export interface SectionRow {
  sectionCode: string;
  module: string;
  title: string;
  status: string;
  estimatedHours: number;
  priority: string;
  metadata: Record<string, unknown>;
}

// ─── US IND Deep Section Types ────────────────────────────────────────────────

interface INDSectionLike {
  code: string;
  title: string;
  module: string;
  depth: number;
  required: boolean;
  requiredForAmendment?: boolean;
  format?: string;
  authoringMode?: string;
  aiDraftable?: boolean;
  role?: string;
  regulatoryRef?: string;
  estimatedHours?: number;
  parentCode?: string;
}

// ─── Bootstrap Functions ──────────────────────────────────────────────────────

/**
 * Main bootstrap entry point. Resolves the registry entry and generates
 * all bootstrap data needed for project creation.
 */
export async function bootstrapFromRegistry(input: BootstrapInput): Promise<BootstrapResult | null> {
  // Resolve registry entry
  const registryId = input.registryId || (input.submissionType ? resolveRegistryId(input.submissionType) : null);
  if (!registryId) return null;

  const entry = getApplicationType(registryId);
  if (!entry) return null;

  // For US IND, use the deep adapter
  const isUSIND = entry.id === 'US_IND' || entry.id === 'US_IND_AMENDMENT';
  if (isUSIND) {
    return bootstrapUSIND(entry, input);
  }

  // For all other types, use the registry blueprint
  return bootstrapGeneric(entry, input);
}

/**
 * Bootstrap US IND using the existing deep 108-section map.
 */
async function bootstrapUSIND(entry: RegulatoryApplicationType, input: BootstrapInput): Promise<BootstrapResult> {
  let sections: SectionRow[];

  try {
    const { getAllINDSections } = await import('../../regulatory/ind-ectd-sections.js');
    const indSections: INDSectionLike[] = getAllINDSections();

    sections = indSections.map(s => ({
      sectionCode: s.code,
      module: s.module,
      title: s.title,
      status: 'not_started',
      estimatedHours: s.estimatedHours ?? 0,
      priority: s.required ? 'high' : 'medium',
      metadata: {
        required: s.required,
        requiredForAmendment: s.requiredForAmendment ?? false,
        aiDraftable: s.aiDraftable ?? false,
        authoringMode: s.authoringMode ?? 'manual',
        role: s.role ?? '',
        regulatoryRef: s.regulatoryRef ?? '',
        format: s.format ?? 'pdf',
        parentCode: s.parentCode ?? '',
        depth: s.depth,
        registryId: entry.id,
      },
    }));
  } catch {
    // Fallback to generic bootstrap if IND sections file unavailable
    return bootstrapGeneric(entry, input);
  }

  const taskBlueprint = getTaskBlueprintForEntry(entry);

  return {
    entry,
    sections,
    milestones: taskBlueprint.milestones,
    defaultInstructions: buildDefaultInstructions(entry, input.product, input.projectName),
    requiredArtifacts: entry.requiredArtifacts,
    dossierStandard: entry.dossierStandard,
    usedDeepAdapter: true,
  };
}

/**
 * Bootstrap any type using registry blueprints.
 */
function bootstrapGeneric(entry: RegulatoryApplicationType, input: BootstrapInput): BootstrapResult {
  const bootstrap = bootstrapProject(entry);

  const sections: SectionRow[] = bootstrap.sections.map(s => ({
    sectionCode: s.code,
    module: `M${s.module}`,
    title: s.title,
    status: 'not_started',
    estimatedHours: 0,
    priority: s.required ? 'high' : 'medium',
    metadata: {
      required: s.required,
      contentType: s.contentType,
      guidance: s.guidance ?? '',
      templateId: s.templateId ?? '',
      registryId: entry.id,
    },
  }));

  return {
    entry,
    sections,
    milestones: bootstrap.milestones,
    defaultInstructions: buildDefaultInstructions(entry, input.product, input.projectName),
    requiredArtifacts: bootstrap.requiredArtifacts,
    dossierStandard: bootstrap.dossierStandard,
    usedDeepAdapter: false,
  };
}

/**
 * Get just the section count for a registry type without full bootstrap.
 */
export async function getSectionCountForType(registryIdOrLegacy: string): Promise<number> {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  const entry = getApplicationType(registryId);
  if (!entry) return 0;

  if (entry.id === 'US_IND') {
    try {
      const { getAllINDSections } = await import('../../regulatory/ind-ectd-sections.js');
      return getAllINDSections().length;
    } catch {
      // Fall through
    }
  }

  const blueprint = getSectionBlueprintForEntry(entry);
  return blueprint.sections.length;
}
