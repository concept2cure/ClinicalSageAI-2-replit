/**
 * Machine attribution — which clauses of a saved text were drafted by a machine
 * author and accepted by a human.
 *
 * ── The defect this closes ────────────────────────────────────────────────────
 * The lineage gate re-derives every clause of the saved content on each write
 * and records each one it cannot tie to a Data Room source as the human
 * actor's `author_assertion` — including the clauses AnA drafted and the human
 * merely accepted. So the Data Origins panel and its PDF said "Asserted by the
 * author" over prose a model produced. The revision ledger knew better at save
 * grain (`origin: 'ai-draft-accept'`); this is the same fact at clause grain.
 *
 * ── How a clause becomes the machine's ────────────────────────────────────────
 * The same way a clause becomes a source's in source-attribution.ts: by
 * verbatim match, on a normalized copy, with the offsets left untouched.
 *
 *   1. NEWLY ACCEPTED TEXT. The editor keeps the text of every insertion the
 *      reviewer accepted from a machine author (suggestions.ts), and the save
 *      carries it in. A clause of the saved content whose normalized text is
 *      inside that accepted text is the machine's, accepted by this save's
 *      actor, now. The match is occurrence-bounded: accepted text containing
 *      one "Not applicable." attributes at most one such clause, so a human's
 *      identical clause elsewhere is not swept up.
 *
 *   2. CARRY-FORWARD. A later save carries no accepted text (the reviewer
 *      accepted nothing), but the machine's clauses are still there. Each live
 *      machine span is matched to a clause with the same text hash — nearest
 *      by offset when the text repeats — and re-recorded at the clause's new
 *      offsets with its ORIGINAL attribution: the machine that drafted it and
 *      the human who accepted it, then. The later saver did not accept it and
 *      is not named as if they had.
 *
 *   3. A WHOLE-CONTENT DRAFT. AnA's own tool writes produce content no human
 *      has seen, let alone accepted. Every clause left is that machine's
 *      `machine_draft` — no asserter at all, because there is none. Who asked
 *      is recorded separately, as createdBy.
 *
 *   A clause that matches none of these is not the machine's: the human who
 *   saved it asserts it, exactly as before. The moment a human edits a machine
 *   clause's words its hash changes, no accepted text contains the new words,
 *   and it becomes theirs — which is the true statement about an edited clause.
 *
 * ── What is compared: the words every reader is shown ─────────────────────────
 * A clause is the machine's only when every reader of the saved content shows
 * the machine's words in it (periodic review 2026-09-28, editor family, the
 * batch-draft accept, rounds 2 to 4). The readers:
 *
 *   - the section editor's canvas: a browser's parser, then the TipTap schema;
 *   - the editor's source mode, a textarea showing every character. It opens
 *     for content holding figure/svg/video/embed/object (opensInSourceMode,
 *     shared/authoring/source-mode.ts) and for content its fidelity gate calls
 *     lossy, which needs the editor's schema and cannot be known here;
 *   - the eCTD leaf and the authoring export: node-html-parser, through
 *     parseSectionHtml, each with its own printing rules;
 *   - content holding no known tag (looksLikeHtml) is plain text to all of
 *     them: every character is shown.
 *
 * The comparison form (comparableText) removes only a tag that a browser and
 * node-html-parser both read, with the same extent, that no reader prints
 * anything for, and whose attributes are the presentational ones the editor
 * writes, with the values it writes (SILENT_ATTRIBUTES): source mode shows
 * those, and none reads as prose. An inline tag joins the text around it and
 * a block tag separates it, as every reader shows them. Anything else stays as
 * written, so a clause holding it matches only text that holds it as written.
 *
 * Three kinds of clause are not compared, and stay the saver's:
 *
 *   - in HTML content, any clause at or after the first place two readers may
 *     read the markup differently (notComparedFrom): a `<` a browser may start
 *     markup at that the strict tag reader below does not accept, a comment,
 *     or an element whose inside a reader drops or reads as text (the raw-text
 *     elements, template, head, svg, math). Where such a thing ends depends on
 *     quoting and context no regex follows, so the whole tail is excluded;
 *   - in HTML content, any clause overlapping an element a reader prints
 *     something for that is not its text, to that element's end: an image, or
 *     a tag carrying alt, title, a footnote, a citation, a cross-reference, a
 *     suggestion's author or a list's start (PRINTED_ATTRIBUTES);
 *   - where a reader shows every character (plain text, source mode), a clause
 *     holding a tag the comparison form removes.
 *
 * The rules apply to newly accepted text and to the carry-forward of an
 * accepted clause, whose words were matched with tags removed and may hold
 * text a later save makes visible (an `<xmp>` put before it). An unaccepted
 * `machine_draft` clause carries forward as before: it was never matched,
 * every character of it is the machine's own write.
 *
 * ── What this deliberately cannot do ──────────────────────────────────────────
 * It cannot attribute words to a machine that are not in the saved content
 * (the needle is the clause, the haystack is the accepted text — a client
 * claiming text that was never saved matches nothing), and it never guesses:
 * no similarity score, no "mostly the machine's". Either the clause is
 * verbatim in what was accepted, or it is not.
 *
 * Pure and deterministic; the gate does the reading and writing.
 *
 * @module server/services/clinical-regulatory-evidence/machine-attribution
 */

import { looksLikeHtml } from '@shared/authoring/plain-text-html';
import { opensInSourceMode } from '@shared/authoring/source-mode';
import type { SentenceSpan } from '../sentenceTraceabilityService';
import { normalizeForMatch } from './source-attribution';
import { hashSpanText, type LiveMachineSpan } from './span-lineage.service';

/** Text a reviewer accepted from a machine author in one editing session. */
export interface AcceptedMachineText {
  /** A MACHINE_AUTHOR_IDS key — validated at the request boundary. */
  authorId: string;
  /** The accepted insertion's text, as the editor had it. */
  text: string;
}

export interface MachineAttributedSpan {
  charStart: number;
  charEnd: number;
  spanText: string;
  machineAuthorId: string;
  /** The human who accepted the words, when one has. Null means nobody has. */
  assertedBy?: string | null;
  /** When they did. Absent means "now" (a fresh acceptance). */
  assertedAt?: Date;
  signatureId?: string | null;
  /** Who asked for the draft, carried forward so a later saver does not
   *  displace the original requester on a span they did not create. */
  createdBy?: string | null;
  /**
   * True when the clause is inside text accepted from a machine author in THIS
   * save: credited by it now, or credited by an earlier save and accepted again
   * (an accept of the same draft twice). A caller that reports what a save
   * accepted counts these, not every machine span the content carries.
   */
  inAcceptedText: boolean;
}

/**
 * Shorter than this and a clause is a fragment ("a)", "No.") that any accepted
 * text of any length is likely to contain by accident. Deliberately far below
 * source-attribution's quote threshold: there, a short match against a long
 * external document is weak evidence of quotation; here, the haystack is
 * exactly what the machine wrote and the human accepted, and a short clause
 * inside it is very probably that clause. The occurrence bound covers the rest.
 */
export const MIN_MACHINE_CLAUSE_CHARS = 8;

/* ── Reading markup as every reader does ───────────────────────────────────── */

/** White space inside a tag as a browser's tokenizer reads it: not JavaScript's `\s`. */
const WS = '[\\t\\n\\f\\r ]';
const ATTRIBUTE_NAME = '[A-Za-z_:][-A-Za-z0-9_:.]*';
/**
 * A quoted value holding no `<` or `>`, or an unquoted one holding nothing a
 * browser and node-html-parser end it at differently. node-html-parser ends a
 * tag at the first `>` outside a quoted value, a browser at the first `>`
 * outside quotes it tracks itself; with no `>` and no `<` inside a value the
 * two cannot differ (refute-review of round 3: D2).
 */
const ATTRIBUTE_VALUE = `(?:"[^"<>]*"|'[^'<>]*'|[^\\t\\n\\f\\r "'<>=\`]+)`;
const ATTRIBUTE = `${ATTRIBUTE_NAME}(?:${WS}*=${WS}*${ATTRIBUTE_VALUE})?`;
/**
 * A start tag both parsers read alike: an ASCII name, then white space, `/`
 * or `>` (a browser's tag name runs to one of those, node-html-parser's to the
 * end of its name characters, so `<b"…">`, `<b/…>`, `<b,…>`, `<i(…)>` and
 * `<u=…>` are a tag to one and text to the other), then strict attributes.
 */
const START_TAG = new RegExp(`<([A-Za-z][A-Za-z0-9]*)((?:${WS}+${ATTRIBUTE})*)${WS}*/?>`, 'y');
const END_TAG = new RegExp(`</([A-Za-z][A-Za-z0-9]*)${WS}*>`, 'y');
const ATTRIBUTES = new RegExp(`(${ATTRIBUTE_NAME})(?:${WS}*=${WS}*(${ATTRIBUTE_VALUE}))?`, 'g');
/** After a `<`, what a browser may start markup at: a letter, `/`, `!` or `?`. */
const MARKUP_START = /[A-Za-z/!?]/;
/**
 * What the leaf's inlineMarksToText reads as a mark and a browser as text:
 * `< sup>`, `< /del>`. One run of white space, then a `/` and a second run:
 * `<\s+\/?\s*` tried every split of a long run between its two runs, which
 * was quadratic (30 s for 100,000 spaces after a `<`).
 */
const LEAF_MARK = /<\s+(?:\/\s*)?(?:sup|del|ins)(?![A-Za-z0-9_])/iy;

interface Tag {
  start: number;
  end: number;
  /** Lower case. */
  name: string;
  closing: boolean;
  /** A start tag's attributes, as written. */
  attributes: string;
}

function readTag(text: string, at: number): Tag | null {
  START_TAG.lastIndex = at;
  const start = START_TAG.exec(text);
  if (start) return { start: at, end: START_TAG.lastIndex, name: start[1].toLowerCase(), closing: false, attributes: start[2] };
  END_TAG.lastIndex = at;
  const end = END_TAG.exec(text);
  return end ? { start: at, end: END_TAG.lastIndex, name: end[1].toLowerCase(), closing: true, attributes: '' } : null;
}

/** Whether a `<` that is no tag readTag accepts may still be read as markup by some reader. */
function readsDifferently(text: string, at: number): boolean {
  if (MARKUP_START.test(text.charAt(at + 1))) return true;
  LEAF_MARK.lastIndex = at;
  return LEAF_MARK.test(text);
}

/**
 * The tags a browser and node-html-parser both read, with the same extent, in
 * order; and the first `<` either may read otherwise (-1 when none). Linear:
 * no pattern above reads past the next `<`, so each `<` is read once.
 */
function scanMarkup(text: string): { tags: Tag[]; differsAt: number } {
  const tags: Tag[] = [];
  let differsAt = -1;
  for (let at = text.indexOf('<'); at !== -1; ) {
    const tag = readTag(text, at);
    if (tag) {
      tags.push(tag);
      at = text.indexOf('<', tag.end);
      continue;
    }
    if (differsAt === -1 && readsDifferently(text, at)) differsAt = at;
    at = text.indexOf('<', at + 1);
  }
  return { tags, differsAt };
}

function attributesOf(tag: Tag): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const m of tag.attributes.matchAll(ATTRIBUTES)) {
    const raw = m[2] ?? '';
    out.push([m[1].toLowerCase(), raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw]);
  }
  return out;
}

/* ── What each tag is to the readers ───────────────────────────────────────── */

/** Tags no reader shows any text for: inside a line, and between blocks. */
const SILENT_INLINE = new Set(['a', 'b', 'code', 'em', 'font', 'i', 'mark', 's', 'span', 'strike', 'strong', 'u']);
const SILENT_BLOCK = new Set([
  'article', 'blockquote', 'br', 'col', 'colgroup', 'dd', 'div', 'dl', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'li', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
/**
 * The attributes the canonical producers write on those tags, with the only
 * values they write: TipTap's text-align (paragraphs, headings, cells), its
 * table widths and cell spans, and the editor's comment anchor
 * (client/src/concept2cure/v2/editor/commentAnchor.ts). plainTextToHtml and
 * the batch-draft card write none. None of these reads as prose, so source
 * mode, which shows them, shows no words (round 4, D4). Any other attribute
 * keeps its tag in the comparison.
 */
const SILENT_ATTRIBUTES = new Map<string, RegExp>([
  ['style', /^(?:text-align: ?(?:left|center|right|justify)|(?:min-)?width: ?\d{1,5}px);?$/],
  ['colspan', /^[1-9]\d{0,2}$/],
  ['rowspan', /^[1-9]\d{0,2}$/],
  ['colwidth', /^\d{1,5}(?:,\d{1,5})*$/],
  ['data-comment-id', /^[A-Za-z0-9_-]{1,64}$/],
  ['class', /^rse-comment-anchor$/],
]);
/**
 * What a reader prints from an element besides its text: the leaf an image's
 * alt (or a label for its kind), the export a footnote, a citation's number
 * and locator, a cross-reference's resolved label (each in place of the
 * element's text) and a suggestion's author and date; the editor a citation's
 * marker; a browser a title, an accessible label, a form value; the leaf a
 * list's numbers from its start (rounds 3 and 4: D5, D6).
 */
const PRINTING_ELEMENTS = new Set(['img', 'image']);
const PRINTED_ATTRIBUTES = new Set([
  'alt', 'title', 'aria-label', 'data-note', 'data-cite', 'data-cite-locator', 'data-xref', 'data-xref-display',
  'data-author-name', 'data-at', 'start', 'value', 'label', 'placeholder',
]);
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'image', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/**
 * Elements whose inside some reader reads as text, drops, or parses as
 * another language. Raw text to a browser: textarea, xmp, plaintext, title,
 * script, style, iframe, noembed, noframes, noscript. Dropped by the leaf
 * while the export prints it: template, head (round 4, D3). Foreign content,
 * with its own case, self-closing and CDATA rules: svg, math.
 */
const REGION_ELEMENTS = new Set([
  'textarea', 'xmp', 'plaintext', 'title', 'script', 'style', 'iframe', 'noembed', 'noframes', 'noscript',
  'template', 'head', 'svg', 'math',
]);

/** `''` for a silent inline tag, `' '` for a silent block tag, null for every other tag. */
function silentAs(tag: Tag): '' | ' ' | null {
  const inline = SILENT_INLINE.has(tag.name);
  if (!inline && !SILENT_BLOCK.has(tag.name)) return null;
  for (const [name, value] of attributesOf(tag)) {
    const allowed = SILENT_ATTRIBUTES.get(name);
    if (!allowed || !allowed.test(value)) return null;
  }
  return inline ? '' : ' ';
}

function prints(tag: Tag): boolean {
  return !tag.closing && (PRINTING_ELEMENTS.has(tag.name) || attributesOf(tag).some(([name]) => PRINTED_ATTRIBUTES.has(name)));
}

/* ── The comparison form ───────────────────────────────────────────────────── */

/** `text` with each tag's characters replaced by `fill(length)`. */
function maskTags(text: string, tags: Tag[], fill: (length: number) => string): string {
  let out = '';
  let from = 0;
  for (const tag of tags) {
    out += text.slice(from, tag.start) + fill(tag.end - tag.start);
    from = tag.end;
  }
  return out + text.slice(from);
}

/** A line of three or more asterisks: a thematic break, shown as a rule. */
const THEMATIC_BREAK = /^[\t ]*\*(?:[\t ]*\*){2,}[\t ]*$/gm;
/** An asterisk that starts a line, then white space: a list item's marker. */
const LIST_MARKER = /^[\t ]*\*(?=[\t ])/gm;
/** A backslash before `*` or `|`: the character itself, shown. */
const ESCAPED = /\\[*|]/g;
/** A run of one to three asterisks before a non-space, and the same run after one: emphasis. */
const EMPHASIS = /(\*{1,3})(?=[^\s*])(?:[^*\n]*?[^\s*])?\1(?!\*)/g;

/** The asterisks a markdown reader hides that are not emphasis, and the backslash of each escape. */
function markdownMarkers(view: string): Set<number> {
  const drop = new Set<number>();
  for (const m of view.matchAll(THEMATIC_BREAK)) {
    for (let i = m.index; i < m.index + m[0].length; i++) if (view[i] === '*') drop.add(i);
  }
  for (const m of view.matchAll(LIST_MARKER)) drop.add(m.index + m[0].length - 1);
  for (const m of view.matchAll(ESCAPED)) drop.add(m.index);
  return drop;
}

/**
 * Paired emphasis delimiters, dropped into `drop`. An escaped asterisk and the
 * markers already dropped are no delimiters; a lone `*` ("5*10") has no pair
 * and stays. Pairs nested in pairs come out a level per round.
 */
function dropEmphasis(view: string, drop: Set<number>): void {
  const chars = view.split('');
  for (let i = 0; i < chars.length; i++) {
    if (drop.has(i) || (view[i] === '*' && view[i - 1] === '\\')) chars[i] = '\u0001';
  }
  for (let round = 0; round < 4; round++) {
    let found = false;
    for (const m of chars.join('').matchAll(EMPHASIS)) {
      found = true;
      const run = m[1].length;
      for (let k = 0; k < run; k++) {
        for (const at of [m.index + k, m.index + m[0].length - run + k]) {
          drop.add(at);
          chars[at] = '\u0001';
        }
      }
    }
    if (!found) return;
  }
}

/**
 * `text` as a markdown reader shows it: emphasis delimiters, list markers and
 * thematic breaks dropped, `\*` and `\|` read as `*` and `|`. Outside tags
 * only. Every `*` used to be dropped, so a record's "5*10 mg/kg" verified a
 * claim of "510 mg/kg", a dose no reader of the record is shown (round 4, D8).
 */
function markdownShown(text: string): string {
  const view = maskTags(text, scanMarkup(text).tags, (n) => '\u0000'.repeat(n));
  const drop = markdownMarkers(view);
  dropEmphasis(view, drop);
  let out = '';
  let from = 0;
  for (const at of [...drop].sort((a, b) => a - b)) {
    out += text.slice(from, at);
    from = at + 1;
  }
  return out + text.slice(from);
}

/**
 * The comparison form of a text: each silent tag (silentAs) removed, inline
 * to nothing and block to a space, every other character kept as written,
 * then normalizeForMatch. Comparison only, never for storage or offsets.
 *
 * The ONE form both sides of machine authorship use: this module, to decide
 * which clauses of a save are the machine's, and the claim verifier
 * (services/authoring/machine-claim-verify.ts), to decide which claimed text a
 * turn record holds. A second copy is how they drifted apart.
 *
 * `markdown` is for text as a model wrote it, which only the turn record's side
 * of the verifier holds (markdownShown). Every text the lineage compares is
 * text as shown, so it never sets it. The verifier reads each record text both
 * ways and a claim only as sent, so a claim holding what the record does not
 * in either reading does not verify.
 */
export function comparableText(text: string, opts: { markdown?: boolean } = {}): string {
  const source = opts.markdown ? markdownShown(text) : text;
  let out = '';
  let from = 0;
  for (const tag of scanMarkup(source).tags) {
    out += source.slice(from, tag.start) + (silentAs(tag) ?? source.slice(tag.start, tag.end));
    from = tag.end;
  }
  return normalizeForMatch(out + source.slice(from));
}

/* ── What is not compared ──────────────────────────────────────────────────── */

function regionFrom(scan: { tags: Tag[]; differsAt: number }): number {
  const opener = scan.tags.find((t) => !t.closing && REGION_ELEMENTS.has(t.name));
  if (!opener) return scan.differsAt;
  return scan.differsAt === -1 ? opener.start : Math.min(opener.start, scan.differsAt);
}

/**
 * Where, in `content`, two readers may first read its markup differently: the
 * offset from which no clause is compared (see "What is compared"), or -1. In
 * content with no known tag every reader shows every character, so there is
 * none: a "<style guide>" in plain text used to drop every clause after it
 * (round 4, C2).
 */
export function notComparedFrom(content: string): number {
  return looksLikeHtml(content) ? regionFrom(scanMarkup(content)) : -1;
}

type Extent = [number, number];

/** A printing element's end tag: closes the innermost open element of its name, and its extent if it prints. */
function closeElement(tag: Tag, depth: Map<string, number>, open: Map<string, Array<{ start: number; depth: number }>>, extents: Extent[]): void {
  const d = depth.get(tag.name) ?? 0;
  if (d === 0) return;
  depth.set(tag.name, d - 1);
  const list = open.get(tag.name);
  const top = list?.[list.length - 1];
  if (list && top && top.depth === d) {
    list.pop();
    extents.push([top.start, tag.end]);
  }
}

/**
 * Each element a reader prints something for besides its text, start tag to
 * its end tag (by nesting depth, so a reader's earlier end is inside it), or
 * to the end of `content` when it has none. Its text can run into later
 * clauses: a cross-reference's label holding a comma, a footnote over two.
 */
function printedExtents(content: string, tags: Tag[], until: number): Extent[] {
  const extents: Extent[] = [];
  const depth = new Map<string, number>();
  const open = new Map<string, Array<{ start: number; depth: number }>>();
  for (const tag of tags) {
    if (tag.start >= until) break;
    if (tag.closing) {
      closeElement(tag, depth, open, extents);
    } else if (VOID_ELEMENTS.has(tag.name)) {
      if (prints(tag)) extents.push([tag.start, tag.end]);
    } else {
      const d = (depth.get(tag.name) ?? 0) + 1;
      depth.set(tag.name, d);
      if (!prints(tag)) continue;
      let list = open.get(tag.name);
      if (!list) open.set(tag.name, (list = []));
      list.push({ start: tag.start, depth: d });
    }
  }
  for (const list of open.values()) for (const o of list) extents.push([o.start, content.length]);
  return extents;
}

/** The ranges of HTML `content` no clause overlapping is compared: sorted, disjoint. */
function notComparedRanges(content: string): Extent[] {
  const scan = scanMarkup(content);
  const region = regionFrom(scan);
  const ranges = printedExtents(content, scan.tags, region === -1 ? content.length : region);
  if (region !== -1) ranges.push([region, content.length]);
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Extent[] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** Whether [start, end) overlaps a range of sorted, disjoint `ranges`. */
function overlaps(ranges: Extent[], start: number, end: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid][0] < end) {
      last = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return last !== -1 && ranges[last][1] > start;
}

/** Whether `text` holds a tag the comparison form removes. */
function holdsRemovedTag(text: string): boolean {
  return scanMarkup(text).tags.some((t) => silentAs(t) !== null);
}

/**
 * For each candidate, whether its shown words can be compared at all (see
 * "What is compared"). False means the clause stays the saver's unless it is an
 * unaccepted machine draft carried forward unchanged.
 */
function comparableClauses(candidates: SentenceSpan[], content: string): boolean[] {
  const html = looksLikeHtml(content);
  const ranges = html ? notComparedRanges(content) : [];
  const everyCharacterShown = !html || opensInSourceMode(content);
  return candidates.map(
    (c) => !overlaps(ranges, c.charStart, c.charEnd) && !(everyCharacterShown && holdsRemovedTag(c.text)),
  );
}

/**
 * `content` with the inside of every tag replaced, length for length, by
 * characters the clause splitter never cuts at. The gate splits this and
 * slices the content at the same offsets (lineage-gate.ts, clauseSpans), so no
 * clause starts or ends inside a tag: a style's ": " cut TipTap's text-align
 * tag in two, and neither half of an honest draft matched (round 4, C2).
 * Plain text comes back as it is: every character of it is shown, a "tag"
 * included.
 */
export function tagsMaskedForSplit(content: string): string {
  if (!looksLikeHtml(content)) return content;
  return maskTags(content, scanMarkup(content).tags, (n) => `<${'x'.repeat(n - 2)}>`);
}

/* ── Attribution ───────────────────────────────────────────────────────────── */

/** Non-overlapping occurrences of `needle` in `haystack`. */
export function occurrencesIn(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let n = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return n;
    n++;
    from = at + needle.length;
  }
}

/** One accepted text, in comparison form. `index` is its place in the save's list. */
interface Haystack {
  index: number;
  authorId: string;
  norm: string;
}

/**
 * Step 2 of attributeMachineSpans: the clauses inside text accepted in this
 * save, occurrence-bounded per (accepted text, clause), and, when the caller
 * knows the records the texts were verified against, by what those hold.
 * Marks each credited clause in `claimed`.
 */
function creditNewlyAccepted(
  candidates: SentenceSpan[],
  haystacks: Haystack[],
  needleOf: (i: number) => string | null,
  claimed: Set<number>,
  opts: { actor: string; recordOccurrences?: (needle: string) => number; reaccepted: Map<string, number> },
): MachineAttributedSpan[] {
  const out: MachineAttributedSpan[] = [];
  const budget = new Map<string, number>();
  const credited = new Map(opts.reaccepted);
  const held = new Map<string, number>();
  /* The same claim sent three times, or overlapping claims, each brought its
     own budget, so a sentence the record holds once was credited three times
     (round 4, DUP). The records' own count bounds them all, the clauses this
     save accepts again by carrying them forward included: a second accept of
     the same draft otherwise credited the repeat the first one left alone. */
  const recordHoldsMore = (needle: string): boolean => {
    if (!opts.recordOccurrences) return true;
    if (!held.has(needle)) held.set(needle, opts.recordOccurrences(needle));
    return (credited.get(needle) ?? 0) < (held.get(needle) ?? 0);
  };
  candidates.forEach((c, i) => {
    if (claimed.has(i)) return;
    const needle = needleOf(i);
    if (needle === null) return;
    for (const h of haystacks) {
      /* Keyed by the ACCEPTED TEXT the count was taken from, not by author
         alone. The count is occurrences(h.norm, needle) — a fact about this
         one accepted insertion — so caching it under a key that names only
         the author makes a zero from one insertion answer for every other.
         A reviewer who accepted two suggestions in one session then had the
         second one's clauses fall through to their own author_assertion:
         the human recorded as asserting prose a machine wrote and they
         merely accepted, which is the statement this module exists to stop.
         Per-insertion is also the honest bound: two accepted insertions that
         each contain the same clause are two clauses a machine wrote and a
         human accepted, and the bound still holds inside each one, which is
         where it was ever doing work. */
      const key = `${h.index} ${h.authorId} ${needle}`;
      let left = budget.get(key);
      if (left === undefined) {
        left = occurrencesIn(h.norm, needle);
        budget.set(key, left);
      }
      if (left <= 0) continue;
      if (!recordHoldsMore(needle)) return;
      budget.set(key, left - 1);
      credited.set(needle, (credited.get(needle) ?? 0) + 1);
      claimed.add(i);
      out.push({
        charStart: c.charStart,
        charEnd: c.charEnd,
        spanText: c.text,
        machineAuthorId: h.authorId,
        assertedBy: opts.actor,
        inAcceptedText: true,
      });
      break;
    }
  });
  return out;
}

/**
 * The machine-attributed spans among `candidates` — the clauses of the saved
 * content not already attributed to a source — given what was accepted in
 * this save and what was already the machine's before it.
 */
export function attributeMachineSpans(
  candidates: SentenceSpan[],
  opts: {
    accepted: AcceptedMachineText[];
    live: LiveMachineSpan[];
    /** This save's actor: the acceptor of any NEWLY accepted clause. */
    actor: string;
    /**
     * Set when the WHOLE content of this save is a machine author's draft that
     * nobody has accepted (AnA's own tool writes). Every clause not already
     * claimed above becomes a `machine_draft` by this author, with no asserter.
     */
    machineDraft?: { authorId: string } | null;
    /**
     * The saved content the candidates' offsets point into. Required: which
     * reader shows what, and where readers may disagree, are facts about the
     * whole content, not about any one clause.
     */
    content: string;
    /**
     * How many times the turn records the accepted texts were verified against
     * hold a clause's comparison form. When given, this save credits no more
     * clauses with that form than that (the batch-draft accept, round 4: DUP).
     * The saves that verify no record omit it.
     */
    recordOccurrences?: (needle: string) => number;
  },
): MachineAttributedSpan[] {
  const out: MachineAttributedSpan[] = [];
  const claimed = new Set<number>();
  const comparable = comparableClauses(candidates, opts.content);

  const byHash = new Map<string, number[]>();
  candidates.forEach((c, i) => {
    const h = hashSpanText(c.text);
    const list = byHash.get(h);
    if (list) list.push(i);
    else byHash.set(h, [i]);
  });

  const haystacks: Haystack[] = opts.accepted
    .filter((a) => typeof a?.authorId === 'string' && a.authorId.length > 0 && typeof a?.text === 'string')
    .map((a, index) => ({ index, authorId: a.authorId, norm: comparableText(a.text) }))
    .filter((h) => h.norm.length > 0);

  /** The clause's comparison form, or null when it is not compared or is too short to be. */
  const needleOf = (i: number): string | null => {
    if (!comparable[i]) return null;
    const needle = comparableText(candidates[i].text);
    return needle.length < MIN_MACHINE_CLAUSE_CHARS ? null : needle;
  };

  /** Clauses carried forward that this save's accepted text holds again, by comparison form. */
  const reaccepted = new Map<string, number>();

  /** Match one live span to the nearest unclaimed clause with the same text. */
  const carryForward = (live: LiveMachineSpan, accepted: boolean): boolean => {
    const open = (byHash.get(live.spanTextSha256) ?? []).filter((i) => !claimed.has(i) && (!accepted || comparable[i]));
    if (open.length === 0) return false;
    const best = open.reduce((a, b) =>
      Math.abs(candidates[b].charStart - live.charStart) < Math.abs(candidates[a].charStart - live.charStart)
        ? b
        : a,
    );
    claimed.add(best);
    const c = candidates[best];
    const needle = accepted ? needleOf(best) : null;
    const inAcceptedText = needle !== null && haystacks.some((h) => h.norm.includes(needle));
    if (inAcceptedText) reaccepted.set(needle, (reaccepted.get(needle) ?? 0) + 1);
    out.push({
      charStart: c.charStart,
      charEnd: c.charEnd,
      spanText: c.text,
      machineAuthorId: live.machineAuthorId,
      assertedBy: live.assertedBy,
      assertedAt: live.assertedAt ?? undefined,
      signatureId: live.signatureId,
      createdBy: live.createdBy,
      inAcceptedText,
    });
    return true;
  };

  const inOffsetOrder = [...opts.live].sort((a, b) => a.charStart - b.charStart);

  // 1. Already ACCEPTED spans carry forward first, so a fresh acceptance in
  //    this same save can never displace the person who accepted them
  //    originally. Acceptance is theirs; it does not transfer on a later save.
  for (const live of inOffsetOrder) {
    if (live.provenanceKind === 'accepted_machine_draft') carryForward(live, true);
  }

  // 2. Newly accepted text, occurrence-bounded per (author, clause text). This
  //    runs BEFORE unaccepted carry-forward on purpose: accepting a clause that
  //    was an unaccepted machine_draft is exactly the transition that turns it
  //    into an accepted one, and it would be missed if the draft had already
  //    claimed the clause.
  if (haystacks.length > 0) {
    const newly = creditNewlyAccepted(candidates, haystacks, needleOf, claimed, {
      actor: opts.actor,
      recordOccurrences: opts.recordOccurrences,
      reaccepted,
    });
    // A loop, not a spread: a long section has more clauses than a call takes arguments.
    for (const span of newly) out.push(span);
  }

  // 3. Still-UNACCEPTED spans carry forward as unaccepted. A human saving the
  //    document is not a human accepting each clause of it, so nothing here
  //    gains an asserter.
  for (const live of inOffsetOrder) {
    if (live.provenanceKind === 'machine_draft') carryForward(live, false);
  }

  // 4. A whole-content machine draft claims everything left. No asserter: the
  //    actor ASKED for this draft, which is recorded as createdBy, and is not
  //    the same claim as having stood behind its words.
  if (opts.machineDraft?.authorId) {
    candidates.forEach((c, i) => {
      if (claimed.has(i)) return;
      claimed.add(i);
      out.push({
        charStart: c.charStart,
        charEnd: c.charEnd,
        spanText: c.text,
        machineAuthorId: opts.machineDraft!.authorId,
        assertedBy: null,
        createdBy: opts.actor,
        inAcceptedText: false,
      });
    });
  }

  out.sort((a, b) => a.charStart - b.charStart || a.charEnd - b.charEnd);
  return out;
}
