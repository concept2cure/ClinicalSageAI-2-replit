/**
 * @vitest-environment jsdom
 *
 * useChatUpload — the single upload engine behind every AnA chat composer.
 * Covers the lifecycle (uploading → ready/error), extraction metadata capture,
 * the aria-live status message, projectId scoping in the request, and the
 * shared attachmentReadLabel helper.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';

import {
  useChatUpload,
  attachmentReadLabel,
  readyAttachmentLabel,
  validateUploadFile,
  composeTurn,
  CHAT_UPLOAD_MAX_BYTES,
} from '../../client/src/concept2cure/hooks/useChatUpload';

/** Build a File of a given size without allocating real bytes. */
function sizedFile(name: string, type: string, size: number): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  (globalThis.fetch as any) = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

const file = (name: string, type = 'text/plain') =>
  new File(['hello world'], name, { type });

beforeEach(() => vi.restoreAllMocks());
afterEach(cleanup);

describe('attachmentReadLabel', () => {
  /* QA 2026-10-08 (j5): the chip said "read · 20 words" while AnA's turn was
     given the file by name only. The count is what the upload EXTRACTED; the
     chip says that, and claims nothing about what AnA was given (the turn's
     "Used in this session" says that, per turn). */
  it('formats word counts as extracted text, and notes OCR', () => {
    expect(attachmentReadLabel('utf8', 1240)).toBe('text extracted · 1,240 words');
    expect(attachmentReadLabel('image-ocr', 87)).toBe('text extracted via OCR · 87 words');
    expect(attachmentReadLabel('pdf-ocr', 1)).toBe('text extracted via OCR · 1 word');
  });
  it('never says the file was read', () => {
    for (const [m, w] of [['utf8', 20], ['pdf-text', 3], ['image-ocr', 87]] as const) {
      expect(attachmentReadLabel(m, w)).not.toMatch(/\bread\b/);
    }
  });
  it('returns null when nothing was read', () => {
    expect(attachmentReadLabel('utf8', 0)).toBeNull();
    expect(attachmentReadLabel(null, undefined)).toBeNull();
  });
});

describe('readyAttachmentLabel', () => {
  it('says a ready file with no text was not read, never "read"', () => {
    expect(readyAttachmentLabel(null, 0)).toBe('no text extracted');
    expect(readyAttachmentLabel('utf8', undefined)).toBe('no text extracted');
  });
  it('is the read label when text was extracted', () => {
    expect(readyAttachmentLabel('pdf-ocr', 87)).toBe('text extracted via OCR · 87 words');
  });
});

/* D2 Amendment A (B5): the upload said nothing when OCR stopped at its page or
   time budget, so a 12-of-40-page read was shown exactly like a whole read.
   The label states the pages OCR read, or that the scanned pages were not
   read, and is unchanged when coverage is absent or unlimited. */
describe('attachment labels with extraction coverage', () => {
  const pageBudget = { pageCount: 40, pagesRead: 12, limitedBy: 'page_budget' } as const;
  const timeBudget = { pageCount: 40, pagesRead: 7, limitedBy: 'time_budget' } as const;
  const ocrFailed = { pageCount: 40, pagesRead: null, limitedBy: 'ocr_failed' } as const;

  it('is byte-identical to the two-argument label when coverage is absent or unlimited', () => {
    const unlimited = { pageCount: 40, pagesRead: 40, limitedBy: null } as const;
    for (const [m, w] of [['pdf-ocr', 87], ['pdf-text', 310], ['utf8', 1], [null, 0], ['pdf-ocr', undefined]] as const) {
      for (const c of [undefined, null, unlimited]) {
        expect(attachmentReadLabel(m, w, c)).toBe(attachmentReadLabel(m, w));
        expect(readyAttachmentLabel(m, w, c)).toBe(readyAttachmentLabel(m, w));
      }
    }
  });

  it('states the pages OCR read when a page or time budget stopped it', () => {
    expect(attachmentReadLabel('pdf-ocr', 3120, pageBudget)).toBe('text extracted via OCR from 12 of 40 pages · 3,120 words');
    expect(readyAttachmentLabel('pdf-ocr', 3120, timeBudget)).toBe('text extracted via OCR from 7 of 40 pages · 3,120 words');
  });

  it('says the OCR read was partial when either page number is missing', () => {
    expect(attachmentReadLabel('pdf-ocr', 87, { pageCount: null, pagesRead: 12, limitedBy: 'page_budget' }))
      .toBe('text extracted via OCR from part of the document · 87 words');
    expect(readyAttachmentLabel('pdf-ocr', 87, { pageCount: 40, pagesRead: null, limitedBy: 'time_budget' }))
      .toBe('text extracted via OCR from part of the document · 87 words');
  });

  it('does not credit OCR with text the thin text layer supplied', () => {
    expect(attachmentReadLabel('pdf-text', 310, pageBudget)).toBe('text layer only; OCR covered 12 of 40 pages · 310 words');
  });

  it('says a budget-limited read with no text covered only part of the document', () => {
    expect(attachmentReadLabel('none', 0, pageBudget)).toBeNull();
    expect(readyAttachmentLabel('none', 0, pageBudget)).toBe('no text extracted; OCR covered 12 of 40 pages');
  });

  it('says the scanned pages were not read when OCR failed', () => {
    expect(attachmentReadLabel('pdf-text', 310, ocrFailed)).toBe('text layer only; scanned pages not read · 310 words');
    expect(attachmentReadLabel('none', 0, ocrFailed)).toBeNull();
    expect(readyAttachmentLabel('none', 0, ocrFailed)).toBe('no text extracted; scanned pages not read');
  });

  it('never renders a limited read as the whole-document label', () => {
    for (const c of [pageBudget, timeBudget, ocrFailed]) {
      expect(attachmentReadLabel('pdf-ocr', 87, c)).not.toBe(attachmentReadLabel('pdf-ocr', 87));
      expect(readyAttachmentLabel('none', 0, c)).not.toBe('no text extracted');
    }
  });
});

describe('composeTurn', () => {
  const ready = { id: 'a1', name: 'Protocol v3.pdf', status: 'ready' as const, fileId: 'file_1', extractionWords: 40 };
  const failed = { id: 'a2', name: 'broken.pdf', status: 'error' as const, error: 'unreadable' };
  const pending = { id: 'a3', name: 'late.pdf', status: 'uploading' as const };

  it('names and sends only the files the server confirmed', () => {
    const { body, files } = composeTurn('Summarise this', [ready, failed, pending]);
    expect(body).toBe('Summarise this\n\nAttached: Protocol v3.pdf');
    expect(files).toEqual([
      { id: 'a1', name: 'Protocol v3.pdf', fileId: 'file_1', extractionMethod: undefined, extractionWords: 40 },
    ]);
  });

  it('lets the attachment line be the message when there is no text', () => {
    expect(composeTurn('  ', [ready]).body).toBe('Attached: Protocol v3.pdf');
  });

  it('sends nothing extra when no file is ready', () => {
    expect(composeTurn('Read this', [failed])).toEqual({ body: 'Read this', files: [] });
    expect(composeTurn('', [failed]).body).toBe('');
  });
});

describe('validateUploadFile', () => {
  it('accepts a supported, reasonably-sized file', () => {
    expect(validateUploadFile(sizedFile('a.pdf', 'application/pdf', 1024))).toBeNull();
  });
  it('rejects an unsupported extension', () => {
    expect(validateUploadFile(sizedFile('a.exe', 'application/octet-stream', 1024)))
      .toMatch(/unsupported file type/i);
  });
  it('rejects an oversized file', () => {
    expect(validateUploadFile(sizedFile('big.pdf', 'application/pdf', CHAT_UPLOAD_MAX_BYTES + 1)))
      .toMatch(/too large/i);
  });
  it('rejects an empty file', () => {
    expect(validateUploadFile(sizedFile('empty.txt', 'text/plain', 0))).toMatch(/empty/i);
  });
});

describe('useChatUpload', () => {
  it('uploads a file, captures extraction metadata, and announces status', async () => {
    mockFetchOnce({ fileId: 'file_1', extractionMethod: 'utf8', extractionWords: 1240 });

    const { result } = renderHook(() => useChatUpload({ projectId: 'proj_12' }));

    act(() => result.current.addFiles([file('enrollment.txt')]));

    // Immediately uploading.
    expect(result.current.uploading).toBe(true);
    expect(result.current.statusMessage).toContain('Uploading enrollment.txt');

    await waitFor(() => expect(result.current.uploading).toBe(false));

    const a = result.current.attachments[0];
    expect(a.status).toBe('ready');
    expect(a.fileId).toBe('file_1');
    expect(a.extractionMethod).toBe('utf8');
    expect(a.extractionWords).toBe(1240);
    expect(result.current.statusMessage).toBe('enrollment.txt: text extracted · 1,240 words');

    // projectId was sent in the multipart body.
    const form = (globalThis.fetch as any).mock.calls[0][1].body as FormData;
    expect(form.get('projectId')).toBe('proj_12');
  });

  it('keeps the validated extraction coverage on the ready attachment and announces it', async () => {
    mockFetchOnce({
      fileId: 'file_3', extractionMethod: 'pdf-ocr', extractionWords: 3120,
      extractionCoverage: { pageCount: 40, pagesRead: 12, limitedBy: 'page_budget', extra: 'dropped' },
    });
    const { result } = renderHook(() => useChatUpload());
    act(() => result.current.addFiles([file('scan.pdf', 'application/pdf')]));
    await waitFor(() => expect(result.current.uploading).toBe(false));

    expect(result.current.attachments[0].extractionCoverage).toEqual({ pageCount: 40, pagesRead: 12, limitedBy: 'page_budget' });
    expect(result.current.statusMessage).toBe('scan.pdf: text extracted via OCR from 12 of 40 pages · 3,120 words');
  });

  it('stores null coverage when the upload sends none or a malformed one', async () => {
    for (const extractionCoverage of [undefined, null, { pageCount: '40', pagesRead: 12, limitedBy: 'page_budget' }, { pageCount: 4, pagesRead: 1, limitedBy: 'quota' }]) {
      mockFetchOnce({ fileId: 'file_4', extractionMethod: 'pdf-ocr', extractionWords: 87, extractionCoverage });
      const { result, unmount } = renderHook(() => useChatUpload());
      act(() => result.current.addFiles([file('scan.pdf', 'application/pdf')]));
      await waitFor(() => expect(result.current.uploading).toBe(false));
      expect(result.current.attachments[0].extractionCoverage).toBeNull();
      expect(result.current.statusMessage).toBe('scan.pdf: text extracted via OCR · 87 words');
      unmount();
    }
  });

  it('marks an attachment as error and announces failure on a bad response', async () => {
    mockFetchOnce({ error: 'nope' }, false, 400);

    const { result } = renderHook(() => useChatUpload());
    act(() => result.current.addFiles([file('bad.png', 'image/png')]));

    await waitFor(() => expect(result.current.uploading).toBe(false));
    expect(result.current.attachments[0].status).toBe('error');
    expect(result.current.statusMessage).toBe('bad.png failed to upload');
  });

  it('rejects an invalid file as an error chip without calling the network', async () => {
    mockFetchOnce({ fileId: 'should_not_happen' });
    const { result } = renderHook(() => useChatUpload());

    act(() => result.current.addFiles([sizedFile('virus.exe', 'application/octet-stream', 10)]));

    // Synchronously an error chip, no fetch.
    expect(result.current.attachments[0].status).toBe('error');
    expect(result.current.attachments[0].error).toMatch(/unsupported file type/i);
    expect(result.current.statusMessage).toMatch(/rejected/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('clear() empties attachments and the status message', async () => {
    mockFetchOnce({ fileId: 'file_2', extractionMethod: 'utf8', extractionWords: 3 });

    const { result } = renderHook(() => useChatUpload());
    act(() => result.current.addFiles([file('a.txt')]));
    await waitFor(() => expect(result.current.attachments).toHaveLength(1));

    act(() => result.current.clear());
    expect(result.current.attachments).toHaveLength(0);
    expect(result.current.statusMessage).toBe('');
  });
});
