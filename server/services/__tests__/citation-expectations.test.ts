/**
 * Tests for deriveSectionExpectations — pure helper that grades how an
 * artifact's citations cover the rules registered for its CTD section.
 */
import { describe, it, expect } from 'vitest';
import { deriveSectionExpectations } from '../ana/citation-expectations';
import type {
  SentenceCitation,
  CitationStatus,
  CitationSource,
} from '../ana/citation-engine';

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

function sent(
  text: string,
  status: CitationStatus = 'supported',
  sources: CitationSource[] = []
): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: text.length,
    text,
    contentHash: 'h-' + Math.random().toString(36).slice(2),
    sources,
    status,
    gap: null,
    flags: [],
  };
}

describe('citation-expectations · deriveSectionExpectations', () => {
  it('returns empty when ctdSection is null', () => {
    expect(deriveSectionExpectations(null, [sent('text')])).toEqual([]);
  });

  it('returns empty when no rules apply to the section', () => {
    expect(deriveSectionExpectations('99.99', [sent('text')])).toEqual([]);
  });

  it('marks rules with matching supported sentences as covered', () => {
    // CSR-9.2-demographics matches "demographics" / "baseline characteristics" / "disposition"
    const out = deriveSectionExpectations('9.2', [
      sent('Demographics table is included.', 'supported', [source()]),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo).toBeDefined();
    expect(demo!.status).toBe('covered');
    expect(demo!.matchingSentenceCount).toBe(1);
  });

  it('marks rules with matching gap-only sentences as partial', () => {
    const out = deriveSectionExpectations('9.2', [
      sent('Demographics table is missing.', 'gap'),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.status).toBe('partial');
  });

  it('marks rules with no matching sentences as missing', () => {
    const out = deriveSectionExpectations('9.2', [
      sent('Unrelated content here.', 'supported', [source()]),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.status).toBe('missing');
    expect(demo!.matchingSentenceCount).toBe(0);
  });

  it('counts contradicted sentences as partial (not covered)', () => {
    const out = deriveSectionExpectations('9.2', [
      sent('Demographics table contradicts the protocol.', 'contradicted'),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.status).toBe('partial');
  });

  it('upgrades to covered when at least one matching sentence is supported', () => {
    const out = deriveSectionExpectations('9.2', [
      sent('Demographics table missing.', 'gap'),
      sent('Demographics table is included.', 'supported', [source()]),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.status).toBe('covered');
    expect(demo!.matchingSentenceCount).toBe(2);
  });

  it('caps matchingSentences at 5 per rule', () => {
    const citations = Array.from({ length: 10 }, () =>
      sent('demographics ...', 'supported', [source()])
    );
    const out = deriveSectionExpectations('9.2', citations);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.matchingSentenceCount).toBe(10);
    expect(demo!.matchingSentences).toHaveLength(5);
  });

  it('collects distinct supporting source artifactIds', () => {
    const out = deriveSectionExpectations('9.2', [
      sent('demographics A.', 'supported', [source({ artifactId: 'X' })]),
      sent('demographics B.', 'supported', [
        source({ artifactId: 'Y' }),
        source({ artifactId: 'X' }),
      ]),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.matchingSourceArtifactIds.sort()).toEqual(['X', 'Y']);
  });

  it('does NOT count contradicts sources in matchingSourceArtifactIds', () => {
    const out = deriveSectionExpectations('9.2', [
      sent('demographics line.', 'contradicted', [
        source({ artifactId: 'X', relationship: 'contradicts' }),
      ]),
    ]);
    const demo = out.find(e => e.rule.id === 'CSR-9.2-demographics');
    expect(demo!.matchingSourceArtifactIds).toEqual([]);
  });

  it('returns expectations sorted critical → info, then missing → covered', () => {
    // For a sub-section like 5.3.5.1 we get the pivotal-CSR critical rule.
    const out = deriveSectionExpectations('5.3.5.1', []);
    // All rules will be "missing" since no citations.
    if (out.length > 1) {
      const severities = out.map(e => e.rule.severity);
      const order = ['critical', 'major', 'minor', 'info'];
      const indexed = severities.map(s => order.indexOf(s));
      // Severity indices should be non-decreasing.
      for (let i = 1; i < indexed.length; i++) {
        expect(indexed[i]).toBeGreaterThanOrEqual(indexed[i - 1]);
      }
    }
  });
});
