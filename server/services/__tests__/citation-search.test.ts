/**
 * Tests for filterCitations — pure filter over a list of artifact
 * citation bundles. Locks down: status / rule / severity / text /
 * artifact / ctd-section-prefix / source-artifact filters.
 */
import { describe, it, expect } from 'vitest';
import {
  filterCitations,
  type ArtifactCitationsBundle,
} from '../ana/citation-search';
import type {
  SentenceCitation,
  CitationStatus,
  CitationSource,
} from '../ana/citation-engine';
import type { GapClassification, GapSeverity } from '../ana/gap-classifier';

function source(over: Partial<CitationSource> = {}): CitationSource {
  return {
    artifactId: 'src',
    sectionCode: null,
    pageRef: null,
    passageSnippet: 'snippet',
    relevanceScore: 0.8,
    relationship: 'supports',
    ...over,
  };
}

function gap(
  rule: string,
  severity: GapSeverity = 'critical'
): GapClassification {
  return {
    severity,
    readinessDelta: severity === 'critical' ? -18 : -2,
    blockingFiling: severity === 'critical',
    rule,
    message: 'msg',
    guidance: 'g',
  };
}

function sent(
  text: string,
  status: CitationStatus = 'supported',
  over: Partial<SentenceCitation> = {}
): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: text.length,
    text,
    contentHash: 'h-' + Math.random().toString(36).slice(2),
    sources: [],
    status,
    gap: null,
    flags: [],
    ...over,
  };
}

function bundle(
  artifactId: string,
  ctdSection: string | null,
  citations: SentenceCitation[],
  title = `${artifactId} title`
): ArtifactCitationsBundle {
  return { artifactId, ctdSection, title, citations };
}

describe('citation-search · filterCitations', () => {
  const fixture: ArtifactCitationsBundle[] = [
    bundle('csr-001', '5.3.5', [
      sent('Median age was 47 years.', 'supported', {
        sources: [source({ artifactId: 'protocol-001' })],
      }),
      sent('Primary endpoint was met at week 12.', 'contradicted', {
        sources: [source({ artifactId: 'ib-001', relationship: 'contradicts' })],
      }),
      sent('No demographics table was provided.', 'gap', {
        gap: gap('CSR-9.2-demographics', 'critical'),
      }),
    ]),
    bundle('csr-002', '5.3.5.1', [
      sent('Pivotal study showed efficacy.', 'supported', {
        sources: [source({ artifactId: 'protocol-001' })],
      }),
      sent('Subgroup analysis missing.', 'gap', {
        gap: gap('CSR-11.4-efficacy-results', 'critical'),
      }),
    ]),
    bundle('protocol-001', '5.3.1', [
      sent('Inclusion criteria defined.', 'supported'),
    ]),
  ];

  it('returns every sentence when filters are empty', () => {
    const hits = filterCitations(fixture, {});
    expect(hits).toHaveLength(6);
  });

  it('filters by status', () => {
    const supported = filterCitations(fixture, { status: 'supported' });
    expect(supported.map(h => h.text)).toEqual([
      'Median age was 47 years.',
      'Pivotal study showed efficacy.',
      'Inclusion criteria defined.',
    ]);
    const gaps = filterCitations(fixture, { status: 'gap' });
    expect(gaps).toHaveLength(2);
    const contradicted = filterCitations(fixture, { status: 'contradicted' });
    expect(contradicted).toHaveLength(1);
  });

  it('filters by gap rule (only matches gap citations with that rule)', () => {
    const hits = filterCitations(fixture, {
      rule: 'CSR-9.2-demographics',
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].gap?.rule).toBe('CSR-9.2-demographics');
  });

  it('filters by gap severity', () => {
    const critical = filterCitations(fixture, { severity: 'critical' });
    expect(critical).toHaveLength(2);
    expect(critical.every(h => h.gap?.severity === 'critical')).toBe(true);
  });

  it('filters by free-text query (case-insensitive substring)', () => {
    const lower = filterCitations(fixture, { query: 'median age' });
    expect(lower).toHaveLength(1);
    const upper = filterCitations(fixture, { query: 'MEDIAN AGE' });
    expect(upper).toHaveLength(1);
    expect(upper[0].text).toBe('Median age was 47 years.');
  });

  it('filters by artifactId', () => {
    const hits = filterCitations(fixture, { artifactId: 'csr-002' });
    expect(hits.every(h => h.artifactId === 'csr-002')).toBe(true);
    expect(hits).toHaveLength(2);
  });

  it('filters by ctd-section prefix (matches exact + sub-sections)', () => {
    // '5.3.5' covers csr-001 (5.3.5) and csr-002 (5.3.5.1) — but NOT
    // protocol-001 (5.3.1).
    const hits = filterCitations(fixture, { ctdSectionPrefix: '5.3.5' });
    const ids = new Set(hits.map(h => h.artifactId));
    expect(ids.has('csr-001')).toBe(true);
    expect(ids.has('csr-002')).toBe(true);
    expect(ids.has('protocol-001')).toBe(false);
  });

  it('filters by sourceArtifactId (matches sentences cited from that source)', () => {
    const hits = filterCitations(fixture, { sourceArtifactId: 'protocol-001' });
    expect(hits).toHaveLength(2);
    expect(hits.every(h => h.sources.some(s => s.artifactId === 'protocol-001'))).toBe(true);
  });

  it('combines multiple filters with AND semantics', () => {
    // gap status + critical severity + ctdSectionPrefix '5.3.5' →
    // both csr-001 and csr-002 gaps qualify.
    const hits = filterCitations(fixture, {
      status: 'gap',
      severity: 'critical',
      ctdSectionPrefix: '5.3.5',
    });
    expect(hits).toHaveLength(2);

    // Add a query that only csr-001's gap matches.
    const narrow = filterCitations(fixture, {
      status: 'gap',
      severity: 'critical',
      ctdSectionPrefix: '5.3.5',
      query: 'demographics',
    });
    expect(narrow).toHaveLength(1);
    expect(narrow[0].artifactId).toBe('csr-001');
  });

  it('returns empty array when no sentence matches', () => {
    const hits = filterCitations(fixture, { query: 'nonexistent text 9999' });
    expect(hits).toEqual([]);
  });

  it('preserves source bundle order in results', () => {
    const hits = filterCitations(fixture, { status: 'supported' });
    expect(hits.map(h => h.artifactId)).toEqual([
      'csr-001',
      'csr-002',
      'protocol-001',
    ]);
  });
});
