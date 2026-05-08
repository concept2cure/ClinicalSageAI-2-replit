/**
 * Tests for the citation run-diff helper. Pure function over two
 * CitationRunDetail objects — locks down sentence matching by contentHash,
 * status-transition counting, and readiness-delta arithmetic.
 */
import { describe, it, expect } from 'vitest';
import {
  diffCitationRunsPayload,
  type CitationRunDetail,
  type SentenceCitation,
  type CitationStatus,
} from '../ana/citation-engine';

function sent(
  hash: string,
  status: CitationStatus,
  text = `Sentence ${hash}`,
  sources: any[] = []
): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: text.length,
    text,
    contentHash: hash,
    sources: sources.map((s, i) => ({
      artifactId: s.artifactId ?? 'a',
      sectionCode: s.sectionCode ?? null,
      pageRef: s.pageRef ?? null,
      passageSnippet: s.passageSnippet ?? `snippet ${i}`,
      relevanceScore: s.relevanceScore ?? 0.8,
      relationship: s.relationship ?? 'supports',
    })),
    status,
    gap: null,
    flags: [],
  };
}

function run(
  runId: string,
  citations: SentenceCitation[],
  totalReadinessDelta = 0
): CitationRunDetail {
  return {
    runId,
    artifactId: 'art-1',
    artifactPk: 1,
    ctdSection: '5.3.5',
    artifactContentHash: 'hash-' + runId,
    totalSentences: citations.length,
    supportedCount: citations.filter(c => c.status === 'supported').length,
    contradictedCount: citations.filter(c => c.status === 'contradicted').length,
    gapCount: citations.filter(c => c.status === 'gap').length,
    totalReadinessDelta,
    filingBlocked: false,
    createdAt: '2026-05-08T00:00:00Z',
    createdBy: 1,
    metadata: {},
    isCurrent: false,
    citations,
  };
}

describe('citation-engine · diffCitationRunsPayload', () => {
  it('returns all-zero diff for identical runs', () => {
    const a = run('A', [sent('h1', 'supported'), sent('h2', 'gap')]);
    const b = run('B', [sent('h1', 'supported'), sent('h2', 'gap')]);
    const d = diffCitationRunsPayload(a, b);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.changed).toEqual([]);
    expect(d.unchangedCount).toBe(2);
    expect(d.transitionCounts.supported_to_supported).toBe(1);
    expect(d.transitionCounts.gap_to_gap).toBe(1);
    expect(d.readinessDeltaChange).toBe(0);
  });

  it('detects added sentences', () => {
    const a = run('A', [sent('h1', 'supported')]);
    const b = run('B', [sent('h1', 'supported'), sent('h2', 'gap')]);
    const d = diffCitationRunsPayload(a, b);
    expect(d.added).toHaveLength(1);
    expect(d.added[0].contentHash).toBe('h2');
    expect(d.removed).toEqual([]);
    expect(d.unchangedCount).toBe(1);
  });

  it('detects removed sentences', () => {
    const a = run('A', [sent('h1', 'supported'), sent('h2', 'gap')]);
    const b = run('B', [sent('h1', 'supported')]);
    const d = diffCitationRunsPayload(a, b);
    expect(d.removed).toHaveLength(1);
    expect(d.removed[0].contentHash).toBe('h2');
    expect(d.added).toEqual([]);
  });

  it('detects status transitions between matched sentences', () => {
    const a = run('A', [sent('h1', 'gap'), sent('h2', 'contradicted')]);
    const b = run('B', [sent('h1', 'supported'), sent('h2', 'supported')]);
    const d = diffCitationRunsPayload(a, b);
    expect(d.changed).toHaveLength(2);
    expect(d.transitionCounts.gap_to_supported).toBe(1);
    expect(d.transitionCounts.contradicted_to_supported).toBe(1);
    expect(d.unchangedCount).toBe(0);
  });

  it('detects sources change even when status stays the same', () => {
    const aSent = sent('h1', 'supported', 't', [
      { artifactId: 'X', passageSnippet: 'old' },
    ]);
    const bSent = sent('h1', 'supported', 't', [
      { artifactId: 'X', passageSnippet: 'old' },
      { artifactId: 'Y', passageSnippet: 'new' },
    ]);
    const a = run('A', [aSent]);
    const b = run('B', [bSent]);
    const d = diffCitationRunsPayload(a, b);
    expect(d.changed).toHaveLength(1);
    expect(d.changed[0].sourcesChanged).toBe(true);
    expect(d.changed[0].fromSourceCount).toBe(1);
    expect(d.changed[0].toSourceCount).toBe(2);
  });

  it('does NOT mark sourcesChanged when sources are identical (different order)', () => {
    const aSent = sent('h1', 'supported', 't', [
      { artifactId: 'X', passageSnippet: 'a' },
      { artifactId: 'Y', passageSnippet: 'b' },
    ]);
    const bSent = sent('h1', 'supported', 't', [
      { artifactId: 'Y', passageSnippet: 'b' },
      { artifactId: 'X', passageSnippet: 'a' },
    ]);
    const a = run('A', [aSent]);
    const b = run('B', [bSent]);
    const d = diffCitationRunsPayload(a, b);
    expect(d.changed).toEqual([]);
    expect(d.unchangedCount).toBe(1);
  });

  it('computes positive readinessDeltaChange when score improves', () => {
    const a = run('A', [], -28);
    const b = run('B', [], -10);
    const d = diffCitationRunsPayload(a, b);
    // -10 - (-28) = +18 (improvement)
    expect(d.readinessDeltaChange).toBe(18);
  });

  it('computes negative readinessDeltaChange when score worsens', () => {
    const a = run('A', [], -2);
    const b = run('B', [], -20);
    const d = diffCitationRunsPayload(a, b);
    expect(d.readinessDeltaChange).toBe(-18);
  });

  it('matches sentences by contentHash even if sentenceIndex differs', () => {
    const a = run('A', [sent('h1', 'supported')]);
    a.citations[0].sentenceIndex = 0;
    const b = run('B', [sent('hZero', 'supported'), sent('h1', 'supported')]);
    b.citations[1].sentenceIndex = 1; // shifted
    const d = diffCitationRunsPayload(a, b);
    expect(d.added).toHaveLength(1);
    expect(d.added[0].contentHash).toBe('hZero');
    expect(d.unchangedCount).toBe(1);
  });

  it('initializes every transition counter at 0 and only increments observed pairs', () => {
    const a = run('A', [sent('h1', 'supported')]);
    const b = run('B', [sent('h1', 'gap')]);
    const d = diffCitationRunsPayload(a, b);
    // Only one transition observed
    expect(d.transitionCounts.supported_to_gap).toBe(1);
    expect(d.transitionCounts.supported_to_supported).toBe(0);
    expect(d.transitionCounts.gap_to_gap).toBe(0);
    expect(d.transitionCounts.contradicted_to_supported).toBe(0);
  });
});
