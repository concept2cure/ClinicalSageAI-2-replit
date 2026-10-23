/**
 * Provenance-ranked search.
 *
 * Deep-research aggregates connector results from several sources. In a
 * regulated setting, *credibility* should lead: a primary regulatory source or
 * trial registry hit should outrank a preprint wherever each sat in its own
 * source's response. This ranks by source AUTHORITY tier first, then — within a
 * tier — by each result's position in its own source's response (`sourceRank`),
 * and annotates each result with its tier so a UI can badge/group by credibility.
 *
 * The second key is an interleave of the sources' own orders, NOT a relevance
 * order: no connector computes relevance. (2026-10-15: it sorted by a
 * `relevanceScore` that was the list position on a per-connector slope.)
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
  /** 1-based position in the source's own response — not a relevance score. */
  sourceRank: number;
}

/**
 * Pure: rank results by source authority FIRST (primary → secondary →
 * preliminary), then by position in their own source's response within a tier
 * (stable, deterministic). Each result is annotated with its `provenanceTier`.
 */
export function rankResultsByProvenance<T extends ProvenanceRankable>(
  results: T[]
): Array<T & { provenanceTier: AuthorityTier }> {
  return results
    .map(r => ({ ...r, provenanceTier: connectorAuthorityTier(r.sourceConnector) }))
    .sort((a, b) => {
      const tier = TIER_RANK[a.provenanceTier] - TIER_RANK[b.provenanceTier];
      if (tier !== 0) return tier;
      return a.sourceRank - b.sourceRank;
    });
}
