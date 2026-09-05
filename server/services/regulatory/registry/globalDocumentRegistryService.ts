/**
 * Global Document Registry Service — Server-side facade over the canonical registry.
 *
 * Provides tenant-safe, cached access to the global regulatory application
 * type registry with resolution, search, and bootstrap orchestration.
 *
 * @module server/services/regulatory/registry/globalDocumentRegistryService
 */

import {
  GLOBAL_REGISTRY,
  getApplicationType,
  search as registrySearch,
  resolveFromLegacy,
} from '../../../../shared/regulatory/global-document-registry.js';
import {
  REGION_PROFILES,
  getRegionProfile,
} from '../../../../shared/regulatory/region-profiles.js';
import {
  APPLICATION_FAMILY_METADATA,
  getAllFamiliesSorted,
} from '../../../../shared/regulatory/application-families.js';
import {
  getSectionBlueprintForEntry,
  getTaskBlueprintForEntry,
} from '../../../../shared/regulatory/project-bootstrap.js';
import { getSectionBlueprint } from '../sectionBlueprintCatalog.js';
import { getTaskBlueprint } from '../taskBlueprintCatalog.js';
import {
  getTaxonomyTree,
  getCountBySegment,
  getSegmentsSorted,
  type TaxonomySegmentNode,
} from '../../../../shared/regulatory/filing-taxonomy.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  ApplicationFamily,
  ProductClass,
  Segment,
  FilingCategory,
  DossierStandard,
  RegionProfile,
  SectionBlueprint,
  TaskBlueprint,
} from '../../../../shared/regulatory/document-taxonomy.js';
import type { ApplicationFamilyMetadata } from '../../../../shared/regulatory/application-families.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegistryCatalog {
  regions: RegionProfile[];
  agencies: { agency: Agency; region: Region; fullName: string }[];
  families: ApplicationFamilyMetadata[];
  totalApplicationTypes: number;
}

export interface ResolveResult {
  entry: RegulatoryApplicationType;
  sectionBlueprint: SectionBlueprint;
  taskBlueprint: TaskBlueprint;
  regionProfile: RegionProfile | undefined;
}

export interface BootstrapPreview {
  entry: RegulatoryApplicationType;
  regionProfile: RegionProfile | undefined;
  sections: { code: string; title: string; module: number; required: boolean }[];
  milestones: { id: string; title: string; taskCount: number }[];
  requiredArtifacts: string[];
  dossierStandard: DossierStandard;
  validationProfile: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Get the full catalog summary for UI pickers.
 */
export function getCatalog(): RegistryCatalog {
  const agencies = REGION_PROFILES.map(rp => ({
    agency: rp.agency,
    region: rp.region,
    fullName: rp.agencyFullName,
  }));

  return {
    regions: REGION_PROFILES,
    agencies,
    families: getAllFamiliesSorted(),
    totalApplicationTypes: GLOBAL_REGISTRY.filter(e => e.active).length,
  };
}

/**
 * Get all active application types, optionally filtered.
 */
export function getApplicationTypes(filters?: {
  region?: Region;
  agency?: Agency;
  family?: ApplicationFamily;
  productClass?: ProductClass;
  segment?: Segment;
  category?: FilingCategory;
  query?: string;
}): RegulatoryApplicationType[] {
  if (!filters) return GLOBAL_REGISTRY.filter(e => e.active);

  let results = GLOBAL_REGISTRY.filter(e => e.active);

  if (filters.region) {
    results = results.filter(e => e.region === filters.region);
  }
  if (filters.agency) {
    results = results.filter(e => e.agency === filters.agency);
  }
  if (filters.family) {
    results = results.filter(e => e.applicationFamily === filters.family);
  }
  if (filters.productClass) {
    results = results.filter(e => e.productClass.includes(filters.productClass!));
  }
  if (filters.segment) {
    results = results.filter(e => e.segment === filters.segment);
  }
  if (filters.category) {
    results = results.filter(e => e.category === filters.category);
  }
  if (filters.query) {
    const q = filters.query.toLowerCase();
    results = results.filter(e =>
      e.displayName.toLowerCase().includes(q) ||
      e.applicationType.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      e.synonyms.some(s => s.toLowerCase().includes(q))
    );
  }

  return results;
}

/**
 * Resolve a registry entry by ID or legacy submission type.
 * Returns the entry plus its blueprints.
 */
export function resolve(idOrLegacy: string): ResolveResult | null {
  // Try direct ID first
  let entry = getApplicationType(idOrLegacy);

  // Try legacy mapping
  if (!entry) {
    entry = resolveFromLegacy(idOrLegacy);
  }

  // Try search as fallback
  if (!entry) {
    const results = registrySearch(idOrLegacy);
    entry = results[0];
  }

  if (!entry) return null;

  return {
    entry,
    sectionBlueprint: getSectionBlueprintForEntry(entry),
    taskBlueprint: getTaskBlueprintForEntry(entry),
    regionProfile: getRegionProfile(entry.region),
  };
}

/**
 * Get a bootstrap preview for a given registry entry ID.
 * Used by the UI to show what will be created before project creation.
 */
export async function getBootstrapPreview(registryId: string): Promise<BootstrapPreview | null> {
  const entry = getApplicationType(registryId);
  if (!entry) return null;

  // Prefer the dedicated, region-specific section blueprint (Canada, Japan, EU,
  // China, Brazil, India, Australia, US NDA/BLA) so the preview matches what
  // project creation actually seeds; fall back to the generic CTD blueprint.
  const dedicatedSection = await getSectionBlueprint(entry.id);
  const sectionBlueprint = dedicatedSection ?? getSectionBlueprintForEntry(entry);
  const taskBlueprint = await getTaskBlueprint(entry.id);
  const regionProfile = getRegionProfile(entry.region);

  return {
    entry,
    regionProfile,
    sections: sectionBlueprint.sections.map(s => ({
      code: s.code,
      title: s.title,
      module: s.module,
      required: s.required,
    })),
    milestones: taskBlueprint.milestones.map(m => ({
      id: m.id,
      title: m.title,
      taskCount: m.tasks.length,
    })),
    requiredArtifacts: entry.requiredArtifacts,
    dossierStandard: entry.dossierStandard as DossierStandard,
    validationProfile: entry.validationProfile,
  };
}

/**
 * Get the full segment → category → filings taxonomy tree (axis 2), in
 * document order, scoped to active classified entries.
 */
export function getTaxonomy(): TaxonomySegmentNode[] {
  return getTaxonomyTree(GLOBAL_REGISTRY.filter(e => e.active));
}

/**
 * Get the segment list with their classified filing counts.
 */
export function getSegmentsWithCounts(): { id: Segment; title: string; subtitle: string; count: number }[] {
  const counts = getCountBySegment(GLOBAL_REGISTRY.filter(e => e.active));
  return getSegmentsSorted().map(s => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    count: counts[s.id] || 0,
  }));
}

/**
 * Get all regions with their application type counts.
 */
export function getRegionsWithCounts(): { region: Region; country: string; agency: Agency; count: number }[] {
  return REGION_PROFILES.map(rp => ({
    region: rp.region,
    country: rp.country,
    agency: rp.agency,
    count: GLOBAL_REGISTRY.filter(e => e.region === rp.region && e.active).length,
  }));
}

/**
 * Get all agencies with their application type counts.
 */
export function getAgenciesWithCounts(): { agency: Agency; region: Region; fullName: string; count: number }[] {
  return REGION_PROFILES.map(rp => ({
    agency: rp.agency,
    region: rp.region,
    fullName: rp.agencyFullName,
    count: GLOBAL_REGISTRY.filter(e => e.agency === rp.agency && e.active).length,
  }));
}
