/**
 * Document intake tests — the extraction routing for spreadsheets and the
 * pure planning pieces of the PDF inspector/rasterizer (no rendering, no DB).
 */

import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { extractDocumentText } from '../extractDocumentText';
import { samplePageNumbers } from '../pdfInspector';
import { ocrService } from '../ocrService';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function buildXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Enrollment');
  ws.getCell('A1').value = 'Site';
  ws.getCell('B1').value = 'Subjects';
  ws.getCell('A2').value = 'Boston';
  ws.getCell('B2').value = 42;
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

describe('extractDocumentText — spreadsheet routing', () => {
  it.each([
    ['application/json', 'payload', '{"subject":"001","value":0}'],
    ['application/xml', 'payload', '<Study><Subject id="001"><Value>0</Value></Subject></Study>'],
    ['application/octet-stream', 'define.xml', '<Study><Subject id="001" /></Study>'],
    ['application/octet-stream', 'enrollment.tsv', 'subject\tvalue\n001\t0'],
    ['text/csv', 'enrollment.csv', 'subject,value\n001,0'],
  ])('reads %s / %s as raw UTF-8 without mapping or validating a scientific dataset', async (mime, name, source) => {
    expect(await extractDocumentText(Buffer.from(source), mime, name)).toEqual({ text: source, method: 'utf8' });
  });

  it.each([
    ['application/msword', 'legacy.doc'],
    ['application/vnd.ms-excel', 'legacy.xls'],
  ])('does not claim a parser for admitted legacy %s bytes', async (mime, name) => {
    expect(await extractDocumentText(Buffer.from('legacy source'), mime, name)).toEqual({ text: '', method: 'none' });
  });

  it.each(['png', 'jpg', 'jpeg', 'gif'])('dispatches .%s to existing OCR and reports its confidence', async (ext) => {
    const recognize = vi.spyOn(ocrService, 'recognizeImage').mockResolvedValueOnce({
      text: 'Subject 001', confidence: 81,
    } as Awaited<ReturnType<typeof ocrService.recognizeImage>>);
    try {
      const bytes = Buffer.from('OCR routing fixture, not a qualified image');
      expect(await extractDocumentText(bytes, 'application/octet-stream', `scan.${ext}`))
        .toEqual({ text: 'Subject 001', method: 'image-ocr', confidence: 81 });
      expect(recognize).toHaveBeenCalledWith(bytes);
    } finally {
      recognize.mockRestore();
    }
  });

  it('reports unreadable content rather than a successful read when OCR fails', async () => {
    const recognize = vi.spyOn(ocrService, 'recognizeImage').mockRejectedValueOnce(new Error('OCR unavailable'));
    try {
      expect(await extractDocumentText(Buffer.from('scan'), 'image/png', 'scan.png'))
        .toEqual({ text: '', method: 'none' });
    } finally {
      recognize.mockRestore();
    }
  });

  it('extracts xlsx by MIME type', async () => {
    const buffer = await buildXlsx();
    const r = await extractDocumentText(buffer, XLSX_MIME, 'enrollment.xlsx');
    expect(r.method).toBe('xlsx');
    expect(r.text).toContain('## Sheet: Enrollment');
    expect(r.text).toContain('Boston\t42');
  });

  it('extracts xlsx by extension when the MIME is generic', async () => {
    const buffer = await buildXlsx();
    const r = await extractDocumentText(buffer, 'application/octet-stream', 'enrollment.xlsx');
    expect(r.method).toBe('xlsx');
    expect(r.text).toContain('Boston\t42');
  });

  it('still treats markdown/CSV as utf8 text', async () => {
    const md = Buffer.from('# Protocol\n\n## Endpoints\nORR per RECIST 1.1\n', 'utf8');
    const r = await extractDocumentText(md, 'text/markdown', 'protocol.md');
    expect(r.method).toBe('utf8');
    expect(r.text).toContain('## Endpoints');
  });

  it('returns method none for an unreadable xlsx buffer', async () => {
    const r = await extractDocumentText(Buffer.from('not a zip'), XLSX_MIME, 'broken.xlsx');
    expect(r.method).toBe('none');
    expect(r.text).toBe('');
  });
});

describe('pdfInspector.samplePageNumbers — census planning', () => {
  it('returns every page for small documents', () => {
    expect(samplePageNumbers(5, 30)).toEqual([1, 2, 3, 4, 5]);
  });

  it('samples edges plus a uniform spread for huge documents', () => {
    const pages = samplePageNumbers(1129, 30);
    expect(pages.length).toBeLessThanOrEqual(30);
    expect(pages[0]).toBe(1);
    expect(pages).toContain(2);
    expect(pages).toContain(1129);
    expect(pages).toContain(1128);
    // strictly increasing, all within bounds
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i]).toBeGreaterThan(pages[i - 1]);
      expect(pages[i]).toBeLessThanOrEqual(1129);
    }
    // the spread reaches the middle of the document
    expect(pages.some((p) => p > 400 && p < 700)).toBe(true);
  });
});
