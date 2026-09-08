// @vitest-environment jsdom
/**
 * The AnA rail composer must never claim to have sent a file it did not send.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The composer held attachments as `useState<string[]>` and added them with
 * `Array.from(fl).map((x) => x.name)` — it kept the NAMES and dropped the File
 * objects. Nothing was ever uploaded. Send then emitted
 * `Attached ${files.length} file(s)`.
 *
 * So: a user picks a PDF, sees a chip with its filename, hits send, and gets a
 * confident answer from an assistant that never received a byte of it. On a
 * regulatory platform an assistant answering about a document it cannot see is
 * worse than one that refuses.
 *
 * ── What is locked here ───────────────────────────────────────────────────────
 * The composer now uploads through the shared useChatUpload hook. These tests
 * drive the real component and assert on what reaches `onSend`, because the
 * defect was precisely a mismatch between what the UI showed and what was sent.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../dataConnect', () => ({
  connected: () => false,
}));

vi.mock('../../../utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));

import { AnaRail, type AnaMessage } from '../Shell';

const surface = { id: 'cmc', label: 'CMC' };

function renderRail(onSend = vi.fn()) {
  render(
    <AnaRail
      open
      setOpen={() => {}}
      surface={surface}
      segment="biotech"
      mode="standard"
      setMode={() => {}}
      messages={[] as AnaMessage[]}
      onSend={onSend}
      onAct={vi.fn()}
      projectId={42}
    />,
  );
  return onSend;
}

/** The hidden document picker (the first file input the composer renders). */
function fileInput(): HTMLInputElement {
  const inputs = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
  expect(inputs.length).toBeGreaterThan(0);
  return inputs[0];
}

function pick(file: File) {
  const input = fileInput();
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const pdf = (name = 'protocol.pdf') =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });

const sendButton = () =>
  document.querySelector<HTMLButtonElement>('.ana-crow button[disabled], .ana-crow button')!;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const uploadOk = (over: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    fileId: 'file_abc',
    extractionMethod: 'pdf-text',
    extractionWords: 1200,
    ...over,
  }),
});

describe('the composer actually uploads the file', () => {
  it('POSTs the real File to /api/chat/upload, not just its name', async () => {
    fetchMock.mockResolvedValue(uploadOk());
    renderRail();

    pick(pdf());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/chat/upload');
    expect(init.method).toBe('POST');

    // The body must carry the actual bytes. This is the assertion the old
    // implementation could never have satisfied.
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const sent = body.get('file') as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.name).toBe('protocol.pdf');
    expect(sent.size).toBeGreaterThan(0);
    // Scoped to the project so extracted text lands in its memory.
    expect(body.get('projectId')).toBe('42');
  });
});

describe('send tells the truth about what was attached', () => {
  it('names the uploaded file in the message once it is ready', async () => {
    fetchMock.mockResolvedValue(uploadOk());
    const onSend = renderRail();

    pick(pdf());
    await waitFor(() => expect(screen.getByTitle(/protocol\.pdf/)).toBeTruthy());

    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'Summarise this' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    const text = onSend.mock.calls[0][0] as string;
    expect(text).toContain('Summarise this');
    expect(text).toContain('protocol.pdf');
  });

  it('does NOT claim an attachment when the upload failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'unreadable' }) });
    const onSend = renderRail();

    pick(pdf('broken.pdf'));
    await waitFor(() => expect(screen.getByTitle(/broken\.pdf/)).toBeTruthy());

    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'Read this' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(onSend).toHaveBeenCalled());
    const text = onSend.mock.calls[0][0] as string;
    // The question still goes through — but nothing says a file came with it.
    expect(text).toContain('Read this');
    expect(text).not.toContain('broken.pdf');
    expect(text).not.toMatch(/attached/i);
  });

  it('refuses to send at all when only a failed upload is present', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'unreadable' }) });
    const onSend = renderRail();

    pick(pdf('broken.pdf'));
    await waitFor(() => expect(screen.getByTitle(/broken\.pdf/)).toBeTruthy());

    const textarea = document.querySelector('textarea')!;
    fireEvent.keyDown(textarea, { key: 'Enter' });

    // No text, no successful upload — sending would be a message about nothing.
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send while an upload is still in flight', async () => {
    // A promise that never settles: the upload is pending forever.
    fetchMock.mockReturnValue(new Promise(() => {}));
    const onSend = renderRail();

    pick(pdf());
    await waitFor(() => expect(screen.getByTitle(/Uploading protocol\.pdf/)).toBeTruthy());

    const textarea = document.querySelector('textarea')!;
    fireEvent.change(textarea, { target: { value: 'Go' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('the chip states what actually happened', () => {
  it('shows the extraction result once read', async () => {
    fetchMock.mockResolvedValue(uploadOk());
    renderRail();
    pick(pdf());
    // "read · 1,200 words" — evidence the server got the bytes, not just a name.
    await waitFor(() => expect(screen.getByTitle(/1,200 words/)).toBeTruthy());
  });

  it('shows the failure reason rather than a bare filename', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'unreadable' }) });
    renderRail();
    pick(pdf('broken.pdf'));
    await waitFor(() => {
      const chip = screen.getByTitle(/broken\.pdf/);
      expect(chip.getAttribute('title')).toMatch(/unreadable|failed/i);
    });
  });

  it('rejects an unsupported type without a network call', async () => {
    renderRail();
    pick(new File(['x'], 'model.xlsx', { type: 'application/vnd.ms-excel' }));
    await waitFor(() => expect(screen.getByTitle(/Unsupported file type/)).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
