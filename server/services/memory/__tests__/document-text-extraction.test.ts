import { describe, it, expect } from 'vitest';
import { extractTextFromFile } from '../document-text-extraction';

const buf = (s: string) => Buffer.from(s, 'utf-8');

describe('extractTextFromFile', () => {
  it('returns plain text verbatim for text/plain', async () => {
    const out = await extractTextFromFile(buf('hello world'), 'text/plain', 'note.txt');
    expect(out.text).toBe('hello world');
    expect(out.pageCount).toBeUndefined();
  });

  it('handles markdown and csv by extension/mime', async () => {
    expect((await extractTextFromFile(buf('# Title'), 'application/octet-stream', 'r.md')).text).toBe('# Title');
    expect((await extractTextFromFile(buf('a,b,c'), 'text/csv', 'data.csv')).text).toBe('a,b,c');
  });

  it('falls back with a descriptive message for an unsupported format', async () => {
    const out = await extractTextFromFile(buf('...'), 'application/zip', 'archive.zip');
    expect(out.text).toContain('archive.zip');
    expect(out.text).toContain('unsupported format');
  });

  it('degrades to a placeholder when a PDF cannot be parsed', async () => {
    const out = await extractTextFromFile(buf('not a real pdf'), 'application/pdf', 'broken.pdf');
    expect(out.text).toContain('broken.pdf');
    expect(out.text).toContain('text extraction unavailable');
  });

  it('degrades to a placeholder when a DOCX cannot be parsed', async () => {
    const out = await extractTextFromFile(buf('not a real docx'), '', 'broken.docx');
    expect(out.text).toContain('broken.docx');
    expect(out.text).toContain('text extraction unavailable');
  });

  it('extracts sheet content from a real XLSX buffer', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Financials');
    ws.addRow(['Quarter', 'Revenue']);
    ws.addRow(['Q1', 100]);
    const bytes = Buffer.from(await wb.xlsx.writeBuffer());

    const out = await extractTextFromFile(bytes, '', 'report.xlsx');
    expect(out.text).toContain('Sheet: Financials');
    expect(out.text).toContain('Quarter\tRevenue');
    expect(out.text).toContain('Q1\t100');
  });
});
