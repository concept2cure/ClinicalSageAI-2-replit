/**
 * Unified text extraction for uploaded documents — the bridge from a raw upload
 * to text AnA can use and store in project memory.
 *
 * Picks the right method per file, with OCR as the recovery path so scanned/image
 * documents are no longer opaque:
 *   • text/* (.txt/.md/.csv/.json/.log) → utf8
 *   • images           → WASM Tesseract OCR
 *   • PDFs             → born-digital text (pdf-parse), OCR fallback when scanned
 *   • .docx            → mammoth raw text
 *   • .xlsx            → exceljs, all sheets rendered as text
 *
 * Pure composition over existing dependencies — no new extractor engine.
 */

import { ocrService } from './ocrService';
import { alignPageSpans, type PageSpan } from './page-offsets';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('document-text');

export type ExtractionMethod =
  | 'utf8'
  | 'pdf-text'
  | 'pdf-ocr'
  | 'image-ocr'
  | 'docx'
  | 'xlsx'
  | 'none';

export interface ExtractedDocumentText {
  text: string;
  method: ExtractionMethod;
  /** OCR mean confidence (0–100) when an OCR method was used. */
  confidence?: number;
  /**
   * Where each page begins and ends in `text`, for the formats that have pages
   * and only when every page could be LOCATED in the combined text (see
   * page-offsets.ts — a map that cannot be verified is not returned at all).
   * This is what lets a passage cite "p.41" instead of a character offset
   * nobody can check against the file.
   */
  pageSpans?: PageSpan[];
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
/** Below this many characters a PDF text layer is treated as missing → OCR. */
const PDF_TEXT_MIN = 200;

/**
 * A PDF's text, with page spans when they can be verified.
 *
 * Its own function because the PDF path is three strategies in a trench coat —
 * a text layer, an OCR recovery when that layer is thin or absent, and the
 * text layer again as a last resort — and reading it inline with the other five
 * formats hid that. It is also where the page mapping lives, which is the part
 * a passage citation depends on.
 */
async function extractPdfText(buffer: Buffer): Promise<ExtractedDocumentText> {
  let text = '';
  /* The per-page pieces the extractor produced, kept so a page span can be
     ALIGNED against the combined text rather than inferred from it. */
  let pages: Array<{ page: number; text: string }> = [];
  try {
    // pdf-parse v2 exports a `PDFParse` class at runtime, but the resolved
    // .d.cts types still describe the v1 default-function API, so the named
    // import trips tsc. Narrow the shape we actually use (behavior unchanged).
    interface PdfParseInstance {
      getText(): Promise<{ text?: string; pages?: Array<{ num?: number; text?: string }> }>;
    }
    interface PdfParseCtor { new (opts: { data: Buffer }): PdfParseInstance; }
    const mod = (await import('pdf-parse')) as unknown as { PDFParse: PdfParseCtor };
    const parser = new mod.PDFParse({ data: buffer });
    const parsed = await parser.getText();
    text = (parsed.text || '').trim();
    pages = Array.isArray(parsed.pages)
      ? parsed.pages.map((p, i) => ({ page: typeof p?.num === 'number' ? p.num : i + 1, text: p?.text ?? '' }))
      : [];
  } catch (error) {
    logger.warn('pdf-parse failed', { error: error instanceof Error ? error.message : String(error) });
  }
  if (text.length >= PDF_TEXT_MIN) {
    return { text, method: 'pdf-text', pageSpans: alignPageSpans(text, pages) ?? undefined };
  }
  // Thin or no text layer → scanned PDF; recover with OCR.
  try {
    const ocr = await ocrService.ocrPdfToText(buffer);
    if (ocr.text.length > text.length) {
      return {
        text: ocr.text,
        method: 'pdf-ocr',
        confidence: ocr.confidence,
        /* pageDetails carries the SOURCE page numbers, which differ from the
           array index whenever the rasteriser was given a page range. */
        pageSpans: alignPageSpans(ocr.text, ocr.pageDetails.map(d => ({ page: d.page, text: d.text }))) ?? undefined,
      };
    }
  } catch (error) {
    logger.warn('pdf OCR failed', { error: error instanceof Error ? error.message : String(error) });
  }
  return text
    ? { text, method: 'pdf-text', pageSpans: alignPageSpans(text, pages) ?? undefined }
    : { text: '', method: 'none' };
}

/** Which extractor a file needs, from its media type and, failing that, its name. */
type DocumentFormat = 'xlsx' | 'text' | 'image' | 'pdf' | 'docx' | 'unknown';

/**
 * Classify the upload. Separated from the dispatch below so the five patterns
 * are read as one list rather than as five conditions interleaved with the
 * bodies they guard — which is also what kept extractDocumentText over the
 * complexity limit.
 *
 * Order matters and is preserved exactly: xlsx is tested before text because a
 * spreadsheet can arrive with a text-ish mime, and the filename fallbacks exist
 * because browsers routinely send application/octet-stream.
 */
export function classifyDocumentFormat(mime: string | undefined, filename = ''): DocumentFormat {
  const m = (mime || '').toLowerCase();
  if (m === XLSX_MIME || /\.xlsx$/i.test(filename)) return 'xlsx';
  if (m.startsWith('text/') || /\.(txt|md|csv|json|log)$/i.test(filename)) return 'text';
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(filename)) return 'image';
  if (m === 'application/pdf' || /\.pdf$/i.test(filename)) return 'pdf';
  if (m === DOCX_MIME || /\.docx$/i.test(filename)) return 'docx';
  return 'unknown';
}

async function extractXlsxText(
  buffer: Buffer,
  filename: string,
  mime: string | undefined,
): Promise<ExtractedDocumentText> {
  try {
    const { workbookToText } = await import('../documentIntelligence/spreadsheetService');
    return { text: await workbookToText(buffer, filename, mime), method: 'xlsx' };
  } catch (error) {
    logger.warn('xlsx extraction failed', { error: error instanceof Error ? error.message : String(error) });
    return { text: '', method: 'none' };
  }
}

async function extractImageText(buffer: Buffer): Promise<ExtractedDocumentText> {
  try {
    const r = await ocrService.recognizeImage(buffer);
    return { text: r.text, method: 'image-ocr', confidence: r.confidence };
  } catch (error) {
    logger.warn('image OCR failed', { error: error instanceof Error ? error.message : String(error) });
    return { text: '', method: 'none' };
  }
}

async function extractDocxText(buffer: Buffer): Promise<ExtractedDocumentText> {
  try {
    const mammoth = await import('mammoth');
    const r = await mammoth.extractRawText({ buffer });
    return { text: (r.value || '').trim(), method: 'docx' };
  } catch (error) {
    logger.warn('docx extraction failed', { error: error instanceof Error ? error.message : String(error) });
    return { text: '', method: 'none' };
  }
}

export async function extractDocumentText(
  buffer: Buffer,
  mime: string | undefined,
  filename = '',
): Promise<ExtractedDocumentText> {
  switch (classifyDocumentFormat(mime, filename)) {
    case 'xlsx':
      return extractXlsxText(buffer, filename, mime);
    case 'text':
      return { text: buffer.toString('utf8').trim(), method: 'utf8' };
    case 'image':
      return extractImageText(buffer);
    case 'pdf':
      return extractPdfText(buffer);
    case 'docx':
      return extractDocxText(buffer);
    default:
      // A format with no extractor is not an error: the document is admitted
      // and the catalog records that its content could not be read.
      return { text: '', method: 'none' };
  }
}
