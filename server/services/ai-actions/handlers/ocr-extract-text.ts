/**
 * OCR Extract Text Handler
 *
 * AnA-callable OCR. After a paperclip upload lands a scanned image (or image-only
 * PDF) in the project vault, AnA can call this to read the text off the page.
 *
 *   • images (png/jpeg/tiff/bmp/webp) → WASM Tesseract — works in every runtime.
 *   • PDFs                            → ocrmypdf when the binary is installed;
 *                                       otherwise reports why and what's available.
 *
 * Payload:
 *   vaultVersionId : string  (required) — the stored file to read
 *   languages?     : string[]           — OCR languages (default ['eng'] / TESSERACT_LANG)
 */

import { registerActionHandler } from '../action-registry';
import { getStorageProvider } from '../../storage';
import { ocrService } from '../../ocr';
import type {
  AIActionHandler,
  AIActionRequest,
  AIActionResponse,
  AIActionExecutionContext,
  AIActionError,
} from '../../../../shared/types/ai-actions';

function isImageMime(mime: string, fileName: string): boolean {
  if (mime?.startsWith('image/')) return true;
  return /\.(png|jpe?g|tiff?|bmp|webp|pbm|gif)$/i.test(fileName);
}

const handler: AIActionHandler = {
  actionType: 'ocr_extract_text',

  validate(request: AIActionRequest): AIActionError[] {
    const errors: AIActionError[] = [];
    if (!request.payload?.vaultVersionId || typeof request.payload.vaultVersionId !== 'string') {
      errors.push({ code: 'MISSING_FILE', message: 'payload.vaultVersionId is required' });
    }
    return errors;
  },

  async execute(
    request: AIActionRequest,
    ctx: AIActionExecutionContext,
  ): Promise<AIActionResponse> {
    const vaultVersionId = String(request.payload.vaultVersionId);
    const languages = Array.isArray(request.payload.languages)
      ? (request.payload.languages as unknown[]).map(String).filter(Boolean)
      : undefined;

    const base = {
      actionType: 'ocr_extract_text' as const,
      createdObjects: [],
      updatedObjects: [],
      provenance: {
        actionId: ctx.actionId,
        timestamp: new Date().toISOString(),
        userId: ctx.user.userId,
        organizationId: ctx.user.organizationId,
        projectId: request.projectId,
        sourceSurface: request.sourceSurface,
      },
      nextSuggestedActions: [],
    };

    const storage = getStorageProvider();
    const file = await storage.get(vaultVersionId);

    if (!file) {
      return {
        ...base,
        success: false,
        status: 'failed',
        result: null,
        warnings: [],
        errors: [{ code: 'FILE_NOT_FOUND', message: `No stored file for vaultVersionId ${vaultVersionId}` }],
      };
    }

    const fileName = file.filename || 'upload';
    const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(fileName);

    if (!isImageMime(file.mime, fileName) && !isPdf) {
      return {
        ...base,
        success: false,
        status: 'failed',
        result: null,
        warnings: [],
        errors: [
          {
            code: 'UNSUPPORTED_FOR_OCR',
            message: `OCR handles images and PDFs; ${fileName} (${file.mime}) is neither.`,
          },
        ],
      };
    }

    let text: string;
    let confidence: number;
    let durationMs: number;
    let langs: string[];

    if (isPdf) {
      // Scanned/image-only PDF — rasterise + WASM OCR (no system binary needed).
      const ocr = await ocrService.ocrPdfToText(file.bytes, languages ? { languages } : undefined);
      text = ocr.text;
      confidence = ocr.confidence;
      durationMs = ocr.durationMs;
      langs = languages ?? ['eng'];
    } else {
      const ocr = await ocrService.recognizeImage(file.bytes, languages ? { languages } : undefined);
      text = ocr.text;
      confidence = ocr.confidence;
      durationMs = ocr.durationMs;
      langs = ocr.languages;
    }

    return {
      ...base,
      success: true,
      status: 'completed',
      result: {
        text,
        confidence,
        languages: langs,
        chars: text.length,
        durationMs,
        kind: isPdf ? 'pdf' : 'image',
      },
      warnings: text.length === 0 ? ['OCR produced no text — the document may be blank or unreadable.'] : [],
      errors: [],
    };
  },
};

registerActionHandler(handler);

export default handler;
