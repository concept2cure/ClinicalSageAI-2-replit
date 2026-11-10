// @vitest-environment jsdom
/**
 * The Vault's viewer shows the PDF rendition of a Word version (P-107 item 3).
 *
 * The viewer framed a PDF and downloaded anything else, so a Word version
 * could not be read in the Vault. It now frames the version's PDF rendition,
 * fetched through the same audited route (?rendition=pdf), and says what it
 * is. What this pins:
 *   - the pane names the version, the source SHA-256 the rendition was made
 *     from and the rendition's own, and says it is not the filed document;
 *   - it never says a rendition was verified against the vault record, and it
 *     never frames one the Vault did not mark as a rendition, or bytes that
 *     are not a PDF;
 *   - the source stays downloadable beside it;
 *   - when no rendition can be made, the reason is the Vault's, nothing is
 *     framed, and the source is still handed over;
 *   - a PDF version is shown as before, and a workbook is still not offered.
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
import { VaultVersionViewer, VersionViewButton, useVaultVersionViewer } from '../surfaces/VaultVersionViewer';

const PID = '11111111-1111-4111-8111-111111111111';
const PDF_VERSION = '22222222-2222-4222-8222-222222222222';
const WORD_VERSION = '33333333-3333-4333-8333-333333333333';
const SHEET_VERSION = '44444444-4444-4444-8444-444444444444';
const PDF_HASH = 'cd'.repeat(32);
const WORD_HASH = 'ab'.repeat(32);
const RENDITION_HASH = 'ef'.repeat(32);
const enc = (s: string) => new TextEncoder().encode(s);
/** A blob's bytes, as plain numbers (jsdom's Blob has no arrayBuffer(), and its typed arrays are another realm's). */
const bytesOf = (blob: Blob) => new Promise<number[]>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(Array.from(new Uint8Array(reader.result as ArrayBuffer)));
  reader.onerror = () => reject(reader.error);
  reader.readAsArrayBuffer(blob);
});
const PDF = enc('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const RENDITION = enc('%PDF-1.7\n% the rendition of the Word version\n%%EOF\n');
const WORD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const SOURCE_URL = (id: string) => `/api/c2c/project-vault/${PID}/documents/${id}/download`;
const RENDITION_URL = (id: string) => `${SOURCE_URL(id)}?rendition=pdf`;

const version = (id: string, v: string, current: boolean, fileName: string, contentHash: string) => ({
  id, version: v, contentHash, fileSize: 2048, fileName, uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current, link: 'none', lifecycle: null,
});

const ok = (headers: Record<string, string>, bytes: Uint8Array) => ({
  ok: true, status: 200, headers: new Headers(headers), arrayBuffer: async () => bytes.slice().buffer,
});
const refusal = (status: number, error: string, message: string) => ({
  ok: false, status, headers: new Headers(), json: async () => ({ success: false, error, message }),
});
const wordSource = () => ok({ 'Content-Type': WORD_MIME, 'Content-Disposition': 'attachment; filename="protocol.docx"', 'X-Content-SHA256': WORD_HASH }, WORD);
const wordRendition = () => ok({
  'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="protocol.docx.rendition.pdf"',
  'X-Vault-Rendition': 'pdf', 'X-Rendition-Source-SHA256': WORD_HASH, 'X-Rendition-SHA256': RENDITION_HASH,
}, RENDITION);

const framed: Blob[] = [];
const revoked: string[] = [];
let renditionResponse: () => unknown;
const requested = () => apiRequest.mock.calls.map(([, url]) => url as string).filter((url) => url.includes('/download'));

beforeEach(() => {
  framed.length = 0;
  revoked.length = 0;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => { framed.push(b); return `blob:test/${framed.length}`; };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u: string) => { revoked.push(u); };
  renditionResponse = wordRendition;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.endsWith('/versions')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { versions: [
        version(PDF_VERSION, '3.0', true, 'protocol.pdf', PDF_HASH),
        version(WORD_VERSION, '2.0', false, 'protocol.docx', WORD_HASH),
        version(SHEET_VERSION, '1.0', false, 'protocol-data.xlsx', 'aa'.repeat(32)),
      ] } }) };
    }
    if (url === SOURCE_URL(PDF_VERSION)) return ok({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="protocol.pdf"', 'X-Content-SHA256': PDF_HASH }, PDF);
    if (url === SOURCE_URL(WORD_VERSION)) return wordSource();
    if (url === RENDITION_URL(WORD_VERSION)) return renditionResponse();
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function mountVersions() {
  render(
    <VaultVersions projectId={PID} documentId={PDF_VERSION} title="Clinical protocol" onDownload={vi.fn()} downloadingId=""
      onUploadNewVersion={vi.fn()} uploading={false} />,
  );
}
const viewWord = async () => fireEvent.click(await screen.findByRole('button', { name: 'View a PDF rendition of version 2.0 of Clinical protocol' }));

describe('Vault Versions — the PDF rendition of a Word version', () => {
  it('frames the rendition and says what it is: of which version, from which source, and not the filed document', async () => {
    mountVersions();
    await viewWord();
    const pane = await screen.findByTestId('vault-version-viewer');
    const frame = pane.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('blob:test/1');
    expect(frame.title).toBe('Clinical protocol v2.0 — PDF rendition');
    expect(framed).toHaveLength(1);
    expect(framed[0].type).toBe('application/pdf');
    expect(await bytesOf(framed[0])).toEqual(Array.from(RENDITION));

    const said = (await screen.findByTestId('vault-rendition-note')).textContent ?? '';
    expect(said).toContain('PDF rendition of Clinical protocol v2.0');
    expect(said).toContain(`made from the source file with SHA-256 ${WORD_HASH.slice(0, 16)}`);
    expect(said).toContain('not the filed document');
    expect(said).toContain(`Rendition SHA-256 ${RENDITION_HASH.slice(0, 16)}`);
    // The line a version's own PDF carries is about the record's bytes; a rendition's are not the record's.
    expect(pane.textContent).not.toMatch(/verified against the vault record/);
    expect(requested()).toContain(RENDITION_URL(WORD_VERSION));
  });

  it('keeps the source downloadable beside the rendition, and hands nothing over until asked', async () => {
    mountVersions();
    await viewWord();
    await screen.findByTestId('vault-version-viewer');
    expect(downloadBlob).not.toHaveBeenCalled();

    const before = requested().length;
    fireEvent.click(screen.getByRole('button', { name: 'Download the source of Clinical protocol v2.0' }));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob.mock.calls[0][0]).toBe('protocol.docx');
    expect(await bytesOf(downloadBlob.mock.calls[0][1] as Blob)).toEqual(Array.from(WORD));
    expect(requested()).toHaveLength(before);
  });

  it('releases the rendition when the viewer is closed', async () => {
    mountVersions();
    await viewWord();
    fireEvent.click(await screen.findByRole('button', { name: /Close viewer/ }));
    expect(screen.queryByTestId('vault-version-viewer')).toBeNull();
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('says why when the Vault cannot make one, frames nothing, and still hands over the source', async () => {
    renditionResponse = () => refusal(503, 'RENDITION_CONVERTER_UNAVAILABLE',
      'This server has no document converter installed, so a PDF rendition cannot be made here. The version itself can still be downloaded.');
    mountVersions();
    await viewWord();
    const note = await screen.findByText(/Downloaded Clinical protocol v2\.0/);
    expect(note.textContent).toContain('its PDF rendition was not shown: This server has no document converter installed');
    expect(document.querySelector('iframe')).toBeNull();
    expect(framed).toEqual([]);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob.mock.calls[0][0]).toBe('protocol.docx');
  });

  it.each([
    ['bytes that are not a PDF', () => ok({ 'Content-Type': 'application/pdf', 'X-Vault-Rendition': 'pdf', 'X-Rendition-Source-SHA256': WORD_HASH, 'X-Rendition-SHA256': RENDITION_HASH }, enc('<!doctype html><script>1</script>')), /what the Vault sent as a rendition is not a PDF/],
    ['a PDF the Vault did not mark as a rendition', () => ok({ 'Content-Type': 'application/pdf', 'X-Content-SHA256': WORD_HASH }, RENDITION), /the Vault did not say what it was made from/],
    ['a rendition that names no source', () => ok({ 'Content-Type': 'application/pdf', 'X-Vault-Rendition': 'pdf' }, RENDITION), /the Vault did not say what it was made from/],
  ])('does not frame %s', async (_what, response, why) => {
    renditionResponse = response;
    mountVersions();
    await viewWord();
    const note = await screen.findByText(/Downloaded Clinical protocol v2\.0/);
    expect(note.textContent).toMatch(why);
    expect(document.querySelector('iframe')).toBeNull();
    expect(framed).toEqual([]);
  });

  it('shows a PDF version as before: its own bytes, verified against the record, with no rendition asked for', async () => {
    mountVersions();
    fireEvent.click(await screen.findByRole('button', { name: 'View version 3.0 of Clinical protocol' }));
    const pane = await screen.findByTestId('vault-version-viewer');
    expect(pane.querySelector('iframe')!.title).toBe('Clinical protocol v3.0 — PDF viewer');
    expect(pane.textContent).toMatch(`SHA-256 ${PDF_HASH.slice(0, 16)}… — verified against the vault record`);
    expect(screen.queryByTestId('vault-rendition-note')).toBeNull();
    expect(screen.queryByRole('button', { name: /Download the source/ })).toBeNull();
    expect(requested()).toEqual([SOURCE_URL(PDF_VERSION)]);
  });

  it('offers no view for a workbook: the converter makes a PDF from a Word document only', async () => {
    mountVersions();
    await screen.findByRole('button', { name: 'View version 3.0 of Clinical protocol' });
    await screen.findByRole('button', { name: 'View a PDF rendition of version 2.0 of Clinical protocol' });
    expect(screen.queryByRole('button', { name: /^View .*version 1\.0 of Clinical protocol$/ })).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download version 1.0 of Clinical protocol' })).toBeTruthy());
  });
});

/** The viewer as a surface wires it once it passes the version's file name on: straight to the rendition. */
function NamedViewer({ fileName }: { fileName: string }) {
  const viewer = useVaultVersionViewer(PID);
  return (
    <>
      <VersionViewButton
        version={{ id: WORD_VERSION, version: '2.0', fileName, contentHash: WORD_HASH }} title="Clinical protocol" viewingId={viewer.viewing}
        onView={(id, label, hash, name) => void viewer.view(id, label, hash, name)}
      />
      <VaultVersionViewer state={viewer} />
    </>
  );
}

describe('the viewer, told the version is a Word file', () => {
  it('asks for the rendition only: the source is not fetched to read the version', async () => {
    render(<NamedViewer fileName="protocol.docx" />);
    await viewWord();
    expect((await screen.findByTestId('vault-rendition-note')).textContent).toContain('PDF rendition of Clinical protocol v2.0');
    expect(requested()).toEqual([RENDITION_URL(WORD_VERSION)]);
    // The source was not fetched, so the pane says where it is rather than offering bytes it does not hold.
    expect(screen.queryByRole('button', { name: /Download the source/ })).toBeNull();
    expect(screen.getByTestId('vault-rendition-note').textContent).toContain('Download the version for the source file');
  });

  it('says what the Vault said when it refuses, frames nothing and downloads nothing', async () => {
    renditionResponse = () => refusal(422, 'RENDITION_FAILED',
      'The converter could not make a PDF from this version, so nothing is shown in its place. The version itself can still be downloaded.');
    render(<NamedViewer fileName="protocol.docx" />);
    await viewWord();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Clinical protocol v2\.0 was not opened — The converter could not make a PDF from this version/);
    expect(document.querySelector('iframe')).toBeNull();
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(requested()).toEqual([RENDITION_URL(WORD_VERSION)]);
  });

  it('shows the version itself when the Vault says it is already a PDF', async () => {
    renditionResponse = () => refusal(409, 'RENDITION_NOT_NEEDED', 'This version is a PDF. It is read as it is, so it has no rendition.');
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === RENDITION_URL(WORD_VERSION)) return renditionResponse();
      return ok({ 'Content-Type': WORD_MIME, 'Content-Disposition': 'attachment; filename="protocol.docx"', 'X-Content-SHA256': WORD_HASH }, PDF);
    });
    render(<NamedViewer fileName="protocol.docx" />);
    await viewWord();
    const pane = await screen.findByTestId('vault-version-viewer');
    expect(pane.textContent).toMatch(`SHA-256 ${WORD_HASH.slice(0, 16)}… — verified against the vault record`);
    expect(screen.queryByTestId('vault-rendition-note')).toBeNull();
    expect(requested()).toEqual([RENDITION_URL(WORD_VERSION), SOURCE_URL(WORD_VERSION)]);
  });
});
