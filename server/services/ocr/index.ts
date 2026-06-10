/**
 * AnA OCR — public surface.
 *
 * Portable image OCR (WASM Tesseract, no system deps) plus PDF OCR over the
 * existing ocrmypdf integration, behind one capability-aware facade.
 */

export { ocrService } from './ocrService';
export type { OcrCapabilities, OcrPdfResult, OcrPdfTextResult } from './ocrService';
export {
  rasterizePdf,
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
  extractDocumentText,
  type ExtractedDocumentText,
  type ExtractionMethod,
} from './extractDocumentText';
export {
  tesseractOcrService,
  type OcrImageOptions,
  type OcrImageResult,
  type ImageInput,
  type TesseractCapabilities,
} from './tesseractOcrService';
