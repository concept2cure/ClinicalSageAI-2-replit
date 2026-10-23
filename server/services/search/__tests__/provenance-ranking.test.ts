/**
 * Tests for provenance-ranked search: authority tier mapping + authority-first
 * ordering (credible sources lead even when a preprint came first in its own
 * source). 2026-10-15: the within-tier key is `sourceRank` (position in the
 * source's response); these cases used to pin a `relevanceScore` that was only
 * that position on a per-connector slope.
 */

import { describe, it, expect } from 'vitest';
import { connectorAuthorityTier, rankResultsByProvenance } from '../provenance-ranking.js';

describe('connectorAuthorityTier', () => {
  it('maps regulatory / registry / peer-reviewed connectors to primary', () => {
    for (const c of ['clinical_trials_gov', 'fda_drugs', 'openfda', 'ema_epar', 'pmda_reviews', 'pubmed']) {
      expect(connectorAuthorityTier(c)).toBe('primary');
    }
  });
  it('maps preprints to preliminary and repos/other to secondary', () => {
    expect(connectorAuthorityTier('biorxiv')).toBe('preliminary');
    expect(connectorAuthorityTier('medrxiv_preprints')).toBe('preliminary');
    expect(connectorAuthorityTier('box')).toBe('secondary');
    expect(connectorAuthorityTier('google_drive')).toBe('secondary');
    expect(connectorAuthorityTier('fhir_r4')).toBe('secondary');
  });
});

describe('rankResultsByProvenance', () => {
  it('ranks by authority tier first, then position in the source within a tier', () => {
    const ranked = rankResultsByProvenance([
      { sourceConnector: 'biorxiv', sourceRank: 1, id: 'preprint' },
      { sourceConnector: 'fda_drugs', sourceRank: 2, id: 'fda' },
      { sourceConnector: 'box', sourceRank: 1, id: 'repo' },
      { sourceConnector: 'clinical_trials_gov', sourceRank: 1, id: 'ctgov' },
    ]);
    // primary (ctgov #1 before fda #2), then secondary (box), then preliminary (preprint)
    expect(ranked.map(r => r.id)).toEqual(['ctgov', 'fda', 'repo', 'preprint']);
    expect(ranked[0].provenanceTier).toBe('primary');
    expect(ranked[ranked.length - 1].provenanceTier).toBe('preliminary');
  });

  it("a preprint first in its source still ranks below a primary source's later result", () => {
    const ranked = rankResultsByProvenance([
      { sourceConnector: 'biorxiv', sourceRank: 1 },
      { sourceConnector: 'ema_epar', sourceRank: 9 },
    ]);
    expect(ranked[0].provenanceTier).toBe('primary');
  });
});
