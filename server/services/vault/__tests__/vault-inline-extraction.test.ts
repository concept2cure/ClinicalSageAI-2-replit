/**
 * What the upload request reads, and what it leaves for the processing sweep
 * (MR-08 Stage 3 step 4): a text layer within a size and a time budget, never
 * OCR.
 */
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { extractInline } from '../vault-inline-extraction';

const read = (text: string) => vi.fn(async () => ({ text, method: 'utf8' as const }));

describe('the request reads within its budget', () => {
  it('reads a born-digital file in the request', async () => {
    const extract = read('A clinical overview.');
    const out = await extractInline(Buffer.from('x'), 'text/plain', 'a.txt', { extract });
    expect(out).toEqual({ kind: 'read', extracted: { text: 'A clinical overview.', method: 'utf8' } });
    expect(extract).toHaveBeenCalledWith(expect.any(Buffer), 'text/plain', 'a.txt', { ocr: false });
  });

  it('leaves a file over the size cap without reading it', async () => {
    const extract = read('never read');
    expect(await extractInline(Buffer.alloc(11), 'text/plain', 'a.txt', { extract, maxBytes: 10 })).toEqual({ kind: 'pending', reason: 'too_large' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('leaves a read that outlasts the time budget, and does not wait for it', async () => {
    const extract = vi.fn(() => new Promise<{ text: string; method: 'utf8' }>((resolve) => setTimeout(() => resolve({ text: 'late', method: 'utf8' }), 2_000)));
    const started = Date.now();
    expect(await extractInline(Buffer.from('x'), 'text/plain', 'a.txt', { extract, budgetMs: 50 })).toEqual({ kind: 'pending', reason: 'over_time' });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('leaves what needs OCR', async () => {
    const extract = vi.fn(async () => ({ text: '', method: 'none' as const, ocrDeferred: true as const }));
    expect(await extractInline(Buffer.from('x'), 'image/png', 'scan.png', { extract })).toEqual({ kind: 'pending', reason: 'needs_ocr' });
  });

  it('records a read that throws as a failure, with its reason', async () => {
    const extract = vi.fn(async () => { throw new Error('parser crashed'); });
    expect(await extractInline(Buffer.from('x'), 'text/plain', 'a.txt', { extract })).toEqual({ kind: 'failed', error: 'parser crashed' });
  });
});

describe('extractDocumentText with ocr: false', () => {
  it('defers a PDF with no text layer and an image, and reads text as before', async () => {
    const { extractDocumentText } = await import('../../ocr/extractDocumentText');
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const blank = Buffer.from(await doc.save());
    expect(await extractDocumentText(blank, 'application/pdf', 'scan.pdf', { ocr: false })).toEqual({ text: '', method: 'none', ocrDeferred: true });
    expect(await extractDocumentText(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png', 'scan.png', { ocr: false })).toEqual({ text: '', method: 'none', ocrDeferred: true });
    expect(await extractDocumentText(Buffer.from('plain words'), 'text/plain', 'a.txt', { ocr: false })).toEqual({ text: 'plain words', method: 'utf8' });
  });
});
