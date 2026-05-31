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
import { rasterizePdf, type RasterizeOptions } from './pdfRasterizer';
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
  /** Mean confidence across pages, 0–100. */
  confidence: number;
  engine: 'pdfjs+tesseract.js';
  durationMs: number;
}

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
   */
  async ocrPdfToText(
    data: Buffer | Uint8Array,
    options: (OcrImageOptions & RasterizeOptions) | undefined = undefined,
  ): Promise<OcrPdfTextResult> {
    const startedAt = Date.now();
    const images = await rasterizePdf(data, {
      dpi: options?.dpi,
      maxPages: options?.maxPages,
    });

    const pages: string[] = [];
    const confidences: number[] = [];
    for (const png of images) {
      const result = await tesseractOcrService.recognizeImage(
        png,
        options?.languages ? { languages: options.languages } : undefined,
      );
      pages.push(result.text);
      confidences.push(result.confidence);
    }

    const confidence = confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;
    const durationMs = Date.now() - startedAt;
    logger.info('PDF text OCR completed', { pages: pages.length, confidence: Math.round(confidence), durationMs });

    return {
      text: pages.join('\n\n').trim(),
      pages,
      confidence,
      engine: 'pdfjs+tesseract.js',
      durationMs,
    };
  }

  /** Release any held OCR worker (call on shutdown). */
  async shutdown(): Promise<void> {
    await tesseractOcrService.terminate();
  }
}

export const ocrService = new OcrService();
