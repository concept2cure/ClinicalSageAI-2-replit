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

import * as usNda from './registry/blueprints/usNdaBlueprint.js';
import * as usBla from './registry/blueprints/usBlaBlueprint.js';
import * as euMaa from './registry/blueprints/euMaaBlueprint.js';
import * as euCta from './registry/blueprints/euCtaBlueprint.js';
import * as canadaNds from './registry/blueprints/canadaNdsBlueprint.js';
import * as canadaCta from './registry/blueprints/canadaCtaBlueprint.js';
import * as japanMaa from './registry/blueprints/japanMaaBlueprint.js';
import * as japanCtn from './registry/blueprints/japanCtnBlueprint.js';
import * as chinaCta from './registry/blueprints/chinaCtaBlueprint.js';
import * as australiaCtn from './registry/blueprints/australiaCtnBlueprint.js';
import * as brazilDdcm from './registry/blueprints/brazilDdcmBlueprint.js';
import * as indiaCt from './registry/blueprints/indiaCtBlueprint.js';

/**
 * Registry ID → its dedicated section blueprint.
 *
 * ── Why these are static imports ──────────────────────────────────────────────
 * The module header above describes wiring these authored blueprints into the
 * runtime path so Canada, Japan, China, Brazil, India, Australia, the EU and the
 * US NDA/BLA would stop falling back to one generic CTD outline. The wiring was
 * `import(file)` with a runtime specifier, which esbuild cannot resolve — so all
 * twelve modules were absent from dist/index.js, every import rejected, the
 * `catch { return null }` swallowed it in silence, and every region fell back to
 * the generic CTD outline exactly as before.
 *
 * The gap the header claims to close was therefore still open in production, and
 * the code that claimed to close it is the reason it looked closed. Static now,
 * so the bundler and the type checker both have to agree the blueprint exists.
 *
 * Keep in sync with `taskBlueprintCatalog`; the same files export both a
 * `sectionBlueprint` and a `taskBlueprint`.
 */
const SECTION_BLUEPRINTS: Record<string, SectionBlueprint> = {
  US_NDA: usNda.sectionBlueprint,
  US_BLA: usBla.sectionBlueprint,
  EU_MAA: euMaa.sectionBlueprint,
  EU_CTA: euCta.sectionBlueprint,
  CA_NDS: canadaNds.sectionBlueprint,
  CA_CTA: canadaCta.sectionBlueprint,
  JP_MKT_APPROVAL: japanMaa.sectionBlueprint,
  JP_CTN: japanCtn.sectionBlueprint,
  CN_CTA: chinaCta.sectionBlueprint,
  AU_CTN: australiaCtn.sectionBlueprint,
  BR_DDCM: brazilDdcm.sectionBlueprint,
  IN_CT04: indiaCt.sectionBlueprint,
};

/** Registry IDs that have a dedicated, wired section blueprint. */
export const DEDICATED_SECTION_BLUEPRINT_IDS: readonly string[] =
  Object.keys(SECTION_BLUEPRINTS);

/**
 * Get the dedicated section blueprint for a registry entry, if one exists.
 * Returns `null` when the type has no dedicated blueprint (callers should then
 * fall back to `getSectionBlueprintForEntry` from project-bootstrap).
 *
 * Accepts a registry ID or a legacy submission type.
 *
 * The empty-sections check is kept. It is no longer defending against a failed
 * load — that cannot happen now — but against a blueprint that exists and is
 * hollow, which is a different defect and one this codebase has shipped before.
 * Returning null there sends the caller to the generic fallback, which is worse
 * than the right outline and better than an empty one.
 */
export async function getSectionBlueprint(
  registryIdOrLegacy: string,
): Promise<SectionBlueprint | null> {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  const blueprint = SECTION_BLUEPRINTS[registryId];
  if (!blueprint) return null;
  if (!Array.isArray(blueprint.sections) || blueprint.sections.length === 0) return null;
  return blueprint;
}

/** True when the registry ID/legacy type resolves to a dedicated section blueprint. */
export function hasDedicatedSectionBlueprint(registryIdOrLegacy: string): boolean {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  return registryId in SECTION_BLUEPRINTS;
}
