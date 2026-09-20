/**
 * Page alignment — exact, or absent. Never approximate.
 *
 * The failure this guards against is the tempting one: assume the combined text
 * is the pages joined by a separator, add up the lengths, and hand back page
 * numbers. That is right until an extractor trims, re-wraps whitespace, or
 * drops a blank page — and then it is silently off by one for the rest of the
 * document. A citation that names the wrong page is worse than one that names
 * none, because it reads as checked.
 */
import { describe, expect, it } from 'vitest';
import { alignPageSpans, pageForOffset } from '../page-offsets';

const joined = (pages: string[]) => pages.join('\n\n').trim();

describe('alignPageSpans', () => {
  it('maps pages joined by a separator, and the spans point at the real text', () => {
    const pages = ['First page body.', 'Second page body.', 'Third page body.'];
    const text = joined(pages);
    const spans = alignPageSpans(
      text,
      pages.map((t, i) => ({ page: i + 1, text: t })),
    );
    expect(spans).not.toBeNull();
    expect(spans).toHaveLength(3);
    for (const s of spans!) {
      expect(text.slice(s.start, s.end)).toBe(pages[s.page - 1]);
    }
  });

  it('survives a leading trim, which is where naive arithmetic goes wrong', () => {
    // ocrPdfToText does pages.join('\n\n').trim(): every offset computed by
    // summing page lengths is shifted by the leading whitespace it removed.
    const pages = ['   Leading blanks here.', 'Second.'];
    const text = pages.join('\n\n').trim();
    const spans = alignPageSpans(text, pages.map((t, i) => ({ page: i + 1, text: t })))!;
    expect(spans[0].start).toBe(0);
    expect(text.slice(spans[1].start, spans[1].end)).toBe('Second.');
  });

  it('keeps the page numbering true across a blank page', () => {
    const spans = alignPageSpans('Alpha\n\nGamma', [
      { page: 1, text: 'Alpha' },
      { page: 2, text: '   ' },
      { page: 3, text: 'Gamma' },
    ])!;
    expect(spans.map(s => s.page)).toEqual([1, 2, 3]);
    // The blank page is zero-width, so nothing is attributed to it, but page 3
    // is still page 3 rather than being renumbered as page 2.
    expect(spans[1].start).toBe(spans[1].end);
    expect(spans[2].page).toBe(3);
  });

  it('honours the page numbers the extractor reports, not the array index', () => {
    // A ranged extraction (firstPage/lastPage) reports pages 5..6; citing them
    // as 1..2 would point a reviewer at the wrong part of the file.
    const spans = alignPageSpans('Fifth.\n\nSixth.', [
      { page: 5, text: 'Fifth.' },
      { page: 6, text: 'Sixth.' },
    ])!;
    expect(spans.map(s => s.page)).toEqual([5, 6]);
  });

  it('REFUSES the whole map when one page cannot be located', () => {
    // The load-bearing case. A page the combined text does not contain means
    // the two came from different extractions, and every later offset is
    // guesswork. Null, not a best effort.
    expect(
      alignPageSpans('Alpha\n\nBeta', [
        { page: 1, text: 'Alpha' },
        { page: 2, text: 'A page that is not in the text at all' },
        { page: 3, text: 'Beta' },
      ]),
    ).toBeNull();
  });

  it('refuses out-of-order pages rather than re-finding an earlier one', () => {
    // Searching from the cursor is what makes this exact: a page whose text
    // repeats earlier in the document must not rewind the mapping.
    expect(
      alignPageSpans('Alpha\n\nBeta', [
        { page: 1, text: 'Beta' },
        { page: 2, text: 'Alpha' },
      ]),
    ).toBeNull();
  });

  it('returns null for empty input rather than an empty map that reads as success', () => {
    expect(alignPageSpans('', [{ page: 1, text: 'x' }])).toBeNull();
    expect(alignPageSpans('text', [])).toBeNull();
  });
});

describe('pageForOffset', () => {
  const pages = ['First page body.', 'Second page body.', 'Third page body.'];
  const text = joined(pages);
  const spans = alignPageSpans(text, pages.map((t, i) => ({ page: i + 1, text: t })))!;

  it('finds the page a chunk starts on', () => {
    expect(pageForOffset(spans, 0)).toBe(1);
    expect(pageForOffset(spans, text.indexOf('Second'))).toBe(2);
    expect(pageForOffset(spans, text.indexOf('Third') + 3)).toBe(3);
  });

  it('attributes a chunk starting between pages to the page it runs into', () => {
    // The separator belongs to neither page; the chunk is about to quote the
    // next one, so that is the honest attribution.
    const between = spans[0].end; // first character after page 1's text
    expect(pageForOffset(spans, between)).toBe(2);
  });

  it('attributes an offset past the end to the last page, not to nothing', () => {
    expect(pageForOffset(spans, text.length + 500)).toBe(3);
  });

  it('is null without a map — no map means no page, not page 1', () => {
    expect(pageForOffset(null, 10)).toBeNull();
    expect(pageForOffset([], 10)).toBeNull();
  });
});
