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

  // Header (title + section code) for traceability.
  const header = options.sectionCode
    ? `${options.sectionCode}  ${options.title ?? ''}`.trim()
    : options.title ?? '';
  if (header) {
    drawLine(header, bold);
    y -= LINE_HEIGHT / 2;
  }

  const text = htmlToPlainText(content || '');
  const logicalLines = text.length ? text.split('\n') : ['(no content)'];
  for (const logical of logicalLines) {
    for (const wrapped of wrapLine(logical, font, maxWidth)) {
      drawLine(wrapped);
    }
  }

  const bytes = await doc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}
