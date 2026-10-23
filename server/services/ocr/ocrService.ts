/**
 * OCR service — AnA's single front door for optical character recognition.
 *
 * Picks the right engine per input and reuses what already exists rather than
 * recreating it:
 *   • images (PNG/JPEG/TIFF/…) → {@link tesseractOcrService} (WASM, no system deps)
 *   • PDFs                     → the existing {@link OcrMyPdfClient} (system `ocrmypdf`,
 *                                which itself wraps Tesseract) when available
 *
 * Scanned-PDF OCR still needs the `ocrmypdf` binary (or a page rasteriser) — we do
 * not add a native rasteriser here; `getOcrCapabilities()` reports honestly what
 * each runtime can actually do so callers degrade gracefully.
 */

import { spawnSync } from 'node:child_process';
import { OcrMyPdfClient } from '../../integrations/ocrmypdf/client';
import { createScopedLogger } from '../../utils/logger';
import { DEFAULT_MAX_PAGE_PIXELS, rasterizePdfDocument, type RasterizeOptions } from './pdfRasterizer';
import {
  tesseractOcrService,
  type OcrImageOptions,
  type OcrImageResult,
  type ImageInput,
  type TesseractCapabilities,
} from './tesseractOcrService';

const logger = createScopedLogger('ocr-service');

function binaryAvailable(command: string): boolean {
  try {
    const probe = spawnSync(command, ['--version'], { stdio: 'ignore', timeout: 5000 });
    return !probe.error && (probe.status === 0 || probe.status === null);
  } catch {
    return false;
  }
}

export interface OcrCapabilities {
  /** Always present: portable WASM image OCR. */
  image: TesseractCapabilities;
  /** PDF OCR via system `ocrmypdf`. */
  pdf: {
    engine: 'ocrmypdf';
    available: boolean;
    command: string;
  };
  /** Scanned-PDF → text with no system binary (pdfjs rasterise + WASM Tesseract). */
  pdfToText: {
    engine: 'pdfjs+tesseract.js';
    available: true;
  };
  /** Legacy direct `tesseract` CLI, probed for completeness. */
  systemTesseract: boolean;
}

export interface OcrPdfResult {
  applied: boolean;
  engine: 'ocrmypdf';
  outputPath?: string;
  reason?: string;
}

export interface OcrPdfTextResult {
  text: string;
  /** Per-page recognised text, in order. */
  pages: string[];
  /** Per-page detail with source page numbers, confidences and the dpi actually rendered. */
  pageDetails: { page: number; text: string; confidence: number; dpi: number }[];
  /** Mean confidence across pages, 0–100. */
  confidence: number;
  engine: 'pdfjs+tesseract.js';
  durationMs: number;
  /** How much of the document was read, and what stopped it short. */
  coverage: OcrPdfCoverage;
}

export interface OcrPdfCoverage {
  /** Pages in the document. */
  pageCount: number;
  /** Pages chosen to read: the caller's range, then `maxPages`. */
  pagesSelected: number;
  /** Pages actually read. */
  pagesRead: number;
  /**
   * What read fewer pages than it would have: the deadline (`time_budget`) or
   * `maxPages` (`page_budget`). A range the caller asked for is not a limit.
   */
  limitedBy: 'page_budget' | 'time_budget' | null;
}

/** OCR options for a PDF: rasterizing, recognition, and a wall-clock deadline. */
export type OcrPdfOptions = OcrImageOptions & RasterizeOptions & {
  /** Epoch ms. No page after the first starts once it has passed. */
  deadlineAt?: number;
};

class OcrService {
  private readonly ocrMyPdf = new OcrMyPdfClient();
  private readonly ocrMyPdfCommand = process.env.OCRMYPDF_COMMAND || 'ocrmypdf';

  /** What this runtime can actually do — call before relying on an engine. */
  getCapabilities(): OcrCapabilities {
    return {
      image: tesseractOcrService.getCapabilities(),
      pdf: {
        engine: 'ocrmypdf',
        available: binaryAvailable(this.ocrMyPdfCommand),
        command: this.ocrMyPdfCommand,
      },
      pdfToText: { engine: 'pdfjs+tesseract.js', available: true },
      systemTesseract: binaryAvailable('tesseract'),
    };
  }

  /** OCR an image buffer or path. Works in every runtime (WASM). */
  async recognizeImage(input: ImageInput, options?: OcrImageOptions): Promise<OcrImageResult> {
    return tesseractOcrService.recognizeImage(input, options);
  }

  /**
   * Produce a text-searchable PDF from a (possibly scanned) PDF using `ocrmypdf`.
   * Degrades gracefully — never throws for a missing binary — so callers can fall
   * back (e.g. rasterise + {@link recognizeImage}) or surface the reason.
   */
  async ocrPdf(inputPath: string, outputPath: string): Promise<OcrPdfResult> {
    const result = await this.ocrMyPdf.run(inputPath, outputPath);
    if (result.applied) {
      return { applied: true, engine: 'ocrmypdf', outputPath };
    }
    logger.warn('PDF OCR not applied', { reason: result.stderr });
    return {
      applied: false,
      engine: 'ocrmypdf',
      reason: result.stderr || 'ocrmypdf_unavailable',
    };
  }

  /**
   * Extract text from a (possibly scanned) PDF with no system binary: rasterise
   * each page with pdfjs and OCR it with the WASM engine. Works in every runtime.
   * Supports targeted runs — page list/range and a fractional page region — so
   * huge scanned documents can be swept selectively (see RasterizeOptions).
   *
   * Every page is capped at DEFAULT_MAX_PAGE_PIXELS unless the caller sets
   * its own cap. Pages are rendered and read one at a time, so one page image
   * is held at once and `deadlineAt`, once passed, stops before the next page
   * is rendered. The result's `coverage` says how many of the document's
   * pages were read.
   */
  async ocrPdfToText(
    data: Buffer | Uint8Array,
    options: OcrPdfOptions | undefined = undefined,
  ): Promise<OcrPdfTextResult> {
    const startedAt = Date.now();
    const pages: string[] = [];
    const pageDetails: OcrPdfTextResult['pageDetails'] = [];
    const confidences: number[] = [];
    const deadlineAt = options?.deadlineAt;
    const { numPages, pagesRequested, pagesSelected } = await rasterizePdfDocument(data, {
      dpi: options?.dpi,
      maxPages: options?.maxPages,
      firstPage: options?.firstPage,
      lastPage: options?.lastPage,
      pages: options?.pages,
      region: options?.region,
      maxPixels: options?.maxPixels ?? DEFAULT_MAX_PAGE_PIXELS,
    }, async ({ page, png, dpi }) => {
      const result = await tesseractOcrService.recognizeImage(
        png,
        options?.languages ? { languages: options.languages } : undefined,
      );
      pages.push(result.text);
      pageDetails.push({ page, text: result.text, confidence: result.confidence, dpi });
      confidences.push(result.confidence);
      // One page's recognition cannot be interrupted; the next page is not rendered past the deadline.
      return deadlineAt !== undefined && Date.now() >= deadlineAt ? 'stop' : undefined;
    });

    const confidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
    const durationMs = Date.now() - startedAt;
    const limitedBy = pages.length < pagesSelected ? 'time_budget'
      : pagesSelected < pagesRequested ? 'page_budget' : null;
    const coverage: OcrPdfCoverage = { pageCount: numPages, pagesSelected, pagesRead: pages.length, limitedBy };
    logger.info('PDF text OCR completed', { pages: pages.length, confidence: Math.round(confidence), durationMs, ...coverage });

    return {
      text: pages.join('\n\n').trim(),
      pages,
      pageDetails,
      confidence,
      engine: 'pdfjs+tesseract.js',
      durationMs,
      coverage,
    };
  }

  /** Release any held OCR worker (call on shutdown). */
  async shutdown(): Promise<void> {
    await tesseractOcrService.terminate();
  }
}

export const ocrService = new OcrService();
