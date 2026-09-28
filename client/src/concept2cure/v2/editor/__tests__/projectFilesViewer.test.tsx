// @vitest-environment jsdom
/**
 * The Project files viewer frames a PDF, and only a PDF — decided by the bytes.
 *
 * ── The defect (periodic review 2026-09-28, editor family, SEC-A-3) ──────────
 * Open framed a fetched file when its title ended in `.pdf` or the served
 * Content-Type said pdf, and it kept the served type on the blob it framed. The
 * vault accepted HTML declared `text/html` under a `.pdf` name and served that
 * type back, so Open on such a row ran the HTML in the app's own origin, in an
 * unsandboxed frame, as whoever clicked it.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * 1. Bytes that do not begin `%PDF` are never framed, whatever the title or the
 *    served type claims. They are downloaded, and the toast says why.
 * 2. What is framed is always typed application/pdf, even when the server said
 *    otherwise: a `%PDF` file served as text/html is also an HTML document.
 * 3. A real PDF still opens in the viewer, including one the server typed as
 *    octet-stream — the capability is kept, and the bytes decide both ways.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
/* The browser's save is not what is under test; what reached it is. */
const downloadBlob = vi.hoisted(() => vi.fn((_name: string, _blob: Blob) => true));
vi.mock('../../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../download')>()),
  downloadBlob,
}));

import { ProjectFilesPanel } from '../ProjectFilesPanel';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const HASH = 'ab'.repeat(32);

/** jsdom has no createObjectURL. Every blob the viewer asks a URL for is kept. */
const framed: Blob[] = [];
const createObjectURL = vi.fn((b: Blob) => {
  framed.push(b);
  return `blob:test/${framed.length}`;
});

const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const HTML = enc('<!doctype html><script>parent.localStorage.getItem("token")</script><h1>report</h1>');
/** Begins %PDF, so a PDF reader accepts it — and parses as HTML with a script. */
const POLYGLOT = enc('%PDF-1.4\n<html><script>parent.localStorage.getItem("token")</script></html>\n%%EOF\n');
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

/** The vault's read model with one uploaded file, and its audited download. */
function serve(file: { title: string; bytes: Uint8Array; type: string; fileName?: string }) {
  const doc = {
    id: 'upload-1', num: '', title: file.title, type: 'Report', status: 'unfiled', pct: null,
    owner: '', ver: '', updated: '', preview: '', src: 'upload', docId: 'upload-1',
  };
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PROGRAM}`) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { tree: [doc] } }) };
    }
    if (url === `/api/c2c/project-vault/${PROGRAM}/documents/upload-1/download`) {
      const headers = new Headers({
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename="${file.fileName ?? file.title}"`,
        'X-Content-SHA256': HASH,
      });
      // Both readers a client could use, so the test drives whichever it calls.
      return {
        ok: true, status: 200, headers,
        blob: async () => new Blob([file.bytes], { type: file.type }),
        arrayBuffer: async () => file.bytes.slice().buffer,
      };
    }
    throw new Error(`unexpected request ${url}`);
  });
}

function renderPanel() {
  const fireToast = vi.fn();
  render(
    <ProjectFilesPanel
      programId={PROGRAM} programName="Program" onClose={() => {}} fireToast={fireToast}
      sectionOpen={false} sectionCode={null} projectSources={[]}
      onCite={() => false} onInsertReference={() => false}
    />,
  );
  return { fireToast };
}

/** Select the row and press Open, then wait until Open has done something. */
async function open(title: string, fireToast: ReturnType<typeof vi.fn>) {
  fireEvent.click(await screen.findByText(title));
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  await waitFor(() => {
    expect(document.querySelector('iframe') !== null || fireToast.mock.calls.length > 0).toBe(true);
  });
}

/** A blob's bytes as plain numbers — the blob may be jsdom's or Node's, and
 *  typed arrays from two realms do not compare equal. */
async function bytesOf(blob: Blob): Promise<number[]> {
  if (typeof (blob as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(Array.from(new Uint8Array(reader.result as ArrayBuffer)));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

beforeEach(() => {
  framed.length = 0;
  (URL as unknown as { createObjectURL: typeof createObjectURL }).createObjectURL = createObjectURL;
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Project files — what the viewer frames', () => {
  it('does not frame HTML saved under a .pdf name and served as text/html; it downloads it and says why', async () => {
    serve({ title: 'report.pdf', bytes: HTML, type: 'text/html' });
    const { fireToast } = renderPanel();
    await open('report.pdf', fireToast);

    expect(document.querySelector('iframe')).toBeNull();
    expect(framed).toEqual([]);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob.mock.calls[0][0]).toBe('report.pdf');
    const [message, tone] = fireToast.mock.calls[0];
    expect(message).toMatch(/report\.pdf/);
    expect(message).toMatch(/not a PDF/);
    expect(tone).toBe('ok');
  });

  it('does not frame HTML the server typed application/pdf', async () => {
    serve({ title: 'Clinical overview', bytes: HTML, type: 'application/pdf', fileName: 'overview.pdf' });
    const { fireToast } = renderPanel();
    await open('Clinical overview', fireToast);

    expect(document.querySelector('iframe')).toBeNull();
    expect(framed).toEqual([]);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(fireToast.mock.calls[0][0]).toMatch(/not a PDF/);
  });

  it('frames %PDF bytes as application/pdf even when the server typed them text/html', async () => {
    serve({ title: 'report.pdf', bytes: POLYGLOT, type: 'text/html' });
    const { fireToast } = renderPanel();
    await open('report.pdf', fireToast);

    const frame = document.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(framed).toHaveLength(1);
    expect(framed[0].type).toBe('application/pdf');
    expect(frame!.getAttribute('src')).toBe('blob:test/1');
    expect(await bytesOf(framed[0])).toEqual(Array.from(POLYGLOT));
  });

  it('still opens a real PDF in the viewer, with the served hash', async () => {
    serve({ title: 'protocol.pdf', bytes: PDF, type: 'application/pdf' });
    const { fireToast } = renderPanel();
    await open('protocol.pdf', fireToast);

    expect(document.querySelector('iframe')).not.toBeNull();
    expect(framed).toHaveLength(1);
    expect(framed[0].type).toBe('application/pdf');
    expect(await bytesOf(framed[0])).toEqual(Array.from(PDF));
    expect(screen.getByText(/SHA-256 abababab/)).toBeTruthy();
    expect(fireToast).not.toHaveBeenCalled();
  });

  it('opens a real PDF the server typed as octet-stream under a name without .pdf — the bytes decide', async () => {
    serve({ title: 'Signed protocol', bytes: PDF, type: 'application/octet-stream', fileName: 'protocol-signed' });
    const { fireToast } = renderPanel();
    await open('Signed protocol', fireToast);

    expect(document.querySelector('iframe')).not.toBeNull();
    expect(framed).toHaveLength(1);
    expect(framed[0].type).toBe('application/pdf');
  });

  it('downloads a file that is not a PDF and does not claim to be, as before', async () => {
    serve({ title: 'listings.docx', bytes: ZIP, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const { fireToast } = renderPanel();
    await open('listings.docx', fireToast);

    expect(document.querySelector('iframe')).toBeNull();
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(fireToast.mock.calls[0][0]).toMatch(/the viewer here shows PDFs only/);
  });
});
