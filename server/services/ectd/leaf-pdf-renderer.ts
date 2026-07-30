/**
 * Deterministic eCTD leaf PDF renderer.
 *
 * The eCTD publisher (`ectdExportService.generateEctdPackage`) writes leaf files
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
import { addBookmarks, type OutlineNode } from './pdf-bookmark-generator';

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
  [/[Α-Ωα-ω]/g, ''], // any other Greek letter → drop (rare in body)
  // Zero-width / BOM artifacts from copy-paste (U+200B–200D, U+FEFF).
  // Escapes, not literal glyphs: the characters are invisible in source, so a
  // literal class both trips no-irregular-whitespace and hides what it matches.
  [/[\u200B-\u200D\uFEFF]/g, ''],
];

/**
 * Make text safe for pdf-lib's WinAnsi standard fonts: apply the substitutions
 * above, then replace ANY remaining character the code page cannot represent
 * (everything outside tab/newlines/printable-ASCII/Latin-1) with '?'. This makes
 * the renderer total over arbitrary Unicode input — no authored glyph can crash a
 * submission export. Pure and deterministic, so the md5 leaf-checksum contract is
 * preserved. NBSP (U+00A0) is Latin-1 and WinAnsi-safe, so it is left intact.
 */
export function toWinAnsiSafe(input: string): string {
  let out = input;
  for (const [pattern, replacement] of WIN_ANSI_SUBSTITUTIONS) {
    out = out.replace(pattern, replacement);
  }
  // Keep: tab, LF, CR, printable ASCII (0x20–0x7E), Latin-1 (0xA0–0xFF).
  // Replace everything else (other controls, and any code point > 0xFF that was
  // not mapped above) with '?'.
  return out.replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Reduce HTML to readable plain text: block tags → newlines, strip the rest. */
export function htmlToPlainText(input: string): string {
  return input
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*>/gi, '\n')
    .replace(/<\s*(p|div|li|h[1-6]|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '') // remaining tags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Word-wrap a single logical line to a pixel width for the given font/size. */
function wrapLine(text: string, font: import('pdf-lib').PDFFont, maxWidth: number): string[] {
  if (text === '') return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, FONT_SIZE) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // A single word longer than the line: hard-break it by characters.
      if (font.widthOfTextAtSize(word, FONT_SIZE) > maxWidth) {
        let chunk = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, FONT_SIZE) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
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
