/**
 * Unified text extraction for uploaded documents — the bridge from a raw upload
 * to text AnA can use and store in project memory.
 *
 * Picks the right method per file, with OCR as the recovery path so scanned/image
 * documents are no longer opaque:
 *   • text/*           → utf8
 *   • images           → WASM Tesseract OCR
 *   • PDFs             → born-digital text (pdf-parse), OCR fallback when scanned
 *   • .docx            → mammoth raw text
 *
 * Pure composition over existing dependencies — no new extractor engine.
 */

import { ocrService } from './ocrService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('document-text');

export type ExtractionMethod =
  | 'utf8'
  | 'pdf-text'
  | 'pdf-ocr'
  | 'image-ocr'
  | 'docx'
  | 'none';

export interface ExtractedDocumentText {
  text: string;
  method: ExtractionMethod;
  /** OCR mean confidence (0–100) when an OCR method was used. */
  confidence?: number;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Below this many characters a PDF text layer is treated as missing → OCR. */
const PDF_TEXT_MIN = 200;

export async function extractDocumentText(
  buffer: Buffer,
  mime: string | undefined,
  filename = '',
): Promise<ExtractedDocumentText> {
  const m = (mime || '').toLowerCase();
  const isText = m.startsWith('text/') || /\.(txt|md|csv|json|log)$/i.test(filename);
  const isImage = m.startsWith('image/') || /\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(filename);
  const isPdf = m === 'application/pdf' || /\.pdf$/i.test(filename);
  const isDocx = m === DOCX_MIME || /\.docx$/i.test(filename);

  if (isText) {
    return { text: buffer.toString('utf8').trim(), method: 'utf8' };
  }

  if (isImage) {
    try {
      const r = await ocrService.recognizeImage(buffer);
      return { text: r.text, method: 'image-ocr', confidence: r.confidence };
    } catch (error) {
      logger.warn('image OCR failed', { error: error instanceof Error ? error.message : String(error) });
      return { text: '', method: 'none' };
    }
  }

  if (isPdf) {
    let text = '';
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      text = (parsed.text || '').trim();
    } catch (error) {
      logger.warn('pdf-parse failed', { error: error instanceof Error ? error.message : String(error) });
    }
    if (text.length >= PDF_TEXT_MIN) {
      return { text, method: 'pdf-text' };
    }
    // Thin or no text layer → scanned PDF; recover with OCR.
    try {
      const ocr = await ocrService.ocrPdfToText(buffer);
      if (ocr.text.length > text.length) {
        return { text: ocr.text, method: 'pdf-ocr', confidence: ocr.confidence };
      }
    } catch (error) {
      logger.warn('pdf OCR failed', { error: error instanceof Error ? error.message : String(error) });
    }
    return text ? { text, method: 'pdf-text' } : { text: '', method: 'none' };
  }

  if (isDocx) {
    try {
      const mammoth = await import('mammoth');
      const r = await mammoth.extractRawText({ buffer });
      return { text: (r.value || '').trim(), method: 'docx' };
    } catch (error) {
      logger.warn('docx extraction failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { text: '', method: 'none' };
}
