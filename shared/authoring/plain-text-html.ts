/**
 * Plain text, written as the section editor's HTML, and the one rule for
 * telling the two apart.
 *
 * A section's content is one string. The section editor's boot path
 * (client/src/concept2cure/v2/editor/roundTrip.ts), the authoring export
 * (server/export/authoring-section-content.ts) and the lineage's machine
 * attribution (server/services/clinical-regulatory-evidence/
 * machine-attribution.ts) read it as HTML only when it holds a known tag
 * (looksLikeHtml, below). Any other string is plain text to them, every
 * character of it, `&amp;` included. The eCTD leaf renderer
 * (server/services/ectd/leaf-pdf-renderer.ts) parses every string as HTML.
 *
 * So text that is stored in such a column is stored as this function writes
 * it. Escaped text alone holds no known tag: the editor and the export would
 * show "R&amp;D" for "R&D", and the editor's next save would write that into
 * the record. Raw text is markup to the leaf renderer: an `<img>` in it is a
 * figure, and "Impurity B was <LOQ in all 3 batches" reads as "Impurity B
 * was". Escaped paragraphs read as the same words in all three (periodic
 * review 2026-09-28, editor family, SEC-B-1/2 follow-on b6).
 *
 * One implementation for the client and the server. The editor converts
 * textarea-era plain text with it when it opens a section, and section
 * generation stores a model's markdown body with it
 * (server/services/authoring/section-generation-service.ts).
 */

/**
 * True when the stored string is HTML rather than textarea-era plain text.
 *
 * One copy, here. The editor and the export each kept their own, held equal
 * only by a test comparing their source, and they had drifted before (below);
 * the lineage became a third reader (periodic review 2026-09-28, editor
 * family, the batch-draft accept, round 3).
 *
 * Matches KNOWN html tags only, deliberately: prose can legitimately contain
 * tag-shaped tokens (`temperature <critical> threshold`), and any-tag
 * detection routed such text through an HTML parse that swallowed the token —
 * the exact silent-loss class the editor's round-trip gate exists to stop.
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
 * this one governs whether `assessFidelity` reads the content as markup.
 */
const KNOWN_HTML_TAG =
  /<\/?(p|div|br|h[1-6]|ul|ol|li|dl|dt|dd|b|strong|i|em|u|s|strike|ins|del|span|table|caption|thead|tbody|tfoot|tr|td|th|blockquote|pre|a|img|hr|sub|sup|mark|code|font|section|article|figure|figcaption)\b[^>]*>/i;
export function looksLikeHtml(stored: string): boolean {
  return KNOWN_HTML_TAG.test(stored);
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
