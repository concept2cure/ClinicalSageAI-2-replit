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
import {
  getSectionBlueprintForEntry,
} from '../../../shared/regulatory/project-bootstrap.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { getSectionBlueprint, getSectionBlueprintContext } from './sectionBlueprintCatalog.js';
import { getTaskBlueprint } from './taskBlueprintCatalog.js';
import { buildDefaultInstructions } from './defaultInstructionBuilder.js';
import type {
  RegulatoryApplicationType,
  MilestoneDefinition,
} from '../../../shared/regulatory/document-taxonomy.js';

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
  /** CTD M1–M5 where applicable; otherwise the document's authoring group. */
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
  parentCode?: string | null;
}

// ─── Bootstrap Functions ──────────────────────────────────────────────────────

/**
 * Main bootstrap entry point. Resolves the registry entry and generates
 * all bootstrap data needed for project creation.
 */
export async function bootstrapFromRegistry(
  input: BootstrapInput
): Promise<BootstrapResult | null> {
  // Resolve registry entry
  const registryId =
    input.registryId || (input.submissionType ? resolveRegistryId(input.submissionType) : null);
  if (!registryId) return null;

  const entry = getApplicationType(registryId);
  if (!entry) return null;

  // For US IND, use the deep adapter
  const isUSIND = entry.id === 'US_IND';
  if (isUSIND) {
    return bootstrapUSIND(entry, input);
  }

  // For all other types, use the registry blueprint
  return bootstrapGeneric(entry, input);
}

/**
 * Bootstrap US IND using the existing deep 108-section map.
 */
async function bootstrapUSIND(
  entry: RegulatoryApplicationType,
  input: BootstrapInput
): Promise<BootstrapResult> {
  let sections: SectionRow[];

  try {
    const { getAllINDSections } = (await import(
      '../../../services/regulatory/ind-ectd-sections.js'
    )) as {
      getAllINDSections: () => INDSectionLike[];
    };
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

  // Prefer the dedicated, richer IND task blueprint (7 milestones with CFR/ICH
  // detail) over the generic 3-milestone fallback.
  const taskBlueprint = await getTaskBlueprint(entry.id);

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
 *
 * Resolution order for sections:
 *   1. Dedicated section blueprint from `sectionBlueprintCatalog`, including
 *      regional trial authoring groups, amendment components and standalone
 *      document structures as well as regional CTD dossiers.
 *   2. Generic CTD blueprint from `project-bootstrap` (`getSectionBlueprintForEntry`).
 *
 * Task/milestones prefer the dedicated blueprint via `taskBlueprintCatalog`,
 * which itself falls back to the shared blueprints, then the default.
 */
async function bootstrapGeneric(
  entry: RegulatoryApplicationType,
  input: BootstrapInput
): Promise<BootstrapResult> {
  const dedicatedSectionBlueprint = await getSectionBlueprint(entry.id);
  const usedDedicatedBlueprint = dedicatedSectionBlueprint !== null;
  const sectionBlueprint = dedicatedSectionBlueprint ?? getSectionBlueprintForEntry(entry);
  const taskBlueprint = await getTaskBlueprint(entry.id);
  const outlineContext = getSectionBlueprintContext(entry.id);

  const sections: SectionRow[] = sectionBlueprint.sections.map(s => ({
    sectionCode: s.code,
    module: sectionAuthoringGroup(entry.id, s.module),
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
      blueprintId: sectionBlueprint.id,
      dedicatedBlueprint: usedDedicatedBlueprint,
      ...(outlineContext.basis ? { outlineBasis: outlineContext.basis } : {}),
      outlineLimitations: [...outlineContext.limitations],
    },
  }));

  return {
    entry,
    sections,
    milestones: taskBlueprint.milestones,
    defaultInstructions: buildDefaultInstructions(entry, input.product, input.projectName),
    requiredArtifacts: entry.requiredArtifacts,
    dossierStandard: entry.dossierStandard,
    usedDeepAdapter: false,
  };
}

/** Preserve CTD labels without assigning a CTD filing location to authoring groups. */
function sectionAuthoringGroup(registryId: string, moduleNumber: number): string {
  if (registryId === 'EU_CTA') {
    const groups: Record<number, string> = {
      1: 'CTIS Form/MSC',
      2: 'CTIS Part I',
      3: 'CTIS Part II',
    };
    return groups[moduleNumber] ?? 'CTIS';
  }
  if (registryId === 'JP_CTN') return 'Notification';
  if (registryId === 'US_IND_AMENDMENT') return 'Amendment';
  if (moduleNumber === 0) return 'Document';
  return `M${moduleNumber}`;
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
      const { getAllINDSections } = (await import(
        '../../../services/regulatory/ind-ectd-sections.js'
      )) as {
        getAllINDSections: () => INDSectionLike[];
      };
      return getAllINDSections().length;
    } catch {
      // Fall through
    }
  }

  const dedicated = await getSectionBlueprint(entry.id);
  if (dedicated) return dedicated.sections.length;

  const blueprint = getSectionBlueprintForEntry(entry);
  return blueprint.sections.length;
}
