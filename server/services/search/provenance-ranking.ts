/**
 * Provenance-ranked search.
 *
 * Deep-research aggregates connector results and ranks them by relevance alone.
 * In a regulated setting, *credibility* should lead: a primary regulatory source
 * or trial registry hit should outrank a preprint even if the preprint scored a
 * touch higher on relevance. This ranks by source AUTHORITY tier first, then by
 * relevance within a tier, and annotates each result with its tier so a UI can
 * badge/group by credibility.
 *
 * Pure / deterministic — no IO. Tier mapping is grounded in the same authority
 * model as evidence/provenance.ts.
 */

import type { AuthorityTier } from '../evidence/provenance.js';

const TIER_RANK: Record<AuthorityTier, number> = { primary: 0, secondary: 1, preliminary: 2 };

/**
 * Map a deep-research connector id to an evidence authority tier:
 *  - primary: regulatory agencies, trial registries, peer-reviewed literature
 *  - preliminary: preprints (not peer-reviewed)
 *  - secondary: enterprise repositories / open clinical data / everything else
 */
export function connectorAuthorityTier(sourceConnector: string): AuthorityTier {
  // Normalize separators to spaces so word boundaries hold for short agency
  // tokens (e.g. `fda_drugs` → `fda drugs`, so `\bfda\b` matches; `_`/`-` are
  // otherwise treated as word chars and would suppress the boundary).
  const c = (sourceConnector || '').toLowerCase().replace(/[_-]+/g, ' ');
  if (
    /clinical trials|clinicaltrials|ctgov|\bfda\b|drugs fda|drugs@fda|openfda|\bema\b|epar|pmda|nmpa|mhra|\btga\b|pubmed|medline/.test(
      c
    )
  ) {
    return 'primary';
  }
  if (/biorxiv|medrxiv|preprint/.test(c)) return 'preliminary';
  return 'secondary';
}

export interface ProvenanceRankable {
  sourceConnector: string;
  relevanceScore: number;
}

/**
 * Pure: rank results by source authority FIRST (primary → secondary →
 * preliminary), then by relevance within a tier (stable, deterministic).
 * Each result is annotated with its `provenanceTier`.
 */
export function rankResultsByProvenance<T extends ProvenanceRankable>(
  results: T[]
): Array<T & { provenanceTier: AuthorityTier }> {
  return results
    .map(r => ({ ...r, provenanceTier: connectorAuthorityTier(r.sourceConnector) }))
    .sort((a, b) => {
      const tier = TIER_RANK[a.provenanceTier] - TIER_RANK[b.provenanceTier];
      if (tier !== 0) return tier;
      return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    });
}
