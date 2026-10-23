/**
 * Within an authority tier, deep research orders results by each one's position
 * in its own source's response (`sourceRank`) — not by a relevance score.
 *
 * rankResultsByProvenance sorted a tier by `relevanceScore`, which every
 * connector set to its list position on its own slope (PubMed 0.04 per place,
 * ClinicalTrials.gov 0.03): a cross-source "relevance" order that was only an
 * artifact of those slopes. No connector computes relevance.
 */
import { describe, expect, it } from 'vitest';
import { rankResultsByProvenance } from '../provenance-ranking.js';

describe('rankResultsByProvenance: authority tier, then position in the source', () => {
  it("orders a tier by each source's own result position, earliest first", () => {
    const ranked = rankResultsByProvenance([
      { sourceConnector: 'pubmed', sourceRank: 2, id: 'pubmed-2' },
      { sourceConnector: 'clinical_trials_gov', sourceRank: 1, id: 'ctgov-1' },
      { sourceConnector: 'pubmed', sourceRank: 1, id: 'pubmed-1' },
      { sourceConnector: 'biorxiv', sourceRank: 1, id: 'preprint-1' },
      { sourceConnector: 'box', sourceRank: 1, id: 'box-1' },
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['ctgov-1', 'pubmed-1', 'pubmed-2', 'box-1', 'preprint-1']);
  });
});
