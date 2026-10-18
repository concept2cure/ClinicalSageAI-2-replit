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
 *
 * Japanese is written without spaces (priority 3, 2026-10-18;
 * docs/evidence/D2-DRAFT-WINDOW-JAPANESE/). A word boundary is therefore only
 * required between two characters of spaced scripts, and Japanese terms are
 * the Han/Katakana runs between hiragana, plus Han bigrams so a compound
 * matches text that splits it. Deterministic approximation, not morphology.
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

/** Japanese instruction boilerplate, the counterpart of STOP. */
const STOP_JA = new Set(['セクション', 'ドラフト', '草案', '作成', '記載', '記述', '説明', '要約', '概要', '提供', '使用']);

/** Scripts written without spaces between words. */
const UNSPACED = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/u;
const SPACED_CHAR = String.raw`(?![\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}])[\p{L}\p{N}]`;
const RUN_CHAR = String.raw`(?=[\p{L}\p{N}])[\p{scx=Han}\p{scx=Katakana}]`;
/** A spaced-script word of 3+ characters, or a Han/Katakana run of 2+; hiragana separates runs. */
const TERM = new RegExp(String.raw`${SPACED_CHAR}(?:${SPACED_CHAR}|-){2,}|(?:${RUN_CHAR}){2,}`, 'gu');
const HAN_STRETCH = /\p{scx=Han}{3,}/gu;

/** A letter or digit of a script written with spaces between words. */
function spacedWordChar(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch) && !UNSPACED.test(ch);
}

/** A spaced-script neighbour joins the term unless the term's own edge is Japanese. */
function joins(neighbour: string | undefined, edge: string | undefined): boolean {
  return spacedWordChar(neighbour) && !(edge && UNSPACED.test(edge));
}

/** Overlapping two-character pieces of each Han stretch of 3+, by code point. */
function hanBigrams(term: string): string[] {
  const pieces: string[] = [];
  for (const stretch of term.match(HAN_STRETCH) ?? []) {
    const chars = Array.from(stretch);
    for (let i = 0; i + 1 < chars.length; i++) pieces.push(chars[i] + chars[i + 1]);
  }
  return pieces;
}

/** A search term and the whole query term it stands for. A bigram stands for its compound. */
interface Term { text: string; group: number; whole: boolean }

/**
 * The section's terms: spaced-script words of three or more letters or digits
 * and Han/Katakana runs of two or more, lower-cased, stop words out; then the
 * Han bigrams of those runs, after every whole term. At most 40.
 */
function termsOf(query: string | null | undefined): Term[] {
  if (!query) return [];
  const words = [...new Set((query.toLowerCase().match(TERM) ?? []).filter((w) => !STOP.has(w) && !STOP_JA.has(w)))];
  const terms: Term[] = words.map((text, group) => ({ text, group, whole: true }));
  const seen = new Set(words);
  words.forEach((word, group) => {
    for (const text of hanBigrams(word)) {
      if (seen.has(text) || STOP_JA.has(text)) continue;
      seen.add(text);
      terms.push({ text, group, whole: false });
    }
  });
  return terms.slice(0, 40);
}

export function sectionTerms(query: string | null | undefined): string[] {
  return termsOf(query).map((t) => t.text);
}

interface Hit { pos: number; term: number }

/** Lowercase search coordinates must still name characters in the original source. */
function sourceOffsetResolver(text: string, lower: string): (offset: number) => number {
  if (lower.length === text.length) return offset => offset;
  const changes: Array<{ end: number; extra: number }> = [];
  let end = 0;
  let extra = 0;
  for (const character of text) {
    const width = character.toLowerCase().length;
    end += width;
    if (width !== character.length) {
      extra += width - character.length;
      changes.push({ end, extra });
    }
  }
  return offset => {
    let lo = 0;
    let hi = changes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (changes[mid].end <= offset) lo = mid + 1;
      else hi = mid;
    }
    return offset - (lo === 0 ? 0 : changes[lo - 1].extra);
  };
}

/** Every occurrence of every term, as a whole word, in document order. */
function hitsIn(text: string, terms: string[]): Hit[] {
  const lower = text.toLowerCase();
  const sourceOffset = sourceOffsetResolver(text, lower);
  const hits: Hit[] = [];
  terms.forEach((term, i) => {
    const chars = Array.from(term);
    const first = chars[0];
    const last = chars[chars.length - 1];
    for (let pos = lower.indexOf(term); pos >= 0; pos = lower.indexOf(term, pos + term.length)) {
      // A literal search cannot turn an instruction into a regex. Inspect at
      // most one Unicode code point on either side. Japanese has no spaces,
      // so a Japanese neighbour or a Japanese term edge needs no boundary.
      const before = Array.from(lower.slice(Math.max(0, pos - 2), pos)).pop();
      const after = Array.from(lower.slice(pos + term.length, pos + term.length + 2))[0];
      if (!joins(before, first) && !joins(after, last)) {
        hits.push({ pos: sourceOffset(pos), term: i });
      }
    }
  });
  return hits.sort((a, b) => a.pos - b.pos);
}

/** One whole query term's full credit, as an integer so window scores compare exactly. */
const FULL = 1_000_000;

/**
 * Credit per whole query term, so a long compound counts once, like a word:
 * full when the term itself is in the window, otherwise the share of its
 * bigrams that are. For text without bigrams this is FULL × distinct terms.
 */
function termCredit(terms: Term[]) {
  const bigramsIn = new Map<number, number>();
  for (const t of terms) if (!t.whole) bigramsIn.set(t.group, (bigramsIn.get(t.group) ?? 0) + 1);
  const whole = new Map<number, number>();
  const pieces = new Map<number, number>();
  const credit = (group: number) => ((whole.get(group) ?? 0) > 0 ? FULL
    : Math.floor(((pieces.get(group) ?? 0) * FULL) / (bigramsIn.get(group) ?? 1)));
  let score = 0;
  /** A term enters (+1) or leaves (-1) the window: its first copy in, or its last copy out. */
  return {
    change(term: Term, delta: 1 | -1) {
      const before = credit(term.group);
      const counts = term.whole ? whole : pieces;
      counts.set(term.group, (counts.get(term.group) ?? 0) + delta);
      score += credit(term.group) - before;
    },
    get score() { return score; },
  };
}

/**
 * The best run of hits that fits in `size` characters: most term credit, then
 * most distinct terms, then most hits, then earliest.
 */
function bestRun(hits: Hit[], size: number, terms: Term[]): { from: number; to: number } | null {
  let best: { from: number; to: number; score: number; distinct: number; count: number } | null = null;
  const seen = new Map<number, number>();
  const credit = termCredit(terms);
  let lo = 0;
  for (let hi = 0; hi < hits.length; hi++) {
    const added = hits[hi].term;
    seen.set(added, (seen.get(added) ?? 0) + 1);
    if (seen.get(added) === 1) credit.change(terms[added], 1);
    while (hits[hi].pos - hits[lo].pos >= size) {
      const t = hits[lo].term;
      const n = (seen.get(t) ?? 1) - 1;
      if (n === 0) { seen.delete(t); credit.change(terms[t], -1); } else seen.set(t, n);
      lo++;
    }
    const { score } = credit;
    const distinct = seen.size;
    const count = hi - lo + 1;
    if (!best || score > best.score || (score === best.score && (distinct > best.distinct
      || (distinct === best.distinct && count > best.count)))) {
      best = { from: hits[lo].pos, to: hits[hi].pos, score, distinct, count };
    }
  }
  return best ? { from: best.from, to: best.to } : null;
}

const SENTENCE_MARKS = ['. ', '? ', '! ', '。', '！', '？'];

/** The nearest paragraph, then sentence, boundary at or before `pos`, within `reach` characters. */
function boundaryBefore(text: string, pos: number, reach = 600): number {
  const floor = Math.max(0, pos - reach);
  const para = text.lastIndexOf('\n', pos);
  if (para >= floor) return para + 1;
  // A Western stop is followed by a space; a Japanese one is not. The window
  // starts after the whole mark, which must itself lie within reach.
  const sentence = Math.max(...SENTENCE_MARKS.map((mark) => {
    const at = text.lastIndexOf(mark, pos);
    return at >= floor ? at + mark.length : -1;
  }));
  return sentence >= 0 ? sentence : floor;
}

/** The window of `text`, at most `size` characters, that a section with `query` is grounded in. */
export function chooseSourceWindow(text: string, query: string | null | undefined, size: number): SourceWindow {
  const length = text.length;
  const cap = Math.max(0, Math.min(size, length));
  if (cap >= length) return { start: 0, end: length, basis: 'whole' };
  if (cap === 0) return { start: 0, end: 0, basis: 'opening' };
  const terms = termsOf(query);
  const run = bestRun(hitsIn(text, terms.map((t) => t.text)), cap, terms);
  if (!run) return { start: 0, end: cap, basis: 'opening' };
  // Start a little before the first hit, at a boundary, backing up no further
  // than keeps the run's last hit inside the window, and never past the end.
  const slack = Math.max(0, cap - (run.to - run.from) - 200);
  const start = Math.min(boundaryBefore(text, run.from, Math.min(600, slack)), length - cap);
  return { start, end: start + cap, basis: start === 0 ? 'opening' : 'relevant' };
}
