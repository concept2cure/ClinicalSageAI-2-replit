/**
 * Tests for the pure helpers in citation-export: aggregateGapsByRule and
 * the CSV/JSON flatteners. Database-free.
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateGapsByRule,
  flattenArtifactCitationsForExport,
  formatCitationsCsv,
  formatCitationsJsonExport,
} from '../ana/citation-export';
import type {
  PersistedCitations,
  SentenceCitation,
  CitationStatus,
  CitationSource,
} from '../ana/citation-engine';
import type { GapClassification } from '../ana/gap-classifier';

function sent(over: Partial<SentenceCitation> = {}): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: 10,
    text: 'A sentence.',
    contentHash: 'h-' + Math.random().toString(36).slice(2),
    sources: [],
    status: 'supported',
    gap: null,
    flags: [],
    ...over,
  };
}

function gap(over: Partial<GapClassification> = {}): GapClassification {
  return {
    severity: 'critical',
    readinessDelta: -18,
    blockingFiling: true,
    rule: 'CSR-9.2-demographics',
    message: 'CSR demographics missing.',
    guidance: 'ICH E3 §9.2',
    ...over,
  };
}

function art(
  over: Partial<PersistedCitations> & { title?: string } = {}
): PersistedCitations & { title: string } {
  return {
    artifactId: 'art-1',
    citationRunId: 'run-1',
    citationsAt: '2026-05-08T00:00:00Z',
    ctdSection: '5.3.5',
    citations: [],
    stats: null,
    isStale: false,
    ranAgainstContentHash: 'ran',
    currentContentHash: 'cur',
    title: 'CSR §9.2',
    ...over,
  };
}

describe('citation-export · aggregateGapsByRule', () => {
  const NOW = new Date('2026-05-08T00:00:00Z');

  it('returns zeroed report for empty project', () => {
    const out = aggregateGapsByRule([], { projectId: 1, organizationId: 1, now: NOW });
    expect(out.artifactCount).toBe(0);
    expect(out.artifactCountWithGaps).toBe(0);
    expect(out.rules).toEqual([]);
    expect(out.unclassified).toEqual([]);
    expect(out.totalReadinessDelta).toBe(0);
    expect(out.filingBlocked).toBe(false);
    expect(out.severityCounts.critical).toBe(0);
    expect(out.severityCounts.unclassified).toBe(0);
  });

  it('buckets gap citations by gap.rule and counts artifacts distinctly', () => {
    const a = art({
      artifactId: 'a',
      ctdSection: '9.2',
      citations: [
        sent({ status: 'gap', gap: gap() }),
        sent({ status: 'gap', gap: gap() }), // same rule, same artifact
      ],
    });
    const b = art({
      artifactId: 'b',
      ctdSection: '9.2',
      citations: [
        sent({ status: 'gap', gap: gap() }), // same rule, different artifact
      ],
    });
    const out = aggregateGapsByRule([a, b], {
      projectId: 1,
      organizationId: 1,
      now: NOW,
    });
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].ruleId).toBe('CSR-9.2-demographics');
    expect(out.rules[0].sentenceCount).toBe(3);
    // Distinct artifacts contributing
    expect(out.rules[0].artifactCount).toBe(2);
    expect(out.totalReadinessDelta).toBe(-54); // 3 × -18
    expect(out.filingBlocked).toBe(true);
    expect(out.artifactCountWithGaps).toBe(2);
  });

  it('sorts rules by severity (critical → info), then by sentenceCount desc', () => {
    const a = art({
      ctdSection: '9.2',
      citations: [
        sent({ status: 'gap', gap: gap({ rule: 'minor-rule', severity: 'minor', readinessDelta: -2, blockingFiling: false }) }),
        sent({ status: 'gap', gap: gap({ rule: 'critical-rule', severity: 'critical' }) }),
        sent({ status: 'gap', gap: gap({ rule: 'critical-rule', severity: 'critical' }) }),
        sent({ status: 'gap', gap: gap({ rule: 'major-rule', severity: 'major', readinessDelta: -8, blockingFiling: false }) }),
      ],
    });
    const out = aggregateGapsByRule([a], {
      projectId: 1,
      organizationId: 1,
      now: NOW,
    });
    expect(out.rules.map(r => r.ruleId)).toEqual([
      'critical-rule',
      'major-rule',
      'minor-rule',
    ]);
  });

  it('separates unclassified gaps from rule buckets', () => {
    const a = art({
      ctdSection: '99.99', // section with no rule registered
      citations: [
        sent({ status: 'gap', gap: null, text: 'No rule for this section.' }),
        sent({ status: 'gap', gap: gap() }),
      ],
    });
    const out = aggregateGapsByRule([a], {
      projectId: 1,
      organizationId: 1,
      now: NOW,
    });
    expect(out.unclassified).toHaveLength(1);
    expect(out.severityCounts.unclassified).toBe(1);
    expect(out.rules).toHaveLength(1);
  });

  it('re-classifies gaps where the persisted snapshot has gap=null but the registry now matches', () => {
    // Persisted snapshot from before a rule was added: gap=null, but
    // section + claim text match a registry rule today.
    const a = art({
      ctdSection: '11.4',
      citations: [
        sent({
          status: 'gap',
          gap: null,
          text: 'Primary endpoint analysis is missing.',
        }),
      ],
    });
    const out = aggregateGapsByRule([a], {
      projectId: 1,
      organizationId: 1,
      now: NOW,
    });
    // CSR-11.4-efficacy-results matches 'primary endpoint'
    expect(out.rules).toHaveLength(1);
    expect(out.rules[0].ruleId).toBe('CSR-11.4-efficacy-results');
    expect(out.unclassified).toHaveLength(0);
  });

  it('counts severity buckets, including unclassified', () => {
    const a = art({
      ctdSection: '99.99',
      citations: [
        sent({ status: 'gap', gap: null, text: 'no rule' }),
        sent({ status: 'gap', gap: gap({ severity: 'critical', rule: 'r1' }) }),
        sent({ status: 'gap', gap: gap({ severity: 'major', rule: 'r2', readinessDelta: -8, blockingFiling: false }) }),
        sent({ status: 'gap', gap: gap({ severity: 'minor', rule: 'r3', readinessDelta: -2, blockingFiling: false }) }),
      ],
    });
    const out = aggregateGapsByRule([a], {
      projectId: 1,
      organizationId: 1,
      now: NOW,
    });
    expect(out.severityCounts).toEqual({
      critical: 1,
      major: 1,
      minor: 1,
      info: 0,
      unclassified: 1,
    });
  });

  it('does not count non-gap citations', () => {
    const a = art({
      citations: [
        sent({ status: 'supported' }),
        sent({ status: 'contradicted' }),
        sent({ status: 'gap', gap: gap() }),
      ],
    });
    const out = aggregateGapsByRule([a], {
      projectId: 1,
      organizationId: 1,
      now: NOW,
    });
    expect(out.rules[0].sentenceCount).toBe(1);
    expect(out.artifactCountWithGaps).toBe(1);
  });
});

describe('citation-export · flattenArtifactCitationsForExport', () => {
  const supportSrc = (over: Partial<CitationSource> = {}): CitationSource => ({
    artifactId: 'src',
    sectionCode: 'X.Y',
    pageRef: 'p.1',
    passageSnippet: 'snippet',
    relevanceScore: 0.8,
    relationship: 'supports',
    ...over,
  });

  it('returns one row per sentence with primary source picked by relevance', () => {
    const out = flattenArtifactCitationsForExport('a', '5.3.5', [
      sent({
        status: 'supported',
        sources: [
          supportSrc({ artifactId: 'low', relevanceScore: 0.6 }),
          supportSrc({ artifactId: 'high', relevanceScore: 0.95 }),
          supportSrc({ artifactId: 'mid', relevanceScore: 0.7 }),
        ],
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].artifactId).toBe('a');
    expect(out[0].primarySourceArtifactId).toBe('high');
    expect(out[0].sourceCount).toBe(3);
    expect(out[0].primarySourceRelationship).toBe('supports');
  });

  it('falls back to first contradicts when no supports', () => {
    const out = flattenArtifactCitationsForExport('a', '5.3.5', [
      sent({
        status: 'contradicted',
        sources: [
          supportSrc({ artifactId: 'C1', relationship: 'contradicts' }),
          supportSrc({ artifactId: 'C2', relationship: 'contradicts' }),
        ],
      }),
    ]);
    expect(out[0].primarySourceArtifactId).toBe('C1');
    expect(out[0].contradictedSourceCount).toBe(2);
  });

  it('emits null primary fields when no sources at all', () => {
    const out = flattenArtifactCitationsForExport('a', null, [
      sent({ status: 'gap', sources: [], gap: gap() }),
    ]);
    expect(out[0].primarySourceArtifactId).toBeNull();
    expect(out[0].primarySourceRelationship).toBeNull();
    expect(out[0].sourceCount).toBe(0);
    expect(out[0].gapSeverity).toBe('critical');
    expect(out[0].gapRule).toBe('CSR-9.2-demographics');
  });
});

describe('citation-export · formatCitationsCsv', () => {
  it('emits a header-only line when there are no rows', () => {
    const out = formatCitationsCsv([]);
    expect(out.startsWith('artifactId,ctdSection,sentenceIndex')).toBe(true);
    expect(out.split('\n')).toHaveLength(1);
  });

  it('escapes quotes, commas, and newlines per RFC 4180', () => {
    const rows = flattenArtifactCitationsForExport('a', '5.3.5', [
      sent({
        text: 'Has, comma "and" quote\nand newline.',
        contentHash: 'h1',
      }),
    ]);
    const csv = formatCitationsCsv(rows);
    const dataLine = csv.split('\n').slice(1).join('\n');
    // The text field should be wrapped in quotes and have its own quotes doubled.
    expect(dataLine).toMatch(
      /"Has, comma ""and"" quote\nand newline\."/
    );
  });

  it('returns rows in the order provided', () => {
    const rows = flattenArtifactCitationsForExport('a', '5.3.5', [
      sent({ sentenceIndex: 0, text: 'first', contentHash: 'h0' }),
      sent({ sentenceIndex: 1, text: 'second', contentHash: 'h1' }),
    ]);
    const csv = formatCitationsCsv(rows);
    const lines = csv.split('\n');
    expect(lines[1]).toMatch(/^a,5\.3\.5,0,/);
    expect(lines[2]).toMatch(/^a,5\.3\.5,1,/);
  });
});

describe('citation-export · formatCitationsJsonExport', () => {
  it('returns the rows array verbatim with a count', () => {
    const rows = flattenArtifactCitationsForExport('a', '5.3.5', [
      sent({ contentHash: 'h0' }),
      sent({ contentHash: 'h1' }),
    ]);
    const out = formatCitationsJsonExport(rows);
    expect(out.rowCount).toBe(2);
    expect(out.rows).toBe(rows); // same reference
  });
});
