/**
 * Registry Search — Advanced search and filtering over the global registry.
 *
 * Provides ranked search with scoring, typeahead support, and faceted
 * filtering for the UI application type picker.
 *
 * @module server/services/regulatory/registry/registrySearch
 */

import { GLOBAL_REGISTRY } from '../../../../shared/regulatory/global-document-registry.js';
import type {
  RegulatoryApplicationType,
  Region,
  Agency,
  ApplicationFamily,
  ProductClass,
  DossierStandard,
} from '../../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SearchFilters {
  region?: Region;
  agency?: Agency;
  family?: ApplicationFamily;
  productClass?: ProductClass;
  dossierStandard?: DossierStandard;
  activeOnly?: boolean;
}

export interface SearchResult {
  entry: RegulatoryApplicationType;
  score: number;
  matchedField: string;
}

export interface FacetCounts {
  regions: Record<string, number>;
  agencies: Record<string, number>;
  families: Record<string, number>;
  productClasses: Record<string, number>;
  dossierStandards: Record<string, number>;
}

// ─── Search Functions ─────────────────────────────────────────────────────────

/**
 * Ranked search across the registry. Returns results sorted by relevance score.
 */
export function rankedSearch(query: string, filters?: SearchFilters, limit = 20): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  let entries = GLOBAL_REGISTRY;

  // Apply filters
  if (filters) {
    entries = applyFilters(entries, filters);
  }

  // Score each entry
  const scored: SearchResult[] = [];

  for (const entry of entries) {
    let score = 0;
    let matchedField = '';

    // Exact ID match (highest priority)
    if (entry.id.toLowerCase() === q) {
      score = 100;
      matchedField = 'id';
    }
    // Exact application type match
    else if (entry.applicationType.toLowerCase() === q) {
      score = 90;
      matchedField = 'applicationType';
    }
    // Exact synonym match
    else if (entry.synonyms.some(s => s.toLowerCase() === q)) {
      score = 85;
      matchedField = 'synonym';
    }
    // Display name starts with query
    else if (entry.displayName.toLowerCase().startsWith(q)) {
      score = 80;
      matchedField = 'displayName';
    }
    // Application type starts with query
    else if (entry.applicationType.toLowerCase().startsWith(q)) {
      score = 75;
      matchedField = 'applicationType';
    }
    // Synonym starts with query
    else if (entry.synonyms.some(s => s.toLowerCase().startsWith(q))) {
      score = 70;
      matchedField = 'synonym';
    }
    // Display name contains query
    else if (entry.displayName.toLowerCase().includes(q)) {
      score = 60;
      matchedField = 'displayName';
    }
    // ID contains query
    else if (entry.id.toLowerCase().includes(q)) {
      score = 55;
      matchedField = 'id';
    }
    // Synonym contains query
    else if (entry.synonyms.some(s => s.toLowerCase().includes(q))) {
      score = 50;
      matchedField = 'synonym';
    }
    // Country name contains query
    else if (entry.country.toLowerCase().includes(q)) {
      score = 40;
      matchedField = 'country';
    }

    if (score > 0) {
      scored.push({ entry, score, matchedField });
    }
  }

  // Sort by score descending, then by display name
  scored.sort((a, b) => b.score - a.score || a.entry.displayName.localeCompare(b.entry.displayName));

  return scored.slice(0, limit);
}

/**
 * Typeahead search optimized for fast prefix matching.
 */
export function typeahead(prefix: string, filters?: SearchFilters, limit = 10): RegulatoryApplicationType[] {
  const p = prefix.toLowerCase().trim();
  if (!p) return [];

  let entries = GLOBAL_REGISTRY.filter(e => e.active);

  if (filters) {
    entries = applyFilters(entries, filters);
  }

  return entries
    .filter(e =>
      e.displayName.toLowerCase().includes(p) ||
      e.applicationType.toLowerCase().includes(p) ||
      e.id.toLowerCase().includes(p) ||
      e.synonyms.some(s => s.toLowerCase().includes(p))
    )
    .slice(0, limit);
}

/**
 * Get facet counts for the current filter state.
 * Used to show how many entries exist per facet value.
 */
export function getFacetCounts(filters?: SearchFilters): FacetCounts {
  let entries = GLOBAL_REGISTRY.filter(e => e.active);

  if (filters) {
    entries = applyFilters(entries, filters);
  }

  const counts: FacetCounts = {
    regions: {},
    agencies: {},
    families: {},
    productClasses: {},
    dossierStandards: {},
  };

  for (const e of entries) {
    counts.regions[e.region] = (counts.regions[e.region] || 0) + 1;
    counts.agencies[e.agency] = (counts.agencies[e.agency] || 0) + 1;
    counts.families[e.applicationFamily] = (counts.families[e.applicationFamily] || 0) + 1;
    counts.dossierStandards[e.dossierStandard] = (counts.dossierStandards[e.dossierStandard] || 0) + 1;
    for (const pc of e.productClass) {
      counts.productClasses[pc] = (counts.productClasses[pc] || 0) + 1;
    }
  }

  return counts;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function applyFilters(
  entries: RegulatoryApplicationType[],
  filters: SearchFilters
): RegulatoryApplicationType[] {
  let result = entries;

  if (filters.activeOnly !== false) {
    result = result.filter(e => e.active);
  }
  if (filters.region) {
    result = result.filter(e => e.region === filters.region);
  }
  if (filters.agency) {
    result = result.filter(e => e.agency === filters.agency);
  }
  if (filters.family) {
    result = result.filter(e => e.applicationFamily === filters.family);
  }
  if (filters.productClass) {
    result = result.filter(e => e.productClass.includes(filters.productClass!));
  }
  if (filters.dossierStandard) {
    result = result.filter(e => e.dossierStandard === filters.dossierStandard);
  }

  return result;
}
