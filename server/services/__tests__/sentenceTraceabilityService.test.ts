/**
 * Unit tests for the Sentence-Level Traceability Service.
 *
 * This service is the platform's "sentence-level source traceability"
 * differentiator (FDA 21 CFR Part 11 / ICH M4 traceability). The tests cover
 * its pure and orchestration logic without touching a real database or the AI
 * provider:
 *
 *   - detectSentences()      — sentence boundary detection, including the
 *                              regulatory edge cases the splitter is built for
 *                              (abbreviations, decimals, initialisms, empty
 *                              input, paragraph tracking, char offsets).
 *   - mapSentencesToSources()— semantic (AI) mapping, the minConfidence filter,
 *                              the keyword-fallback path when the AI call fails,
 *                              and merging of pre-existing auto_trace_links.
 *   - resolveClickThrough()  — char-offset -> sentence -> enriched sources,
 *                              including out-of-range and boundary offsets.
 *   - generateTraceabilityReport() — coverage / unsupported-claim / average
 *                              confidence math.
 *   - persistTraceLinks()    — link-strength bucketing and stored/error counts.
 *
 * The Postgres pool (../../db.js) and the unified AI client are mocked so the
 * suite is fully deterministic, offline, and fast. No real network or DB calls
 * are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const chatMock = vi.fn();
const queryMock = vi.fn();

vi.mock('../../db.js', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

vi.mock('../../lib/unified-ai-client', () => ({
  ai: { chat: (...args: unknown[]) => chatMock(...args) },
}));

import {
  detectSentences,
  mapSentencesToSources,
  resolveClickThrough,
  generateTraceabilityReport,
  persistTraceLinks,
  type SentenceTraceLink,
} from '../sentenceTraceabilityService';

beforeEach(() => {
  chatMock.mockReset();
  queryMock.mockReset();
});

// Shape of a row returned by loadProjectSources(); the service reads camelCase
// keys (matching the internal ProjectSource interface), so tests provide them.
interface SourceRow {
  id: string;
  title: string;
  type: string;
  excerpt: string;
  documentPath?: string;
  pageNumber?: number;
}

/**
 * Wire up the three queries that mapSentencesToSources() issues:
 *   1. evidence_objects, 2. concept2cure_artifacts (loadProjectSources)
 *   3. innovation.auto_trace_links (loadExistingTraceLinks)
 */
function primeSourceQueries(sources: SourceRow[], existingTraceLinks: unknown[] = []) {
  queryMock
    .mockResolvedValueOnce({ rows: sources })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: existingTraceLinks });
}

function aiMapping(mappings: unknown[]) {
  chatMock.mockResolvedValue({ content: JSON.stringify({ mappings }) });
}

// ───────────────────────────────────────────────────────────────────────────
// detectSentences — sentence boundary detection
// ───────────────────────────────────────────────────────────────────────────

describe('detectSentences', () => {
  it('returns an empty array for empty or whitespace-only input', () => {
    expect(detectSentences('')).toEqual([]);
    expect(detectSentences('   ')).toEqual([]);
    expect(detectSentences('\n\n\t')).toEqual([]);
  });

  it('splits a simple multi-sentence paragraph on . ! and ?', () => {
    const spans = detectSentences('Is this safe? Yes it is! Absolutely.');
    expect(spans.map(s => s.text)).toEqual(['Is this safe?', 'Yes it is!', 'Absolutely.']);
    expect(spans.map(s => s.index)).toEqual([0, 1, 2]);
  });

  it('produces char offsets that exactly slice the original content', () => {
    const content = 'First sentence here. Second sentence there.';
    const spans = detectSentences(content);
    for (const span of spans) {
      expect(content.slice(span.charStart, span.charEnd)).toBe(span.text);
    }
    expect(spans[0].charStart).toBe(0);
    expect(spans[spans.length - 1].charEnd).toBe(content.length);
  });

  it('does NOT split on honorific / Latin abbreviations (Dr., e.g.)', () => {
    expect(detectSentences('Dr. Smith reviewed the data. The results were clear.').map(s => s.text)).toEqual([
      'Dr. Smith reviewed the data.',
      'The results were clear.',
    ]);
    expect(
      detectSentences('Several sites participated, e.g. Boston and Paris. Enrollment was strong.').map(s => s.text)
    ).toEqual(['Several sites participated, e.g. Boston and Paris.', 'Enrollment was strong.']);
  });

  it('does NOT split on dotted initialisms like U.S.', () => {
    const spans = detectSentences('The U.S. FDA reviewed it. Approval followed.');
    expect(spans).toHaveLength(2);
    expect(spans[0].text).toBe('The U.S. FDA reviewed it.');
  });

  it('does NOT split decimal numbers or p-values mid-sentence', () => {
    const spans = detectSentences(
      'The p-value was p<0.05 in the trial. Efficacy reached 3.14 units. We concluded benefit.'
    );
    expect(spans.map(s => s.text)).toEqual([
      'The p-value was p<0.05 in the trial.',
      'Efficacy reached 3.14 units.',
      'We concluded benefit.',
    ]);
  });

  it('treats input without terminal punctuation as a single sentence', () => {
    const spans = detectSentences('Only one sentence with no terminal punctuation');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('Only one sentence with no terminal punctuation');
  });

  it('tracks paragraph indices across blank-line-separated paragraphs', () => {
    const content = 'First paragraph sentence one. Sentence two here.\n\nSecond paragraph alone.';
    const spans = detectSentences(content);
    expect(spans.map(s => s.paragraphIndex)).toEqual([0, 0, 1]);
    // Offsets must still slice cleanly even across the paragraph break.
    for (const span of spans) {
      expect(content.slice(span.charStart, span.charEnd)).toBe(span.text);
    }
  });

  it('assigns a stable 16-char content hash derived from the sentence text', () => {
    const a = detectSentences('Identical sentence text.');
    const b = detectSentences('Identical sentence text.');
    expect(a[0].contentHash).toHaveLength(16);
    expect(a[0].contentHash).toBe(b[0].contentHash);
    expect(detectSentences('A different sentence.')[0].contentHash).not.toBe(a[0].contentHash);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// mapSentencesToSources — semantic mapping + keyword fallback
// ───────────────────────────────────────────────────────────────────────────

describe('mapSentencesToSources', () => {
  it('returns no links when the project has no sources at all', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const links = await mapSentencesToSources(detectSentences('Some claim here.'), 1, 2);
    expect(links).toEqual([]);
    // Short-circuits before ever calling the AI.
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('maps a sentence to an AI-identified source with full metadata', async () => {
    primeSourceQueries([
      { id: 'ev1', title: 'Study A', type: 'evidence_object', excerpt: 'baseline', documentPath: '/p.pdf', pageNumber: 3 },
    ]);
    aiMapping([
      {
        sentenceIdx: 0,
        sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.9, excerpt: 'cited excerpt' }],
        claimType: 'efficacy',
        needsReview: false,
      },
    ]);

    const links = await mapSentencesToSources(detectSentences('Drug X improved outcomes.'), 1, 2);

    expect(links).toHaveLength(1);
    const [link] = links;
    expect(link.sources).toHaveLength(1);
    const [src] = link.sources;
    expect(src.sourceId).toBe('ev1');
    expect(src.detectionMethod).toBe('semantic');
    expect(src.linkType).toBe('supports');
    expect(src.documentPath).toBe('/p.pdf');
    expect(src.pageNumber).toBe(3);
    expect(src.excerpt).toBe('cited excerpt');
    expect(link.claimType).toBe('efficacy');
    expect(link.overallConfidence).toBeCloseTo(0.9);
    expect(link.isSupported).toBe(true);
    expect(link.needsReview).toBe(false);
  });

  it('drops AI sources whose confidence is below minConfidence', async () => {
    primeSourceQueries([{ id: 'ev1', title: 'A', type: 'evidence_object', excerpt: 'foo' }]);
    aiMapping([{ sentenceIdx: 0, sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.1 }] }]);

    const links = await mapSentencesToSources(detectSentences('Drug X improved.'), 1, 2, {
      minConfidence: 0.3,
    });

    expect(links[0].sources).toHaveLength(0);
    expect(links[0].isSupported).toBe(false);
    expect(links[0].overallConfidence).toBe(0);
  });

  it('flags needsReview when overall confidence is below 0.7 and the AI omits the flag', async () => {
    primeSourceQueries([{ id: 'ev1', title: 'A', type: 'evidence_object', excerpt: 'foo' }]);
    // No explicit needsReview from the model; confidence 0.55 < 0.7 -> review.
    aiMapping([{ sentenceIdx: 0, sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.55 }] }]);

    const [link] = await mapSentencesToSources(detectSentences('Borderline claim.'), 1, 2, {
      minConfidence: 0.2,
    });
    expect(link.overallConfidence).toBeCloseTo(0.55);
    expect(link.needsReview).toBe(true);
  });

  it('requires a supporting link of >=0.5 relevance for isSupported to be true', async () => {
    primeSourceQueries([{ id: 'ev1', title: 'A', type: 'evidence_object', excerpt: 'foo' }]);
    // A "references" link (not "supports") must not count as support.
    aiMapping([{ sentenceIdx: 0, sources: [{ sourceIdx: 0, linkType: 'references', confidence: 0.9 }] }]);

    const [link] = await mapSentencesToSources(detectSentences('Merely referenced claim.'), 1, 2, {
      minConfidence: 0.2,
    });
    expect(link.sources).toHaveLength(1);
    expect(link.isSupported).toBe(false);
  });

  it('falls back to keyword matching when the AI call throws', async () => {
    // Source excerpt shares many >3-char words with the sentence so the
    // keyword Jaccard-style overlap clears the 0.3 threshold.
    primeSourceQueries([
      {
        id: 'ev1',
        title: 'Efficacy Study',
        type: 'evidence_object',
        excerpt: 'efficacy reached significant improvement patients carcinoma treatment outcomes',
      },
    ]);
    chatMock.mockRejectedValue(new Error('AI provider unavailable'));

    const [link] = await mapSentencesToSources(
      detectSentences('Efficacy reached significant improvement in patients with carcinoma treatment outcomes today.'),
      1,
      2
    );

    expect(link.sources).toHaveLength(1);
    expect(link.sources[0].detectionMethod).toBe('keyword');
    expect(link.sources[0].linkType).toBe('references');
    expect(link.isSupported).toBe(true);
    // Keyword-fallback links are always flagged for human review.
    expect(link.needsReview).toBe(true);
  });

  it('produces an unsupported, zero-confidence link when keyword fallback finds nothing', async () => {
    primeSourceQueries([
      { id: 'ev1', title: 'Unrelated', type: 'evidence_object', excerpt: 'completely orthogonal vocabulary tokens' },
    ]);
    chatMock.mockRejectedValue(new Error('AI provider unavailable'));

    const [link] = await mapSentencesToSources(
      detectSentences('Manufacturing batch yields exceeded specification thresholds substantially.'),
      1,
      2
    );
    expect(link.sources).toHaveLength(0);
    expect(link.isSupported).toBe(false);
    expect(link.overallConfidence).toBe(0);
  });

  it('merges a pre-existing auto_trace_link when it is highly similar to the sentence', async () => {
    primeSourceQueries(
      [{ id: 'ev1', title: 'Src', type: 'evidence_object', excerpt: 'unrelated source text' }],
      [
        {
          id: 'tl1',
          source_text: 'The patient cohort showed marked improvement overall',
          target_text: 'cohort improvement data',
          target_document_id: 'tgt9',
          link_type: 'SUPPORTS',
          confidence_score: '0.77',
          detection_method: 'semantic',
          is_validated: true,
          validated_by: 'reviewer-1',
          validated_at: '2026-01-01',
        },
      ]
    );
    // The AI itself finds nothing; the existing-link merge must still attach a source.
    aiMapping([{ sentenceIdx: 0, sources: [] }]);

    const [link] = await mapSentencesToSources(
      detectSentences('The patient cohort showed marked improvement overall.'),
      1,
      2
    );

    expect(link.sources).toHaveLength(1);
    const [src] = link.sources;
    expect(src.sourceId).toBe('tgt9');
    expect(src.linkType).toBe('supports'); // SUPPORTS -> supports
    expect(src.isVerified).toBe(true);
    expect(src.verifiedBy).toBe('reviewer-1');
    expect(link.isSupported).toBe(true);
  });

  it('skips loading existing auto_trace_links when includeAutoTrace is false', async () => {
    // Only the two loadProjectSources queries should run; the third (trace links) must not.
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'ev1', title: 'A', type: 'evidence_object', excerpt: 'foo' }] })
      .mockResolvedValueOnce({ rows: [] });
    aiMapping([{ sentenceIdx: 0, sources: [] }]);

    await mapSentencesToSources(detectSentences('A claim.'), 1, 2, { includeAutoTrace: false });

    expect(queryMock).toHaveBeenCalledTimes(2);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// resolveClickThrough — char offset -> sentence -> enriched sources
// ───────────────────────────────────────────────────────────────────────────

describe('resolveClickThrough', () => {
  const content = 'First sentence here. Second sentence there.';

  it('returns null for an out-of-range character offset', async () => {
    const result = await resolveClickThrough(content, 9999, 1, 2);
    expect(result).toBeNull();
    // No source lookups are attempted when the offset matches no sentence.
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('resolves an in-range offset to the correct sentence with enriched sources', async () => {
    // mapSentencesToSources for the single clicked sentence: 3 queries.
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'ev1', title: 'Src', type: 'evidence_object', excerpt: 'second sentence excerpt' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      // loadSourceContent for the evidence_object source: 1 more query.
      .mockResolvedValueOnce({ rows: [{ content: 'big content with second sentence excerpt inside it' }] });
    aiMapping([
      {
        sentenceIdx: 0,
        sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.8, excerpt: 'second sentence excerpt' }],
      },
    ]);

    // Offset 25 lands inside "Second sentence there." (index 1).
    const result = await resolveClickThrough(content, 25, 1, 2);

    expect(result).not.toBeNull();
    expect(result!.sentence.index).toBe(1);
    expect(result!.sentence.text).toBe('Second sentence there.');
    expect(result!.confidence).toBeCloseTo(0.8);
    expect(result!.sources).toHaveLength(1);
    expect(result!.sources[0].accessUrl).toBe('/api/evidence/v2/ev1');
    expect(result!.sources[0].highlightRange).toEqual({ start: 17, end: 40 });
    // The other sentence in the same paragraph is surfaced as related.
    expect(result!.relatedSentences).toHaveLength(1);
    expect(result!.relatedSentences[0].index).toBe(0);
  });

  it('resolves an offset on the sentence start boundary (inclusive charStart)', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    // No sources -> mapSentencesToSources returns [] -> resolveClickThrough returns null,
    // but it must first have matched the sentence at the exact charStart (offset 0).
    aiMapping([]);
    const result = await resolveClickThrough(content, 0, 1, 2);
    // With zero sources the function returns null, yet the boundary match still
    // means the source lookup ran (3 queries) rather than short-circuiting.
    expect(result).toBeNull();
    expect(queryMock).toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// generateTraceabilityReport — coverage / unsupported-claim math
// ───────────────────────────────────────────────────────────────────────────

describe('generateTraceabilityReport', () => {
  it('computes coverage, average confidence, and unsupported/review buckets', async () => {
    const content = 'Claim one is supported well. Claim two has no source at all here.';
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'ev1', title: 'Src', type: 'evidence_object', excerpt: 'x' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      // storeTraceabilityReport audit-log insert.
      .mockResolvedValueOnce({ rows: [] });
    aiMapping([
      { sentenceIdx: 0, sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.9 }], needsReview: false },
      { sentenceIdx: 1, sources: [] },
    ]);

    const report = await generateTraceabilityReport('doc-1', content, 1, 2);

    expect(report.documentId).toBe('doc-1');
    expect(report.totalSentences).toBe(2);
    expect(report.tracedSentences).toBe(1);
    expect(report.coveragePercent).toBe(50);
    // (0.9 + 0) / 2 = 0.45, rounded to 2 dp.
    expect(report.averageConfidence).toBe(0.45);
    // The unsupported sentence is long enough (>20 chars) to be reported.
    expect(report.unsupportedClaims).toHaveLength(1);
    expect(report.unsupportedClaims[0].sentenceSpan.index).toBe(1);
    // The unsupported, zero-confidence link is also flagged for review.
    expect(report.needsReviewClaims).toHaveLength(1);
    // A full SHA-256 hex digest of the content.
    expect(report.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reports 100% coverage and no unsupported claims when every sentence is traced', async () => {
    const content = 'Alpha claim is fully supported. Beta claim is fully supported too.';
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'ev1', title: 'Src', type: 'evidence_object', excerpt: 'x' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    aiMapping([
      { sentenceIdx: 0, sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.95 }], needsReview: false },
      { sentenceIdx: 1, sources: [{ sourceIdx: 0, linkType: 'supports', confidence: 0.85 }], needsReview: false },
    ]);

    const report = await generateTraceabilityReport('doc-2', content, 1, 2);

    expect(report.coveragePercent).toBe(100);
    expect(report.tracedSentences).toBe(2);
    expect(report.unsupportedClaims).toEqual([]);
    expect(report.needsReviewClaims).toEqual([]);
    expect(report.averageConfidence).toBe(0.9);
  });

  it('reports zero coverage for an empty document', async () => {
    // No sentences -> mapSentencesToSources never loads sources or calls the AI.
    const report = await generateTraceabilityReport('doc-empty', '   ', 1, 2);
    expect(report.totalSentences).toBe(0);
    expect(report.coveragePercent).toBe(0);
    expect(report.averageConfidence).toBe(0);
    expect(report.links).toEqual([]);
    expect(chatMock).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persistTraceLinks — link-strength bucketing + stored/error counts
// ───────────────────────────────────────────────────────────────────────────

describe('persistTraceLinks', () => {
  function linkWithSources(scores: number[]): SentenceTraceLink {
    return {
      id: 'l1',
      sentenceSpan: { index: 0, text: 'claim', charStart: 0, charEnd: 5, paragraphIndex: 0, contentHash: 'h' },
      sources: scores.map((relevanceScore, i) => ({
        sourceId: `s${i}`,
        sourceType: 'evidence_object' as const,
        title: 't',
        excerpt: 'e',
        relevanceScore,
        linkType: 'supports' as const,
        detectionMethod: 'semantic' as const,
        isVerified: false,
      })),
      overallConfidence: scores[0] ?? 0,
      isSupported: true,
      needsReview: false,
      targetContentHash: 'h',
      createdAt: '',
      updatedAt: '',
    };
  }

  it('writes one row per source and buckets relevance into strong/moderate/weak', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    const result = await persistTraceLinks([linkWithSources([0.9, 0.6, 0.4])], 1, 2, 'doc-1');

    expect(result).toEqual({ stored: 3, updated: 0, errors: 0 });
    expect(queryMock).toHaveBeenCalledTimes(3);
    // The 6th positional bind param is the strength bucket.
    const strengths = queryMock.mock.calls.map(call => (call[1] as unknown[])[5]);
    expect(strengths).toEqual(['strong', 'moderate', 'weak']);
  });

  it('counts a failed insert as an error without throwing', async () => {
    queryMock.mockRejectedValue(new Error('invalid input syntax for type uuid'));
    const result = await persistTraceLinks([linkWithSources([0.9])], 1, 2, 'doc-1');
    expect(result).toEqual({ stored: 0, updated: 0, errors: 1 });
  });

  it('persists nothing for a link that has no sources', async () => {
    const result = await persistTraceLinks([linkWithSources([])], 1, 2, 'doc-1');
    expect(result).toEqual({ stored: 0, updated: 0, errors: 0 });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
