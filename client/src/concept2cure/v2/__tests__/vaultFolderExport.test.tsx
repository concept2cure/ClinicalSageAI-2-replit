// @vitest-environment jsdom
/**
 * Export a Vault folder (MR-08 Stage 6 step 3).
 *
 * A filing folder with documents offers "Export <folder>". The archive is
 * saved only when it hashes to the SHA-256 the server recorded for it; a
 * refusal is the server's own words, and nothing is saved. Unfiled, and a
 * folder with no documents, offer nothing. Server half:
 * tests/db/vault-folder-export.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), saved: [] as Array<{ name: string }> }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: H.apiRequest,
}));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob: (name: string) => { H.saved.push({ name }); return true; },
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { exportableFolderId } from '../surfaces/VaultFolderExport';
import { PID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const DOC = '44444444-4444-4444-8444-444444444444';
const UNFILED = '66666666-6666-4666-8666-666666666666';
const VAULT_URL = `/api/c2c/project-vault/${PID}`;
const EXPORT_URL = `/api/c2c/project-vault/${PID}/folders/module-3/export`;
const ZIP = new TextEncoder().encode('PK-folder-export-bytes');
const zipSha = createHash('sha256').update(ZIP).digest('hex');
const zipResponse = (sha: string | null, withheld = '0') => ({
  ok: true, status: 200,
  headers: { get: (h: string) => ({ 'X-Content-SHA256': sha, 'X-Archive-Withheld': withheld,
    'Content-Disposition': 'attachment; filename="vault-module-3-export-1a2b3c4d.zip"' } as Record<string, string | null>)[h] ?? null },
  arrayBuffer: async () => ZIP.buffer.slice(ZIP.byteOffset, ZIP.byteOffset + ZIP.byteLength),
});

let answer: () => Promise<unknown>;
beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  H.saved = [];
  answer = async () => zipResponse(zipSha);
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === VAULT_URL && method === 'GET') {
      return ok(vaultPayload({ tree: cabinetTree([uploadDoc({ id: `up-${DOC}`, docId: DOC, title: 'Drug product specification' })],
        [uploadDoc({ id: `up-${UNFILED}`, docId: UNFILED, title: 'scan-0042', filing: null })]) }));
    }
    if (url === EXPORT_URL) return answer();
    return ok({ success: true, data: { entries: [], chain: { ok: true } } });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

const treeFolder = async (label: string) => {
  await waitFor(() => expect(document.querySelectorAll('.vd-tree .vd-folder').length).toBeGreaterThan(1));
  const button = Array.from(document.querySelectorAll('.vd-tree .vd-folder')).find((b) => b.querySelector('.vd-flabel')?.textContent?.trim() === label);
  if (!button) throw new Error(`no tree folder ${label}`);
  fireEvent.click(button);
};

const exportNote = async (role: 'status' | 'alert') => {
  const block = await screen.findByTestId('vault-folder-export');
  await waitFor(() => expect(block.querySelector(`[role="${role}"]`)).not.toBeNull());
  return block.querySelector(`[role="${role}"]`)!;
};

async function exportModule3() {
  render(<Vault {...props()} />);
  await treeFolder('Module 3 · Quality');
  fireEvent.click(await screen.findByRole('button', { name: /^Export Module 3 · Quality/ }));
}

describe('exporting a Vault folder', () => {
  it('offers export on a filing folder only', () => {
    expect(exportableFolderId('cab-module-3')).toBe('module-3');
    expect(exportableFolderId('cab-unfiled')).toBeNull();
    expect(exportableFolderId('cab-other-view')).toBeNull();
    expect(exportableFolderId('authored')).toBeNull();
    expect(exportableFolderId('cabinet')).toBeNull();
  });

  it('offers nothing on the cabinet itself, on Unfiled, or on a folder with no documents', async () => {
    render(<Vault {...props()} />);
    // The cabinet itself is the folder the surface opens on.
    await waitFor(() => expect(document.querySelectorAll('.vd-tree .vd-folder').length).toBeGreaterThan(1));
    expect(screen.queryByTestId('vault-folder-export')).toBeNull();
    await treeFolder('Agency correspondence');
    await waitFor(() => expect(document.querySelector('.vd-tree .vd-folder[data-on]')?.textContent).toContain('Agency correspondence'));
    expect(screen.queryByTestId('vault-folder-export')).toBeNull();
    await treeFolder('Unfiled · needs review');
    expect(screen.queryByTestId('vault-folder-export')).toBeNull();
    await treeFolder('Module 3 · Quality');
    expect((await screen.findByTestId('vault-folder-export')).textContent).toContain('Export Module 3 · Quality');
  });

  it('saves the archive when it hashes to the SHA-256 the server recorded', async () => {
    await exportModule3();
    const note = await exportNote('status');
    expect(note.textContent).toBe(`Folder export saved. Its SHA-256, checked on receipt against the server's record: ${zipSha}.`);
    expect(H.saved).toEqual([{ name: 'vault-module-3-export-1a2b3c4d.zip' }]);
    expect(H.apiRequest).toHaveBeenCalledWith('GET', EXPORT_URL);
  });

  it('says when a withdrawn file is not in it', async () => {
    answer = async () => zipResponse(zipSha, '1');
    await exportModule3();
    expect((await exportNote('status')).textContent).toContain('1 document’s original file was withdrawn under a data disposition and is not in it; the index lists it.');
  });

  it('does not save a file that does not match the recorded SHA-256', async () => {
    answer = async () => zipResponse('f'.repeat(64));
    await exportModule3();
    expect((await exportNote('alert')).textContent).toContain('does not match the SHA-256 the server recorded for it, so it was not saved');
    expect(H.saved).toEqual([]);
  });

  it("says nothing was saved, in the server's words, when the export is refused", async () => {
    answer = async () => { throw new ApiRequestError('HTTP 409', 409, { success: false, error: 'EXPORT_FILE_UNVERIFIED',
      message: 'Stability protocol could not be exported: the stored file does not match what was recorded. Nothing was sent.' }); };
    await exportModule3();
    expect((await exportNote('alert')).textContent).toContain('Stability protocol could not be exported');
    expect(H.saved).toEqual([]);
  });
});
