/**
 * Inline semantic marks → their plain-text equivalents, before any tag strip.
 *
 * ── The defect this exists to close ──────────────────────────────────────────
 * Two independent export pipelines reduce stored HTML to text by removing every
 * remaining tag with `replace(/<[^>]+>/g, '')` — a rule that deletes a tag and
 * inserts NOTHING:
 *
 *   server/services/ectd/leaf-pdf-renderer.ts   htmlToPlainText
 *   server/services/docx/masterDocumentBuilder.ts  htmlToOoxml
 *
 * For `<sup>` and for the editor's tracked-change marks that is not a loss of
 * formatting. It changes what the document says:
 *
 *   Bioburden was 10<sup>6</sup> CFU/mL           ->  ...was 106 CFU/mL
 *   Administer <del>100 mg</del><ins>200 mg</ins> ->  Administer 100 mg200 mg
 *   Dose <del>100 mg</del> daily                  ->  Dose 100 mg daily
 *
 * The first is wrong by five orders of magnitude and looks entirely normal on
 * the page — nothing suggests anything was lost, which is what makes it the
 * worst kind of export defect. The second is garbled. The third is the most
 * dangerous of all: a deletion a reviewer had PROPOSED is silently ACCEPTED,
 * and the filed leaf then states 100 mg as settled fact. An insertion alone
 * fares the same way in reverse.
 *
 * That last one is the rule the DOCX authoring branch already states and
 * enforces — "an unresolved suggestion is part of the record's human-readable
 * form and silently settling it either way at export time would fabricate a
 * decision nobody made" (server/export/authoring-blocks-to-docx.ts). That path
 * emits real Word revisions; plain text has no such affordance, so both sides
 * survive explicitly marked. A reader sees that a change is pending, which is
 * true, instead of a confident value that was chosen for them.
 *
 * ── Why one module and not two copies ────────────────────────────────────────
 * Both pipelines need exactly this conversion, and a second copy is a second
 * thing to forget. The two had already drifted apart on the identical table-cell
 * defect once. One implementation, both callers.
 *
 * ── Superscript is marked; subscript deliberately is not ─────────────────────
 * `CO<sub>2</sub>` -> `CO2` is the conventional written form of a formula and
 * reads correctly as-is; `CO_2` would be the unusual rendering. The asymmetry
 * IS the rule: superscript is marked because dropping it changes a magnitude,
 * subscript is not because dropping it does not.
 *
 * Every character emitted here is ASCII, so it survives the WinAnsi filter the
 * PDF renderer applies and pdf-lib's standard fonts can draw it. Unicode ⁶
 * cannot be drawn by those fonts and would degrade to `?`.
 */

/** `<ins>`/`<del>` carry data-author-name and data-at from the editor, so the
 *  patterns must tolerate attributes — a bare-tag pattern would miss every
 *  real suggestion the product writes. */
const RULES: Array<[RegExp, string]> = [
  [/<\s*sup\b[^>]*>([\s\S]*?)<\s*\/\s*sup\s*>/gi, '^$1'],
  [/<\s*del\b[^>]*>([\s\S]*?)<\s*\/\s*del\s*>/gi, '[-$1-]'],
  [/<\s*ins\b[^>]*>([\s\S]*?)<\s*\/\s*ins\s*>/gi, '[+$1+]'],
];

/**
 * Replace inline semantic marks with plain-text equivalents.
 *
 * Call this BEFORE any generic tag strip; afterwards the information is gone.
 * Leaves all other markup untouched, so the caller's own structural rules
 * (block tags, table cells) still see the document they expect.
 */
export function inlineMarksToText(html: string): string {
  let out = html;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return out;
}
