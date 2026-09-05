/**
 * Document catalog — the pure core: span arithmetic, read coverage, the
 * catalog-write gate, and extraction-outcome honesty. No DB, no mocks.
 *
 * The gate tests are written failure-first on purpose: the whole reason the
 * gate exists is the "read one page, claim the document" behavior, so the
 * refusal cases are the cases that prove it works.
 */
import { describe, it, expect } from 'vitest';
import {
  mergeSpans,
  computeCoverage,
  assertCatalogWriteAllowed,
  buildExtractionOutcome,
  type Span,
} from '../document-catalog.service';

const spans = (...pairs: Array<[number, number]>): Span[] =>
  pairs.map(([start, end]) => ({ start, end }));

describe('mergeSpans', () => {
  it('unions touching and overlapping spans into one', () => {
    expect(mergeSpans(spans([0, 30], [30, 55], [50, 80]), 100)).toEqual(spans([0, 80]));
  });

  it('clamps to [0, charCount] and drops spans that vanish', () => {
    expect(mergeSpans(spans([-10, 5], [90, 900], [200, 300]), 100)).toEqual(
      spans([0, 5], [90, 100])
    );
  });

  it('keeps genuinely disjoint spans apart', () => {
    expect(mergeSpans(spans([10, 20], [40, 50]), 100)).toEqual(spans([10, 20], [40, 50]));
  });
});

describe('computeCoverage', () => {
  it('reports exact gaps between reads, in order', () => {
    const c = computeCoverage(spans([0, 100], [250, 400]), 500);
    expect(c.coveredChars).toBe(250);
    expect(c.uncovered).toEqual(spans([100, 250], [400, 500]));
    expect(c.complete).toBe(false);
  });

  it('is complete only at exact full coverage — 99.9% is not "reviewed"', () => {
    const almostAll = computeCoverage(spans([0, 999]), 1000);
    expect(almostAll.complete).toBe(false);
    expect(almostAll.uncovered).toEqual(spans([999, 1000]));

    const all = computeCoverage(spans([0, 400], [400, 1000]), 1000);
    expect(all.complete).toBe(true);
    expect(all.uncovered).toEqual([]);
  });

  it('double-reading does not inflate coverage', () => {
    const c = computeCoverage(spans([0, 300], [0, 300], [100, 200]), 1000);
    expect(c.coveredChars).toBe(300);
  });

  it('a document with no text can never be "completely read"', () => {
    const c = computeCoverage([], 0);
    expect(c.complete).toBe(false);
    expect(c.coveredChars).toBe(0);
  });
});

describe('assertCatalogWriteAllowed — the sampling gate', () => {
  it('REFUSES a first-page-only read and names the exact unread ranges', () => {
    // The observed failure mode this feature exists to stop: grab one window,
    // declare the document reviewed.
    const verdict = assertCatalogWriteAllowed(computeCoverage(spans([0, 30000]), 120000));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('30000 of 120000');
    expect(verdict.reason).toContain('30000–120000');
    expect(verdict.coverage.uncovered).toEqual(spans([30000, 120000]));
  });

  it('REFUSES a middle gap even when both ends were read', () => {
    const verdict = assertCatalogWriteAllowed(
      computeCoverage(spans([0, 50000], [70000, 120000]), 120000)
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('50000–70000');
  });

  it('REFUSES a document whose extraction produced nothing', () => {
    const verdict = assertCatalogWriteAllowed(computeCoverage([], 0));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/no extracted text/i);
  });

  it('allows the write only once every character has been served', () => {
    const verdict = assertCatalogWriteAllowed(
      computeCoverage(spans([0, 30000], [30000, 90000], [90000, 120000]), 120000)
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBeNull();
  });
});

describe('buildExtractionOutcome — honesty about extraction', () => {
  it('an empty result is a FAILURE with a reason, never "extracted, 0 chars"', () => {
    const o = buildExtractionOutcome({ text: '   ', method: 'pdf-text' });
    expect(o.status).toBe('extraction_failed');
    expect(o.error).toMatch(/produced no text/);
    expect(o.charCount).toBe(0);
  });

  it('a file type nothing could extract says exactly that', () => {
    const o = buildExtractionOutcome({ text: null, method: 'none' });
    expect(o.status).toBe('extraction_failed');
    expect(o.error).toMatch(/no extraction method/i);
  });

  it('a thrown extraction error is carried, not swallowed', () => {
    const o = buildExtractionOutcome({ text: null, method: 'none', error: 'clamd exploded' });
    expect(o.status).toBe('extraction_failed');
    expect(o.error).toBe('clamd exploded');
  });

  it('real text is recorded with its method, confidence and counts', () => {
    const o = buildExtractionOutcome({ text: 'alpha beta gamma', method: 'pdf-ocr', confidence: 87.5 });
    expect(o).toMatchObject({
      status: 'extracted',
      method: 'pdf-ocr',
      confidence: 87.5,
      error: null,
      charCount: 16,
      wordCount: 3,
    });
  });
});
