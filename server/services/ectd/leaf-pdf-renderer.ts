/**
 * Deterministic eCTD leaf PDF renderer.
 *
 * The eCTD assemblers (leaf-source-resolver / assemble-from-core) write leaf files
 * with a `.pdf` extension, but the source content for a granule/section is HTML
 * or plain text. Writing those bytes under a `.pdf` name produces a file that an
 * FDA ESG / eCTD validator rejects (not a real PDF). This module renders that
 * content to genuine, valid PDF bytes using pdf-lib — pure JavaScript, so it
 * works in every environment (no LibreOffice/Chromium dependency) and is
 * unit-testable.
 *
 * Determinism: the same input yields byte-identical output (fixed metadata and
 * epoch dates, no object streams). That is what keeps the md5 a granule's
 * index.xml records stable across re-renders — the eCTD checksum contract.
 *
 * Fidelity note: this is a faithful TEXT rendering (HTML is reduced to text and
 * laid out as paragraphs). High-fidelity rendering of styled HTML/DOCX leaves is
 * the LibreOffice/Puppeteer path in `pdf-converter.ts`; this renderer guarantees
 * a valid PDF leaf everywhere, which is what the eCTD structure requires.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { parse as parseHtml } from 'node-html-parser';
import { addBookmarks, type OutlineNode } from './pdf-bookmark-generator';
import { inlineMarksToText } from '../../export/inline-marks-to-text.js';
import { decodeHtmlEntities } from '../../export/decode-html-entities.js';

const PAGE_WIDTH = 612; // US Letter, points
const PAGE_HEIGHT = 792;
const MARGIN = 72; // 1 inch
const FONT_SIZE = 11;
const LINE_HEIGHT = 15;
const EPOCH = new Date(0);

export interface LeafPdfOptions {
  /** Document title written to PDF metadata (and the page header). */
  title?: string;
  /** eCTD section code, shown in the header for traceability. */
  sectionCode?: string;
  /**
   * Optional explicit bookmark outline for a multi-section leaf (e.g. a CSR or
   * a summary with its own ToC). When omitted, a single document-level bookmark
   * (the section code + title) is added so every rendered leaf is navigable —
   * FDA eCTD guidance requires PDF bookmarks for navigation. Page indices are
   * caller-supplied (zero-based); they should match this renderer's layout.
   */
  bookmarks?: OutlineNode[];
}

/**
 * Faithful ASCII substitutions for the non-WinAnsi glyphs that actually occur in
 * submission source text. pdf-lib's standard (WinAnsi/Windows-1252) fonts throw
 * in page.drawText on any code point the code page cannot represent, and a single
 * such glyph would otherwise 500 the WHOLE eCTD export — box drawing from the
 * generated placeholder leaves, and arrows / Greek letters / math operators /
 * minus signs pasted out of Word or PubMed in CMC and clinical prose. Mapped
 * BEFORE the catch-all below so they read correctly rather than becoming '?'.
 */
const WIN_ANSI_SUBSTITUTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  // Box drawing (U+2500–257F) / block elements (U+2580–259F): placeholder leaves,
  // ASCII tables.
  [/[─-╿]/g, '-'],
  [/[▀-▟]/g, '#'],
  // Arrows.
  [/[→↦⇒]/g, '->'],
  [/[←⇐]/g, '<-'],
  [/[↔⇔]/g, '<->'],
  // Math operators not in WinAnsi (note: +/- U+00B1, x U+00D7, / U+00F7,
  // degree U+00B0 and micro U+00B5 ARE in WinAnsi and are left untouched).
  [/−/g, '-'], // minus sign → hyphen
  [/≤/g, '<='], // ≤
  [/≥/g, '>='], // ≥
  [/≠/g, '!='], // ≠
  [/≈/g, '~'], // ≈
  [/∞/g, 'inf'], // ∞
  // Greek letters common in CMC/PK text (α, β, μ-as-U+03BC, …).
  [/α/g, 'alpha'],
  [/β/g, 'beta'],
  [/γ/g, 'gamma'],
  [/δ/g, 'delta'],
  [/λ/g, 'lambda'],
  [/μ/g, 'u'], // Greek small mu → u (micro sign U+00B5 is WinAnsi, untouched)
  [/σ/g, 'sigma'],
  [/ω/g, 'omega'],
  // ── Every remaining Greek letter is TRANSLITERATED, never dropped ─────────
  // This line used to be `[/[Α-Ωα-ω]/g, '']` — "any other Greek letter → drop
  // (rare in body)". They are not rare in clinical statistics, and dropping is
  // the worst available outcome because the sentence stays grammatical while
  // the symbol identifying the number disappears:
  //
  //   "chi-square χ² = 4.21"      rendered as   "chi-square ² = 4.21"
  //   "Δ from baseline -2.4"      rendered as   "from baseline -2.4"
  //   "Spearman ρ = 0.42"         rendered as   "Spearman = 0.42"
  //   "Kendall τ = 0.31"          rendered as   "Kendall = 0.31"
  //
  // A reviewer cannot see that anything was removed. Verified by extracting the
  // text back out of a rendered leaf with pdfjs.
  [/Χ/g, 'Chi'], [/χ/g, 'chi'],
  [/Δ/g, 'Delta'],
  [/Π/g, 'Pi'], [/π/g, 'pi'],
  [/Θ/g, 'Theta'], [/θ/g, 'theta'],
  [/ρ/g, 'rho'],
  [/τ/g, 'tau'],
  [/Φ/g, 'Phi'], [/φ/g, 'phi'],
  [/Ψ/g, 'Psi'], [/ψ/g, 'psi'],
  [/Ω/g, 'Omega'],
  [/Σ/g, 'Sigma'],
  [/Λ/g, 'Lambda'],
  [/Γ/g, 'Gamma'],
  [/Α/g, 'Alpha'], [/Β/g, 'Beta'],
  [/ε/g, 'epsilon'], [/ζ/g, 'zeta'], [/η/g, 'eta'], [/ι/g, 'iota'],
  [/κ/g, 'kappa'], [/ν/g, 'nu'], [/ξ/g, 'xi'], [/ο/g, 'o'],
  [/υ/g, 'upsilon'],
  // Anything still Greek (final sigma, accented forms) transliterates to a
  // marker rather than vanishing — '?' is honest, absence is not.
  [/[Α-Ωα-ω]/g, '?'],
  // ── Sub/superscript digits ───────────────────────────────────────────────
  // CO₂ and H₂O are ordinary CMC text; ₂ is not WinAnsi and became '?'.
  [/₀/g, '0'], [/₁/g, '1'], [/₂/g, '2'], [/₃/g, '3'], [/₄/g, '4'],
  [/₅/g, '5'], [/₆/g, '6'], [/₇/g, '7'], [/₈/g, '8'], [/₉/g, '9'],
  // Superscripts are handled as whole runs by normalizeSuperscripts() below.
  // Zero-width / BOM artifacts from copy-paste (U+200B–200D, U+FEFF).
  [/[\u200B-\u200D\uFEFF]/g, ''],
];

/**
 * Superscript runs become caret notation: "10⁶" -> "10^6", "5×10⁻³" -> "5×10^-3".
 *
 * Two separate hazards make this a run-level transform rather than per-character
 * substitution:
 *
 *   1. Dropping the marker changes the value. Mapping ⁶ to a bare '6' turns
 *      "10⁶ CFU/mL" into "106 CFU/mL" — a microbial count wrong by four orders
 *      of magnitude, and plausible enough that no reviewer would query it. A
 *      corrupted number that still looks like a number is worse than a visible
 *      '?', which is what this used to render.
 *   2. ¹ ² ³ are Latin-1 and survive to the page as real superscript glyphs
 *      while ⁴-⁹ and ⁻ do not. Substituting only the latter left one number
 *      spelled two ways — "5×10⁻³" came out as "5×10^-³". Normalizing the whole
 *      run gives a submission one exponent notation throughout.
 */
const SUPERSCRIPT_DIGITS: Readonly<Record<string, string>> = {
  '\u2070': '0', '\u00b9': '1', '\u00b2': '2', '\u00b3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
  '\u207a': '+', '\u207b': '-', '\u207c': '=', '\u207d': '(', '\u207e': ')',
  '\u2071': 'i', '\u207f': 'n',
};

export function normalizeSuperscripts(input: string): string {
  return input.replace(
    /[\u2070-\u207f\u00b9\u00b2\u00b3]+/g,
    (run) => '^' + Array.from(run).map((c) => SUPERSCRIPT_DIGITS[c] ?? c).join(''),
  );
}

/**
 * Make text safe for pdf-lib's WinAnsi standard fonts: apply the substitutions
 * above, then replace ANY remaining character the code page cannot represent
 * (everything outside tab/newlines/printable-ASCII/Latin-1) with '?'. This makes
 * the renderer total over arbitrary Unicode input — no authored glyph can crash a
 * submission export. Pure and deterministic, so the md5 leaf-checksum contract is
 * preserved. NBSP (U+00A0) is Latin-1 and WinAnsi-safe, so it is left intact.
 */
export function toWinAnsiSafe(input: string): string {
  let out = normalizeSuperscripts(input);
  for (const [pattern, replacement] of WIN_ANSI_SUBSTITUTIONS) {
    out = out.replace(pattern, replacement);
  }
  // Keep: tab, LF, CR, printable ASCII (0x20–0x7E), Latin-1 (0xA0–0xFF), AND
  // the 27 characters CP1252 places at 0x80–0x9F whose Unicode code points are
  // above 0xFF.
  //
  // The filter used to reject everything > 0xFF, which destroyed characters
  // WinAnsi can represent perfectly well. Confirmed against pdf-lib itself:
  // page.drawText succeeds for en dash, em dash, curly quotes, dagger, double
  // dagger, bullet, ellipsis, trademark and euro; it throws only for genuinely
  // unrepresentable code points such as ₂, χ and Δ (handled above). So this was
  // damaging submission prose for no reason:
  //
  //   "Range 10–20 mg — as dosed"   rendered as   "Range 10?20 mg ? as dosed"
  //   "“primary” and ‘secondary’"   rendered as   "?primary? and ?secondary?"
  //   "Footnote † and ‡"            rendered as   "Footnote ? and ?"
  //
  // Ranges, quoted endpoint names and dagger footnote markers are ordinary in
  // text pasted from Word, which is how most submission source arrives.
  return out.replace(/[^\t\n\r\x20-\x7E\xA0-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/g, '?');
}

/**
 * Reduce HTML to readable plain text: block tags → newlines, strip the rest.
 *
 * ── Why table cells get an explicit delimiter ───────────────────────────────
 * `tr` produced a line break but `td`/`th` fell through to the generic
 * strip-remaining-tags rule, which removes a tag and inserts NOTHING. So the
 * cells of an HTML table were concatenated in the rendered leaf:
 *
 *   <tr><th>Arm</th><th>n</th></tr>          rendered as   Armn
 *   <tr><td>Placebo</td><td>150</td></tr>    rendered as   Placebo150
 *
 * Confirmed by extracting the text back out of a rendered PDF with pdfjs. No
 * content is lost — every character survives — but the boundary between a label
 * and its value is, which in a filing package means a dose or a subject count
 * running into the cell beside it in a document a regulator reads.
 *
 * Only the boundary BETWEEN adjacent cells becomes a delimiter; the row's final
 * `</td>` is still stripped by the generic rule, so a row does not end in a
 * dangling separator. ` | ` matches the convention serializeTable() already
 * uses in orchestrator-real-package.ts, and single spaces survive the
 * whitespace-collapsing rules below (a two-space separator would not).
 *
 * The orchestrator path was never affected: it serializes structured tables via
 * serializeTable() before rendering. This is the leaf-source-resolver path,
 * which renders stored document HTML directly.
 */
/**
 * Reduce stored document HTML to the plain text a leaf renders.
 *
 * -- Why this walks a tree instead of running regexes --------------------------
 * The regex reducer this replaces lost content silently. Extracting text back
 * out of rendered leaves with pdfjs turned up eight distinct failures, and the
 * ones that matter share a shape: the page still reads as a finished sentence,
 * so nothing on it tells a reviewer that anything is missing.
 *
 *   <img>     disappeared entirely. "See figure." / [K-M curve] / "After."
 *             rendered as "See figure. After." - a cross-reference pointing at
 *             nothing, with the alt text discarded too.
 *   <dl>      ran together: an abbreviations list came out as
 *             "AEAdverse eventSAESerious AE".
 *   lists     lost numbering and nesting. Inclusion criteria and their
 *             sub-criteria flattened into one column with "Exclusion", so which
 *             criteria belonged to which heading was no longer recoverable, and
 *             "as described in step 3" had no step 3 to point at.
 *   entities  only five were decoded. "37&deg;C &plusmn;2" printed literally,
 *             ampersands and all, into a filed document.
 *   <pre>     lost its indentation to the whitespace collapse.
 *   <style>   and <script> bodies leaked in as visible document text.
 *   cells     containing a heading or a nested table left the row broken across
 *             lines with a dangling " | ".
 *
 * node-html-parser is already a production dependency, is synchronous and pure,
 * and decodes the full named and numeric entity set. Determinism matters here
 * beyond readability: leaf checksums in the eCTD backbone are md5 over the
 * rendered bytes, so identical input must always reduce to identical text.
 *
 * Parsing must never fail a submission export, so anything thrown falls back to
 * the original tag-stripping reducer, which is total by construction.
 */
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'figure', 'figcaption',
  'form', 'fieldset', 'address', 'details', 'summary', 'caption',
]);

/** Markup machinery whose text is never document content. */
const DROPPED_TAGS = new Set(['script', 'style', 'noscript', 'head', 'template', 'iframe']);

/**
 * Fences <pre> content so the whitespace-normalizing pass steps over it. U+0000
 * cannot appear in parsed HTML text, and toWinAnsiSafe's keep-set excludes it,
 * so a sentinel that somehow survived could never reach a rendered page.
 */
const PRE_SENTINEL = '\u0000';

const DIGITS_AND_SIGN_ONLY = /^[0-9+-]+$/;

interface WalkContext {
  /** Nesting depth of the enclosing list, for indentation. */
  listDepth: number;
}

function collapseInline(text: string): string {
  return text.replace(/\s+/g, ' ');
}

function isElement(node: any): boolean {
  return node?.nodeType === 1;
}

/** A node's child text, inline whitespace collapsed and trimmed. */
function inlineText(node: any, ctx: WalkContext): string {
  return collapseInline(walkChildren(node, ctx)).trim();
}

function tagOf(node: any): string | undefined {
  return isElement(node) ? (node.rawTagName ?? '').toLowerCase() : undefined;
}

function renderListItems(list: any, ctx: WalkContext): string {
  const ordered = tagOf(list) === 'ol';
  const startAttr = Number.parseInt(list.getAttribute?.('start') ?? '', 10);
  let counter = Number.isFinite(startAttr) ? startAttr : 1;
  const indent = '  '.repeat(ctx.listDepth);
  const childCtx: WalkContext = { listDepth: ctx.listDepth + 1 };

  const lines: string[] = [];
  for (const child of list.childNodes) {
    if (tagOf(child) !== 'li') continue;

    // A nested list inside the <li> renders after the item's own text, one level
    // deeper. This hierarchy is what the flat reducer destroyed.
    const nestedLists: any[] = [];
    const ownParts: string[] = [];
    for (const grand of child.childNodes) {
      const tag = tagOf(grand);
      if (tag === 'ul' || tag === 'ol') nestedLists.push(grand);
      else ownParts.push(walkNode(grand, childCtx));
    }

    const marker = ordered ? counter + '. ' : '- ';
    counter += 1;
    lines.push(indent + marker + collapseInline(ownParts.join('')).trim());
    for (const nested of nestedLists) lines.push(renderListItems(nested, childCtx));
  }
  return lines.join('\n');
}

function renderRow(row: any, ctx: WalkContext): string {
  const cells: string[] = [];
  for (const cell of row.childNodes) {
    const tag = tagOf(cell);
    if (tag !== 'td' && tag !== 'th') continue;
    // A block element inside a cell (a heading, a nested table) must not break
    // the row apart, so cell content is flattened onto one line.
    cells.push(collapseInline(walkChildren(cell, ctx).replace(/\n+/g, ' ')).trim());
  }
  return cells.join(' | ');
}

function walkChildren(node: any, ctx: WalkContext): string {
  let out = '';
  for (const child of node.childNodes ?? []) out += walkNode(child, ctx);
  return out;
}

function walkNode(node: any, ctx: WalkContext): string {
  if (node?.nodeType === 3) return node.text ?? ''; // text node, entities decoded
  if (!isElement(node)) return '';

  const tag = tagOf(node) ?? '';
  if (DROPPED_TAGS.has(tag)) return '';

  switch (tag) {
    case 'br':
    case 'hr':
      return '\n';

    case 'img': {
      // Never silent. Alt text is the figure's only description in a text
      // rendering; the file name still tells a reviewer something was there.
      const alt = collapseInline(node.getAttribute('alt') ?? '').trim();
      const src = (node.getAttribute('src') ?? '').split(/[/\\]/).pop() ?? '';
      return '\n[Figure: ' + (alt || src || 'image') + ']\n';
    }

    case 'pre':
      // Verbatim, indentation included, fenced so normalization leaves it alone.
      return '\n' + PRE_SENTINEL + node.text + PRE_SENTINEL + '\n';

    // <sup> and the tracked-change marks are converted upstream by
    // inlineMarksToText, which both export pipelines share; handling them again
    // here would fork the contract that module exists to keep single.
    case 'sub': {
      const inner = inlineText(node, ctx);
      if (!inner) return '';
      // H<sub>2</sub>O reads as H2O; anything else keeps a visible marker.
      return DIGITS_AND_SIGN_ONLY.test(inner) ? inner : '_' + inner;
    }

    case 'ul':
    case 'ol':
      return '\n' + renderListItems(node, ctx) + '\n';

    case 'dl':
      return '\n' + walkChildren(node, ctx) + '\n';
    case 'dt':
      return '\n' + inlineText(node, ctx) + ': ';
    case 'dd':
      return inlineText(node, ctx) + '\n';

    case 'tr':
      return renderRow(node, ctx) + '\n';
    case 'td':
    case 'th':
      // Reached only for a cell walked outside a row (malformed markup).
      return collapseInline(walkChildren(node, ctx)).trim() + ' ';
    case 'table':
    case 'thead':
    case 'tbody':
    case 'tfoot':
      return '\n' + walkChildren(node, ctx) + '\n';

    default:
      if (BLOCK_TAGS.has(tag)) return '\n' + walkChildren(node, ctx) + '\n';
      return walkChildren(node, ctx); // inline: span, strong, em, a, code, ...
  }
}

/** The pre-tree reducer, kept as the fallback that cannot throw. */
function legacyHtmlToPlainText(input: string): string {
  const stripped = input
    .replace(/<\s*\/\s*(?:td|th)\s*>\s*<\s*(?:td|th)\b[^>]*>/gi, ' | ')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, '\n')
    .replace(/<\s*(p|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  /* Decoded only now that no tag rule remains — that order was already right
     here — but through the shared single-pass decoder, because the chain this
     replaced led with `&amp;`, which turned an author's literal `&amp;lt;`
     into `<`. See server/export/decode-html-entities.ts. */
  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function htmlToPlainText(input: string): string {
  // Inline semantic marks become text BEFORE the tree is walked, through the
  // module the DOCX pipeline shares: <del>/<ins> must survive as [-...-] and
  // [+...+] because silently settling an unresolved suggestion either way
  // fabricates a decision nobody made. One implementation, both callers - these
  // two pipelines had already drifted apart on the identical table-cell defect.
  const marked = inlineMarksToText(input);

  let raw: string;
  try {
    raw = walkNode(parseHtml(marked) as any, { listDepth: 0 });
  } catch (error) {
    // Degrading is right - a parse failure must not fail a submission export -
    // but it must not be invisible either: the fallback loses figures, list
    // structure and most entities, so anyone looking at a leaf rendered this way
    // needs to be able to find out that it was.
    console.warn(
      '[ectd-leaf] HTML parse failed; fell back to the tag-stripping reducer, ' +
        'which does not preserve figures, list structure or entities: ' +
        (error instanceof Error ? error.message : String(error)),
    );
    return legacyHtmlToPlainText(marked);
  }

  // Split out the verbatim <pre> regions so normalization cannot reach them.
  const normalized = raw.split(PRE_SENTINEL).map((segment, index) => {
    if (index % 2 === 1) return segment; // inside <pre>
    return segment
      .replace(/ ?\n ?\| ?/g, ' | ')  // a block inside a cell must not break the row
      .split('\n')
      // Collapse runs of spaces and tabs WITHIN a line, but never the leading
      // indent: that indent is the only thing carrying list nesting depth, and
      // collapsing it made every level render one space deep - which is to say,
      // made a sub-criterion indistinguishable from the criterion below it.
      .map((line) => {
        const lead = /^ */.exec(line)?.[0] ?? '';
        return lead + line.slice(lead.length).replace(/[^\S\n]+/g, ' ').trimEnd();
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  });

  return normalized.join('').trim();
}

/** Word-wrap a single logical line to a pixel width for the given font/size. */
/**
 * Wrap one logical line to the page width, keeping its leading indentation.
 *
 * The indent is not decoration: it is the only thing that carries list nesting
 * depth onto the rendered page, so a sub-criterion can be told apart from the
 * criterion after it. This used to split the whole line on /\s+/, which dropped
 * the indent before the first word was measured - htmlToPlainText could compute
 * the hierarchy perfectly and none of it would reach the paper.
 *
 * Continuation lines carry the same indent, so a criterion that wraps stays
 * visually inside its own level instead of falling back to the margin.
 */
function wrapLine(text: string, font: import('pdf-lib').PDFFont, maxWidth: number): string[] {
  if (text === '') return [''];

  const indent = /^[ \t]*/.exec(text)?.[0] ?? '';
  const words = text.slice(indent.length).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = indent;
  for (const word of words) {
    const candidate = current === indent ? `${current}${word}` : `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current !== indent) lines.push(current);
    // A single word wider than the line: hard-break it by characters.
    if (font.widthOfTextAtSize(indent + word, FONT_SIZE) > maxWidth) {
      let chunk = indent;
      for (const ch of word) {
        if (font.widthOfTextAtSize(chunk + ch, FONT_SIZE) > maxWidth && chunk !== indent) {
          lines.push(chunk);
          chunk = indent + ch;
        } else {
          chunk += ch;
        }
      }
      current = chunk;
    } else {
      current = indent + word;
    }
  }
  if (current !== indent) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Render content (HTML or plain text) to a deterministic, valid PDF leaf.
 * Returns the PDF bytes as a Buffer.
 */
export async function renderLeafPdf(content: string, options: LeafPdfOptions = {}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Deterministic metadata — no wall-clock dates, no random producer string.
  doc.setTitle(options.title ?? 'eCTD leaf');
  doc.setProducer('Concept2Cure eCTD leaf renderer');
  doc.setCreator('Concept2Cure eCTD leaf renderer');
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  const maxWidth = PAGE_WIDTH - 2 * MARGIN;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const drawLine = (text: string, f = font) => {
    if (y < MARGIN) newPage();
    page.drawText(text, { x: MARGIN, y, size: FONT_SIZE, font: f, color: rgb(0, 0, 0) });
    y -= LINE_HEIGHT;
  };

  // Header (title + section code) for traceability. Sanitized like the body so a
  // non-WinAnsi glyph in a section title cannot crash the render.
  const header = toWinAnsiSafe(
    (options.sectionCode
      ? `${options.sectionCode}  ${options.title ?? ''}`.trim()
      : options.title ?? '')
  );
  if (header) {
    drawLine(header, bold);
    y -= LINE_HEIGHT / 2;
  }

  // toWinAnsiSafe BEFORE wrapping: both width measurement and drawText must see
  // only representable glyphs, or either can throw on the raw content.
  const text = toWinAnsiSafe(htmlToPlainText(content || ''));
  const logicalLines = text.length ? text.split('\n') : ['(no content)'];
  for (const logical of logicalLines) {
    for (const wrapped of wrapLine(logical, font, maxWidth)) {
      drawLine(wrapped);
    }
  }

  let bytes = await doc.save({ useObjectStreams: false });

  // Bookmarks: an explicit multi-section outline when provided, otherwise a
  // single document-level bookmark so every leaf is navigable per FDA eCTD
  // guidance. addBookmarks is deterministic (no dates/random), so the byte
  // stability / md5 contract above is preserved.
  const outline: OutlineNode[] =
    options.bookmarks && options.bookmarks.length > 0
      ? options.bookmarks
      : header
        ? [{ title: header, sectionCode: options.sectionCode ?? '', pageIndex: 0 }]
        : [];
  if (outline.length > 0) {
    bytes = await addBookmarks(bytes, outline);
  }

  return Buffer.from(bytes);
}

/** One section of a structured leaf (heading + body, optionally nested). */
export interface LeafSection {
  /** Section heading (drawn bold, becomes a bookmark). */
  heading: string;
  /** Narrative body (plain text or HTML; empty bodies render a placeholder). */
  body?: string;
  /** Optional section code shown before the heading and on the bookmark. */
  sectionCode?: string;
  /** Nested subsections (rendered with deeper indentation + nested bookmarks). */
  children?: LeafSection[];
}

/**
 * Render a STRUCTURED leaf (a tree of heading/body sections) to a deterministic
 * PDF whose bookmarks point at the ACTUAL page each section starts on. Unlike
 * renderLeafPdf (flat content + a single document bookmark), this tracks the
 * live page index as it lays each heading out, so a multi-section document
 * (a CSR, an IND Safety Report, an Annual Report) gets a real, navigable
 * outline — what FDA eCTD guidance requires for multi-section PDFs.
 *
 * Deterministic: fixed metadata + epoch dates + deterministic bookmark objects,
 * so identical input yields byte-identical output (the md5 contract).
 */
export async function renderStructuredLeafPdf(
  sections: LeafSection[],
  options: LeafPdfOptions = {},
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle(options.title ?? 'eCTD leaf');
  doc.setProducer('Concept2Cure eCTD leaf renderer');
  doc.setCreator('Concept2Cure eCTD leaf renderer');
  doc.setCreationDate(EPOCH);
  doc.setModificationDate(EPOCH);

  const maxWidth = PAGE_WIDTH - 2 * MARGIN;
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const draw = (text: string, f = font, indent = 0) => {
    if (y < MARGIN) newPage();
    page.drawText(text, { x: MARGIN + indent, y, size: FONT_SIZE, font: f, color: rgb(0, 0, 0) });
    y -= LINE_HEIGHT;
  };

  // Document title header.
  const header = toWinAnsiSafe(
    (options.sectionCode
      ? `${options.sectionCode}  ${options.title ?? ''}`.trim()
      : options.title ?? '')
  );
  if (header) {
    draw(header, bold);
    y -= LINE_HEIGHT / 2;
  }

  // Walk the section tree depth-first, recording the page index at which each
  // heading is drawn so the bookmark jumps to the right page.
  const walk = (nodes: LeafSection[], depth: number): OutlineNode[] =>
    nodes.map((s) => {
      const indent = depth * 14;
      // A heading near the bottom of a page should start the next page so it is
      // not orphaned away from its body — and so its bookmark page is accurate.
      if (y < MARGIN + LINE_HEIGHT * 2) newPage();
      const pageIndex = doc.getPageCount() - 1;
      const label = toWinAnsiSafe(s.sectionCode ? `${s.sectionCode}  ${s.heading}` : s.heading);
      draw(label, bold, indent);

      const bodyText = toWinAnsiSafe(htmlToPlainText(s.body ?? ''));
      const lines = bodyText.length ? bodyText.split('\n') : ['—'];
      for (const logical of lines) {
        for (const wrapped of wrapLine(logical, font, maxWidth - indent)) {
          draw(wrapped, font, indent);
        }
      }
      y -= LINE_HEIGHT / 2;

      const children = s.children && s.children.length > 0 ? walk(s.children, depth + 1) : undefined;
      return { title: label, sectionCode: s.sectionCode ?? '', pageIndex, children };
    });

  const outline = walk(sections.length ? sections : [{ heading: '(no content)' }], 0);

  let bytes = await doc.save({ useObjectStreams: false });
  bytes = await addBookmarks(bytes, outline);
  return Buffer.from(bytes);
}
