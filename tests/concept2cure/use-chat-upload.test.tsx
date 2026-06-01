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
} from '../../client/src/concept2cure/hooks/useChatUpload';

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
  it('formats word counts and notes OCR', () => {
    expect(attachmentReadLabel('utf8', 1240)).toBe('read · 1,240 words');
    expect(attachmentReadLabel('image-ocr', 87)).toBe('read via OCR · 87 words');
    expect(attachmentReadLabel('pdf-ocr', 1)).toBe('read via OCR · 1 word');
  });
  it('returns null when nothing was read', () => {
    expect(attachmentReadLabel('utf8', 0)).toBeNull();
    expect(attachmentReadLabel(null, undefined)).toBeNull();
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
    expect(result.current.statusMessage).toBe('enrollment.txt read · 1,240 words');

    // projectId was sent in the multipart body.
    const form = (globalThis.fetch as any).mock.calls[0][1].body as FormData;
    expect(form.get('projectId')).toBe('proj_12');
  });

  it('marks an attachment as error and announces failure on a bad response', async () => {
    mockFetchOnce({ error: 'nope' }, false, 400);

    const { result } = renderHook(() => useChatUpload());
    act(() => result.current.addFiles([file('bad.png', 'image/png')]));

    await waitFor(() => expect(result.current.uploading).toBe(false));
    expect(result.current.attachments[0].status).toBe('error');
    expect(result.current.statusMessage).toBe('bad.png failed to upload');
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
