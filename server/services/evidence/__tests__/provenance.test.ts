/**
 * Unified evidence provenance — unit tests.
 * Lock in source-registry-driven record construction, peer-review/authority
 * inheritance, default-caveat merging, authority ranking, the unknown-source
 * guard, and the data_lineage_records projection.
 */
import { describe, it, expect } from 'vitest';
import {
  buildProvenance,
  getEvidenceSource,
  rankByAuthority,
  toLineageSource,
  EVIDENCE_SOURCES,
  type ProvenanceRecord,
} from '../provenance';

const fixedNow = () => new Date('2026-06-12T00:00:00.000Z');

describe('getEvidenceSource', () => {
  it('resolves registered sources and returns undefined for unknown', () => {
    expect(getEvidenceSource('chembl')?.type).toBe('compound_database');
    expect(getEvidenceSource('biorxiv_medrxiv')?.peerReviewed).toBe(false);
    expect(getEvidenceSource('pubmed')?.peerReviewed).toBe(true);
    expect(getEvidenceSource('nope')).toBeUndefined();
  });
});

describe('buildProvenance', () => {
  it('inherits source-level facts and stamps the citation', () => {
    const rec = buildProvenance({
      sourceId: 'chembl',
      citation: { title: 'ASPIRIN', identifier: 'CHEMBL25', url: 'https://www.ebi.ac.uk/chembl/compound_report_card/CHEMBL25/' },
      query: 'aspirin',
      confidence: 'high',
      now: fixedNow,
    });
    expect(rec.sourceLabel).toMatch(/ChEMBL/);
    expect(rec.sourceType).toBe('compound_database');
    expect(rec.retrievalMethod).toBe('api');
    expect(rec.peerReviewed).toBeNull();
    expect(rec.authority).toBe('primary');
    expect(rec.confidenceBasis).toBe('curated');
    expect(rec.lineageObjectType).toBe('external_evidence');
    expect(rec.retrievedAt).toBe('2026-06-12T00:00:00.000Z');
    expect(rec.citation.identifier).toBe('CHEMBL25');
  });

  it('attaches the source default caveat and merges extra caveats (deduped)', () => {
    const rec = buildProvenance({
      sourceId: 'biorxiv_medrxiv',
      citation: { title: 'A preprint', identifier: '10.1101/x', url: 'https://doi.org/10.1101/x' },
      extraCaveats: ['Small sample.', 'Small sample.'],
      now: fixedNow,
    });
    expect(rec.peerReviewed).toBe(false);
    expect(rec.authority).toBe('preliminary');
    expect(rec.caveats).toContain('Small sample.');
    expect(rec.caveats.some(c => /not peer-reviewed/i.test(c))).toBe(true);
    // deduped: 'Small sample.' appears once
    expect(rec.caveats.filter(c => c === 'Small sample.')).toHaveLength(1);
  });

  it('carries the deterministic-computation caveat for the cheminformatics source', () => {
    const rec = buildProvenance({
      sourceId: 'c2c_cheminformatics',
      citation: { title: 'Structural-alert screen', identifier: null, url: null },
      confidence: 'high',
      now: fixedNow,
    });
    expect(rec.sourceType).toBe('computation');
    expect(rec.confidenceBasis).toBe('rules_based');
    expect(rec.caveats.some(c => /deterministic/i.test(c))).toBe(true);
  });

  it('throws on an unknown source id rather than emit un-attributable evidence', () => {
    expect(() =>
      buildProvenance({ sourceId: 'mystery', citation: { title: 'x', identifier: null, url: null } })
    ).toThrow(/Unknown evidence source/);
  });
});

describe('rankByAuthority', () => {
  it('orders primary before secondary before preliminary, stable within tier', () => {
    const mk = (sourceId: string, title: string): ProvenanceRecord =>
      buildProvenance({ sourceId, citation: { title, identifier: null, url: null }, now: fixedNow });
    const records = [
      mk('biorxiv_medrxiv', 'preprint-A'), // preliminary
      mk('pubmed', 'pubmed-A'), // primary
      mk('ivd_corpus', 'corpus-A'), // secondary
      mk('pubmed', 'pubmed-B'), // primary
    ];
    const ranked = rankByAuthority(records);
    expect(ranked.map(r => r.citation.title)).toEqual(['pubmed-A', 'pubmed-B', 'corpus-A', 'preprint-A']);
  });
});

describe('toLineageSource', () => {
  it('projects onto data_lineage_records SOURCE columns with a confidence score', () => {
    const rec = buildProvenance({
      sourceId: 'pubmed',
      citation: { title: 'A study', identifier: 'PMID:123', url: 'https://pubmed.ncbi.nlm.nih.gov/123/' },
      confidence: 'moderate',
      now: fixedNow,
    });
    const lineage = toLineageSource(rec);
    expect(lineage.sourceObjectType).toBe('external_evidence');
    expect(lineage.sourceObjectId).toBe('PMID:123');
    expect(lineage.sourceTitle).toBe('A study');
    expect(lineage.confidenceBasis).toBe('validation_based');
    expect(lineage.confidenceScore).toBe(60);
  });

  it('falls back to url then sourceId when no identifier', () => {
    const rec = buildProvenance({
      sourceId: 'firecrawl',
      citation: { title: 'Web page', identifier: null, url: 'https://example.com/a' },
      now: fixedNow,
    });
    expect(toLineageSource(rec).sourceObjectId).toBe('https://example.com/a');
  });
});

describe('EVIDENCE_SOURCES registry integrity', () => {
  it('every entry id matches its key and has a lineage object type', () => {
    for (const [key, src] of Object.entries(EVIDENCE_SOURCES)) {
      expect(src.id).toBe(key);
      expect(src.lineageObjectType.length).toBeGreaterThan(0);
    }
  });
});
