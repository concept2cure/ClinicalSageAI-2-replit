/**
 * Plain text, written as the section editor's HTML.
 *
 * A section's content is one string. The section editor's boot path
 * (`looksLikeHtml`, client/src/concept2cure/v2/editor/roundTrip.ts) and the
 * authoring export (`contentLooksLikeHtml`,
 * server/export/authoring-section-content.ts) read it as HTML only when it
 * holds a known tag. Any other string is plain text to them, every character
 * of it, `&amp;` included. The eCTD leaf renderer
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
