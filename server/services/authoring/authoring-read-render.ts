/**
 * Rendering a section's stored content as text a model can read, windowing it,
 * and placing a search snippet in it — for authoring-read.ts, which owns the
 * store, the scope and the SQL. Moved here unchanged from authoring-read.ts
 * (2026-10-01) to keep each module under the max-lines limit; the contract —
 * every character of proposed text inside a ⟦…⟧ label, windows that never cut
 * a label's words or a surrogate pair and always advance — is described in
 * authoring-read.ts's module comment and in the comments below.
 *
 * @module server/services/authoring/authoring-read-render
 */

import { parse, HTMLElement, TextNode, type Node } from 'node-html-parser';
import { CITATION_SOURCE_ATTR } from '../../../shared/authoring/citations';
import { CROSS_REF_TARGET_ATTR } from '../../../shared/authoring/cross-references';
import { MAX_LIST_DEPTH, contentLooksLikeHtml, sectionContentToBlocks } from '../../export/authoring-section-content';
import type { ContentBlock, InlineRun, TableCell } from '../../export/authoring-section-content';

const SNIPPET_CHARS = 200;
/** The longest search query; a snippet's word-by-word fallback looks no further ahead than twice this. */
export const SEARCH_QUERY_MAX = 200;
const AUTHOR_MAX = 60;

/** Opens a proposal label. Never occurs in rendered content (see escapeDelimiters). */
export const PROPOSAL_OPEN = '⟦';
/** Closes a proposal label. */
export const PROPOSAL_CLOSE = '⟧';
/** How a window that stops inside a proposal closes it. */
const PROPOSAL_CONTINUES = `…(continues)${PROPOSAL_CLOSE}`;


// ── Rendering stored content as text a model can read ───────────────────────

interface Proposal { kind: 'insertion' | 'deletion'; author: string }
/**
 * A stretch of rendered text; `proposal` set when it is pending, unaccepted
 * change; `deco` set when the renderer wrote it (a list marker, a cell
 * separator, a figure placeholder) rather than the document.
 */
interface Piece { text: string; proposal?: Proposal; deco?: boolean }

/** One proposal's place in the rendered text. Its label runs labelStart..bodyStart; its close is the one character at bodyEnd. */
export interface ProposalSpan extends Proposal { labelStart: number; bodyStart: number; bodyEnd: number }

export interface RenderedSection {
  text: string;
  spans: ProposalSpan[];
  /** Stretches the renderer wrote (markers, separators, figure placeholders), in order; search reads them as a gap. */
  decorations: Array<{ start: number; end: number }>;
}

/** The label delimiters never appear in content: a stored ⟦ or ⟧ becomes [ or ]. */
export function escapeDelimiters(t: string): string {
  return t.replace(/⟦/g, '[').replace(/⟧/g, ']');
}

function authorName(raw: string | null | undefined): string {
  const a = escapeDelimiters(String(raw ?? '')).replace(/\s+/g, ' ').trim();
  if (!a) return 'an unnamed author';
  return a.length > AUTHOR_MAX ? `${a.slice(0, AUTHOR_MAX - 1)}…` : a;
}

function openLabel(p: Proposal, continued: boolean): string {
  return `${PROPOSAL_OPEN}${continued ? '(continued) ' : ''}proposed ${p.kind} by ${p.author}: `;
}

function runText(r: InlineRun): string {
  let t = r.text;
  if (r.citationSourceId) t = `[citation: ${t.trim() || r.citationSourceId}${r.citationLocator ? `, ${r.citationLocator}` : ''}]`;
  if (r.footnote) t += ` [footnote: ${r.footnote}]`;
  return escapeDelimiters(t);
}

/** Inline runs as pieces, each pending change one proposal with who proposed it. */
function runsPieces(runs: InlineRun[]): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < runs.length; ) {
    const r = runs[i];
    if (!r.suggestion) {
      out.push({ text: runText(r) });
      i++;
      continue;
    }
    // Adjacent runs of one change (bold and plain inside one insertion) are one proposal.
    let j = i;
    let text = '';
    while (j < runs.length && runs[j].suggestion === r.suggestion && runs[j].suggestionAuthor === r.suggestionAuthor) {
      text += runText(runs[j]);
      j++;
    }
    out.push({ text, proposal: { kind: r.suggestion, author: authorName(r.suggestionAuthor) } });
    i = j;
  }
  return out;
}

/** Trim the outer whitespace of a line — settled text only; a proposal's text is shown as proposed. */
function trimPieces(pieces: Piece[]): Piece[] {
  const out = pieces.filter((p) => p.text.length > 0).map((p) => ({ ...p }));
  while (out.length && !out[0].proposal) {
    out[0].text = out[0].text.replace(/^\s+/, '');
    if (out[0].text) break;
    out.shift();
  }
  while (out.length && !out[out.length - 1].proposal) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    out.pop();
  }
  return out;
}

type Mark = { kind: Proposal['kind']; author?: string };

/** The parser's applyMark rule: an ins/del sets the kind, and its author when it names one. */
function markOf(tag: string, el: HTMLElement, mark: Mark | undefined): Mark | undefined {
  if (tag !== 'ins' && tag !== 'del') return mark;
  return { kind: tag === 'ins' ? 'insertion' : 'deletion', author: el.getAttribute('data-author-name') || mark?.author };
}

const proposalOf = (m: Mark | undefined): Proposal | undefined => (m ? { kind: m.kind, author: authorName(m.author) } : undefined);

/**
 * The parser's rule for an anchor it does not descend into: one inside a
 * cross-reference or citation (its own attribute, or an ancestor's: applyMark
 * inherits both) that has no text of its own. Returns whether `el` opens or
 * continues a reference, and whether the walk stops at it.
 */
function referenceOf(tag: string, el: HTMLElement, inRef: boolean): { inRef: boolean; skip: boolean } {
  if (tag !== 'a') return { inRef, skip: false };
  const own = Boolean((el.getAttribute(CROSS_REF_TARGET_ATTR) ?? '').trim() || (el.getAttribute(CITATION_SOURCE_ATTR) ?? '').trim());
  const ref = inRef || own;
  return { inRef: ref, skip: ref && !el.text };
}

const elementChildren = (node: HTMLElement): HTMLElement[] => node.childNodes.filter((c): c is HTMLElement => c instanceof HTMLElement);
const tagOf = (el: HTMLElement): string => (el.rawTagName || '').toLowerCase();

/**
 * What the block parser emits that it does not label: each figure, in the order
 * the parser emits it, with the pending change it sits in; and each table, with
 * its OWN caption as labelled pieces.
 *
 * The parser keeps suggestion state on text runs only, so a figure proposed for
 * insertion came out as an ordinary `[figure: …]`, and a table's caption came
 * out as plain text (`querySelector('caption')`, which is also the first
 * caption anywhere inside the table — a nested table's when the table has none
 * of its own). This walks the same parse with the parser's own traversal rules
 * (parseHtmlToBlocks' walk, parseTable's row scan, cellContentOf's visit): it
 * skips what the parser skips — script and style, an image in a caption or
 * directly in a row, an empty cross-reference or citation anchor, anything in a
 * table outside its rows — so the Nth figure here is the Nth figure the
 * renderer meets. An earlier version queued states per `src` over EVERY
 * `<img>`, so a skipped copy of an image took the state meant for the next.
 */
interface Emitted { figures: Array<{ src: string; proposal?: Proposal }>; tables: Array<{ caption: Piece[] }> }

function emittedObjects(stored: string | null | undefined): Emitted {
  const out: Emitted = { figures: [], tables: [] };
  const s = stored ?? '';
  if (!/<(img|table)\b/i.test(s) || !contentLooksLikeHtml(s)) return out;
  const figure = (el: HTMLElement, mark: Mark | undefined): void => {
    const src = (el.getAttribute('src') ?? '').trim();
    if (src) out.figures.push({ src, proposal: proposalOf(mark) });
  };
  // cellContentOf: every descendant but an empty reference; a nested table is just more of the cell.
  const cell = (node: HTMLElement, mark: Mark | undefined, inRef: boolean): void => {
    for (const el of elementChildren(node)) {
      const tag = tagOf(el);
      if (tag === 'br') continue;
      if (tag === 'img') {
        figure(el, mark);
        continue;
      }
      const ref = referenceOf(tag, el, inRef);
      if (!ref.skip) cell(el, markOf(tag, el, mark), ref.inRef);
    }
  };
  // parseTable: cells of rows that are the table's children or its thead/tbody/tfoot's; no cells, no block.
  const table = (node: HTMLElement, mark: Mark | undefined, inRef: boolean): void => {
    const cells: HTMLElement[] = [];
    const scan = (parent: HTMLElement): void => {
      for (const el of elementChildren(parent)) {
        const tag = tagOf(el);
        if (tag === 'tr') cells.push(...elementChildren(el).filter((c) => tagOf(c) === 'td' || tagOf(c) === 'th'));
        else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') scan(el);
      }
    };
    scan(node);
    if (!cells.length) return;
    const own = elementChildren(node).find((c) => tagOf(c) === 'caption');
    out.tables.push({ caption: own ? captionPieces(own, mark) : [] });
    for (const c of cells) cell(c, mark, inRef);
  };
  // parseHtmlToBlocks' walk.
  const walk = (node: HTMLElement, mark: Mark | undefined, inRef: boolean): void => {
    const tag = tagOf(node);
    if (tag === 'script' || tag === 'style' || tag === 'br') return;
    const next = markOf(tag, node, mark);
    if (tag === 'table') return table(node, next, inRef);
    if (tag === 'img') return figure(node, next);
    const ref = referenceOf(tag, node, inRef);
    if (!ref.skip) for (const el of elementChildren(node)) walk(el, next, ref.inRef);
  };
  for (const el of elementChildren(parse(s))) walk(el, undefined, false);
  return out;
}

/** A caption's words, each pending change in it a proposal (the table's own state is inherited, as its cells inherit it). */
function captionPieces(caption: HTMLElement, mark: Mark | undefined): Piece[] {
  const runs: InlineRun[] = [];
  const visit = (node: Node, m: Mark | undefined): void => {
    if (node instanceof TextNode) {
      const text = node.text.replace(/\s+/g, ' ');
      const prev = runs[runs.length - 1];
      if (text && prev && prev.suggestion === m?.kind && prev.suggestionAuthor === m?.author) prev.text += text;
      else if (text) runs.push({ text, ...(m ? { suggestion: m.kind, suggestionAuthor: m.author } : {}) });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = tagOf(node);
    if (tag === 'br') runs.push({ text: ' ', ...(m ? { suggestion: m.kind, suggestionAuthor: m.author } : {}) });
    else if (tag !== 'img') for (const child of node.childNodes) visit(child, markOf(tag, node, m));
  };
  for (const child of caption.childNodes) visit(child, mark);
  // One space where two runs meet with a space on each side.
  for (let i = 1; i < runs.length; i++) if (/\s$/.test(runs[i - 1].text)) runs[i].text = runs[i].text.replace(/^\s+/, '');
  return trimPieces(runsPieces(runs));
}

/** Hands out, in render order, the state of each figure and the caption of each table. */
class EmittedCursor {
  private f = 0;
  private t = 0;
  constructor(private readonly e: Emitted) {}

  /**
   * The next figure's proposal. Its src must be the one the parser gave the
   * block; if the walks ever disagreed, the next figure with that src is taken,
   * so the state still comes from a copy of the same image.
   */
  figure(src: string): Proposal | undefined {
    const at = this.e.figures[this.f]?.src === src.trim() ? this.f : this.e.figures.findIndex((x, i) => i >= this.f && x.src === src.trim());
    if (at < 0) return undefined;
    this.f = at + 1;
    return this.e.figures[at].proposal;
  }

  /** The next table's own caption; null when the walks disagree, and the parser's caption is used. */
  caption(): Piece[] | null {
    return this.e.tables[this.t++]?.caption ?? null;
  }
}

function figurePiece(src: string | undefined, alt: string | undefined, emitted: EmittedCursor): Piece {
  const text = `[figure${alt ? `: ${escapeDelimiters(alt)}` : ''}]`;
  const proposal = src ? emitted.figure(src) : undefined;
  return proposal ? { text, proposal, deco: true } : { text, deco: true };
}

function cellPieces(c: TableCell, emitted: EmittedCursor): Piece[] {
  const parts: Piece[][] = [trimPieces(runsPieces(c.runs)), ...(c.images ?? []).map((im) => [figurePiece(im.src, im.alt, emitted)])]
    .filter((p) => p.length > 0);
  return parts.flatMap((p, i) => (i === 0 ? p : [{ text: ' ', deco: true }, ...p]));
}

function listMarker(b: ContentBlock, depth: number, counters: number[]): string {
  counters.length = depth + 1;
  if (!b.ordered) return '-';
  counters[depth] = (counters[depth] ?? 0) + 1;
  return `${counters[depth]}.`;
}

function tablePieces(b: ContentBlock, emitted: EmittedCursor): Piece[] {
  const lines: Piece[][] = [];
  const own = emitted.caption();
  const caption = own ?? (b.caption ? [{ text: escapeDelimiters(b.caption) }] : []);
  if (caption.length) lines.push([{ text: 'Table: ', deco: true }, ...caption]);
  for (const row of b.rows ?? []) {
    lines.push(row.flatMap((cell, i) => (i === 0 ? cellPieces(cell, emitted) : [{ text: ' | ', deco: true }, ...cellPieces(cell, emitted)])));
  }
  return lines.filter((l) => l.length > 0).flatMap((l, i) => (i === 0 ? l : [{ text: '\n', deco: true }, ...l]));
}

function blockPieces(b: ContentBlock, counters: number[], emitted: EmittedCursor): Piece[] {
  if (b.kind !== 'list-item') counters.length = 0;
  switch (b.kind) {
    case 'heading':
      return [{ text: `${'#'.repeat(b.level ?? 1)} `, deco: true }, ...trimPieces(runsPieces(b.runs))];
    case 'list-item': {
      const depth = Math.min(MAX_LIST_DEPTH, Math.max(0, b.depth ?? 0));
      return [{ text: `${'  '.repeat(depth)}${listMarker(b, depth, counters)} `, deco: true }, ...trimPieces(runsPieces(b.runs))];
    }
    case 'table':
      return tablePieces(b, emitted);
    case 'image':
      return [figurePiece(b.src, b.alt, emitted)];
    default:
      return trimPieces(runsPieces(b.runs));
  }
}

/** Lay pieces out as one string, recording where each proposal's label, text and close sit, and where the renderer's own marks are. */
export function layout(pieces: Piece[]): RenderedSection {
  let text = '';
  const spans: ProposalSpan[] = [];
  const decorations: Array<{ start: number; end: number }> = [];
  for (const p of pieces) {
    if (!p.text) continue;
    if (!p.proposal) {
      if (p.deco) decorations.push({ start: text.length, end: text.length + p.text.length });
      text += p.text;
      continue;
    }
    const labelStart = text.length;
    text += openLabel(p.proposal, false);
    const bodyStart = text.length;
    if (p.deco) decorations.push({ start: bodyStart, end: bodyStart + p.text.length });
    text += p.text;
    spans.push({ ...p.proposal, labelStart, bodyStart, bodyEnd: text.length });
    text += PROPOSAL_CLOSE;
  }
  return { text, spans, decorations };
}

/**
 * A section's stored content as text with its block structure kept: headings
 * as `#`, list items as `-` or `1.`, table rows as ` | `-joined cells, blocks
 * separated by a blank line (list items by a newline), and every pending
 * change inside a ⟦…⟧ label.
 */
export function renderSection(stored: string | null | undefined): RenderedSection {
  const emitted = new EmittedCursor(emittedObjects(stored));
  const counters: number[] = [];
  const pieces: Piece[] = [];
  let prev: ContentBlock['kind'] | null = null;
  for (const b of sectionContentToBlocks(stored)) {
    if (prev !== null) pieces.push({ text: prev === 'list-item' && b.kind === 'list-item' ? '\n' : '\n\n', deco: true });
    pieces.push(...blockPieces(b, counters, emitted));
    prev = b.kind;
  }
  return layout(pieces);
}

export function sectionReadableText(stored: string | null | undefined): string {
  return renderSection(stored).text;
}

// ── Windows over rendered text ──────────────────────────────────────────────

/** The proposal whose label, text or close holds position `i`. */
function spanHolding(r: RenderedSection, i: number): ProposalSpan | undefined {
  return r.spans.find((s) => i >= s.labelStart && i <= s.bodyEnd);
}

/** Position `i` falls between the two halves of a surrogate pair: a window may neither start nor end there. */
const splitsPair = (t: string, i: number): boolean =>
  i > 0 && i < t.length && /[\uD800-\uDBFF]/.test(t[i - 1]) && /[\uDC00-\uDFFF]/.test(t[i]);

/**
 * `maxChars` of `r.text` from `offset`, labelled so that every character of
 * proposed text in the result is inside a ⟦…⟧:
 *   - a start inside a label moves to the proposal's text; a start on a close
 *     moves past it (the close alone says nothing); a start between the halves
 *     of a surrogate pair moves back to the pair;
 *   - an end inside a label (no proposed character reached) moves back before
 *     the label — unless the window starts at that label, when it takes at
 *     least one character of the proposal so a walk always advances;
 *   - an end between the halves of a surrogate pair moves back before the
 *     pair when that still leaves something to deliver, and otherwise forward
 *     past it, so a window too small for one whole code point delivers one;
 *   - an end exactly before a close takes the close too;
 *   - a start inside proposed text re-opens the label, an end inside it closes
 *     it with `…(continues)⟧`.
 * `end` is exactly where the next window starts, and is always past `start`
 * while text remains, so a walk from 0 by `end` delivers every character of
 * `r.text` once, labels and all, at every window size from 1 up.
 */
export function windowOf(r: RenderedSection, offset: number, maxChars: number): { start: number; end: number; text: string } {
  const t = r.text;
  const start = windowStart(r, offset);
  if (start >= t.length) return { start: t.length, end: t.length, text: '' };
  const { end, suffix } = windowEnd(r, start, maxChars);
  const open = spanHolding(r, start);
  const prefix = open && start >= open.bodyStart && start < open.bodyEnd ? openLabel(open, true) : '';
  return { start, end, text: prefix + t.slice(start, end) + suffix };
}

/** A start inside a label moves to the proposal's text; a start on a close moves past it; a start inside a pair moves back to it. */
function windowStart(r: RenderedSection, offset: number): number {
  let start = Math.min(Math.max(0, Math.floor(offset)), r.text.length);
  if (splitsPair(r.text, start)) start--;
  const s = spanHolding(r, start);
  if (s && start > s.labelStart && start < s.bodyStart) return s.bodyStart;
  return s && start === s.bodyEnd ? s.bodyEnd + 1 : start;
}

function windowEnd(r: RenderedSection, start: number, maxChars: number): { end: number; suffix: string } {
  const t = r.text;
  let end = Math.min(t.length, start + Math.max(1, Math.floor(maxChars)));
  const cut = r.spans.find((s) => s.labelStart < end && end <= s.bodyEnd);
  // No proposed character reached: stop before the label, or — when the window begins at it — take one.
  if (cut && end <= cut.bodyStart) end = cut.labelStart > start ? cut.labelStart : cut.bodyStart + 1;
  // Never cut a surrogate pair. Label edges never fall inside one (labels are ASCII), so only
  // text is ever split; stepping back must still leave a character to deliver — past the start,
  // and inside a proposal past its label — or the window takes the whole pair instead.
  if (splitsPair(t, end)) {
    const floor = cut && end > cut.bodyStart ? Math.max(start, cut.bodyStart) : start;
    end = end - 1 > floor ? end - 1 : end + 1;
  }
  if (!cut || end <= cut.bodyStart) return { end, suffix: '' };
  // The whole proposal is in: take its close. Otherwise close it as continuing.
  return end >= cut.bodyEnd ? { end: cut.bodyEnd + 1, suffix: '' } : { end, suffix: PROPOSAL_CONTINUES };
}

/**
 * The rendered text as the SQL match sees the stored content, with where each
 * of its characters sits in the rendered text. PLAIN_SQL turns every tag into a
 * space and collapses whitespace; here every stretch the renderer wrote — a
 * proposal's label and close, a list marker, a cell separator, a heading's `#`,
 * a block break, a figure placeholder — is a space, and whitespace collapses
 * the same way. What is left is the document's own words in order.
 */
function searchable(r: RenderedSection): { content: string; at: number[] } {
  let content = '';
  const at: number[] = [];
  const decos = r.decorations;
  let k = 0;
  let d = 0;
  for (let i = 0; i < r.text.length; i++) {
    while (k < r.spans.length && i > r.spans[k].bodyEnd) k++;
    while (d < decos.length && i >= decos[d].end) d++;
    const s = r.spans[k];
    const inLabel = s !== undefined && ((i >= s.labelStart && i < s.bodyStart) || i === s.bodyEnd);
    const deco = d < decos.length && i >= decos[d].start;
    if (inLabel || deco || /\s/.test(r.text[i])) {
      if (content && !content.endsWith(' ')) {
        content += ' ';
        at.push(i);
      }
      continue;
    }
    content += r.text[i];
    at.push(i);
  }
  return { content, at };
}

const escapeRegExp = (w: string): string => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where `q` occurs in the rendered text, as [start, end) — so a snippet can
 * hold all of it. The SQL match put a space at every tag, so a space in the
 * query may stand for no space at all in the rendered text (`dose is<ins>raised`):
 * the words are matched with any whitespace, or none, between them. Should
 * that still miss (a citation the renderer wraps in `[citation: …]`, an entity
 * the SQL does not decode), the words are found in order with a short gap
 * between each (wordsInOrder); failing that, the first word; failing that, null.
 */
function locate(r: RenderedSection, q: string): { start: number; end: number } | null {
  const { content, at } = searchable(r);
  const words = q.split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!words.length) return null;
  // nosemgrep: detect-non-literal-regexp -- words are escaped (escapeRegExp) and joined by \s*: no nested quantifier
  const exact = new RegExp(words.join('\\s*'), 'iu').exec(content);
  const span = exact ? { index: exact.index, end: exact.index + exact[0].length } : wordsInOrder(content, words);
  if (!span) return null;
  return { start: at[span.index], end: at[span.end - 1] + 1 };
}

/** Max characters between two words of a query in the token-wise fallback. */
const WORD_GAP = 60;

/**
 * The first place every word occurs in order, each within WORD_GAP characters
 * of the last; else the first word alone. A scan, not one regex with lazy gaps
 * between the words, which backtracks exponentially on a repetitive query.
 */
function wordsInOrder(content: string, words: string[]): { index: number; end: number } | null {
  // nosemgrep: detect-non-literal-regexp -- each word is escaped (escapeRegExp, in locate)
  const first = new RegExp(words[0], 'giu');
  // nosemgrep: detect-non-literal-regexp -- each word is escaped (escapeRegExp, in locate); a scan, not one backtracking pattern
  const rest = words.slice(1).map((w) => new RegExp(w, 'iu'));
  let firstHit: { index: number; end: number } | null = null;
  for (let m = first.exec(content); m; m = first.exec(content)) {
    if (!firstHit) firstHit = { index: m.index, end: m.index + m[0].length };
    let end = m.index + m[0].length;
    const ok = rest.every((re) => {
      const n = re.exec(content.slice(end, end + WORD_GAP + 2 * SEARCH_QUERY_MAX));
      if (!n || n.index > WORD_GAP) return false;
      end += n.index + n[0].length;
      return true;
    });
    if (ok) return { index: m.index, end };
  }
  return firstHit;
}

/**
 * About SNIPPET_CHARS around the first hit, through windowOf so a proposal in
 * it stays labelled. The window is centred on the hit as it sits in the
 * rendered text — labels between its words included — and widened to hold the
 * whole hit when that is longer.
 */
export function snippetOf(r: RenderedSection, q: string): string {
  const hit = locate(r, q);
  let from = 0;
  let size = SNIPPET_CHARS;
  if (hit) {
    from = Math.max(0, hit.start - Math.max(0, Math.floor((SNIPPET_CHARS - (hit.end - hit.start)) / 2)));
    size = Math.max(SNIPPET_CHARS, hit.end - from);
  }
  const w = windowOf(r, from, size);
  const body = w.text.replace(/\s+/g, ' ').trim();
  return `${w.start > 0 ? '…' : ''}${body}${w.end < r.text.length ? '…' : ''}`;
}
