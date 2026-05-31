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
  /** Legacy direct `tesseract` CLI, probed for completeness. */
  systemTesseract: boolean;
}

export interface OcrPdfResult {
  applied: boolean;
  engine: 'ocrmypdf';
  outputPath?: string;
  reason?: string;
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

  /** Release any held OCR worker (call on shutdown). */
  async shutdown(): Promise<void> {
    await tesseractOcrService.terminate();
  }
}

export const ocrService = new OcrService();
