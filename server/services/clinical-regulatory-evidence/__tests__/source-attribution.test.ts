/**
 * Automated source attribution — the match rules are the whole risk surface.
 *
 * attributeQuotedSpans() records a citation only where it is a verifiable fact:
 * a span of the generated text whose words appear, in order, inside a retrieved
 * source. These tests pin exactly what counts as verifiable and — just as
 * important — what does not, because the failure mode of an attribution engine
 * is not "misses a quote" but "fabricates one". The central guarantees:
 *
 *   • a span present verbatim (modulo whitespace/case) in a source IS attributed
 *   • a span NOT present is silently left unattributed — never guessed
 *   • returned offsets select exactly the attributed text in the ORIGINAL string
 *   • a coincidental short match is declined by the length floor, on purpose
 */

import { describe, it, expect } from 'vitest';
import {
  attributeQuotedSpans,
  quotedCoverage,
  normalizeForMatch,
  type RetrievedSource,
} from '../source-attribution';

const S1 = 'The primary endpoint was met at week twelve.';
const S2 = 'Adverse events were mild and transient.';
const GENERATED = `${S1} ${S2}`;

describe('attributeQuotedSpans — verified quotes are recorded', () => {
  it('attributes a sentence that appears verbatim in a source', () => {
    const sources: RetrievedSource[] = [
      { sourceId: 101, content: `Executive summary: ${S1} Full results follow.` },
    ];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });

    expect(spans).toHaveLength(1);
    expect(spans[0].sourceId).toBe(101);
    expect(spans[0].usage).toBe('quoted');
    expect(spans[0].spanText).toBe(S1);
  });

  it('leaves a sentence with no matching source unattributed (silence, not a guess)', () => {
    const sources: RetrievedSource[] = [
      { sourceId: 101, content: `Executive summary: ${S1} Full results follow.` },
    ];
    // S2 is nowhere in the source; it must not appear in the output.
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    expect(spans.some((s) => s.spanText === S2)).toBe(false);
  });

  it('attributes different sentences to the different sources that contain them', () => {
    const sources: RetrievedSource[] = [
      { sourceId: 101, content: `Efficacy. ${S1} End.` },
      { sourceId: 202, content: `Safety: ${S2} No SAEs.` },
    ];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });

    const byText = Object.fromEntries(spans.map((s) => [s.spanText, s.sourceId]));
    expect(byText[S1]).toBe(101);
    expect(byText[S2]).toBe(202);
  });
});

describe('attributeQuotedSpans — normalization is honest, not fuzzy', () => {
  it('matches across whitespace reflow (newlines and doubled spaces in the source)', () => {
    const reflowed = 'The primary endpoint\n   was met at week twelve.';
    expect(normalizeForMatch(reflowed)).toBe('the primary endpoint was met at week twelve.');

    const spans = attributeQuotedSpans(GENERATED, [{ sourceId: 5, content: `A: ${reflowed} B` }], {
      granularity: 'sentence',
    });
    expect(spans.map((s) => s.spanText)).toContain(S1);
  });

  it('matches across case (a phrase capitalized at sentence start vs mid-source)', () => {
    const cased = 'see appendix: the PRIMARY endpoint was met at week twelve. ok';
    const spans = attributeQuotedSpans(GENERATED, [{ sourceId: 7, content: cased }], {
      granularity: 'sentence',
    });
    expect(spans.map((s) => s.spanText)).toContain(S1);
  });

  it('does NOT match on mere similarity — a changed word breaks the quote', () => {
    // "week ten" vs "week twelve": one word different is not a quote.
    const near = 'The primary endpoint was met at week ten. Details omitted.';
    const spans = attributeQuotedSpans(GENERATED, [{ sourceId: 9, content: near }], {
      granularity: 'sentence',
    });
    expect(spans).toHaveLength(0);
  });
});

describe('attributeQuotedSpans — the length floor declines coincidental short matches', () => {
  const shortGen = 'It was significant.';
  const src: RetrievedSource[] = [{ sourceId: 1, content: 'The result: It was significant. p<0.05.' }];

  it('declines a span below minQuoteChars even though it is present', () => {
    // Present in the source, but 19 normalized chars < default floor of 24.
    expect(attributeQuotedSpans(shortGen, src, { granularity: 'sentence' })).toHaveLength(0);
  });

  it('records it once the floor is lowered', () => {
    const spans = attributeQuotedSpans(shortGen, src, { granularity: 'sentence', minQuoteChars: 5 });
    expect(spans).toHaveLength(1);
    expect(spans[0].sourceId).toBe(1);
  });
});

describe('attributeQuotedSpans — multi-source behavior', () => {
  const sources: RetrievedSource[] = [
    { sourceId: 11, content: `Doc one. ${S1} tail` },
    { sourceId: 22, content: `Doc two. ${S1} tail` },
  ];

  it('records the span against every source containing it by default', () => {
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    const forS1 = spans.filter((s) => s.spanText === S1).map((s) => s.sourceId).sort((a, b) => a - b);
    expect(forS1).toEqual([11, 22]);
  });

  it('records only the first matching source when multiSource is false', () => {
    const spans = attributeQuotedSpans(GENERATED, sources, {
      granularity: 'sentence',
      multiSource: false,
    });
    const forS1 = spans.filter((s) => s.spanText === S1);
    expect(forS1).toHaveLength(1);
    expect(forS1[0].sourceId).toBe(11);
  });
});

describe('attributeQuotedSpans — the offset invariant', () => {
  it('every returned span selects exactly its text in the original generated string', () => {
    const sources: RetrievedSource[] = [
      { sourceId: 101, content: `x ${S1} y` },
      { sourceId: 202, content: `z ${S2} w` },
    ];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    expect(spans.length).toBeGreaterThan(0);
    for (const s of spans) {
      expect(GENERATED.slice(s.charStart, s.charEnd)).toBe(s.spanText);
    }
  });

  it('returns spans in document order, then ascending sourceId', () => {
    const sources: RetrievedSource[] = [
      { sourceId: 202, content: `${S2}` },
      { sourceId: 101, content: `${S1}` },
      { sourceId: 303, content: `${S1}` },
    ];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    // S1 spans come first (earlier in the document), and within S1 sourceId ascends.
    expect(spans.map((s) => ({ t: s.spanText, id: s.sourceId }))).toEqual([
      { t: S1, id: 101 },
      { t: S1, id: 303 },
      { t: S2, id: 202 },
    ]);
  });
});

describe('attributeQuotedSpans — defensive input handling', () => {
  it('returns [] for empty generated text', () => {
    expect(attributeQuotedSpans('', [{ sourceId: 1, content: S1 }])).toEqual([]);
  });
  it('returns [] when there are no sources', () => {
    expect(attributeQuotedSpans(GENERATED, [])).toEqual([]);
  });
  it('drops sources with empty or non-string content and invalid ids without throwing', () => {
    const spans = attributeQuotedSpans(GENERATED, [
      { sourceId: 0, content: S1 }, // invalid id
      { sourceId: -3, content: S1 }, // invalid id
      { sourceId: 5, content: '' }, // empty content
      // @ts-expect-error deliberately wrong type at runtime boundary
      { sourceId: 6, content: null },
      { sourceId: 101, content: `ok ${S1} ok` }, // the only valid, matching source
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0].sourceId).toBe(101);
  });
});

describe('quotedCoverage — how much traces to a source', () => {
  it('is 0 when nothing is attributed', () => {
    expect(quotedCoverage(GENERATED, [])).toBe(0);
  });

  it('is between 0 and 100 when only part of the text is quoted', () => {
    const sources: RetrievedSource[] = [{ sourceId: 101, content: `only ${S1} here` }];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    const cov = quotedCoverage(GENERATED, spans);
    expect(cov).toBeGreaterThan(0);
    expect(cov).toBeLessThan(100);
  });

  it('is 100 when every sentence is quoted', () => {
    const sources: RetrievedSource[] = [{ sourceId: 101, content: `${S1} ${S2}` }];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    expect(quotedCoverage(GENERATED, spans)).toBe(100);
  });

  it('does not exceed 100 when multiple sources cover the same span', () => {
    const sources: RetrievedSource[] = [
      { sourceId: 11, content: `${S1} ${S2}` },
      { sourceId: 22, content: `${S1} ${S2}` },
    ];
    const spans = attributeQuotedSpans(GENERATED, sources, { granularity: 'sentence' });
    expect(quotedCoverage(GENERATED, spans)).toBe(100);
  });
});
