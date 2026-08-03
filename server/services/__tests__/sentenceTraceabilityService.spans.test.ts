/**
 * @fileoverview Sub-sentence span detection — offsets must be exact.
 *
 * Every downstream use of a span is keyed on its character offsets: the
 * click-through resolves a reader's cursor position, the lineage row records
 * [charStart, charEnd), and staleness compares a hash of the text those offsets
 * select. An offset that is off by one produces lineage that points at the
 * wrong words while looking entirely healthy — so the central assertion here is
 * not "the split looks sensible" but the invariant
 *
 *     content.slice(span.charStart, span.charEnd) === span.text
 *
 * checked over every span of every fixture, at every granularity. The prose
 * fixtures are deliberately the awkward ones: decimals, abbreviations,
 * p-values and parentheses are what regulatory text is actually made of, and
 * they are where naive splitting silently drifts.
 */

import { describe, it, expect } from 'vitest';
import {
  detectSentences,
  detectSpans,
  resolveSpanAt,
  type SpanGranularity,
} from '../sentenceTraceabilityService';

const FIXTURES: Record<string, string> = {
  simple: 'The primary endpoint was met. The secondary endpoint was not.',

  // The case clause granularity exists for: a sourced fact and an author's
  // judgement inside one sentence.
  factAndJudgement:
    'The primary endpoint was met (p<0.001), which we consider clinically meaningful.',

  abbreviations:
    'Dr. Smith reported the result. The mean was 3.14 mg/dL vs. baseline. See Sec. 2.3 for details.',

  multiParagraph:
    'First paragraph sentence one. Sentence two follows.\n\nSecond paragraph begins here, and it continues.',

  listy: '1. First item was observed. 2. Second item was not observed.',

  conjunctions:
    'Exposure was comparable across arms, but the responder rate differed, and the difference was significant.',
};

const GRANULARITIES: SpanGranularity[] = ['sentence', 'clause', 'word'];

describe('detectSpans — the offset invariant', () => {
  for (const [name, content] of Object.entries(FIXTURES)) {
    for (const granularity of GRANULARITIES) {
      it(`${name} @ ${granularity}: every span's offsets select exactly its text`, () => {
        const spans = detectSpans(content, granularity);
        expect(spans.length).toBeGreaterThan(0);
        for (const s of spans) {
          expect(content.slice(s.charStart, s.charEnd)).toBe(s.text);
        }
      });

      it(`${name} @ ${granularity}: spans are ordered and never overlap`, () => {
        const spans = detectSpans(content, granularity);
        for (let i = 1; i < spans.length; i++) {
          // Overlapping spans would let one character have two different
          // provenances with no way to say which governs.
          expect(spans[i].charStart).toBeGreaterThanOrEqual(spans[i - 1].charEnd);
        }
      });

      it(`${name} @ ${granularity}: index is sequential across the document`, () => {
        const spans = detectSpans(content, granularity);
        expect(spans.map(s => s.index)).toEqual(spans.map((_, i) => i));
      });
    }
  }
});

describe('detectSpans — granularity actually differs', () => {
  it('clause splits a sourced fact from the judgement attached to it', () => {
    const spans = detectSpans(FIXTURES.factAndJudgement, 'clause');
    expect(spans).toHaveLength(2);
    expect(spans[0].text).toBe('The primary endpoint was met (p<0.001),');
    // The comma is the first boundary, so the relative pronoun introducing the
    // second clause stays with it. That is the better reading: "which we
    // consider clinically meaningful" is the assertion, and dropping "which"
    // would leave a fragment that no longer says what it is about.
    expect(spans[1].text).toBe('which we consider clinically meaningful.');
    // The point: these two can now carry different provenance. Attributing the
    // whole sentence to the CSR would put its name behind the opinion.
  });

  it('splits on coordinating conjunctions as well as punctuation', () => {
    const spans = detectSpans(FIXTURES.conjunctions, 'clause');
    expect(spans.length).toBeGreaterThan(2);
    expect(spans.every(s => s.text.length > 0)).toBe(true);
  });

  it('word granularity is finer than clause, which is finer than sentence', () => {
    const c = FIXTURES.conjunctions;
    const sentences = detectSpans(c, 'sentence').length;
    const clauses = detectSpans(c, 'clause').length;
    const words = detectSpans(c, 'word').length;
    expect(clauses).toBeGreaterThan(sentences);
    expect(words).toBeGreaterThan(clauses);
  });

  it('sentence granularity agrees with detectSentences', () => {
    for (const content of Object.values(FIXTURES)) {
      expect(detectSpans(content, 'sentence').map(s => s.text)).toEqual(
        detectSentences(content).map(s => s.text),
      );
    }
  });

  it('defaults to clause', () => {
    expect(detectSpans(FIXTURES.factAndJudgement)).toEqual(
      detectSpans(FIXTURES.factAndJudgement, 'clause'),
    );
  });
});

describe('detectSpans — regulatory text edge cases survive subdivision', () => {
  it('does not split inside a decimal or an abbreviation', () => {
    const spans = detectSpans(FIXTURES.abbreviations, 'clause');
    const joined = spans.map(s => s.text).join(' ');
    // If a decimal were split, "3.14" would appear as "3." and "14".
    expect(joined).toContain('3.14');
    expect(joined).toContain('Dr.');
    expect(joined).toContain('Sec. 2.3');
  });

  it('keeps paragraph attribution through subdivision', () => {
    const spans = detectSpans(FIXTURES.multiParagraph, 'clause');
    expect(new Set(spans.map(s => s.paragraphIndex)).size).toBeGreaterThan(1);
  });

  it('hashes each sub-span on its own text, not the parent sentence', () => {
    const spans = detectSpans(FIXTURES.factAndJudgement, 'clause');
    expect(spans[0].contentHash).not.toBe(spans[1].contentHash);
  });
});

describe('detectSpans — degenerate input', () => {
  it('returns nothing for empty or whitespace-only content', () => {
    for (const granularity of GRANULARITIES) {
      expect(detectSpans('', granularity)).toEqual([]);
      expect(detectSpans('   \n\n  ', granularity)).toEqual([]);
    }
  });

  it('handles a single word with no terminator', () => {
    const spans = detectSpans('Observed', 'clause');
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe('Observed');
    expect(spans[0].charStart).toBe(0);
    expect(spans[0].charEnd).toBe(8);
  });
});

describe('detectSpans — hostile input stays linear', () => {
  it('does not degrade on a long whitespace run that never reaches a conjunction', () => {
    // Document content is attacker-influenced: anyone who can paste into a
    // section controls this string. An unbounded `\s+(?:and|but|…)\s+` backtracks
    // polynomially here and burns the request thread (CodeQL: polynomial regular
    // expression on uncontrolled data). Bounded quantifiers keep it linear.
    const hostile = `Start${'\t'.repeat(40_000)}end.`;

    const began = Date.now();
    const spans = detectSpans(hostile, 'clause');
    const elapsed = Date.now() - began;

    expect(spans.length).toBeGreaterThan(0);
    // Generous: the polynomial form takes many seconds on this input, the
    // bounded form single-digit milliseconds. The margin is for slow CI, not
    // for a regression to hide in.
    expect(elapsed).toBeLessThan(2_000);
  });

  it('still returns exact offsets for that input', () => {
    // Whatever the splitter does under stress, it must not lie about position.
    const hostile = `Start${'\t'.repeat(5_000)}end.`;
    for (const s of detectSpans(hostile, 'clause')) {
      expect(hostile.slice(s.charStart, s.charEnd)).toBe(s.text);
    }
  });
});

describe('resolveSpanAt — answering word-level questions from clause-level rows', () => {
  const content = FIXTURES.factAndJudgement;
  const spans = detectSpans(content, 'clause');

  it('resolves any offset inside a span to that span', () => {
    // This is what makes clause-grained storage sufficient for a per-word UI:
    // every character of a covered span resolves to the statement governing it.
    for (const s of spans) {
      for (const offset of [s.charStart, Math.floor((s.charStart + s.charEnd) / 2), s.charEnd - 1]) {
        expect(resolveSpanAt(spans, offset)).toEqual(s);
      }
    }
  });

  it('resolves every character of every word in a covered span', () => {
    const words = detectSpans(content, 'word');
    for (const w of words) {
      const covering = resolveSpanAt(spans, w.charStart);
      // A word may fall in the gap consumed by a clause separator; when it is
      // covered, the covering span must actually contain it.
      if (covering) {
        expect(w.charStart).toBeGreaterThanOrEqual(covering.charStart);
        expect(w.charStart).toBeLessThan(covering.charEnd);
      }
    }
  });

  it('returns null outside any span — text with no lineage', () => {
    expect(resolveSpanAt(spans, -1)).toBeNull();
    expect(resolveSpanAt(spans, content.length + 50)).toBeNull();
  });

  it('is exclusive at the upper bound, so adjacent spans never both match', () => {
    const first = spans[0];
    expect(resolveSpanAt(spans, first.charEnd - 1)).toEqual(first);
    const atBoundary = resolveSpanAt(spans, first.charEnd);
    expect(atBoundary === null || atBoundary.charStart >= first.charEnd).toBe(true);
  });
});
