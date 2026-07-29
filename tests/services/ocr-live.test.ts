/**
 * AnA OCR — live integration test (no mocks).
 *
 * Exercises the real WASM Tesseract engine and the real pdfjs+canvas rasteriser
 * against the vendored language data in `server/assets/tessdata/`. Fully offline
 * and deterministic — proves OCR actually works in CI, not just that the wiring
 * type-checks. Skips automatically if the language data hasn't been vendored.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ocrService } from '../../server/services/ocr';
import { tesseractOcrService } from '../../server/services/ocr/tesseractOcrService';
import { extractDocumentText } from '../../server/services/ocr/extractDocumentText';

const HAS_LANG_DATA = existsSync(
  path.resolve(__dirname, '../../server/assets/tessdata/eng.traineddata.gz'),
);
const describeLive = HAS_LANG_DATA ? describe : describe.skip;

function textImagePng(text: string): Buffer {
  const canvas = createCanvas(720, 160);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 720, 160);
  ctx.fillStyle = '#000000';
  ctx.font = '44px sans-serif';
  ctx.fillText(text, 30, 95);
  return canvas.toBuffer('image/png');
}

async function onePagePdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 200]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 110, size: 32, font, color: rgb(0, 0, 0) });
  return Buffer.from(await doc.save());
}

describeLive('OCR (live)', () => {
  afterAll(async () => {
    await ocrService.shutdown();
  });

  it('reports language data as available locally', () => {
    expect(tesseractOcrService.getCapabilities().langDataLocal).toBe(true);
  });

  it('recognises text in an image with high confidence', async () => {
    const result = await ocrService.recognizeImage(textImagePng('AnA OCR works offline'));
    expect(result.text.toLowerCase()).toContain('ana ocr works offline');
    expect(result.confidence).toBeGreaterThan(70);
  }, 60000);

  it('extracts text from a PDF (rasterise + OCR, no system binary)', async () => {
    const pdf = await onePagePdf('Scanned PDF OCR path');
    const result = await ocrService.ocrPdfToText(pdf);
    expect(result.pages).toHaveLength(1);
    expect(result.text.toLowerCase()).toContain('scanned pdf ocr path');
    expect(result.engine).toBe('pdfjs+tesseract.js');
  }, 60000);
});

describe('extractDocumentText (live)', () => {
  it('reads text/* directly', async () => {
    const out = await extractDocumentText(Buffer.from('plain memory text'), 'text/plain', 'a.txt');
    expect(out.method).toBe('utf8');
    expect(out.text).toBe('plain memory text');
  });

  (HAS_LANG_DATA ? it : it.skip)('OCRs an uploaded image', async () => {
    const out = await extractDocumentText(textImagePng('Memory from an image'), 'image/png', 'a.png');
    expect(out.method).toBe('image-ocr');
    expect(out.text.toLowerCase()).toContain('memory from an image');
  }, 60000);

  it('reads a born-digital PDF text layer (no OCR needed)', async () => {
    const pdf = await onePagePdf(
      'Born digital body text long enough to skip OCR '.repeat(6),
    );
    const out = await extractDocumentText(pdf, 'application/pdf', 'b.pdf');
    expect(out.method).toBe('pdf-text');
    expect(out.text.toLowerCase()).toContain('born digital body text');
  }, 60000);
});
