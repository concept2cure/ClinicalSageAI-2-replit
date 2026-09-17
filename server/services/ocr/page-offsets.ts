/**
 * Where each page begins in an extracted document's text — established, never
 * guessed.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * A passage citation is only worth something if it says WHERE in the document
 * the sentence came from. The vault chunker records `char_start`/`char_end`
 * into the extracted text, which is exact but unquotable to a human: nobody can
 * check "characters 12,400–14,100" against a PDF. What they can check is a page.
 *
 * The extractors already have the material. `pdf-parse` returns a per-page
 * array beside its combined text, and the OCR path builds its text by joining
 * per-page recognitions. What nobody had is the mapping from a character offset
 * in the combined text back to the page it came from.
 *
 * ── Why alignment rather than arithmetic ────────────────────────────────────
 * The obvious approach — assume the combined text is the pages joined by a
 * known separator and add up lengths — is wrong the moment an extractor trims,
 * normalizes whitespace, or drops an empty page. It would not fail loudly; it
 * would return page numbers that are quietly off by one for the rest of the
 * document, which is worse than no page at all: a wrong citation is a claim,
 * and this product cannot make claims it has not checked.
 *
 * So each page's text is LOCATED in the combined text, in order, starting from
 * where the previous page ended. If every page is found, the mapping is exact
 * by construction whatever the extractor did in between. If any page is not
 * found, the whole map is discarded and the caller gets null — no page numbers,
 * which is honest, rather than a plausible sequence that is wrong.
 *
 * @module server/services/ocr/page-offsets
 */

/** One page's half-open span `[start, end)` in the combined extracted text. */
export interface PageSpan {
  page: number;
  start: number;
  end: number;
}

/** A page as an extractor reports it: its number and the text it contributed. */
export interface ExtractedPage {
  page: number;
  text: string;
}

/**
 * Map each page onto its span in `text`, or return null if any page cannot be
 * located in order.
 *
 * Empty pages (a blank scan, a page of pure imagery with no text layer) carry
 * no text to find. They are given a zero-width span at the current cursor
 * rather than dropped, so the page numbering stays true: page 7 of the file is
 * page 7 here even when page 6 was blank.
 */
export function alignPageSpans(text: string, pages: ExtractedPage[]): PageSpan[] | null {
  if (!text || !Array.isArray(pages) || pages.length === 0) return null;
  const spans: PageSpan[] = [];
  let cursor = 0;
  for (const p of pages) {
    const body = (p.text ?? '').trim();
    if (body.length === 0) {
      spans.push({ page: p.page, start: cursor, end: cursor });
      continue;
    }
    const at = text.indexOf(body, cursor);
    if (at === -1) {
      // One page unfound means every page after it is suspect. Refuse the map.
      return null;
    }
    spans.push({ page: p.page, start: at, end: at + body.length });
    cursor = at + body.length;
  }
  return spans;
}

/**
 * The page a character offset falls on, or null when it falls outside every
 * page's span (the gap between two pages, or past the end).
 *
 * A chunk starting in the whitespace between pages is attributed to the page it
 * runs INTO — it is about to quote that page's first words — which is why the
 * search is for the first span ending after the offset rather than the one
 * containing it.
 */
export function pageForOffset(spans: PageSpan[] | null | undefined, offset: number): number | null {
  if (!spans || spans.length === 0 || !Number.isFinite(offset)) return null;
  for (const s of spans) {
    if (offset < s.end || (s.start === s.end && offset <= s.start)) return s.page;
  }
  // Past the last page's text: attribute to the last page rather than nothing.
  return spans[spans.length - 1].page;
}
