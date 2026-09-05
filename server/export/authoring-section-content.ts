/**
 * Section content → export blocks, for the authoring document exports.
 *
 * `authoring_sections.content` is an opaque string holding three generations
 * of canvas output: textarea-era plain text, execCommand-era innerHTML, and
 * the canonical editor's clean HTML — which can carry `<ins>`/`<del>`
 * suggestion marks (real track changes) and comment-anchor spans.
 *
 * Before this existed, the DOCX branch wrote the raw string into a Word
 * paragraph (HTML tags rendered literally in a filed document) and the PDF
 * branch escaped it (same tags, as visible text). Both were fine while the
 * only canvas was a textarea and both became wrong the day content held
 * markup.
 *
 * This module parses the stored string ONCE into typed blocks of attributed
 * inline runs, and both branches render from it:
 *   - formatting maps: b/strong, i/em, u, s/strike;
 *   - suggestion marks survive AS REDLINE — a pending insertion exports
 *     underlined, a pending deletion struck through, because an unresolved
 *     suggestion is part of the record's human-readable form and silently
 *     settling it either way at export time would fabricate a decision nobody
 *     made. Callers can count pending suggestions and say so in the export.
 *   - unknown/annotation markup (comment-anchor spans, legacy divs) keeps its
 *     TEXT and drops its dressing — words are never lost, structure may
 *     normalize.
 *
 * TABLES ARE A BLOCK KIND, NOT FLATTENED TEXT. They used to be: `td`/`th` were
 * joined with tabs into an ordinary paragraph, so the substantial-equivalence
 * comparison that IS the 510(k) argument, and every Module 3 specification and
 * stability table, left the platform as tab-separated prose. The text survived
 * and the structure did not, which in a filed document is a different document.
 * A `table` block carries its rows, its header flags, its spans and its
 * caption, and both render branches emit a real table from it.
 *
 * Ordered and unordered lists are also distinguished here. They were not, so a
 * numbered procedure — the form most test methods and instructions-for-use take
 * — exported as bullets and silently lost its step numbers.
 *
 * CITATIONS carry THE SOURCE'S ID and not the number printed at the claim.
 * "[3]" is a rendering of where a source currently sits in this document's
 * reference list; the number is assigned in reading order at render time by a
 * document-scoped registry, and the reference list is assembled from the
 * citations actually used. See @shared/authoring/citations.
 *
 * CAPTIONS carry THE OBJECT'S IDENTITY AND ITS WORDS, never its number. A
 * table and a figure are numbered objects in a CTD document — "Table 3",
 * "Figure 1" — and the ordinal is a rendering of where the object currently
 * sits, assigned in reading order at render time by a document-scoped counter
 * and counted separately for the two kinds. See @shared/authoring/captions.
 *
 * CROSS-REFERENCES carry the TARGET SECTION'S ID and not its printed number.
 * The run's `text` is the editor's cache and is not what either renderer
 * prints: both resolve the id against the document's sections at render time,
 * so renumbering a section fixes every reference to it without any referring
 * section's stored content changing. See @shared/authoring/cross-references.
 */

import { parse, HTMLElement, TextNode, Node } from 'node-html-parser';
import {
  CROSS_REF_TARGET_ATTR,
  CROSS_REF_DISPLAY_ATTR,
  normalizeCrossReferenceDisplay,
  type CrossReferenceDisplay,
} from '@shared/authoring/cross-references';
import {
  CITATION_SOURCE_ATTR,
  CITATION_LOCATOR_ATTR,
} from '@shared/authoring/citations';
import {
  CAPTION_ID_ATTR,
  captionCrossReferenceTargets,
  numberCaptions,
  type CaptionKind,
  type CaptionNumbering,
  type CaptionedObject,
  type NumberedCaption,
} from '@shared/authoring/captions';
import type { CrossReferenceTarget } from '@shared/authoring/cross-references';

export interface InlineRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** cm², t½ — CTD text is full of these (BP-W1-1). */
  superScript?: boolean;
  subScript?: boolean;
  /** Present when this run is an unresolved tracked change. */
  suggestion?: 'insertion' | 'deletion';
  /** Who made it, and when — from the mark's data-author-name / data-at.
   *  Carried so the DOCX export can emit a REAL Word revision (w:ins / w:del),
   *  which Word will only attribute and let a reviewer accept or reject if it
   *  has an author and a date. Without these the export can do no better than
   *  colour the text. */
  suggestionAuthor?: string;
  suggestionAt?: string;
  /** The note text, when this run is a footnote REFERENCE.
   *
   *  Regulatory tables are built on footnotes — every Module 3 specification,
   *  batch-analysis and stability table carries them ("a Determined by HPLC;
   *  b n=3; ITT population"), and so does every efficacy summary. The editor
   *  had no footnote of any kind, so the only way to write one was a superscript
   *  letter and a loose paragraph underneath, which detaches the moment the
   *  table moves.
   *
   *  The note travels WITH its reference rather than in a separate list, so a
   *  cut-and-paste of the row carries its own note and cannot orphan it. The
   *  marker a reader sees is derived at render time from position, so notes
   *  renumber themselves when content moves. */
  footnote?: string;
  /** Present when this run is a CROSS-REFERENCE to another section.
   *
   *  `crossRefTarget` is the target section's ID — never its printed number.
   *  "2.7.4.2" is a rendering of where a section currently sits; storing it is
   *  precisely the bug this closes, because a renumber then leaves every
   *  reference silently wrong with no way to find them but by eye.
   *
   *  `text` on this run is the editor's CACHED rendering and both renderers
   *  ignore it: they resolve the target through the export's section directory
   *  and print what it says now. That is why renumbering a section corrects
   *  every reference to it without one byte of the referring sections'
   *  stored content changing. */
  crossRefTarget?: string;
  /** How much of the target to print — see CrossReferenceDisplay. */
  crossRefDisplay?: CrossReferenceDisplay;
  /** Present when this run is a CITATION of a source.
   *
   *  `citationSourceId` is the source's identity in the platform's canonical
   *  source registry — never the number printed at the claim. "[3]" describes
   *  where that source currently sits in this document's reference list, and a
   *  citation inserted earlier moves it. Both renderers ask a document-scoped
   *  registry for the number (see @shared/authoring/citations) and IGNORE this
   *  run's `text`, which is the editor's cache of the source's NAME.
   *
   *  `citationLocator` is the author's pinpoint within the source — "p. 42",
   *  "Table 3". It is authored content, not a derived value: no renderer can
   *  recompute it, so it is stored and printed inside the marker. */
  citationSourceId?: string;
  citationLocator?: string;
}

export interface TableCell {
  runs: InlineRun[];
  /** A `th`, or a cell inside `thead`. Rendered as a header cell. */
  header?: boolean;
  colSpan?: number;
  rowSpan?: number;
  /** Figures inside the cell, in document order.
   *
   *  A cell is not always text. A subject-versus-predicate comparison puts the
   *  subject device's photograph beside the predicate's; a Module 3 method
   *  table puts a chromatogram in the results column. `<img>` is void, so the
   *  run walker below visited zero children and the figure contributed
   *  NOTHING — and a table whose cells held only figures then had no text at
   *  all, so the emptiness filter deleted THE ENTIRE TABLE from the export.
   *  Silently: no placeholder, no warning, a filed document simply missing the
   *  comparison the submission turns on. */
  images?: { src: string; alt?: string }[];
}

export interface ContentBlock {
  kind: 'paragraph' | 'heading' | 'list-item' | 'table' | 'image';
  /** Heading level 1–5 (headings only), relative to the section title.
   *
   *  Was 1–3, and the parser clamped with `Math.min(3, …)`. CTD sections nest
   *  deeper than that — 2.7.3.1.2 is five levels — so an H4 a writer had
   *  legitimately stored came back as an H3 and the document's structure was
   *  quietly flattened. The round-trip fidelity gate could not catch it either:
   *  it compares TEXT, and a heading demoted from H4 to H3 keeps every
   *  character. The words survived; the hierarchy did not, and hierarchy is
   *  what a reviewer navigates a submission by. */
  level?: 1 | 2 | 3 | 4 | 5;
  /** List items only: true when the item came from an `ol`. */
  ordered?: boolean;
  /** List items only: 0-based nesting depth. 0 is a top-level item, 1 is an
   *  item inside a nested list, and so on.
   *
   *  THE PARSER USED TO DROP THIS, AND DROPPING IT CHANGED WHAT THE DOCUMENT
   *  SAID. The parser tracked only the innermost list TYPE, so every item of
   *
   *      1. Prepare the sample
   *         a. Weigh 5.0 mg
   *         b. Dissolve in 10 mL diluent
   *      2. Inject 20 µL
   *
   *  came out as a flat sequence of top-level ordered items, and the renderers
   *  — which restart nothing, because they were never told a level changed —
   *  numbered them 1, 2, 3, 4. The filed procedure's "step 2" is
   *  "Weigh 5.0 mg". The author's "step 2" is "Inject 20 µL".
   *
   *  That is not a lost indent. Every character survives, so the round-trip
   *  fidelity gate — which compares text — passes it, and a deviation
   *  investigation, a validation protocol or an IFU that cites "step 2" now
   *  cites a different instruction in the copy the agency reads than in the
   *  copy the author wrote. Numbered procedures are the form most test
   *  methods and instructions-for-use take.
   *
   *  Absent means 0; every consumer clamps, so an out-of-range depth from
   *  pathological markup cannot produce an invalid list level. */
  depth?: number;
  /**
   * Inline content. Always present so every consumer can iterate it
   * unconditionally; empty for a `table` (text lives in `rows`) and for an
   * `image` (a figure has no runs).
   */
  runs: InlineRun[];
  /** Tables only: rows of cells, in document order. */
  rows?: TableCell[][];
  /** Tables only: the `caption` text, when the author gave one.
   *
   *  The WORDS only. A caption never carries its number in stored content —
   *  "Table 3" is a rendering of where this table currently sits, derived at
   *  render time by a document-scoped counter. See @shared/authoring/captions. */
  caption?: string;
  /** Images only: the stored reference (`/api/authoring/images/<id>`, a data
   *  URI, or a foreign URL) and the author's alt text.
   *
   *  For a standalone figure the alt text IS the caption — it is the string
   *  both renderers already print in the caption position, and giving a figure
   *  a second, parallel caption field would be two stores for one sentence. */
  src?: string;
  alt?: string;
  /** Tables and images: `data-caption-id`, the object's stable identity.
   *
   *  Present only so a CROSS-REFERENCE can point at this table or figure — it
   *  is never printed and it is never the number. Absent on content written
   *  before captions had an identity, which still numbers and prints correctly
   *  and simply cannot be referenced. */
  captionId?: string;
}

/** How deep a list may nest before the renderers clamp. Five ranks is the
 *  standard outline depth and deeper than any real procedure; the clamp exists
 *  so pathological stored markup cannot ask for a rank a renderer has no
 *  format for — which Word renders as an unnumbered paragraph, silently
 *  costing a step its identifier.
 *
 *  It lives here, beside `depth`, because it constrains the BLOCK MODEL: both
 *  renderers clamp to it and must clamp identically, and the alternative —
 *  the HTML renderer importing it from the DOCX one — makes the PDF path
 *  depend on the Word path for a rule that belongs to neither. */
export const MAX_LIST_DEPTH = 4;

/** Every run in a block, including the ones inside a table's cells. */
export function blockRuns(b: ContentBlock): InlineRun[] {
  if (b.kind !== 'table') return b.runs;
  const out: InlineRun[] = [];
  for (const row of b.rows ?? []) for (const cell of row) out.push(...cell.runs);
  return out;
}

/** Same detection the client's round-trip gate uses (roundTrip.ts — keep the
 * two in agreement). Known tags only: prose can legitimately contain
 * tag-shaped tokens (`temperature <critical> threshold`), and any-tag
 * detection routed such text through an HTML parse that swallowed the token.
 *
 * "Keep the two in agreement" was a comment and nothing else, and they drifted:
 * `dl`/`dt`/`dd`/`caption` were in neither, so a glossary section was ESCAPED
 * into the record by the editor (see roundTrip.ts for that failure in full) and
 * would have been read as plain text here too — one paragraph per line, tags
 * and all, in the exported DOCX and PDF. A section whose own tags are prose on
 * screen and prose in the filing is the same document being wrong twice.
 *
 * The agreement is now asserted: `roundTripFidelity.test.ts` compares the two
 * lists and fails if either gains a tag the other lacks. */
const KNOWN_HTML_TAG =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|dl|dt|dd|b|strong|i|em|u|s|strike|ins|del|span|table|caption|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article|figure|figcaption)\b[^>]*>/i;
export function contentLooksLikeHtml(stored: string): boolean {
  return KNOWN_HTML_TAG.test(stored);
}

interface InlineState {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  suggestion?: 'insertion' | 'deletion';
  suggestionAuthor?: string;
  suggestionAt?: string;
  footnote?: string;
  crossRefTarget?: string;
  crossRefDisplay?: CrossReferenceDisplay;
  citationSourceId?: string;
  citationLocator?: string;
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'blockquote', 'pre']);

function pushRun(runs: InlineRun[], text: string, st: InlineState): void {
  if (!text) return;
  const prev = runs[runs.length - 1];
  if (
    prev &&
    !!prev.bold === !!st.bold &&
    !!prev.italics === !!st.italics &&
    !!prev.underline === !!st.underline &&
    !!prev.strike === !!st.strike &&
    !!prev.superScript === !!st.superScript &&
    !!prev.subScript === !!st.subScript &&
    prev.suggestion === st.suggestion &&
    prev.suggestionAuthor === st.suggestionAuthor &&
    prev.suggestionAt === st.suggestionAt &&
    prev.footnote === st.footnote &&
    /* Two references to DIFFERENT sections must never merge into one run —
       the second target would be silently discarded and the filed document
       would carry one reference where the author wrote two. */
    prev.crossRefTarget === st.crossRefTarget &&
    prev.crossRefDisplay === st.crossRefDisplay &&
    /* Two citations of DIFFERENT sources must never merge into one run — the
       second source would be silently discarded and the filed document would
       carry one citation, and one reference-list entry, where the author cited
       two. A different locator is a different citation of the same source
       ("p. 42" and "p. 96" are not interchangeable), so it separates runs too. */
    prev.citationSourceId === st.citationSourceId &&
    prev.citationLocator === st.citationLocator
  ) {
    prev.text += text;
    return;
  }
  runs.push({
    text,
    ...(st.bold ? { bold: true } : {}),
    ...(st.italics ? { italics: true } : {}),
    ...(st.underline ? { underline: true } : {}),
    ...(st.strike ? { strike: true } : {}),
    ...(st.superScript ? { superScript: true } : {}),
    ...(st.subScript ? { subScript: true } : {}),
    ...(st.suggestion ? { suggestion: st.suggestion } : {}),
    ...(st.suggestionAuthor ? { suggestionAuthor: st.suggestionAuthor } : {}),
    ...(st.suggestionAt ? { suggestionAt: st.suggestionAt } : {}),
    ...(st.footnote ? { footnote: st.footnote } : {}),
    ...(st.crossRefTarget ? { crossRefTarget: st.crossRefTarget } : {}),
    ...(st.crossRefTarget && st.crossRefDisplay ? { crossRefDisplay: st.crossRefDisplay } : {}),
    ...(st.citationSourceId ? { citationSourceId: st.citationSourceId } : {}),
    ...(st.citationSourceId && st.citationLocator ? { citationLocator: st.citationLocator } : {}),
  });
}

/**
 * A cross-reference or a citation whose cached text is empty still contributes
 * a run.
 *
 * `pushRun` drops empty text, and correctly so for every other run kind. But
 * both of these are RESOLVED at render time — the stored text is only a cache —
 * so an empty one is something the author wrote, not whitespace. Dropping it
 * here would delete it from the filed document in silence, which is the one
 * outcome neither feature may ever produce.
 *
 * Shared by both because the rule is one rule: an element whose printed form
 * comes from a directory rather than from its own text survives an empty cache.
 */
function pushEmptyResolvedRef(runs: InlineRun[], st: InlineState): void {
  if (st.crossRefTarget) {
    runs.push({
      text: '',
      crossRefTarget: st.crossRefTarget,
      ...(st.crossRefDisplay ? { crossRefDisplay: st.crossRefDisplay } : {}),
    });
    return;
  }
  if (st.citationSourceId) {
    runs.push({
      text: '',
      citationSourceId: st.citationSourceId,
      ...(st.citationLocator ? { citationLocator: st.citationLocator } : {}),
    });
  }
}

/** Inline tags that carry attribution; shared by the block walk and cells.
 *
 * `el` is threaded in so `<ins>` / `<del>` can keep their data-author-name and
 * data-at. The editor's suggestion marks have always written both
 * (v2/editor/suggestions.ts); this parser dropped them, so by the time the DOCX
 * renderer saw a tracked change all it knew was the KIND. That is why redlines
 * exported as coloured text rather than as Word revisions. */
function applyMark(tag: string, st: InlineState, el?: { getAttribute(name: string): string | null | undefined }): InlineState {
  const next: InlineState = { ...st };
  if (tag === 'b' || tag === 'strong') next.bold = true;
  if (tag === 'i' || tag === 'em') next.italics = true;
  if (tag === 'u') next.underline = true;
  if (tag === 's' || tag === 'strike') next.strike = true;
  if (tag === 'sup') {
    next.superScript = true;
    /* A footnote reference is a `sup` carrying its note. Anything else in a
       `sup` is ordinary superscript (cm², t½) and stays that way. */
    const note = el?.getAttribute('data-note');
    if (note) next.footnote = note;
  }
  if (tag === 'sub') next.subScript = true;
  /* An `a` carrying the target attribute is a cross-reference, and one carrying
     the source attribute is a citation. Any other anchor is an ordinary link
     and keeps its text unchanged, as before. */
  if (tag === 'a') {
    const target = el?.getAttribute(CROSS_REF_TARGET_ATTR);
    if (target && target.trim()) {
      next.crossRefTarget = target.trim();
      next.crossRefDisplay = normalizeCrossReferenceDisplay(
        el?.getAttribute(CROSS_REF_DISPLAY_ATTR),
      );
    }
    const cited = el?.getAttribute(CITATION_SOURCE_ATTR);
    if (cited && cited.trim()) {
      next.citationSourceId = cited.trim();
      const locator = (el?.getAttribute(CITATION_LOCATOR_ATTR) ?? '').trim();
      if (locator) next.citationLocator = locator;
    }
  }
  if (tag === 'ins' || tag === 'del') {
    if (tag === 'ins') {
      next.underline = true;
      next.suggestion = 'insertion';
    } else {
      next.strike = true;
      next.suggestion = 'deletion';
    }
    const who = el?.getAttribute('data-author-name');
    const when = el?.getAttribute('data-at');
    if (who) next.suggestionAuthor = who;
    if (when) next.suggestionAt = when;
  }
  return next;
}

/**
 * Flatten one cell to attributed runs. A cell legitimately holds block content
 * — the canonical editor wraps every cell's text in a `p` — so block children
 * are joined with a space rather than becoming separate blocks; the cell is the
 * structural unit here, and its internal paragraphing is not load-bearing.
 */
function cellContentOf(
  node: HTMLElement,
  st: InlineState,
): { runs: InlineRun[]; images: { src: string; alt?: string }[] } {
  const runs: InlineRun[] = [];
  const images: { src: string; alt?: string }[] = [];
  const visit = (n: Node, state: InlineState): void => {
    if (n instanceof TextNode) {
      const text = n.text.replace(/\s+/g, ' ');
      if (text.trim() || text === ' ') pushRun(runs, text, state);
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    const tag = (n.rawTagName || '').toLowerCase();
    if (tag === 'br') {
      pushRun(runs, ' ', state);
      return;
    }
    if (tag === 'img') {
      /* Void element: the recursion below would visit zero children and the
         figure would leave no trace at all. See TableCell.images. */
      const src = (n.getAttribute('src') ?? '').trim();
      if (src) {
        const alt = (n.getAttribute('alt') ?? '').trim();
        images.push({ src, ...(alt ? { alt } : {}) });
      }
      return;
    }
    const isBlock = BLOCK_TAGS.has(tag) || tag === 'ol' || tag === 'ul';
    if (isBlock && runs.length) pushRun(runs, ' ', state);
    const inner = applyMark(tag, state, n);
    if (tag === 'a' && (inner.crossRefTarget || inner.citationSourceId) && !n.text) {
      pushEmptyResolvedRef(runs, inner);
      return;
    }
    for (const child of n.childNodes) visit(child, inner);
  };
  for (const child of node.childNodes) visit(child, st);
  return { runs: trimRuns(runs), images };
}

/** Trim the outer whitespace of a run list and drop the runs left empty. */
function trimRuns(runs: InlineRun[]): InlineRun[] {
  return runs
    .map((r, i, arr) => ({
      ...r,
      text: (i === 0 ? r.text.replace(/^\s+/, '') : r.text).replace(
        i === arr.length - 1 ? /\s+$/ : /$^/,
        '',
      ),
    }))
    // A reference or a citation is kept whatever its cached text says — see
    // pushEmptyResolvedRef.
    .filter((r) => r.text.length > 0 || Boolean(r.crossRefTarget) || Boolean(r.citationSourceId));
}

/**
 * A `table` element → a table block. Rows are read from `thead`/`tbody`/`tfoot`
 * or directly from the element, in document order; a cell is a header when it
 * is a `th` or sits inside `thead`. `colspan`/`rowspan` are carried so a merged
 * heading — routine in a subject-versus-predicate comparison — is not silently
 * unmerged into the wrong columns. Returns null for a table with no cells,
 * which would otherwise export as an empty frame.
 */
function parseTable(node: HTMLElement, st: InlineState): ContentBlock | null {
  const caption = node.querySelector('caption')?.text?.replace(/\s+/g, ' ').trim() || undefined;
  /* The object's identity, so a cross-reference can point at this table. Never
     its number, which is positional and computed at render time. */
  const captionId = (node.getAttribute(CAPTION_ID_ATTR) ?? '').trim() || undefined;
  const rows: TableCell[][] = [];

  const readRow = (tr: HTMLElement, inHead: boolean): void => {
    const cells: TableCell[] = [];
    for (const child of tr.childNodes) {
      if (!(child instanceof HTMLElement)) continue;
      const tag = (child.rawTagName || '').toLowerCase();
      if (tag !== 'td' && tag !== 'th') continue;
      const span = (name: string): number | undefined => {
        const raw = Number(child.getAttribute(name));
        return Number.isFinite(raw) && raw > 1 ? Math.floor(raw) : undefined;
      };
      const colSpan = span('colspan');
      const rowSpan = span('rowspan');
      const { runs, images } = cellContentOf(child, st);
      cells.push({
        runs,
        ...(tag === 'th' || inHead ? { header: true } : {}),
        ...(colSpan ? { colSpan } : {}),
        ...(rowSpan ? { rowSpan } : {}),
        ...(images.length ? { images } : {}),
      });
    }
    if (cells.length) rows.push(cells);
  };

  const scan = (parent: HTMLElement, inHead: boolean): void => {
    for (const child of parent.childNodes) {
      if (!(child instanceof HTMLElement)) continue;
      const tag = (child.rawTagName || '').toLowerCase();
      if (tag === 'tr') readRow(child, inHead);
      else if (tag === 'thead') scan(child, true);
      else if (tag === 'tbody' || tag === 'tfoot') scan(child, false);
    }
  };
  scan(node, false);

  if (!rows.length) return null;
  return {
    kind: 'table',
    runs: [],
    rows,
    ...(caption ? { caption } : {}),
    ...(captionId ? { captionId } : {}),
  };
}

function parseHtmlToBlocks(html: string): ContentBlock[] {
  const root = parse(html);
  const blocks: ContentBlock[] = [];
  let current: ContentBlock | null = null;

  const ensureBlock = (kind: ContentBlock['kind'] = 'paragraph', level?: 1 | 2 | 3 | 4 | 5): ContentBlock => {
    if (!current) {
      current = { kind, ...(level ? { level } : {}), runs: [] };
      blocks.push(current);
    }
    return current;
  };
  const closeBlock = () => {
    current = null;
  };

  /* The open list ancestry, innermost last: `true` for an `ol`, `false` for a
     `ul`. This was a single `listOrdered: boolean | null` — the innermost TYPE
     with no notion of how deep it sat — which is why every item of a nested
     procedure exported as a top-level item and was renumbered. See
     `ContentBlock.depth`. */
  const listStack: boolean[] = [];

  const walk = (node: Node, st: InlineState): void => {
    if (node instanceof TextNode) {
      // Collapse the formatting whitespace of serialized HTML, keep real text.
      const text = node.text.replace(/\s+/g, ' ');
      if (text.trim() || text === ' ') pushRun(ensureBlock().runs, text, st);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = (node.rawTagName || '').toLowerCase();

    if (tag === 'script' || tag === 'style') {
      // Their text is not document prose — but per the round-trip gate's
      // philosophy it must not vanish silently either: keep it as plain text.
      pushRun(ensureBlock().runs, node.text, st);
      return;
    }
    if (tag === 'br') {
      // A hard break inside a paragraph becomes a block boundary in export.
      closeBlock();
      return;
    }

    const nextState: InlineState = applyMark(tag, st, node as unknown as { getAttribute(n: string): string | null | undefined });

    if (tag === 'ol' || tag === 'ul') {
      closeBlock();
      listStack.push(tag === 'ol');
      for (const child of node.childNodes) walk(child, nextState);
      listStack.pop();
      closeBlock();
      return;
    }

    if (tag === 'table') {
      closeBlock();
      const block = parseTable(node, nextState);
      if (block) blocks.push(block);
      return;
    }

    if (tag === 'img') {
      /* An <img> is void — the generic recursion below visits zero children,
         so before this branch existed the figure contributed nothing and the
         whitespace filter at the bottom then deleted it from every DOCX and
         PDF export, silently. A filed document missing a figure the editor
         shows is the exact fabrication this parser exists to prevent. */
      const src = (node.getAttribute('src') ?? '').trim();
      if (src) {
        closeBlock();
        const alt = (node.getAttribute('alt') ?? '').trim();
        const captionId = (node.getAttribute(CAPTION_ID_ATTR) ?? '').trim();
        blocks.push({
          kind: 'image',
          runs: [],
          src,
          ...(alt ? { alt } : {}),
          ...(captionId ? { captionId } : {}),
        });
      }
      return;
    }

    if (BLOCK_TAGS.has(tag)) {
      closeBlock();
      const heading = /^h([1-6])$/.exec(tag);
      if (heading) {
        const level = Math.min(5, Number(heading[1])) as 1 | 2 | 3 | 4 | 5;
        current = { kind: 'heading', level, runs: [] };
        blocks.push(current);
      } else if (tag === 'li') {
        /* An `li` with no list ancestor is malformed stored markup; it keeps
           the old behaviour — an unordered item at depth 0 — rather than
           being dropped. */
        const depth = Math.max(0, listStack.length - 1);
        current = {
          kind: 'list-item',
          ...(listStack[depth] ? { ordered: true } : {}),
          ...(depth ? { depth } : {}),
          runs: [],
        };
        blocks.push(current);
      }
      for (const child of node.childNodes) walk(child, nextState);
      closeBlock();
      return;
    }

    if (tag === 'a' && (nextState.crossRefTarget || nextState.citationSourceId) && !node.text) {
      pushEmptyResolvedRef(ensureBlock().runs, nextState);
      return;
    }

    /* A `td`/`th` reaching here is outside any `table` (malformed stored
       markup). Keep the old tab join so its words still survive. */
    if (tag === 'td' || tag === 'th') {
      if (current && current.runs.length) pushRun(current.runs, '\t', st);
      for (const child of node.childNodes) walk(child, nextState);
      return;
    }

    for (const child of node.childNodes) walk(child, nextState);
  };

  for (const child of root.childNodes) walk(child, {});
  closeBlock();

  /* Drop blocks that are only whitespace, trim run edges per block.
     An image block is textless BY KIND — testing it for text would delete
     every figure here, which is the defect the img branch above closed.
     A TABLE IS TEXTLESS BY KIND TOO, and this filter did test it: it ran
     `blockRuns` over the cells, so a table whose cells hold only figures —
     the subject/predicate photographs of a substantial-equivalence
     comparison — had no text anywhere and the WHOLE TABLE was deleted from
     the export, with no placeholder and no warning. `parseTable` already
     returns null for a table with no cells, which is the real emptiness
     test and the only one this needs. */
  return blocks
    .map((b) => (b.kind === 'table' || b.kind === 'image' ? b : { ...b, runs: trimRuns(b.runs) }))
    .filter(
      (b) =>
        b.kind === 'image' ||
        b.kind === 'table' ||
        blockRuns(b).some((r) => r.text.trim().length > 0) ||
        /* A block whose only content is a cross-reference or a citation has no
           text of its own — both are RESOLVED at render time. Testing it for
           text here would delete them from the filed document, which is the
           silent-vanish neither feature may ever do. */
        blockRuns(b).some((r) => r.crossRefTarget || r.citationSourceId),
    );
}

/** Parse a stored section content string into export blocks. */
export function sectionContentToBlocks(stored: string | null | undefined): ContentBlock[] {
  const s = stored ?? '';
  if (!s.trim()) return [];
  if (!contentLooksLikeHtml(s)) {
    // Textarea-era plain text: paragraphs on blank lines, one block per line.
    return s
      .replace(/\r\n/g, '\n')
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ kind: 'paragraph' as const, runs: [{ text: line }] }));
  }
  return parseHtmlToBlocks(s);
}

/**
 * The captioned object a block is, or null when it is not one.
 *
 * ONE predicate, used by the collector that builds the cross-reference
 * directory and by BOTH renderers. That is deliberate: the directory pass and
 * the render pass walk the same blocks in the same order and must agree
 * object-for-object, or a reference would print "Table 3" while the caption
 * printed "Table 4" — a plausible-looking wrong number, which is the one
 * outcome this whole design exists to prevent.
 *
 * What it encodes, in one place:
 *   - a TABLE's caption is its `<caption>`; a FIGURE's is its alt text, which
 *     is the string both renderers already print in the caption position;
 *   - no caption text, no number (see @shared/authoring/captions);
 *   - a figure INSIDE a table cell is not a numbered object. It is part of the
 *     table it sits in — the subject device's photograph in a comparison row —
 *     and it has no caption position of its own to print "Figure 4" in.
 */
export function blockCaption(b: ContentBlock): CaptionedObject | null {
  const kind: CaptionKind | null =
    b.kind === 'table' ? 'table' : b.kind === 'image' ? 'figure' : null;
  if (!kind) return null;
  const caption = String((kind === 'table' ? b.caption : b.alt) ?? '').trim();
  if (!caption) return null;
  return { kind, caption, ...(b.captionId ? { id: b.captionId } : {}) };
}

/**
 * Number the captioned tables and figures in a set of blocks, in reading order.
 *
 * `numbering` is the DOCUMENT's counter, threaded in by the caller and shared
 * across every section, for the same reason the citation registry and the DOCX
 * footnote sink are: a submission's tables run 1..n across the whole document,
 * and a renderer that started its own counter would open every section with
 * "Table 1".
 */
export function numberBlockCaptions(
  blocks: ContentBlock[],
  numbering: CaptionNumbering,
): NumberedCaption[] {
  const objects: CaptionedObject[] = [];
  for (const b of blocks) {
    const c = blockCaption(b);
    if (c) objects.push(c);
  }
  return numberCaptions(objects, numbering);
}

/**
 * The captioned tables and figures of a set of blocks, as CROSS-REFERENCE
 * TARGETS — merged by the export into the same directory the sections go into.
 *
 * The export needs this BEFORE it renders, and for the whole document: "as
 * shown in Table 7" is routinely written above the table it names, so a
 * reference cannot be resolved by counting as the renderer walks. The caller
 * makes one pass over every section to build the directory and a second,
 * identical pass to render — which is exactly what it already does for
 * citations, whose reference list also cannot be assembled until every section
 * has been read.
 *
 * An object with no `data-caption-id` is not a target (nothing can point at it)
 * but still consumes its ordinal, so the objects after it carry the numbers the
 * filed document prints.
 */
export function collectCaptionTargets(
  blocks: ContentBlock[],
  numbering: CaptionNumbering,
): CrossReferenceTarget[] {
  return captionCrossReferenceTargets(numberBlockCaptions(blocks, numbering));
}

/**
 * Every source id cited across a set of blocks, in reading order, de-duplicated.
 *
 * The export needs this BEFORE it renders: the reference list is assembled from
 * the sources actually cited, so the export has to know which sources to look
 * up before it can number a single marker. Reading order is preserved so a
 * caller that resolves in this order sees the document as a reviewer does.
 */
export function collectCitedSourceIds(blocks: ContentBlock[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    for (const r of blockRuns(b)) {
      const id = r.citationSourceId;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

/** Unresolved tracked changes across a set of blocks. */
export function countPendingSuggestions(blocks: ContentBlock[]): {
  insertions: number;
  deletions: number;
} {
  let insertions = 0;
  let deletions = 0;
  for (const b of blocks) {
    for (const r of blockRuns(b)) {
      if (r.suggestion === 'insertion') insertions++;
      else if (r.suggestion === 'deletion') deletions++;
    }
  }
  return { insertions, deletions };
}

/** Plain-text lines (redline flattened), for consumers that need only text. */
export function blocksToPlainText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) =>
      b.kind === 'table'
        ? (b.rows ?? [])
            .map((row) => row.map((c) => c.runs.map((r) => r.text).join('')).join('\t'))
            .join('\n')
        : b.runs.map((r) => r.text).join(''),
    )
    .join('\n');
}
