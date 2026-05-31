/**
 * AnA OCR — unit tests.
 *
 * Deterministic and offline: the WASM worker and the ocrmypdf client are mocked,
 * so these run without network access or system binaries. They cover:
 *   • tesseractOcrService — capability reporting, language selection, worker reuse
 *   • ocrService          — engine routing + graceful PDF degradation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted so the (also-hoisted) vi.mock factories can close over them.
const { recognize, terminate, createWorker, ocrmypdfRun } = vi.hoisted(() => ({
  recognize: vi.fn(async (_image: unknown) => ({
    data: { text: '  Hello, AnA.  ', confidence: 92.5 },
  })),
  terminate: vi.fn(async () => undefined),
  createWorker: vi.fn(async (_langs: unknown) => ({ recognize, terminate })),
  ocrmypdfRun: vi.fn(async () => ({ applied: false, stderr: 'ocrmypdf: not found' })),
}));

vi.mock('tesseract.js', () => ({
  createWorker,
  Worker: class {},
}));

vi.mock('../../server/integrations/ocrmypdf/client', () => ({
  OcrMyPdfClient: class {
    run = ocrmypdfRun;
  },
}));

import { tesseractOcrService } from '../../server/services/ocr/tesseractOcrService';
import { ocrService } from '../../server/services/ocr';

beforeEach(async () => {
  // Reset the cached singleton worker so worker-reuse counts are per-test.
  await tesseractOcrService.terminate();
  vi.clearAllMocks();
  delete process.env.TESSERACT_LANG;
  delete process.env.TESSERACT_LANG_PATH;
});

describe('tesseractOcrService', () => {
  it('reports the WASM engine as available with sensible defaults', () => {
    const caps = tesseractOcrService.getCapabilities();
    expect(caps.engine).toBe('tesseract.js');
    expect(caps.available).toBe(true);
    expect(caps.defaultLanguages).toEqual(['eng']);
    expect(caps.supportedLanguages).toContain('eng');
    // No vendored traineddata in the test env.
    expect(caps.langDataLocal).toBe(false);
  });

  it('honours TESSERACT_LANG for default languages', () => {
    process.env.TESSERACT_LANG = 'eng+fra';
    expect(tesseractOcrService.getCapabilities().defaultLanguages).toEqual(['eng', 'fra']);
  });

  it('recognises an image buffer and trims the result', async () => {
    const result = await tesseractOcrService.recognizeImage(Buffer.from('fake-png'));
    expect(result.text).toBe('Hello, AnA.');
    expect(result.confidence).toBeCloseTo(92.5);
    expect(result.languages).toEqual(['eng']);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(createWorker).toHaveBeenCalledWith(['eng'], undefined, expect.any(Object));
  });

  it('reuses the worker across calls with the same languages', async () => {
    await tesseractOcrService.recognizeImage(Buffer.from('a'));
    await tesseractOcrService.recognizeImage(Buffer.from('b'));
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(recognize).toHaveBeenCalledTimes(2);
  });

  it('serialises concurrent recognise calls', async () => {
    const [r1, r2] = await Promise.all([
      tesseractOcrService.recognizeImage(Buffer.from('a')),
      tesseractOcrService.recognizeImage(Buffer.from('b')),
    ]);
    expect(r1.text).toBe('Hello, AnA.');
    expect(r2.text).toBe('Hello, AnA.');
    expect(recognize).toHaveBeenCalledTimes(2);
  });
});

describe('ocrService', () => {
  it('exposes capabilities: WASM image OCR always, PDF gated on ocrmypdf', () => {
    const caps = ocrService.getCapabilities();
    expect(caps.image.available).toBe(true);
    expect(caps.pdf.engine).toBe('ocrmypdf');
    // ocrmypdf binary is absent in the test runtime.
    expect(caps.pdf.available).toBe(false);
    expect(typeof caps.systemTesseract).toBe('boolean');
  });

  it('routes image OCR to the WASM engine', async () => {
    const out = await ocrService.recognizeImage(Buffer.from('img'));
    expect(out.text).toBe('Hello, AnA.');
  });

  it('degrades gracefully when ocrmypdf is unavailable (never throws)', async () => {
    const out = await ocrService.ocrPdf('/tmp/in.pdf', '/tmp/out.pdf');
    expect(out.applied).toBe(false);
    expect(out.engine).toBe('ocrmypdf');
    expect(out.reason).toContain('not found');
    expect(ocrmypdfRun).toHaveBeenCalledWith('/tmp/in.pdf', '/tmp/out.pdf');
  });

  it('reports applied when ocrmypdf succeeds', async () => {
    ocrmypdfRun.mockResolvedValueOnce({ applied: true, stderr: '' });
    const out = await ocrService.ocrPdf('/tmp/in.pdf', '/tmp/out.pdf');
    expect(out.applied).toBe(true);
    expect(out.outputPath).toBe('/tmp/out.pdf');
  });
});
