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
 * the two in agreement.
 *
 * AN ALLOWLIST THAT IS TOO NARROW CORRUPTS THE RECORD, and did. `dl`, `dt`,
 * `dd` and `caption` were missing. A definition list is how an abbreviations
 * or glossary section is written — "AE / Adverse Event", "MTD / Maximum
 * Tolerated Dose" — and is exactly the shape an AI draft emits for one. With
 * the tag unrecognised the boot path took the PLAIN-TEXT branch, where
 * `plainTextToHtml` escapes everything because plain text has no markup by
 * definition. So the record's markup became visible body text: a filed
 * document reading `<dl><dt>AE</dt><dd>Adverse Event</dd></dl>` as a literal
 * line of prose, angle brackets and all.
 *
 * The gate then AFFIRMED it. `assessFidelity` asks this same question, so it
 * compared the raw string-with-tags against the parsed literal
 * string-with-tags, they matched, and it returned `lossy: false` — reporting
 * the corruption as faithful because both halves agreed on the same mistake.
 *
 * Adding a tag here is therefore not cosmetic. Anything the stored record can
 * legitimately hold must be recognised, or it is escaped into the filed
 * document; anything ambiguous with prose must not be. `figure`/`figcaption`
 * are listed for the same reason even though the boot path also routes
 * `figure` to source mode explicitly — the two guards are independent, and
 * this one governs whether `assessFidelity` reads the content as markup. */
const KNOWN_HTML_TAG =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|dl|dt|dd|b|strong|i|em|u|s|strike|ins|del|span|table|caption|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article|figure|figcaption)\b[^>]*>/i;
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

/**
 * How many of the clipboard's words the parse kept.
 *
 * The gate above protects STORED content from a lossy parse. Paste is the other
 * door into this editor, and it is the busier one: a medical writer drafts in
 * Word, or lifts pages out of a previous CSR, and pastes. Whatever the schema
 * cannot represent is dropped at that instant, and the gate never sees it —
 * by the time the section is stored, the stored string and the parse agree with
 * each other perfectly, because the loss happened before either existed.
 *
 * The comparison is deliberately the same one the gate makes: the WORDS the
 * clipboard carried against the words that survived. It is a count, not a diff,
 * so it can say that something was dropped and not what — which is why the
 * notice it drives asks the writer to check their source rather than claiming
 * to know what went missing.
 *
 * `lost` is only reported above a one-word margin. The two counts come from
 * different tokenisers (a DOM text walk, and ProseMirror's slice text), and a
 * one-word disagreement across several pages is their noise floor rather than a
 * writer's missing sentence. Reporting it would put a warning on every ordinary
 * paste, and a warning that cries wolf on every paste is one nobody reads.
 */
export interface PasteFidelity {
  /** Words the clipboard HTML carried. 0 when the paste was not rich HTML. */
  expected: number;
  /** Words the parse kept. */
  kept: number;
  /** Words dropped, above the noise floor. 0 when nothing meaningful was lost. */
  lost: number;
}

const wordCount = (text: string): number =>
  normalizeForCompare(text).split(' ').filter(Boolean).length;

export function assessPasteFidelity(clipboardHtml: string, keptText: string): PasteFidelity {
  // Plain text has no structure to lose; comparing it would report its own
  // tokenisation noise on every ordinary paste.
  if (!looksLikeHtml(clipboardHtml)) return { expected: 0, kept: 0, lost: 0 };
  const expected = wordCount(htmlVisibleText(clipboardHtml));
  const kept = wordCount(keptText);
  const diff = expected - kept;
  return { expected, kept, lost: diff > 1 ? diff : 0 };
}
