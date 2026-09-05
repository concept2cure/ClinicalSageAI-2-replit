/**
 * Decode HTML entities in one pass, at the end of a markup reduction.
 *
 * ── Two ordering defects this closes ─────────────────────────────────────────
 *
 * **1. Decode before strip destroys content.** Both export pipelines reduce
 * stored HTML to text and finish with `replace(/<[^>]+>/g, '')`, a rule that
 * deletes a tag and inserts nothing. `htmlToOoxml` decoded entities BEFORE that
 * rule ran, so an author's literal comparator became something the very next
 * line read as markup:
 *
 *   'Total impurities were &lt; 0.05% and assay was &gt; 98.0%'
 *     → decode → '...were < 0.05% and assay was > 98.0%'
 *     → strip  → 'Total impurities were  98.0%'
 *
 * The limit, the criterion and the words between them are gone from the built
 * .docx. Nothing warns; nothing on the page suggests a specification was ever
 * stated. In this domain `&lt;` and `&gt;` are not decoration — they are how
 * release specifications, impurity limits and acceptance criteria are written,
 * and they arrive encoded because that is how an editor stores a literal `<`.
 *
 * So: strip markup first, decode last. Then a decoded `<` is never re-scanned.
 *
 * **2. Sequential replaces double-decode.** The old chain led with
 * `.replace(/&amp;/g, '&')` under the comment "& must be first to avoid
 * double-decode". It is exactly backwards. Decoding `&amp;` first rewrites
 * `&amp;lt;` — an author who typed the seven characters `&lt;` — into `&lt;`,
 * which the next replace in the chain turns into `<`. The two distinct inputs
 * `&amp;lt;` and `&lt;` collapse to the same output and the distinction is
 * unrecoverable. A single left-to-right pass cannot do this: each match is
 * consumed once and the replacement text is never re-examined.
 *
 * Only the named entities these pipelines actually encounter are handled, plus
 * numeric references, which the editor emits for anything outside them.
 *
 * @module server/export/decode-html-entities
 */

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ', // a normal space: these pipelines emit plain text and OOXML runs
  le: '≤',
  ge: '≥',
  ne: '≠',
  plusmn: '±',
  deg: '°',
  micro: 'µ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/** One alternation, one pass. Named entities are case-insensitive in the wild. */
const ENTITY = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * Decode HTML entities. Call this AFTER every tag-stripping rule has run and
 * BEFORE any XML/HTML re-escaping — never before a generic tag strip.
 *
 * An entity this does not recognise is left exactly as written rather than
 * dropped: an unknown `&foo;` in a filed document is better read literally than
 * silently deleted.
 */
export function decodeHtmlEntities(input: string): string {
  return input.replace(ENTITY, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      // Reject non-characters and anything outside Unicode rather than emitting
      // a replacement glyph that reads as data.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole; // lone surrogate
      return String.fromCodePoint(code);
    }
    const named = NAMED[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}
