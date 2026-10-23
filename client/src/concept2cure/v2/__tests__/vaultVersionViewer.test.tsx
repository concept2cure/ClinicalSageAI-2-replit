// @vitest-environment jsdom
/**
 * The Vault surface shows a version in the page (gap 3.1, 2026-10-22).
 *
 * Versions could only download. It now offers View on a version whose file is
 * named as a PDF, through the same viewer Project files uses
 * (editor/vaultPdfViewer.tsx), so the same rules hold here:
 *   - the audited download route is the only read;
 *   - only bytes that begin %PDF are framed, typed application/pdf;
 *   - HTML under a .pdf name is downloaded, and the note says why;
 *   - a refusal says what the Vault said;
 *   - the object URL is released on close;
 *   - a version not named as a PDF is not offered a view.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const downloadBlob = vi.hoisted(() => vi.fn((_name: string, _blob: Blob) => true));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob,
}));

import { VaultVersions } from '../surfaces/VaultVersions';

const PID = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const HASH = 'cd'.repeat(32);
const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const HTML = enc('<!doctype html><script>parent.localStorage.getItem("token")</script>');

const version = (id: string, v: string, current: boolean, fileName: string) => ({
  id, version: v, contentHash: HASH, fileSize: 2048, fileName, uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current, link: 'none', lifecycle: null,
});

const framed: Blob[] = [];
const revoked: string[] = [];
let download: () => unknown;

beforeEach(() => {
  framed.length = 0;
  revoked.length = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => { framed.push(b); return `blob:test/${framed.length}`; };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u: string) => { revoked.push(u); };
  download = () => ({
    ok: true, status: 200,
    headers: new Headers({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="protocol.pdf"', 'X-Content-SHA256': HASH }),
    arrayBuffer: async () => PDF.slice().buffer,
  });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.endsWith('/versions')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { versions: [version(V2, '2.0', true, 'protocol.pdf'), version(V1, '1.0', false, 'protocol-notes.txt')] } }) };
    }
    if (url === `/api/c2c/project-vault/${PID}/documents/${V2}/download`) return download();
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mount() {
  render(
    <VaultVersions projectId={PID} documentId={V2} title="Clinical protocol" onDownload={vi.fn()} downloadingId=""
      onUploadNewVersion={vi.fn()} uploading={false} />,
  );
}

describe('Vault Versions — View', () => {
  it('frames a PDF version through the audited download, typed application/pdf, with the served hash', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'View version 2.0 of Clinical protocol' }));
    const pane = await screen.findByTestId('vault-version-viewer');
    const frame = pane.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('blob:test/1');
    expect(frame.title).toBe('Clinical protocol v2.0 — PDF viewer');
    expect(framed).toHaveLength(1);
    expect(framed[0].type).toBe('application/pdf');
    expect(pane.textContent).toMatch(`SHA-256 ${HASH.slice(0, 16)}`);
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PID}/documents/${V2}/download`);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('releases the object URL when the viewer is closed', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'View version 2.0 of Clinical protocol' }));
    fireEvent.click(await screen.findByRole('button', { name: /Close viewer/ }));
    expect(screen.queryByTestId('vault-version-viewer')).toBeNull();
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('does not frame HTML saved under a .pdf name; it downloads it and says why', async () => {
    download = () => ({
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="protocol.pdf"' }),
      arrayBuffer: async () => HTML.slice().buffer,
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'View version 2.0 of Clinical protocol' }));
    expect(await screen.findByText(/Downloaded Clinical protocol v2\.0 — it is named or typed as a PDF, but its contents are not a PDF, so it is not shown here/)).toBeTruthy();
    expect(document.querySelector('iframe')).toBeNull();
    expect(framed).toEqual([]);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });

  it("says what the Vault said when it refuses, and frames nothing", async () => {
    download = () => ({ ok: false, status: 409, json: async () => ({ error: { message: 'The stored bytes do not match the recorded hash' } }) });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'View version 2.0 of Clinical protocol' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Clinical protocol v2.0 was not opened — The stored bytes do not match the recorded hash/);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('offers no view for a version whose file is not named as a PDF', async () => {
    mount();
    await screen.findByRole('button', { name: 'View version 2.0 of Clinical protocol' });
    expect(screen.queryByRole('button', { name: 'View version 1.0 of Clinical protocol' })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download version 1.0 of Clinical protocol' })).toBeTruthy());
  });
});
