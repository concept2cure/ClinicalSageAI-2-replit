/**
 * US IND Adapter — Bridges the existing deep IND eCTD section map
 * into the registry's SectionBlueprint format.
 *
 * This adapter uses services/regulatory/ind-ectd-sections.ts as
 * the authoritative source for U.S. IND section structure.
 * It does NOT replace that file — it reads from it.
 *
 * @module server/services/regulatory/registry/adapters/usIndFromExistingSections
 */

import type { SectionDefinition, SectionBlueprint } from '../../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape of sections from ind-ectd-sections.ts (INDSection interface) */
interface INDSectionLike {
  code: string;
  title: string;
  module: string; // 'M1' | 'M2' | 'M3' | 'M4' | 'M5'
  depth: number;
  required: boolean;
  requiredForAmendment?: boolean;
  format?: string;
  authoringMode?: string;
  aiDraftable?: boolean;
  role?: string;
  regulatoryRef?: string;
  description?: string;
  estimatedHours?: number;
  contextOfUse?: string;
  pyramidTaskId?: string;
  parentCode?: string;
  children?: INDSectionLike[];
}

// ─── Module Number Mapping ────────────────────────────────────────────────────

const MODULE_MAP: Record<string, number> = {
  M1: 1,
  M2: 2,
  M3: 3,
  M4: 4,
  M5: 5,
};

// ─── Content Type Inference ───────────────────────────────────────────────────

function inferContentType(section: INDSectionLike): SectionDefinition['contentType'] {
  if (section.authoringMode === 'form' || section.format === 'xml') return 'form';
  if (section.authoringMode === 'data_import' || section.format === 'xpt') return 'data';
  if (section.format === 'pdf' && section.authoringMode === 'ai_draft') return 'narrative';
  if (section.code.includes('.A') || section.code.includes('appendix')) return 'mixed';
  if (section.children && section.children.length > 0) return 'mixed';
  return 'narrative';
}

// ─── Adapter Functions ────────────────────────────────────────────────────────

/**
 * Convert a single INDSection into a SectionDefinition.
 */
export function adaptINDSection(section: INDSectionLike): SectionDefinition {
  return {
    code: section.code,
    title: section.title,
    module: MODULE_MAP[section.module] ?? 1,
    required: section.required,
    contentType: inferContentType(section),
    guidance: section.regulatoryRef,
    templateId: section.pyramidTaskId ? `ind_${section.pyramidTaskId}` : undefined,
  };
}

/**
 * Flatten the IND section tree and convert to SectionDefinition[].
 * Only includes leaf-level or meaningful parent sections (depth 0-2).
 */
export function adaptAllINDSections(sections: INDSectionLike[]): SectionDefinition[] {
  const result: SectionDefinition[] = [];

  function walk(section: INDSectionLike) {
    // Include sections at depth 0-2 (module, sub-module, sub-sub-module)
    // Skip very deep nested sections to keep blueprint manageable
    if (section.depth <= 2) {
      result.push(adaptINDSection(section));
    }

    if (section.children) {
      for (const child of section.children) {
        walk(child);
      }
    }
  }

  for (const section of sections) {
    walk(section);
  }

  return result;
}

/**
 * Build a full SectionBlueprint from the existing IND sections.
 * Dynamically imports ind-ectd-sections.ts at call time.
 */
export async function buildUSIndBlueprint(): Promise<SectionBlueprint> {
  const { getAllINDSections } = await import('../../../../regulatory/ind-ectd-sections.js');
  const allSections = getAllINDSections();

  return {
    id: 'us_ind_full_ectd',
    name: 'US IND Full eCTD Sections (from canonical map)',
    sections: adaptAllINDSections(allSections),
  };
}

/**
 * Build a full section list from the existing IND sections.
 * Returns the raw sections with all metadata preserved.
 * Used by project bootstrap for the detailed section insertion.
 */
export async function getFullINDSectionsForBootstrap(): Promise<INDSectionLike[]> {
  const { getAllINDSections } = await import('../../../../regulatory/ind-ectd-sections.js');
  return getAllINDSections();
}

/**
 * Get the section count from the existing IND section map.
 */
export async function getINDSectionCount(): Promise<number> {
  const { getAllINDSections } = await import('../../../../regulatory/ind-ectd-sections.js');
  return getAllINDSections().length;
}
