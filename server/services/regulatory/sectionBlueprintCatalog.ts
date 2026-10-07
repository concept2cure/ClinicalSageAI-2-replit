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
import type { RegulatoryApplicationType, SectionBlueprint } from '../../../shared/regulatory/document-taxonomy.js';
import { getSectionBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap.js';
import type { RegulatoryBasis } from '../../../shared/regulatory/regulatory-basis.js';

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
import { dsurSectionBlueprint, csrSectionBlueprint } from './registry/blueprints/clinicalDocumentBlueprints.js';
import * as usIndAmendment from './registry/blueprints/usIndAmendmentBlueprint.js';
import * as nonclinicalSummary from './registry/blueprints/nonclinicalSummaryBlueprint.js';

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
  CA_CTA_A: canadaCta.amendmentSectionBlueprint,
  JP_MKT_APPROVAL: japanMaa.sectionBlueprint,
  JP_CTN: japanCtn.sectionBlueprint,
  CN_CTA: chinaCta.sectionBlueprint,
  AU_CTN: australiaCtn.sectionBlueprint,
  BR_DDCM: brazilDdcm.sectionBlueprint,
  IN_CT04: indiaCt.sectionBlueprint,
  ICH_DSUR: dsurSectionBlueprint,
  ICH_CSR: csrSectionBlueprint,
  US_IND_AMENDMENT: usIndAmendment.sectionBlueprint,
  ICH_NONCLIN_SUMMARY: nonclinicalSummary.sectionBlueprint,
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
  return getExactSectionBlueprint(registryId);
}

/** Synchronous exact lookup for the server's persistence and assessment paths. */
export function getExactSectionBlueprint(registryId: string): SectionBlueprint | null {
  const blueprint = SECTION_BLUEPRINTS[registryId];
  if (!blueprint) return null;
  if (!Array.isArray(blueprint.sections) || blueprint.sections.length === 0) return null;
  return blueprint;
}

/** One regional-first resolution path for server consumers. */
export function getResolvedSectionBlueprint(entry: RegulatoryApplicationType): SectionBlueprint {
  return getExactSectionBlueprint(entry.id) ?? getSectionBlueprintForEntry(entry);
}

const APPLICABILITY_REVIEW_IDS = new Set(['EU_CTA', 'CA_CTA', 'CA_CTA_A', 'JP_CTN', 'US_IND_AMENDMENT']);

/** These scaffolds encode conditional branches, but no client applicability decision. */
export function requiresSectionApplicabilityAssessment(registryId: string): boolean {
  return APPLICABILITY_REVIEW_IDS.has(registryId);
}

/** Provenance and limitations travel with the repaired outline through all authoring paths. */
export function getSectionBlueprintContext(registryId: string): { basis?: RegulatoryBasis; limitations: readonly string[] } {
  if (registryId === 'JP_CTN') return { basis: japanCtn.outlineBasis, limitations: japanCtn.outlineLimitations };
  if (registryId === 'US_IND_AMENDMENT') return { basis: usIndAmendment.outlineBasis, limitations: usIndAmendment.outlineLimitations };
  if (registryId === 'ICH_NONCLIN_SUMMARY') return { basis: nonclinicalSummary.outlineBasis, limitations: nonclinicalSummary.outlineLimitations };
  if (registryId === 'EU_CTA') return {
    basis: { ref: 'Platform CTIS authoring groups, checked against EMA CTIS Sponsor Handbook 6.4 and CTR Annex I', confidence: 'platform-convention', url: euCta.EU_CTA_BLUEPRINT_SOURCES[1].url, checked: '2026-10-07' },
    limitations: [
      'Numeric module values are platform groups: 1 = CTIS Form/MSC, 2 = Part I, 3 = Part II. They are not CTD module designations.',
      'Required flags are baseline preparation expectations including permitted alternatives; false flags leave applicability unresolved, not waived. Confirm Part I-only scope, each product and each Member State.',
      'This outline does not create CTIS fields, validate language or disclosure copies, resolve conditional evidence, or establish filing readiness.',
    ],
  };
  if (registryId === 'CA_CTA' || registryId === 'CA_CTA_A') return {
    limitations: [
      'Canadian trial applications use Modules 1–3 as applicable, not a full marketing CTD. Confirm eCTD or non-eCTD and the current trial-specific delivery instructions.',
      'Required flags are platform preparation expectations. Quality, site and clinical-change applicability remain unresolved until client sources and change scope are reviewed.',
      registryId === 'CA_CTA_A' ? 'Select clinical, quality or combined amendment scope; the initial-only PSEAT-CTA synopsis is excluded.' : 'PSEAT-CTA is an initial-CTA synopsis; verify current protocol, consent, quality and site records.',
      'A scaffold does not determine approval, technical conformance or filing readiness.',
    ],
  };
  return { limitations: [] };
}

/** True when the registry ID/legacy type resolves to a dedicated section blueprint. */
export function hasDedicatedSectionBlueprint(registryIdOrLegacy: string): boolean {
  const registryId = resolveRegistryId(registryIdOrLegacy) || registryIdOrLegacy;
  return registryId in SECTION_BLUEPRINTS;
}
