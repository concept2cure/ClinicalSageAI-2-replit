/**
 * AnA OCR — public surface.
 *
 * Portable image OCR (WASM Tesseract, no system deps) plus PDF OCR over the
 * existing ocrmypdf integration, behind one capability-aware facade.
 */

export { ocrService } from './ocrService';
export type { OcrCapabilities, OcrPdfCoverage, OcrPdfOptions, OcrPdfResult, OcrPdfTextResult } from './ocrService';
export {
  DEFAULT_MAX_PAGE_PIXELS,
  rasterizePdf,
  rasterizePdfDocument,
  rasterizePdfPages,
  type RasterizeOptions,
  type RasterizeRegion,
  type RasterizedPage,
} from './pdfRasterizer';
export {
  inspectPdf,
  extractPdfPagesText,
  type PdfInventory,
  type PdfOutlineEntry,
  type PdfPageTextStat,
} from './pdfInspector';
export {
  AUTOMATIC_PDF_OCR_BUDGET,
  extractDocumentText,
  type ExtractedDocumentText,
  type ExtractionCoverage,
  type ExtractionMethod,
} from './extractDocumentText';
export {
  tesseractOcrService,
  type OcrImageOptions,
  type OcrImageResult,
  type ImageInput,
  type TesseractCapabilities,
} from './tesseractOcrService';
