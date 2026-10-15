/**
 * Which part of a cited document a drafted section is grounded in (D2, Data
 * Room catalog S5d, 2026-10-15;
 * docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * The drafting engine is given at most 12,000 characters of each cited
 * document (48,000 across them). Those were always the FIRST 12,000: a CSR's
 * title page, synopsis and table of contents. A section on the primary
 * efficacy result or the adverse-event summary was drafted from front matter,
 * and the figures it needed stood 200 pages further in, unread.
 *
 * Now the window is the contiguous stretch of the document's text that holds
 * the most of the section's own terms (its type and instructions): the most
 * distinct terms, then the most occurrences, starting at the nearest
 * paragraph or sentence boundary before its first hit. Deterministic and
 * keyless, like the passage search (S1). With no term, or no term in the
 * document, the window is the opening, as before, and says so. The window is
 * a contiguous span with its own start, so the read receipt, the save's
 * verification and every figure's offset name exactly the characters served.
 */

export interface SourceWindow {
  start: number;
  end: number;
  /** 'relevant': chosen by the section's terms; 'opening': no term to choose by, or none in the document. */
  basis: 'relevant' | 'opening' | 'whole';
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'are', 'was', 'were', 'has', 'have', 'its', 'their',
  'section', 'draft', 'write', 'include', 'including', 'based', 'using', 'per', 'all', 'any', 'each', 'other', 'also',
  'should', 'must', 'will', 'shall', 'not', 'our', 'your', 'provide', 'describe', 'summary', 'summarize',
]);

/** The section's terms: words of three or more letters or digits, lower-cased, stop words out. */
export function sectionTerms(query: string | null | undefined): string[] {
  if (!query) return [];
  const words = query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))].slice(0, 40);
}

interface Hit { pos: number; term: number }

/** Every occurrence of every term, as a whole word, in document order. */
function hitsIn(text: string, terms: string[]): Hit[] {
  const lower = text.toLowerCase();
  const hits: Hit[] = [];
  terms.forEach((term, i) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of lower.matchAll(re)) hits.push({ pos: m.index ?? 0, term: i });
  });
  return hits.sort((a, b) => a.pos - b.pos);
}

/** The best run of hits that fits in `size` characters: most distinct terms, then most hits, then earliest. */
function bestRun(hits: Hit[], size: number): { from: number; to: number } | null {
  let best: { from: number; to: number; distinct: number; count: number } | null = null;
  const seen = new Map<number, number>();
  let lo = 0;
  for (let hi = 0; hi < hits.length; hi++) {
    seen.set(hits[hi].term, (seen.get(hits[hi].term) ?? 0) + 1);
    while (hits[hi].pos - hits[lo].pos >= size) {
      const t = hits[lo].term;
      const n = (seen.get(t) ?? 1) - 1;
      if (n === 0) seen.delete(t); else seen.set(t, n);
      lo++;
    }
    const distinct = seen.size;
    const count = hi - lo + 1;
    if (!best || distinct > best.distinct || (distinct === best.distinct && count > best.count)) {
      best = { from: hits[lo].pos, to: hits[hi].pos, distinct, count };
    }
  }
  return best ? { from: best.from, to: best.to } : null;
}

/** The nearest paragraph, then sentence, boundary at or before `pos`, within `reach` characters. */
function boundaryBefore(text: string, pos: number, reach = 600): number {
  const floor = Math.max(0, pos - reach);
  const para = text.lastIndexOf('\n', pos);
  if (para >= floor) return para + 1;
  const sentence = Math.max(text.lastIndexOf('. ', pos), text.lastIndexOf('? ', pos), text.lastIndexOf('! ', pos));
  if (sentence >= floor) return sentence + 2;
  return floor;
}

/** The window of `text`, at most `size` characters, that a section with `query` is grounded in. */
export function chooseSourceWindow(text: string, query: string | null | undefined, size: number): SourceWindow {
  const length = text.length;
  const cap = Math.max(0, Math.min(size, length));
  if (cap >= length) return { start: 0, end: length, basis: 'whole' };
  const run = bestRun(hitsIn(text, sectionTerms(query)), cap);
  if (!run) return { start: 0, end: cap, basis: 'opening' };
  // Start a little before the first hit, at a boundary, backing up no further
  // than keeps the run's last hit inside the window, and never past the end.
  const slack = Math.max(0, cap - (run.to - run.from) - 200);
  const start = Math.min(boundaryBefore(text, run.from, Math.min(600, slack)), length - cap);
  return { start, end: start + cap, basis: start === 0 ? 'opening' : 'relevant' };
}
