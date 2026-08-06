/**
 * Section Blueprint Catalog — Registry-driven section/dossier blueprints.
 *
 * Mirrors {@link ./taskBlueprintCatalog} for the SECTION axis. For registry
 * types that ship a dedicated, hand-authored section blueprint under
 * `registry/blueprints/*`, this catalog loads that blueprint so project
 * creation and preview use the real region-specific dossier structure
 * (region-specific Module 1, correct required flags) instead of the generic
 * CTD fallback in `shared/regulatory/project-bootstrap.ts`.
 *
 * Background: the per-region blueprint files each export a `sectionBlueprint`
 * (e.g. `canadaNdsBlueprint`, `japanMaaBlueprint`), but nothing imported those
 * exports — only their `taskBlueprint`. As a result Canada, Japan, China,
 * Brazil, India, Australia, and the US NDA/BLA all silently fell back to a
 * single generic CTD outline. This catalog wires the authored section
 * blueprints into the runtime resolution path, closing that gap without
 * duplicating any content.
 *
 * US IND is intentionally NOT listed here: it is served by the deep 108-section
 * eCTD map via `projectBootstrapFromRegistry.bootstrapUSIND()` and its blueprint
 * export is async, so it keeps its dedicated path.
 *
 * @module server/services/regulatory/sectionBlueprintCatalog
 */

import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import type { SectionBlueprint } from '../../../shared/regulatory/document-taxonomy.js';

/**
 * Registry ID → dedicated blueprint module that exports `sectionBlueprint`.
 * Keep in sync with `taskBlueprintCatalog`'s fileMap; the same files export
 * both a `sectionBlueprint` and a `taskBlueprint`.
 */
const SECTION_BLUEPRINT_FILES: Record<string, () => Promise<any>> = {
  US_NDA: () => import('./registry/blueprints/usNdaBlueprint.js'),
  US_BLA: () => import('./registry/blueprints/usBlaBlueprint.js'),
  EU_MAA: () => import('./registry/blueprints/euMaaBlueprint.js'),
  EU_CTA: () => import('./registry/blueprints/euCtaBlueprint.js'),
  CA_NDS: () => import('./registry/blueprints/canadaNdsBlueprint.js'),
  CA_CTA: () => import('./registry/blueprints/canadaCtaBlueprint.js'),
  JP_MKT_APPROVAL: () => import('./registry/blueprints/japanMaaBlueprint.js'),
  JP_CTN: () => import('./registry/blueprints/japanCtnBlueprint.js'),
  CN_CTA: () => import('./registry/blueprints/chinaCtaBlueprint.js'),
  AU_CTN: () => import('./registry/blueprints/australiaCtnBlueprint.js'),
  BR_DDCM: () => import('./registry/blueprints/brazilDdcmBlueprint.js'),
  IN_CT04: () => import('./registry/blueprints/indiaCtBlueprint.js'),
};

/** Registry IDs that have a dedicated, wired section blueprint. */
export const DEDICATED_SECTION_BLUEPRINT_IDS: readonly string[] =
  Object.keys(SECTION_BLUEPRINT_FILES);

const blueprintCache = new Map<string, SectionBlueprint>();

/**
 * Get the dedicated section blueprint for a registry entry, if one exists.
 * Returns `null` when the type has no dedicated blueprint (callers should then
 * fall back to `getSectionBlueprintForEntry` from project-bootstrap).
 *
 * Accepts a registry ID or a legacy submission type.
 */
export async function getSectionBlueprint(
  registryIdOrLegacy: string,
): Promise<SectionBlueprint | null> {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;

  if (blueprintCache.has(registryId)) {
    return blueprintCache.get(registryId)!;
  }

  const file = SECTION_BLUEPRINT_FILES[registryId];
  if (!file) return null;

  try {
    const mod = (await file()) as { sectionBlueprint?: SectionBlueprint };
    const blueprint = mod.sectionBlueprint ?? null;
    if (blueprint && Array.isArray(blueprint.sections) && blueprint.sections.length > 0) {
      blueprintCache.set(registryId, blueprint);
      return blueprint;
    }
    return null;
  } catch {
    return null;
  }
}

/** True when the registry ID/legacy type resolves to a dedicated section blueprint. */
export function hasDedicatedSectionBlueprint(registryIdOrLegacy: string): boolean {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  return registryId in SECTION_BLUEPRINT_FILES;
}
