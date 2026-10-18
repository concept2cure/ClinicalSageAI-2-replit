/**
 * D2 / W2 — bounded automatic PDF OCR with honest coverage
 * (docs/evidence/D2-OCR-BUDGET/2026-10-18/CONTRACT.md, "Interfaces (exact)").
 *
 * Written from the contract only, fail-first against the baseline bytes.
 *
 * Facade (`ocrService.ocrPdfToText`): the rasterizer and the WASM Tesseract
 * engine are replaced by synthetic seams. The fake rasterizer honours the
 * page-selection options the way the real one does (range, explicit list,
 * then `maxPages`), so the facade's coverage receipt is checked against what a
 * real document of `numPages` pages would yield. No PDF is parsed and no page
 * is rendered or recognised.
 *
 * Extractor (`extractDocumentText`, PDF path): `pdf-parse` is replaced with a
 * synthetic text layer and the facade is spied, so the automatic fallback's
 * budget and the coverage it records are observed directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FakeRasterOptions = {
  dpi?: number;
  maxPages?: number;
  firstPage?: number;
  lastPage?: number;
  pages?: number[];
  region?: unknown;
  maxPixels?: number;
  [key: string]: unknown;
};

const seam = vi.hoisted(() => ({
  numPages: 1,
  rasterizeDocument: vi.fn(),
  rasterizePages: vi.fn(),
  recognizeImage: vi.fn(),
  pdfGetText: vi.fn(),
}));

vi.mock('../pdfRasterizer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    rasterizePdfDocument: seam.rasterizeDocument,
    rasterizePdfPages: seam.rasterizePages,
  };
});

vi.mock('../tesseractOcrService', () => ({
  tesseractOcrService: {
    recognizeImage: seam.recognizeImage,
    getCapabilities: () => ({ engine: 'tesseract.js', available: true }),
    terminate: async () => undefined,
  },
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class {
    constructor(_options: { data: Buffer }) {}
    getText() {
      return seam.pdfGetText();
    }
  },
}));

import { ocrService } from '../ocrService';
import * as extractModule from '../extractDocumentText';
import { extractDocumentText } from '../extractDocumentText';

/** The pages the real rasterizer would select (pdfRasterizer.selectPages semantics). */
function selectFakePages(numPages: number, options: FakeRasterOptions): number[] {
  let selected: number[];
  if (options.pages?.length) {
    selected = [...new Set(options.pages.map((p) => Math.floor(p)))]
      .filter((p) => p >= 1 && p <= numPages)
      .sort((a, b) => a - b);
  } else {
    const first = Math.max(1, Math.floor(options.firstPage ?? 1));
    const last = Math.min(numPages, Math.floor(options.lastPage ?? numPages));
    selected = [];
    for (let n = first; n <= last; n++) selected.push(n);
  }
  if (options.maxPages && selected.length > options.maxPages) selected = selected.slice(0, options.maxPages);
  return selected;
}

async function fakeRasterizeDocument(_data: unknown, options: FakeRasterOptions = {}) {
  const pages = selectFakePages(seam.numPages, options).map((page) => ({
    page,
    png: Buffer.from(`synthetic-png-page-${page}`),
    dpi: options.dpi ?? 200,
  }));
  return { numPages: seam.numPages, pages };
}

/** Every options object the rasterizer was handed, whichever entry point was used. */
function rasterizerOptions(): FakeRasterOptions[] {
  return seam.rasterizeDocument.mock.calls.map((call) => (call[1] ?? {}) as FakeRasterOptions);
}

const PDF_BYTES = Buffer.from('%PDF-1.7 synthetic bytes, never parsed');

beforeEach(() => {
  seam.numPages = 1;
  seam.rasterizeDocument.mockReset().mockImplementation(fakeRasterizeDocument);
  // rasterizePdfPages is (await rasterizePdfDocument(...)).pages, per the contract.
  seam.rasterizePages
    .mockReset()
    .mockImplementation(async (data: unknown, options?: FakeRasterOptions) => (await seam.rasterizeDocument(data, options)).pages);
  seam.recognizeImage.mockReset().mockImplementation(async (png: Buffer) => {
    const page = String(png).replace('synthetic-png-page-', '');
    return { text: `Recognised text of page ${page}.`, confidence: 90 };
  });
  seam.pdfGetText.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pdfRasterizer — one page-pixel cap definition', () => {
  it('exports DEFAULT_MAX_PAGE_PIXELS = 40_000_000', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('../pdfRasterizer');
    expect(actual.DEFAULT_MAX_PAGE_PIXELS).toBe(40_000_000);
  });
});

describe('ocrService.ocrPdfToText — pixel budget is forwarded', () => {
  it('forwards maxPixels = DEFAULT_MAX_PAGE_PIXELS (40_000_000) when the caller sets none', async () => {
    seam.numPages = 2;
    await ocrService.ocrPdfToText(PDF_BYTES);
    const calls = rasterizerOptions();
    expect(calls.length).toBeGreaterThan(0);
    for (const options of calls) expect(options.maxPixels).toBe(40_000_000);
    // The same one definition, not a second literal.
    const actual = await vi.importActual<Record<string, unknown>>('../pdfRasterizer');
    for (const options of calls) expect(options.maxPixels).toBe(actual.DEFAULT_MAX_PAGE_PIXELS);
  });

  it('forwards an explicit maxPixels override unchanged', async () => {
    seam.numPages = 2;
    await ocrService.ocrPdfToText(PDF_BYTES, { maxPixels: 1_234_567 });
    const calls = rasterizerOptions();
    expect(calls.length).toBeGreaterThan(0);
    for (const options of calls) expect(options.maxPixels).toBe(1_234_567);
  });
});

describe('ocrService.ocrPdfToText — time budget (deadlineAt)', () => {
  it('a deadline already past reads exactly one page and reports time_budget', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    seam.numPages = 5;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { deadlineAt: Date.now() - 1 } as never);
    expect(seam.recognizeImage).toHaveBeenCalledTimes(1);
    expect(result.pageDetails.map((d) => d.page)).toEqual([1]);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 5,
      pagesSelected: 5,
      pagesRead: 1,
      limitedBy: 'time_budget',
    });
  });

  it('a deadline equal to now still attempts the first page and stops before the second', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    seam.numPages = 3;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { deadlineAt: Date.now() } as never);
    expect(seam.recognizeImage).toHaveBeenCalledTimes(1);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 3,
      pagesSelected: 3,
      pagesRead: 1,
      limitedBy: 'time_budget',
    });
  });

  it('a deadline crossed mid-document stops after the page that crossed it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-10-18T12:00:00.000Z').getTime();
    vi.setSystemTime(start);
    seam.numPages = 6;
    // Each page "takes" 600 ms of clock time: after page 1 the clock reads
    // start+600 (< deadline, continue); after page 2 start+1200 (>= deadline, stop).
    seam.recognizeImage.mockImplementation(async (png: Buffer) => {
      vi.setSystemTime(Date.now() + 600);
      return { text: `Recognised ${String(png)}.`, confidence: 80 };
    });
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { deadlineAt: start + 1_000 } as never);
    expect(seam.recognizeImage).toHaveBeenCalledTimes(2);
    expect(result.pageDetails.map((d) => d.page)).toEqual([1, 2]);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 6,
      pagesSelected: 6,
      pagesRead: 2,
      limitedBy: 'time_budget',
    });
  });

  it('a deadline that is never reached reads every selected page (limitedBy null)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    seam.numPages = 4;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { deadlineAt: Date.now() + 3_600_000 } as never);
    expect(seam.recognizeImage).toHaveBeenCalledTimes(4);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 4,
      pagesSelected: 4,
      pagesRead: 4,
      limitedBy: null,
    });
  });
});

describe('ocrService.ocrPdfToText — page budget and caller ranges', () => {
  it('maxPages cutting the selection reports page_budget with the document page count', async () => {
    seam.numPages = 12;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { maxPages: 4 });
    expect(seam.recognizeImage).toHaveBeenCalledTimes(4);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 12,
      pagesSelected: 4,
      pagesRead: 4,
      limitedBy: 'page_budget',
    });
  });

  it('maxPages cutting an explicit range is still page_budget', async () => {
    seam.numPages = 20;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { firstPage: 3, lastPage: 12, maxPages: 4 });
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 20,
      pagesSelected: 4,
      pagesRead: 4,
      limitedBy: 'page_budget',
    });
  });

  it('maxPages equal to the page count cuts nothing (limitedBy null)', async () => {
    seam.numPages = 4;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { maxPages: 4 });
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 4,
      pagesSelected: 4,
      pagesRead: 4,
      limitedBy: null,
    });
  });

  it('an explicit firstPage/lastPage range smaller than the document is a request, not a limit', async () => {
    seam.numPages = 12;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { firstPage: 3, lastPage: 5 });
    expect(result.pageDetails.map((d) => d.page)).toEqual([3, 4, 5]);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 12,
      pagesSelected: 3,
      pagesRead: 3,
      limitedBy: null,
    });
  });

  it('an explicit page list with a maxPages that does not cut it is not a limit', async () => {
    seam.numPages = 12;
    const result = await ocrService.ocrPdfToText(PDF_BYTES, { pages: [2, 7], maxPages: 10 });
    expect(result.pageDetails.map((d) => d.page)).toEqual([2, 7]);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 12,
      pagesSelected: 2,
      pagesRead: 2,
      limitedBy: null,
    });
  });

  it('no limits: every page selected and read, limitedBy null', async () => {
    seam.numPages = 3;
    const result = await ocrService.ocrPdfToText(PDF_BYTES);
    expect(seam.recognizeImage).toHaveBeenCalledTimes(3);
    expect((result as { coverage?: unknown }).coverage).toEqual({
      pageCount: 3,
      pagesSelected: 3,
      pagesRead: 3,
      limitedBy: null,
    });
  });

  it('CONTROL: text, pages and page details still carry every page read, in order', async () => {
    seam.numPages = 3;
    const result = await ocrService.ocrPdfToText(PDF_BYTES);
    expect(result.pages).toEqual([
      'Recognised text of page 1.',
      'Recognised text of page 2.',
      'Recognised text of page 3.',
    ]);
    expect(result.pageDetails.map((d) => d.page)).toEqual([1, 2, 3]);
    expect(result.engine).toBe('pdfjs+tesseract.js');
  });
});

// ── Extractor: the automatic fallback ─────────────────────────────────────────

const THIN_TEXT = 'Scanned cover page.'; // < 200 characters: treated as no text layer
const OCR_TEXT = 'Recognised clinical study report body text. '.repeat(20).trim();

function thinTextLayer(pageCount: number, text = THIN_TEXT) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({ num: i + 1, text: i === 0 ? text : '' }));
  return { text, pages };
}

function ocrResult(coverage: { pageCount: number; pagesSelected: number; pagesRead: number; limitedBy: 'page_budget' | 'time_budget' | null }) {
  return {
    text: OCR_TEXT,
    pages: [OCR_TEXT],
    pageDetails: [{ page: 1, text: OCR_TEXT, confidence: 88 }],
    confidence: 88,
    engine: 'pdfjs+tesseract.js' as const,
    durationMs: 5,
    coverage,
  };
}

describe('extractDocumentText — automatic PDF OCR budget', () => {
  it('exports AUTOMATIC_PDF_OCR_BUDGET = { maxPages: 100, maxDurationMs: 600_000 }', () => {
    expect((extractModule as Record<string, unknown>).AUTOMATIC_PDF_OCR_BUDGET).toEqual({ maxPages: 100, maxDurationMs: 600_000 });
  });

  it('the thin-text fallback calls ocrPdfToText with maxPages 100 and deadlineAt = now + 600_000', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-10-18T12:00:00.000Z').getTime();
    vi.setSystemTime(now);
    seam.pdfGetText.mockResolvedValue(thinTextLayer(3));
    const spy = vi
      .spyOn(ocrService, 'ocrPdfToText')
      .mockResolvedValue(ocrResult({ pageCount: 3, pagesSelected: 3, pagesRead: 3, limitedBy: null }) as never);

    await extractDocumentText(PDF_BYTES, 'application/pdf', 'scan.pdf');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ maxPages: 100, deadlineAt: expect.any(Number) }));
    const deadlineAt = (spy.mock.calls[0][1] as { deadlineAt: number }).deadlineAt;
    expect(deadlineAt).toBeGreaterThanOrEqual(now + 600_000);
    expect(deadlineAt).toBeLessThanOrEqual(now + 600_000 + 5_000);
  });
});

describe('extractDocumentText — coverage receipts', () => {
  it('OCR result used: method pdf-ocr and coverage copied from OCR (page_budget)', async () => {
    seam.pdfGetText.mockResolvedValue(thinTextLayer(250));
    vi.spyOn(ocrService, 'ocrPdfToText').mockResolvedValue(
      ocrResult({ pageCount: 250, pagesSelected: 100, pagesRead: 100, limitedBy: 'page_budget' }) as never,
    );
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'binder.pdf');
    expect(result.method).toBe('pdf-ocr');
    expect(result.text).toBe(OCR_TEXT);
    expect((result as { coverage?: unknown }).coverage).toEqual({ pageCount: 250, pagesRead: 100, limitedBy: 'page_budget' });
  });

  it('OCR result used: time_budget coverage is copied', async () => {
    seam.pdfGetText.mockResolvedValue(thinTextLayer(40));
    vi.spyOn(ocrService, 'ocrPdfToText').mockResolvedValue(
      ocrResult({ pageCount: 40, pagesSelected: 40, pagesRead: 17, limitedBy: 'time_budget' }) as never,
    );
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'binder.pdf');
    expect(result.method).toBe('pdf-ocr');
    expect((result as { coverage?: unknown }).coverage).toEqual({ pageCount: 40, pagesRead: 17, limitedBy: 'time_budget' });
  });

  it('OCR result used: a complete OCR still records coverage with limitedBy null', async () => {
    seam.pdfGetText.mockResolvedValue(thinTextLayer(3));
    vi.spyOn(ocrService, 'ocrPdfToText').mockResolvedValue(
      ocrResult({ pageCount: 3, pagesSelected: 3, pagesRead: 3, limitedBy: null }) as never,
    );
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'scan.pdf');
    expect(result.method).toBe('pdf-ocr');
    expect((result as { coverage?: unknown }).coverage).toEqual({ pageCount: 3, pagesRead: 3, limitedBy: null });
  });

  it('OCR throws with a thin text layer: pdf-text, coverage ocr_failed with the pdf-parse page count', async () => {
    seam.pdfGetText.mockResolvedValue(thinTextLayer(7));
    vi.spyOn(ocrService, 'ocrPdfToText').mockRejectedValue(new Error('synthetic OCR outage'));
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'scan.pdf');
    expect(result.method).toBe('pdf-text');
    expect(result.text).toBe(THIN_TEXT);
    expect((result as { coverage?: unknown }).coverage).toEqual({ pageCount: 7, pagesRead: null, limitedBy: 'ocr_failed' });
  });

  it('OCR throws and there is no text at all: none, with the same ocr_failed coverage', async () => {
    seam.pdfGetText.mockResolvedValue(thinTextLayer(4, ''));
    vi.spyOn(ocrService, 'ocrPdfToText').mockRejectedValue(new Error('synthetic OCR outage'));
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'scan.pdf');
    expect(result.method).toBe('none');
    expect(result.text).toBe('');
    expect((result as { coverage?: unknown }).coverage).toEqual({ pageCount: 4, pagesRead: null, limitedBy: 'ocr_failed' });
  });

  it('OCR throws and pdf-parse gave no pages: pageCount is null', async () => {
    seam.pdfGetText.mockRejectedValue(new Error('synthetic pdf-parse failure'));
    vi.spyOn(ocrService, 'ocrPdfToText').mockRejectedValue(new Error('synthetic OCR outage'));
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'scan.pdf');
    expect(result.method).toBe('none');
    expect((result as { coverage?: unknown }).coverage).toEqual({ pageCount: null, pagesRead: null, limitedBy: 'ocr_failed' });
  });

  it('CONTROL: a text-layer PDF with >= 200 characters has no coverage and never calls OCR', async () => {
    const body = 'Born-digital protocol text with a real text layer. '.repeat(8).trim();
    expect(body.length).toBeGreaterThanOrEqual(200);
    seam.pdfGetText.mockResolvedValue({ text: body, pages: [{ num: 1, text: body }] });
    const spy = vi.spyOn(ocrService, 'ocrPdfToText');
    const result = await extractDocumentText(PDF_BYTES, 'application/pdf', 'protocol.pdf');
    expect(result.method).toBe('pdf-text');
    expect(result.text).toBe(body);
    expect(result).not.toHaveProperty('coverage');
    expect(spy).not.toHaveBeenCalled();
  });

  it('CONTROL: a non-PDF format has no coverage', async () => {
    const result = await extractDocumentText(Buffer.from('plain text body'), 'text/plain', 'notes.txt');
    expect(result.method).toBe('utf8');
    expect(result).not.toHaveProperty('coverage');
  });
});
