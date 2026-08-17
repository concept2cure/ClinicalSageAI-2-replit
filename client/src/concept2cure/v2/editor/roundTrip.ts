/**
 * Round-trip fidelity gate for the canonical section editor.
 *
 * The authoring store holds section `content` as an opaque string. Three
 * generations of canvas wrote three shapes into it: plain text (the textarea),
 * raw `innerHTML` (the retired execCommand DocCanvas), and clean editor HTML
 * (this editor). A rich editor that silently re-serializes whatever it parsed
 * would REWRITE the governed record on the next save — and if its schema
 * dropped anything on parse, the loss would be invisible until an inspector
 * compared revisions.
 *
 * The gate: before a section becomes rich-editable, prove the editor's parse
 * preserved every character of the stored content's text. If it did not, the
 * editor refuses rich mode and falls back to source mode (a plain textarea over
 * the raw stored string, same save path) with a notice that says why. Fail
 * closed: unproven fidelity means no rich rewrite, never a quiet one.
 *
 * "Text" is the comparison unit deliberately. Structure (a legacy `<div>`
 * becoming `<p>`, a `<b>` becoming `<strong>`) may normalize; the words of a
 * regulated document may not change by a single character.
 */

/** True when the stored string is HTML rather than textarea-era plain text.
 *
 * Matches KNOWN html tags only, deliberately: prose can legitimately contain
 * tag-shaped tokens (`temperature <critical> threshold`), and any-tag
 * detection routed such text through an HTML parse that swallowed the token —
 * the exact silent-loss class this module exists to stop. Mirrored by
 * `contentLooksLikeHtml` in server/export/authoring-section-content.ts; keep
 * the two in agreement. */
const KNOWN_HTML_TAG =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|b|strong|i|em|u|s|strike|ins|del|span|table|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article)\b[^>]*>/i;
export function looksLikeHtml(stored: string): boolean {
  return KNOWN_HTML_TAG.test(stored);
}

/** Block-level tags whose boundaries read as line breaks in extracted text. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'br',
  'blockquote', 'pre', 'ul', 'ol', 'table', 'thead', 'tbody', 'td', 'th',
]);

/**
 * Extract the text of an HTML string the way a reader would see it: element
 * text content, with block boundaries as breaks. Uses the browser parser so
 * entity decoding matches what any renderer of the stored content shows.
 *
 * IMPORTANT: `<script>`/`<style>` text is INCLUDED, not skipped. That is the
 * point — the DOM holds it as text, ProseMirror's parser drops it, and the
 * whole job of this module is to notice exactly that class of difference.
 */
export function htmlVisibleText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (node as Element).tagName.toLowerCase();
    if (BLOCK_TAGS.has(tag)) parts.push('\n');
    node.childNodes.forEach(walk);
    if (BLOCK_TAGS.has(tag)) parts.push('\n');
  };
  doc.body.childNodes.forEach(walk);
  return parts.join('');
}

/** Whitespace-insensitive normalization: the words, in order, nothing else. */
export function normalizeForCompare(text: string): string {
  return text
    .replace(/\u00a0/g, ' ') // nbsp — DOM text and editor text disagree on it
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export interface FidelityVerdict {
  /** True when rich editing would lose or alter stored text — refuse it. */
  lossy: boolean;
  /** Normalized text of the stored content (what the record says). */
  storedText: string;
  /** Normalized text as the editor parsed it (what rich mode would keep). */
  parsedText: string;
}

/**
 * Compare the stored content's readable text against the text the editor's
 * parse actually retained (`parsedText` should come from the parsed document,
 * e.g. TipTap's `getText`). Plain-text stored content compares as itself.
 */
export function assessFidelity(stored: string, parsedDocText: string): FidelityVerdict {
  const storedText = normalizeForCompare(
    looksLikeHtml(stored) ? htmlVisibleText(stored) : stored,
  );
  const parsedText = normalizeForCompare(parsedDocText);
  return { lossy: storedText !== parsedText, storedText, parsedText };
}

/**
 * Convert textarea-era plain text to the editor's HTML: blank-line-separated
 * runs become paragraphs, single newlines become hard breaks. Escapes
 * everything — plain text has no markup by definition.
 */
export function plainTextToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = text.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return paras
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
