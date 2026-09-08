import { getSchema, type JSONContent, type Extensions } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { fixTables, tableEditing } from '@tiptap/pm/tables';

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
  return htmlVisibleTextFromDoc(new DOMParser().parseFromString(html, 'text/html'));
}

/** The body-text walk, over an ALREADY-parsed document — so assessFidelity can
 *  parse the stored HTML once and read both its text and its structural
 *  signature off the same DOM. */
function htmlVisibleTextFromDoc(doc: Document): string {
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

/**
 * A count of the STRUCTURE the record carries, in the exact shape ProseMirror
 * preserves as document semantics — not tag counts. Text equality cannot see a
 * heading demoted to a paragraph or a caption reparented into a data cell,
 * because every word survives; these counters can. Every field is chosen to be
 * INVARIANT under the normalization the gate must allow (a legacy <div>
 * becoming <p>, <b> becoming <strong>): none of those creates, removes, or
 * re-ranks a heading, table, row, declared cell, caption, header cell,
 * definition item, or image.
 */
export interface StructuralSignature {
  /** Heading ranks present, sorted ascending. A demotion changes the multiset. */
  headingLevels: number[];
  tables: number;
  rows: number;
  /** DECLARED td+th elements — never the colspan/rowspan-expanded grid. */
  cells: number;
  /** Tables carrying a non-empty caption. */
  captions: number;
  /** th, plus td inside thead — the export parser's own header rule. */
  headerCells: number;
  /** dt+dd. The parsed side is always 0: the schema has no definition-list node. */
  defItems: number;
  images: number;
}

export interface FidelityVerdict {
  /** True when rich editing would lose or alter stored text OR structure. */
  lossy: boolean;
  /** Normalized text of the stored content (what the record says). */
  storedText: string;
  /** Normalized text as the editor parsed it (what rich mode would keep). */
  parsedText: string;
  /** Structure the stored content carries. */
  storedSignature: StructuralSignature;
  /** Structure the parse retained. */
  parsedSignature: StructuralSignature;
  /** Which signature fields diverged — drives the "why rich is off" notice. */
  structuralDrift: (keyof StructuralSignature)[];
}

const EMPTY_SIGNATURE: StructuralSignature = {
  headingLevels: [],
  tables: 0,
  rows: 0,
  cells: 0,
  captions: 0,
  headerCells: 0,
  defItems: 0,
  images: 0,
};

/** Collapse whitespace and trim — a caption of only spaces is not a caption. */
const cleanText = (t: string): string => t.replace(/\s+/g, ' ').trim();

/**
 * The structure a stored HTML string carries, read off its parsed DOM.
 *
 * Counts DECLARED elements, deliberately: a `<td colspan="2">` is ONE cell here
 * and ONE tableCell node on the parsed side, so a merged-cell table reads equal
 * on both sides. Counting the expanded grid instead would flag every merged
 * table into source mode — the primary false-positive trap.
 */
export function structuralSignatureFromDom(doc: Document): StructuralSignature {
  const q = (sel: string) => Array.from(doc.querySelectorAll(sel));
  const headingLevels = q('h1,h2,h3,h4,h5,h6')
    .map((el) => Number(el.tagName[1]))
    .sort((a, b) => a - b);
  const captions = q('table > caption').filter((el) => cleanText(el.textContent ?? '') !== '').length;
  return {
    headingLevels,
    tables: q('table').length,
    rows: q('tr').length,
    cells: q('td,th').length,
    captions,
    headerCells: q('th').length + q('thead td').length,
    defItems: q('dt,dd').length,
    images: q('img').length, // any <img>; a srcless one is DROPPED by the parse, so its drift is real
  };
}

/**
 * The structure the editor's parse retained, read off the TipTap JSON document.
 *
 * Matched by node.type string. A stored heading that parsed to a paragraph
 * contributes no heading here, so it drops out of the multiset and the drift is
 * seen. The caption is read from `attrs.caption` — the same attribute
 * `parsedDocText` reads — NOT from table content, or it would re-introduce the
 * false positives that logic exists to prevent.
 */
export function structuralSignatureFromDoc(root: JSONContent): StructuralSignature {
  const sig: StructuralSignature = {
    headingLevels: [], tables: 0, rows: 0, cells: 0,
    captions: 0, headerCells: 0, defItems: 0, images: 0,
  };
  const walk = (node: JSONContent): void => {
    switch (node.type) {
      case 'heading': sig.headingLevels.push(Number(node.attrs?.level ?? 1)); break;
      case 'table':
        sig.tables += 1;
        if (cleanText(String(node.attrs?.caption ?? '')) !== '') sig.captions += 1;
        break;
      case 'tableRow': sig.rows += 1; break;
      case 'tableCell': sig.cells += 1; break;
      case 'tableHeader': sig.cells += 1; sig.headerCells += 1; break;
      case 'image': sig.images += 1; break;
      // No case for a definition list: the schema registers no node for one, so
      // defItems is 0 on this side by construction — which is exactly why any
      // stored dt/dd is a drift the gate must catch.
      default: break;
    }
    (node.content ?? []).forEach(walk);
  };
  walk(root);
  sig.headingLevels.sort((a, b) => a - b);
  return sig;
}

/** The signature fields that differ. Empty when the structure round-trips. */
export function signatureDrift(a: StructuralSignature, b: StructuralSignature): (keyof StructuralSignature)[] {
  const drift: (keyof StructuralSignature)[] = [];
  const eqArr = (x: number[], y: number[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  if (!eqArr(a.headingLevels, b.headingLevels)) drift.push('headingLevels');
  for (const k of ['tables', 'rows', 'cells', 'captions', 'headerCells', 'defItems', 'images'] as const) {
    if (a[k] !== b[k]) drift.push(k);
  }
  return drift;
}

/**
 * The readable text of a parsed TipTap document — what the parse actually kept.
 *
 * Moved here from the editor so assessFidelity can take the parsed doc directly:
 * the boot path already holds `generateJSON(html, extensions)`, and this is the
 * single canonical reader of a parsed doc's record-text, shared with the gate.
 * Leaf nodes whose text is RESOLVED at render time (a cross-reference or
 * citation's number, a table's caption attribute) contribute their stored/cached
 * value, because the gate's question is "did the parse keep what was stored",
 * not "is the resolved value current".
 */
export function parsedDocText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'crossReference') return String(node.attrs?.label ?? '');
  if (node.type === 'citation') return String(node.attrs?.label ?? '');
  const inner = (node.content ?? []).map(parsedDocText).join('');
  if (node.type === 'table') {
    const caption = String(node.attrs?.caption ?? '');
    return (caption ? caption + '\n' : '') + inner + '\n';
  }
  return node.type === 'doc' ? inner : inner + '\n';
}


/**
 * The document the LIVE editor will actually hold — which is NOT what
 * generateJSON returns, and the difference silently rewrites the record.
 *
 * generateJSON parses HTML to a ProseMirror doc via DOMParser and runs no
 * plugins. The Editor runs fixTables on its first transaction, which
 * RECTANGULARIZES a ragged table — padding short rows with fabricated empty
 * cells — and clamps a rowspan that overflows the table. So a non-rectangular
 * stored table passes a generateJSON-based check, opens in rich mode, and is
 * mutated into the governed record the instant the writer edits anything (the
 * whole reason rich mode was opened). Every word survives; the geometry is
 * silently reinterpreted — the exact class this gate exists to stop, missed
 * because the gate modeled a lighter parse than the editor performs.
 *
 * This returns the fixTables-normalized doc when a table would be rewritten
 * (so the signature comparison sees the padded cell count and refuses rich
 * mode), and the input unchanged otherwise — including on any modeling failure,
 * which is no worse than comparing the raw parse.
 */
export interface EditorHeldDoc {
  /** The document as the editor will hold it after fixTables. */
  doc: JSONContent;
  /**
   * True when fixTables produced a transaction — i.e. the editor WOULD rewrite a
   * stored table on first edit. Ragged padding surfaces as a cell-count drift in
   * the signature too, but a rowspan/colspan CLAMP changes only an attribute and
   * no count, so it is invisible to any counter — yet it still rewrites the
   * record. This boolean is the complete signal: if the editor would touch the
   * table, refuse rich mode, whatever the counts say.
   */
  tablesRewritten: boolean;
}

export function editorHeldDoc(json: JSONContent, extensions: Extensions): EditorHeldDoc {
  try {
    const schema = getSchema(extensions);
    const doc = schema.nodeFromJSON(json);
    const state = EditorState.create({ doc, schema, plugins: [tableEditing()] });
    const tx = fixTables(state);
    return tx ? { doc: tx.doc.toJSON() as JSONContent, tablesRewritten: true } : { doc: json, tablesRewritten: false };
  } catch {
    return { doc: json, tablesRewritten: false };
  }
}

/**
 * ACCEPTED, DOCUMENTED GAPS — structural changes the signature deliberately
 * does NOT flag, because a signature that caught them would false-positive on
 * ordinary content and dump legitimate documents into the source-mode textarea
 * (the harm the design fought hardest to avoid). Each is either cosmetic or
 * vanishingly rare in stored content:
 *   - <section>/<article>/<font> unwrapping and <div>→<p> normalization;
 *   - inline-mark flattening (a <b>/<sup>/<mark> losing its mark) — the words
 *     survive and the text axis is unaffected;
 *   - an image's ALT/caption content (only image PRESENCE is signatured; a
 *     srcless <img> is caught because it is dropped whole, but a changed alt is
 *     not) — alt is a void-element attribute in neither text nor structure;
 *   - list MARKER style set by CSS (list-style-type) rather than the tag;
 *     <ol type>/<ol start> ARE preserved and need no signature;
 *   - heading CONTAINMENT (a heading lifted out of a list item) and paragraph
 *     BOUNDARIES — counted signatures would false-positive on legitimate reflow.
 * These were confirmed low-exposure by an adversarial empirical sweep; adding
 * fields for them was explicitly rejected.
 */

/**
 * Compare the stored content against what the editor's parse retained, on BOTH
 * axes: the readable text (character-exact — the property this module was built
 * for, unchanged) AND the document STRUCTURE. A mismatch on EITHER is lossy.
 *
 * Text equality alone has twice affirmed a corruption it could not see — a
 * heading flattened one rank, a caption reparented into a data cell — because
 * every word survived. The structural signature closes that class: it counts
 * the constructs ProseMirror preserves as semantics and refuses rich mode when
 * the parse changed one, so the next save cannot write a demoted structure into
 * the governed record while the gate looks the other way.
 *
 * Structure is ORed IN, never substituted: a structural check that let text
 * loss through would regress the property the module exists for.
 *
 * `parsedDoc` is the TipTap JSON the boot path already holds
 * (`generateJSON(html, extensions)`) — so the stored HTML is parsed to a DOM
 * exactly once here, and both the visible text and the structural signature are
 * read off that one DOM.
 */
export function assessFidelity(stored: string, parsedDoc: JSONContent): FidelityVerdict {
  const isHtml = looksLikeHtml(stored);
  // Plain-text stored content has no markup — an all-zero signature, no DOM
  // parse — exactly as the text side treats it as itself. plainTextToHtml
  // output is paragraphs-only, so the parsed signature is all-zero too and they
  // match; only the text governs, as before.
  const doc = isHtml ? new DOMParser().parseFromString(stored, 'text/html') : null;
  const storedText = normalizeForCompare(doc ? htmlVisibleTextFromDoc(doc) : stored);
  const storedSignature = doc ? structuralSignatureFromDom(doc) : EMPTY_SIGNATURE;

  const parsedText = normalizeForCompare(parsedDocText(parsedDoc));
  const parsedSignature = structuralSignatureFromDoc(parsedDoc);

  const structuralDrift = signatureDrift(storedSignature, parsedSignature);
  const lossy = storedText !== parsedText || structuralDrift.length > 0;
  return { lossy, storedText, parsedText, storedSignature, parsedSignature, structuralDrift };
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
  // The one-word noise floor is a floor for LONG pastes. On a short paste a
  // one-word disagreement is not tokeniser noise; in a filing, "not" is a word.
  const lost = diff > 1 || (diff === 1 && expected <= 40) ? diff : 0;
  return { expected, kept, lost };
}

/**
 * The plain text a parsed document would serialize back to, under the same
 * contract `plainTextToHtml` encodes: paragraphs separated by one blank line,
 * hard breaks as single newlines. An exact comparison with the stored string
 * is the fidelity gate for `format: 'text'` — whitespace the parse collapsed
 * (runs of spaces, tabs, extra blank lines) shows up as a difference here.
 */
export function docToPlainText(root: JSONContent): string {
  const inline = (n: JSONContent): string => {
    if (n.type === 'text') return n.text ?? '';
    if (n.type === 'hardBreak') return '\n';
    return (n.content ?? []).map(inline).join('');
  };
  return (root.content ?? []).map(inline).join('\n\n');
}
