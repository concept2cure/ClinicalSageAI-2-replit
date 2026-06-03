import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn(async () => ({ text: 'PDF EXTRACTED TEXT' })),
}));
vi.mock('mammoth', () => ({
  default: { extractRawText: vi.fn(async () => ({ value: 'DOCX EXTRACTED TEXT' })) },
}));

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { extractUploadedText, MAX_EXTRACTED_CHARS } from '../../services/projects/extract-text';

const pdfMock = pdfParse as unknown as ReturnType<typeof vi.fn>;
const docxMock = (mammoth as any).extractRawText as ReturnType<typeof vi.fn>;

beforeEach(() => {
  pdfMock.mockClear();
  docxMock.mockClear();
});

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('extractUploadedText', () => {
  it('returns empty for an empty buffer', async () => {
    expect(await extractUploadedText(Buffer.alloc(0), 'application/pdf', 'a.pdf')).toBe('');
    expect(pdfMock).not.toHaveBeenCalled();
  });

  it('passes plain text through without invoking a parser', async () => {
    expect(await extractUploadedText(buf('hello world'), 'text/plain', 'a.txt')).toBe('hello world');
    expect(pdfMock).not.toHaveBeenCalled();
    expect(docxMock).not.toHaveBeenCalled();
  });

  it('extracts PDF text via pdf-parse', async () => {
    expect(await extractUploadedText(buf('%PDF'), 'application/pdf', 'a.pdf')).toBe('PDF EXTRACTED TEXT');
    expect(pdfMock).toHaveBeenCalledTimes(1);
  });

  it('routes by .pdf extension when the mimetype is generic', async () => {
    expect(await extractUploadedText(buf('%PDF'), 'application/octet-stream', 'report.pdf')).toBe(
      'PDF EXTRACTED TEXT'
    );
  });

  it('extracts DOCX text via mammoth', async () => {
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(await extractUploadedText(buf('PK'), docxMime, 'a.docx')).toBe('DOCX EXTRACTED TEXT');
    expect(docxMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty for an unsupported type', async () => {
    expect(await extractUploadedText(buf('\x89PNG'), 'image/png', 'a.png')).toBe('');
    expect(pdfMock).not.toHaveBeenCalled();
    expect(docxMock).not.toHaveBeenCalled();
  });

  it('returns empty (caller falls back) when parsing throws', async () => {
    pdfMock.mockRejectedValueOnce(new Error('corrupt pdf'));
    expect(await extractUploadedText(buf('%PDF'), 'application/pdf', 'a.pdf')).toBe('');
  });

  it('clips very long extractions to the cap', async () => {
    pdfMock.mockResolvedValueOnce({ text: 'a'.repeat(MAX_EXTRACTED_CHARS + 500) });
    const out = await extractUploadedText(buf('%PDF'), 'application/pdf', 'a.pdf');
    expect(out.length).toBe(MAX_EXTRACTED_CHARS);
  });
});
