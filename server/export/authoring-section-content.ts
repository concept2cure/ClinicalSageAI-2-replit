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
 */

import { parse, HTMLElement, TextNode, Node } from 'node-html-parser';

export interface InlineRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** Present when this run is an unresolved tracked change. */
  suggestion?: 'insertion' | 'deletion';
}

export interface ContentBlock {
  kind: 'paragraph' | 'heading' | 'list-item';
  /** Heading level 1–3 (headings only). */
  level?: 1 | 2 | 3;
  runs: InlineRun[];
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
  suggestion?: 'insertion' | 'deletion';
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
    prev.suggestion === st.suggestion
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
    ...(st.suggestion ? { suggestion: st.suggestion } : {}),
  });
}

function parseHtmlToBlocks(html: string): ContentBlock[] {
  const root = parse(html);
  const blocks: ContentBlock[] = [];
  let current: ContentBlock | null = null;

  const ensureBlock = (kind: ContentBlock['kind'] = 'paragraph', level?: 1 | 2 | 3): ContentBlock => {
    if (!current) {
      current = { kind, ...(level ? { level } : {}), runs: [] };
      blocks.push(current);
    }
    return current;
  };
  const closeBlock = () => {
    current = null;
  };

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

    const nextState: InlineState = { ...st };
    if (tag === 'b' || tag === 'strong') nextState.bold = true;
    if (tag === 'i' || tag === 'em') nextState.italics = true;
    if (tag === 'u') nextState.underline = true;
    if (tag === 's' || tag === 'strike') nextState.strike = true;
    if (tag === 'ins') {
      nextState.underline = true;
      nextState.suggestion = 'insertion';
    }
    if (tag === 'del') {
      nextState.strike = true;
      nextState.suggestion = 'deletion';
    }

    if (BLOCK_TAGS.has(tag)) {
      closeBlock();
      const heading = /^h([1-6])$/.exec(tag);
      if (heading) {
        const level = Math.min(3, Number(heading[1])) as 1 | 2 | 3;
        current = { kind: 'heading', level, runs: [] };
        blocks.push(current);
      } else if (tag === 'li') {
        current = { kind: 'list-item', runs: [] };
        blocks.push(current);
      }
      for (const child of node.childNodes) walk(child, nextState);
      closeBlock();
      return;
    }

    // td/th: separate cells with a tab so table text stays readable.
    if (tag === 'td' || tag === 'th') {
      if (current && current.runs.length) pushRun(current.runs, '\t', st);
      for (const child of node.childNodes) walk(child, nextState);
      return;
    }

    for (const child of node.childNodes) walk(child, nextState);
  };

  for (const child of root.childNodes) walk(child, {});
  closeBlock();

  // Drop blocks that are only whitespace, trim run edges per block.
  return blocks
    .map((b) => ({
      ...b,
      runs: b.runs
        .map((r, i, arr) => ({
          ...r,
          text: (i === 0 ? r.text.replace(/^\s+/, '') : r.text).replace(
            i === arr.length - 1 ? /\s+$/ : /$^/,
            '',
          ),
        }))
        .filter((r) => r.text.length > 0),
    }))
    .filter((b) => b.runs.some((r) => r.text.trim().length > 0));
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
    for (const r of b.runs) {
      if (r.suggestion === 'insertion') insertions++;
      else if (r.suggestion === 'deletion') deletions++;
    }
  }
  return { insertions, deletions };
}

/** Plain-text lines (redline flattened), for consumers that need only text. */
export function blocksToPlainText(blocks: ContentBlock[]): string {
  return blocks.map((b) => b.runs.map((r) => r.text).join('')).join('\n');
}
