/**
 * AnA OCR — public surface.
 *
 * Portable image OCR (WASM Tesseract, no system deps) plus PDF OCR over the
 * existing ocrmypdf integration, behind one capability-aware facade.
 */

export { ocrService } from './ocrService';
export type { OcrCapabilities, OcrPdfResult } from './ocrService';
export {
  tesseractOcrService,
  type OcrImageOptions,
  type OcrImageResult,
  type ImageInput,
  type TesseractCapabilities,
} from './tesseractOcrService';
