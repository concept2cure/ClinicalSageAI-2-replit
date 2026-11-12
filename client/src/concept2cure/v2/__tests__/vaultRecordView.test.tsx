// @vitest-environment jsdom
/**
 * A document is read from its record in the Vault, in a wide reading pane.
 *
 * The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." And 2026-11-11: "focus entirely on
 * getting what we built surfaces correctly on the UI." The Vault could show a document: the viewer exists
 * (surfaces/VaultVersionViewer.tsx over editor/vaultPdfViewer.tsx), with a PDF rendition for a Word file (P-107).
 * It was reached only by opening the record's closed "Versions" section and pressing View on a row, and it framed
 * the page 328px wide inside the record panel. The record's own actions now offer View beside Download, and the
 * same viewer opens in a wide drawer. Nothing is rebuilt: the same audited route, the same bytes rule, the same
 * hash line.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

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

import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, vaultPayload, props, cabinetTree, uploadDoc } from './_vault-surface-fixtures';

const HASH = 'cd'.repeat(32);
const enc = (s: string) => new TextEncoder().encode(s);
const PDF = enc('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const HTML = enc('<!doctype html><p>not a pdf</p>');
const DOWNLOAD = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/download`;

const framed: Blob[] = [];
const revoked: string[] = [];
const reads: string[] = [];
let served: { status?: number; type: string; bytes: Uint8Array; rendition?: boolean };

function install(doc: Record<string, unknown>) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([uploadDoc(doc)]) }));
    if (url === `/api/c2c/project-vault/${PID}/seals`) return ok({ success: true, data: { seals: [] } });
    if (url.startsWith(DOWNLOAD) && method === 'GET') {
      reads.push(url);
      if ((served.status ?? 200) !== 200) return { ok: false, status: served.status, json: async () => ({ success: false, error: { message: 'This version is on legal hold and is not served.' } }) } as Response;
      return {
        ok: true, status: 200,
        headers: new Headers({ 'Content-Type': served.type, 'Content-Disposition': 'attachment; filename="stability-summary-24m.pdf"', 'X-Content-SHA256': HASH,
          ...(url.includes('rendition=pdf') ? { 'X-Rendition-Of-SHA256': 'ab'.repeat(32) } : {}) }),
        arrayBuffer: async () => served.bytes.slice().buffer,
      } as unknown as Response;
    }
    return ok({});
  });
}

/** The Vault with the document's record open: the row is pressed, as a person opens it. */
async function openRecord(title: string) {
  render(<Vault {...props()} />);
  const row = (await screen.findAllByText(title)).map((el) => el.closest('.vd-row')).find(Boolean) as HTMLElement;
  fireEvent.click(row);
  await waitFor(() => expect(document.querySelector('.vd-d-actions')).not.toBeNull());
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  framed.length = 0; revoked.length = 0; reads.length = 0;
  served = { type: 'application/pdf', bytes: PDF };
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => { framed.push(b); return `blob:test/${framed.length}`; };
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u: string) => { revoked.push(u); };
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

describe('reading a document from its record', () => {
  it('a PDF is offered View beside Download, and opens in a reading drawer through the audited route', async () => {
    install({ mimeType: 'application/pdf' });
    await openRecord('stability-summary-24m');
    const view = await screen.findByRole('button', { name: 'View stability-summary-24m' });
    // Beside Download, in the record's own actions: not inside the Versions section.
    expect(view.closest('.vd-d-actions')).not.toBeNull();
    expect(within(view.closest('.vd-d-actions') as HTMLElement).getByRole('button', { name: /Download/ })).toBeTruthy();
    fireEvent.click(view);
    const drawer = await screen.findByRole('dialog', { name: /^Reading stability-summary-24m/ });
    expect(reads).toEqual([DOWNLOAD]);
    expect(drawer.querySelector('iframe')?.getAttribute('src')).toBe('blob:test/1');
    expect(framed[0].type).toBe('application/pdf');
    expect(drawer.textContent).toContain(`SHA-256 ${HASH.slice(0, 16)}`);
    // Closing releases the framed bytes and removes the drawer.
    fireEvent.click(within(drawer).getByRole('button', { name: /Close viewer/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /^Reading/ })).toBeNull());
    expect(revoked).toEqual(['blob:test/1']);
  });

  it('a Word document is offered View as PDF, which asks for its rendition and says what it is', async () => {
    install({ mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', preview: 'stability-summary-24m.docx · 1.0 MB' });
    await openRecord('stability-summary-24m');
    fireEvent.click(await screen.findByRole('button', { name: 'View a PDF rendition of stability-summary-24m' }));
    const drawer = await screen.findByRole('dialog', { name: /^Reading stability-summary-24m/ });
    expect(reads).toEqual([`${DOWNLOAD}?rendition=pdf`]);
    expect(drawer.textContent).toContain('A PDF rendition made from');
    expect(drawer.textContent).toContain('The version in the Vault is the Word file');
    // Never "verified against the vault record": that is said of a stored version, not of a rendition.
    expect(drawer.textContent).not.toContain('verified against the vault record');
  });

  it('a file that is neither is offered no view', async () => {
    install({ mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await openRecord('stability-summary-24m');
    await screen.findByRole('button', { name: /Download/ });
    expect(screen.queryByRole('button', { name: /^View / })).toBeNull();
  });

  it('bytes that are not a PDF are downloaded, no drawer opens, and the record says why', async () => {
    install({ mimeType: 'application/pdf' });
    served = { type: 'application/pdf', bytes: HTML };
    await openRecord('stability-summary-24m');
    fireEvent.click(await screen.findByRole('button', { name: 'View stability-summary-24m' }));
    const note = await screen.findByTestId('vault-record-view-note');
    expect(note.textContent).toContain('its contents are not a PDF');
    expect(screen.queryByRole('dialog', { name: /^Reading/ })).toBeNull();
    expect(framed).toHaveLength(0);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });

  it('a refusal says what the Vault said, in the record', async () => {
    install({ mimeType: 'application/pdf' });
    served = { status: 423, type: 'application/json', bytes: enc('') };
    await openRecord('stability-summary-24m');
    fireEvent.click(await screen.findByRole('button', { name: 'View stability-summary-24m' }));
    const note = await screen.findByTestId('vault-record-view-note');
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toContain('legal hold');
    expect(screen.queryByRole('dialog', { name: /^Reading/ })).toBeNull();
  });
});
