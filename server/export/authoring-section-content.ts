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
 */

import { parse, HTMLElement, TextNode, Node } from 'node-html-parser';

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
}

export interface TableCell {
  runs: InlineRun[];
  /** A `th`, or a cell inside `thead`. Rendered as a header cell. */
  header?: boolean;
  colSpan?: number;
  rowSpan?: number;
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
  /**
   * Inline content. Always present so every consumer can iterate it
   * unconditionally; empty for a `table` (text lives in `rows`) and for an
   * `image` (a figure has no runs).
   */
  runs: InlineRun[];
  /** Tables only: rows of cells, in document order. */
  rows?: TableCell[][];
  /** Tables only: the `caption` text, when the author gave one. */
  caption?: string;
  /** Images only: the stored reference (`/api/authoring/images/<id>`, a data
   *  URI, or a foreign URL) and the author's alt text. */
  src?: string;
  alt?: string;
}

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
 * detection routed such text through an HTML parse that swallowed the token. */
const KNOWN_HTML_TAG =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|b|strong|i|em|u|s|strike|ins|del|span|table|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article)\b[^>]*>/i;
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
    prev.suggestionAt === st.suggestionAt
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
  });
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
  if (tag === 'sup') next.superScript = true;
  if (tag === 'sub') next.subScript = true;
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
function inlineRunsOf(node: HTMLElement, st: InlineState): InlineRun[] {
  const runs: InlineRun[] = [];
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
    const isBlock = BLOCK_TAGS.has(tag) || tag === 'ol' || tag === 'ul';
    if (isBlock && runs.length) pushRun(runs, ' ', state);
    for (const child of n.childNodes) visit(child, applyMark(tag, state, n));
  };
  for (const child of node.childNodes) visit(child, st);
  return trimRuns(runs);
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
    .filter((r) => r.text.length > 0);
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
      cells.push({
        runs: inlineRunsOf(child, st),
        ...(tag === 'th' || inHead ? { header: true } : {}),
        ...(colSpan ? { colSpan } : {}),
        ...(rowSpan ? { rowSpan } : {}),
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
  return { kind: 'table', runs: [], rows, ...(caption ? { caption } : {}) };
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

  /** Innermost list type, so a nested ol inside a ul numbers correctly. */
  let listOrdered: boolean | null = null;

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
      const outer = listOrdered;
      listOrdered = tag === 'ol';
      for (const child of node.childNodes) walk(child, nextState);
      listOrdered = outer;
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
        blocks.push({ kind: 'image', runs: [], src, ...(alt ? { alt } : {}) });
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
        current = { kind: 'list-item', ...(listOrdered ? { ordered: true } : {}), runs: [] };
        blocks.push(current);
      }
      for (const child of node.childNodes) walk(child, nextState);
      closeBlock();
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

  // Drop blocks that are only whitespace, trim run edges per block. A table
  // keeps its rows untouched — its cells were trimmed as they were read, and
  // its emptiness test is over the cells, not over the (always empty) runs.
  // An image block is textless BY KIND — testing it for text would delete
  // every figure here, which is the defect the img branch above closed.
  return blocks
    .map((b) => (b.kind === 'table' || b.kind === 'image' ? b : { ...b, runs: trimRuns(b.runs) }))
    .filter((b) => b.kind === 'image' || blockRuns(b).some((r) => r.text.trim().length > 0));
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
