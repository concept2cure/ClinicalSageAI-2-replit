/** Actual extractCapture over synthetic extractor output; no OCR, provider or database.
 * Pins returned evidence, not a proposed helper or inferred page/confidence rules. */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const seam = vi.hoisted(() => ({ extract: vi.fn(), query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: seam.query } }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: seam.extract }));

import { extractCapture } from '../data-room-processing';

interface PageSpan { page: number; start: number; end: number }
interface Receipt {
  version: 1; sourceSha256: string; extractedTextSha256: string; method: string;
  pageSpans?: PageSpan[]; ocrConfidence?: number;
}
type ObservedCapture = Awaited<ReturnType<typeof extractCapture>> & { extractionEvidence?: Receipt };

const BYTES = Buffer.from('Synthetic original PDF bytes, distinct from extracted text.');
const TEXT = '  日本語 🧬結果は12/30。\n\n第二表：診断装置の再現性は8/10。  ';
const SECOND = TEXT.indexOf('第二表');
const EMOJI = TEXT.indexOf('🧬');
const COVERAGE = { pageCount: 12, pagesRead: 3, limitedBy: 'page_budget' } as const;
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const SPANS: PageSpan[] = [
  { page: 2, start: 2, end: SECOND - 2 },
  { page: 5, start: SECOND - 1, end: SECOND - 1 },
  { page: 9, start: SECOND, end: TEXT.length - 2 },
];

function expected(method: string, extra: Partial<Receipt> = {}): Receipt {
  return { version: 1, sourceSha256: sha(BYTES), extractedTextSha256: sha(TEXT), method, ...extra };
}
async function capture(output: Record<string, unknown> = {}): Promise<ObservedCapture> {
  seam.extract.mockResolvedValue({ text: TEXT, method: 'pdf-text', ...output });
  return extractCapture(BYTES, 'application/pdf', 'synthetic-report.pdf');
}

beforeEach(() => { vi.resetAllMocks(); });

describe('capture extraction evidence from actual returned source text', () => {
  it('binds original bytes and exact untrimmed Japanese/emoji text, preserving real blank and nonconsecutive pages', async () => {
    const result = await capture({ method: 'pdf-ocr', confidence: 0, pageSpans: SPANS, coverage: COVERAGE });
    expect(result.extractionEvidence).toEqual(expected('pdf-ocr', { pageSpans: SPANS, ocrConfidence: 0 }));
    expect(result.text).toBe(TEXT);
    expect(result.sourceSha256).toBe(sha(BYTES));
    expect(result.extractionEvidence?.extractedTextSha256).not.toBe(sha(TEXT.trim()));
    expect(result.pageCount).toBe(3);
    expect(result.coverage).toEqual(COVERAGE);
  });

  it('detaches the page map and each page object from extractor-owned mutable output', async () => {
    const pages = SPANS.map(page => ({ ...page }));
    const result = await capture({ pageSpans: pages });
    expect(result.extractionEvidence).toEqual(expected('pdf-text', { pageSpans: SPANS }));
    expect(result.extractionEvidence?.pageSpans).not.toBe(pages);
    expect(result.extractionEvidence?.pageSpans?.[0]).not.toBe(pages[0]);
    pages[0].page = 99; pages[0].end = TEXT.length; pages.push({ page: 100, start: 0, end: 0 });
    expect(result.extractionEvidence).toEqual(expected('pdf-text', { pageSpans: SPANS }));
  });

  it('keeps source/text/method binding when the extractor has no located pages or confidence', async () => {
    expect((await capture()).extractionEvidence).toEqual(expected('pdf-text'));
  });
});

describe('page maps that would create false source locators are omitted in full', () => {
  const invalidMaps: Array<{ name: string; pages: unknown }> = [
    { name: 'no located pages', pages: [] },
    { name: 'page zero', pages: [{ page: 0, start: 0, end: 2 }] },
    { name: 'fractional page number', pages: [{ page: 1.5, start: 0, end: 2 }] },
    { name: 'unsafe page number', pages: [{ page: Number.MAX_SAFE_INTEGER + 1, start: 0, end: 2 }] },
    { name: 'duplicated page number', pages: [{ page: 2, start: 0, end: 2 }, { page: 2, start: 2, end: 4 }] },
    { name: 'reversed page order', pages: [{ page: 9, start: 0, end: 2 }, { page: 2, start: 2, end: 4 }] },
    { name: 'overlapping page text', pages: [{ page: 1, start: 0, end: 8 }, { page: 2, start: 7, end: 10 }] },
    { name: 'negative text offset', pages: [{ page: 1, start: -1, end: 2 }] },
    { name: 'page beyond extraction', pages: [{ page: 1, start: 0, end: TEXT.length + 1 }] },
    { name: 'reversed text offsets', pages: [{ page: 1, start: 8, end: 2 }] },
    { name: 'fractional text offset', pages: [{ page: 1, start: 0.5, end: 2 }] },
    { name: 'unusable text offset', pages: [{ page: 1, start: Number.NaN, end: 2 }] },
    { name: 'string text offset', pages: [{ page: 1, start: '0', end: 2 }] },
    { name: 'missing page object', pages: [null] },
    { name: 'page starts inside the emoji surrogate pair', pages: [{ page: 1, start: EMOJI + 1, end: TEXT.length }] },
    { name: 'page ends inside the emoji surrogate pair', pages: [{ page: 1, start: 0, end: EMOJI + 1 }] },
  ];
  it.each(invalidMaps)('$name leaves no repaired or inferred page evidence', async ({ pages }) => {
    const result = await capture({ pageSpans: pages });
    expect(result.extractionEvidence).toEqual(expected('pdf-text'));
    expect(result.text).toBe(TEXT);
    // Existing count semantics remain independent of whether locators verify.
    expect(result.pageCount).toBe((pages as unknown[]).length);
  });
});

describe('only actual aggregate OCR scores are retained', () => {
  it.each([
    { method: 'pdf-ocr', confidence: 0 }, { method: 'pdf-ocr', confidence: 100 },
    { method: 'image-ocr', confidence: 0 }, { method: 'image-ocr', confidence: 100 },
    { method: 'pdf-ocr', confidence: 83.125 },
  ])('keeps reported $method score $confidence without rescaling or defaulting', async ({ method, confidence }) => {
    expect((await capture({ method, confidence })).extractionEvidence).toEqual(expected(method, { ocrConfidence: confidence }));
  });

  it.each([
    { name: 'missing', confidence: undefined }, { name: 'null', confidence: null },
    { name: 'NaN', confidence: Number.NaN }, { name: 'infinite', confidence: Number.POSITIVE_INFINITY },
    { name: 'negative', confidence: -1 }, { name: 'above 100', confidence: 101 },
    { name: 'numeric text', confidence: '88' }, { name: 'object', confidence: { value: 88 } },
  ])('omits $name OCR score rather than inventing a numeric confidence', async ({ confidence }) => {
    expect((await capture({ method: 'pdf-ocr', confidence })).extractionEvidence).toEqual(expected('pdf-ocr'));
  });

  it.each(['pdf-text', 'utf8', 'docx', 'xlsx'])('does not label a %s extraction as OCR-confident', async method => {
    expect((await capture({ method, confidence: 99 })).extractionEvidence).toEqual(expected(method));
  });
});

describe('existing extraction behavior and identity controls', () => {
  it('keeps the canonical automatic OCR budget and copies caller bytes before extraction', async () => {
    const result = await capture({ pageSpans: SPANS, coverage: COVERAGE });
    expect(seam.extract).toHaveBeenCalledExactlyOnceWith(expect.any(Buffer), 'application/pdf', 'synthetic-report.pdf',
      { pdfOcrBudget: { maxPages: 100, maxDurationMs: 600_000 } });
    const seenBytes = seam.extract.mock.calls[0][0] as Buffer;
    expect(seenBytes).toEqual(BYTES);
    expect(seenBytes).not.toBe(BYTES);
    expect(result.words).toBe(TEXT.trim().split(/\s+/).length);
    expect(result.pageCount).toBe(SPANS.length);
    expect(result.coverage).toEqual(COVERAGE);
    expect(result.coverage).not.toBe(COVERAGE);
    expect(seam.query).not.toHaveBeenCalled();
  });

  it('keeps absent page counts and coverage absent instead of inferring a full document', async () => {
    const result = await capture();
    expect(result.pageCount).toBeNull();
    expect(result).not.toHaveProperty('coverage');
  });

  it.each(['', ' \n\t '])('an unreadable extraction %j has no receipt and retains coverage', async text => {
    const result = await capture({ text, method: 'none', confidence: 100, pageSpans: SPANS, coverage: COVERAGE });
    expect(result).toMatchObject({ text: null, method: 'none', pageCount: null, words: 0,
      sourceSha256: sha(BYTES), coverage: COVERAGE, error: 'No text could be read from the file.' });
    expect(result).not.toHaveProperty('extractionEvidence');
  });

  it('extractor rejection remains a failed read without invented receipt or coverage', async () => {
    seam.extract.mockRejectedValue(new Error('Synthetic extraction failed'));
    const result = await extractCapture(BYTES, 'application/pdf', 'synthetic-report.pdf');
    expect(result).toMatchObject({ text: null, method: null, pageCount: null, words: 0,
      sourceSha256: sha(BYTES), error: 'Synthetic extraction failed' });
    expect(result).not.toHaveProperty('extractionEvidence');
    expect(result).not.toHaveProperty('coverage');
  });

  it.each(['Unreadable lone high surrogate \ud800.', 'Unreadable lone low surrogate \udc00.'])('retains ill-formed text behavior but issues no lossy UTF-8 receipt', async text => {
    const result = await capture({ text, method: 'pdf-ocr', confidence: 88 });
    expect(result.text).toBe(text);
    expect(result.method).toBe('pdf-ocr');
    expect(result).not.toHaveProperty('extractionEvidence');
  });
});
