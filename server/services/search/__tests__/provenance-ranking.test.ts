/**
 * Tests for provenance-ranked search: authority tier mapping + authority-first
 * ordering (credible sources lead even when a preprint scores higher relevance).
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
  it('ranks by authority tier first, then relevance within a tier', () => {
    const ranked = rankResultsByProvenance([
      { sourceConnector: 'biorxiv', relevanceScore: 0.99, id: 'preprint' },
      { sourceConnector: 'fda_drugs', relevanceScore: 0.50, id: 'fda' },
      { sourceConnector: 'box', relevanceScore: 0.95, id: 'repo' },
      { sourceConnector: 'clinical_trials_gov', relevanceScore: 0.80, id: 'ctgov' },
    ]);
    // primary (ctgov 0.80 > fda 0.50), then secondary (box), then preliminary (preprint)
    expect(ranked.map(r => r.id)).toEqual(['ctgov', 'fda', 'repo', 'preprint']);
    expect(ranked[0].provenanceTier).toBe('primary');
    expect(ranked[ranked.length - 1].provenanceTier).toBe('preliminary');
  });

  it('a high-relevance preprint still ranks below a lower-relevance primary source', () => {
    const ranked = rankResultsByProvenance([
      { sourceConnector: 'biorxiv', relevanceScore: 0.99 },
      { sourceConnector: 'ema_epar', relevanceScore: 0.40 },
    ]);
    expect(ranked[0].provenanceTier).toBe('primary');
  });
});
