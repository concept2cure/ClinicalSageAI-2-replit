/**
 * Tests for the citation regression watchdog. Pure detector over two
 * runs; we lock down: no-regression cases, status-transition flagging,
 * lostSupports detection, filing-blocked transition, readiness
 * regression sign convention, and added/removed sentences NOT counted.
 */
import { describe, it, expect } from 'vitest';
import { detectCitationRegression } from '../ana/citation-regression';
import type {
  CitationRunDetail,
  SentenceCitation,
  CitationStatus,
  CitationSource,
} from '../ana/citation-engine';
import type { GapClassification } from '../ana/gap-classifier';

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

function gap(over: Partial<GapClassification> = {}): GapClassification {
  return {
    severity: 'critical',
    readinessDelta: -18,
    blockingFiling: true,
    rule: 'r1',
    message: 'm',
    guidance: 'g',
    ...over,
  };
}

function sent(
  hash: string,
  status: CitationStatus,
  sources: CitationSource[] = [],
  over: Partial<SentenceCitation> = {}
): SentenceCitation {
  return {
    sentenceIndex: 0,
    paragraphIndex: 0,
    charStart: 0,
    charEnd: 1,
    text: `Sentence ${hash}`,
    contentHash: hash,
    sources,
    status,
    gap: null,
    flags: [],
    ...over,
  };
}

function run(
  runId: string,
  citations: SentenceCitation[],
  over: Partial<CitationRunDetail> = {}
): CitationRunDetail {
  return {
    runId,
    artifactId: 'art-1',
    artifactPk: 1,
    ctdSection: '5.3.5',
    artifactContentHash: 'h-' + runId,
    totalSentences: citations.length,
    supportedCount: citations.filter(c => c.status === 'supported').length,
    contradictedCount: citations.filter(c => c.status === 'contradicted').length,
    gapCount: citations.filter(c => c.status === 'gap').length,
    totalReadinessDelta: 0,
    filingBlocked: false,
    createdAt: '2026-05-08T00:00:00Z',
    createdBy: 1,
    metadata: {},
    isCurrent: false,
    citations,
    ...over,
  };
}

describe('citation-regression · detectCitationRegression', () => {
  it('flags hasRegression=false when nothing changed', () => {
    const a = run('A', [
      sent('h1', 'supported', [source()]),
      sent('h2', 'supported', [source()]),
    ]);
    const b = run('B', [
      sent('h1', 'supported', [source()]),
      sent('h2', 'supported', [source()]),
    ]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(false);
    expect(r.newGaps).toBe(0);
    expect(r.newContradictions).toBe(0);
    expect(r.lostSupports).toBe(0);
    expect(r.regressedSentences).toEqual([]);
  });

  it('detects supported → gap as a regression', () => {
    const a = run('A', [sent('h1', 'supported', [source()])]);
    const b = run('B', [sent('h1', 'gap')]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(true);
    expect(r.newGaps).toBe(1);
    expect(r.regressedSentences[0].triggers).toContain('newGap');
  });

  it('detects supported → contradicted as a regression', () => {
    const a = run('A', [sent('h1', 'supported', [source()])]);
    const b = run('B', [
      sent('h1', 'contradicted', [source({ relationship: 'contradicts' })]),
    ]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(true);
    expect(r.newContradictions).toBe(1);
    expect(r.regressedSentences[0].triggers).toContain('newContradiction');
  });

  it('detects lostSupports when status stays supported but sources drop to 0', () => {
    // The status enum might still say 'supported' (engine tolerance) even
    // though all support sources were stripped — we still flag this.
    const a = run('A', [sent('h1', 'supported', [source()])]);
    const b = run('B', [sent('h1', 'supported', [])]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(true);
    expect(r.lostSupports).toBe(1);
    expect(r.regressedSentences[0].triggers).toContain('lostSupports');
  });

  it('detects newFilingBlock when a gap with blockingFiling appears', () => {
    const a = run('A', [sent('h1', 'supported', [source()])]);
    const b = run('B', [
      sent('h1', 'gap', [], { gap: gap({ blockingFiling: true }) }),
    ]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(true);
    expect(r.newFilingBlocks).toBe(1);
    expect(r.regressedSentences[0].triggers).toContain('newFilingBlock');
    expect(r.regressedSentences[0].triggers).toContain('newGap');
  });

  it('flags filingBlockedRegression at the artifact roll-up level', () => {
    const a = run('A', [], { filingBlocked: false });
    const b = run('B', [], { filingBlocked: true });
    const r = detectCitationRegression(a, b);
    expect(r.filingBlockedRegression).toBe(true);
    expect(r.hasRegression).toBe(true);
  });

  it('readinessDeltaRegression is negative when score worsens', () => {
    const a = run('A', [], { totalReadinessDelta: -2 });
    const b = run('B', [], { totalReadinessDelta: -20 });
    const r = detectCitationRegression(a, b);
    expect(r.readinessDeltaRegression).toBe(-18);
    expect(r.hasRegression).toBe(true);
  });

  it('readinessDeltaRegression is positive on improvement (NOT a regression)', () => {
    const a = run('A', [], { totalReadinessDelta: -28 });
    const b = run('B', [], { totalReadinessDelta: -10 });
    const r = detectCitationRegression(a, b);
    expect(r.readinessDeltaRegression).toBe(18);
    // Improvement-only does NOT trigger hasRegression.
    expect(r.hasRegression).toBe(false);
  });

  it('does NOT flag a brand-new sentence (no prior to compare)', () => {
    const a = run('A', [sent('h1', 'supported', [source()])]);
    const b = run('B', [
      sent('h1', 'supported', [source()]),
      sent('hNew', 'gap'), // newly added; not a regression
    ]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(false);
    expect(r.newGaps).toBe(0);
  });

  it('does NOT flag a removed sentence (sentence dropped out of artifact)', () => {
    const a = run('A', [
      sent('h1', 'supported', [source()]),
      sent('h2', 'supported', [source()]),
    ]);
    const b = run('B', [sent('h1', 'supported', [source()])]);
    const r = detectCitationRegression(a, b);
    expect(r.hasRegression).toBe(false);
  });

  it('records multiple triggers on a single sentence', () => {
    const a = run('A', [sent('h1', 'supported', [source()])]);
    const b = run('B', [
      sent('h1', 'gap', [], { gap: gap({ blockingFiling: true }) }),
    ]);
    const r = detectCitationRegression(a, b);
    // supported+source → gap+empty triggers all three: lost the supports,
    // got a new gap, the gap blocks filing.
    expect(r.regressedSentences[0].triggers.sort()).toEqual([
      'lostSupports',
      'newFilingBlock',
      'newGap',
    ]);
  });
});
