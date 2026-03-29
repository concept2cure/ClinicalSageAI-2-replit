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
  getByRegion,
  getByAgency,
  getByFamily,
  getByProductClass,
  search as registrySearch,
  resolveFromLegacy,
  getRegions,
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
  bootstrapProject,
  getSectionBlueprintForEntry,
  getTaskBlueprintForEntry,
} from '../../../../shared/regulatory/project-bootstrap.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  ApplicationFamily,
  ProductClass,
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
export function getBootstrapPreview(registryId: string): BootstrapPreview | null {
  const entry = getApplicationType(registryId);
  if (!entry) return null;

  const bootstrap = bootstrapProject(entry);
  const regionProfile = getRegionProfile(entry.region);

  return {
    entry,
    regionProfile,
    sections: bootstrap.sections.map(s => ({
      code: s.code,
      title: s.title,
      module: s.module,
      required: s.required,
    })),
    milestones: bootstrap.milestones.map(m => ({
      id: m.id,
      title: m.title,
      taskCount: m.tasks.length,
    })),
    requiredArtifacts: bootstrap.requiredArtifacts,
    dossierStandard: bootstrap.dossierStandard as DossierStandard,
    validationProfile: bootstrap.validationProfile,
  };
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
