// @vitest-environment jsdom
/**
 * The Vault's upload list takes a manifest (Veeva gap 7, "manifest/CSV mapping
 * into Vault"). Download the list as a CSV, fill it in, apply it: each named
 * file's row takes its fields, nothing is sent until Upload, and the upload
 * sends what the rows now say. A manifest the Vault cannot read changes
 * nothing; a line it cannot apply is named, with the reason. The rules
 * themselves: vaultUploadManifest.test.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const H = vi.hoisted(() => ({ apiRequest: vi.fn(), saved: [] as Array<{ name: string; blob: Blob }> }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: H.apiRequest,
}));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob: (name: string, blob: Blob) => { H.saved.push({ name, blob }); return true; },
}));

import { Vault } from '../surfaces/Vault';
import { PID, ok, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';
import { ingestReceipt, stubIngestXhr } from './_ingest-xhr-fake';

const HEADER = 'File,Title,Document type,Classification,Folder,Evidence kind,CTD section';

function stubIngest() {
  const sent: FormData[] = [];
  stubIngestXhr(vi.fn(async (_url: string, init: { body?: unknown }) => {
    sent.push(init.body as FormData);
    return { ok: true, status: 201, json: async () => ingestReceipt(init.body as FormData) };
  }));
  return sent;
}
const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([k]) => k !== 'file' && k !== 'programId'));

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  H.saved = [];
  H.apiRequest.mockReset();
  H.apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree() }));
    return ok({ success: true, data: {} });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

async function choose(files: File[]) {
  render(<Vault {...props()} />);
  fireEvent.change(await screen.findByTestId('vault-upload-zone-files'), { target: { files } });
  return screen.findByTestId('vault-upload-staging');
}
const applyCsv = (panel: HTMLElement, csv: string, name = 'manifest.csv') =>
  fireEvent.change(within(panel).getByTestId('vault-stage-manifest-file'), { target: { files: [new File([csv], name, { type: 'text/csv' })] } });
const manifestNote = async (panel: HTMLElement, role: 'status' | 'alert') => {
  const block = within(panel).getByTestId('vault-stage-manifest');
  await waitFor(() => expect(block.querySelector(`[role="${role}"]`)?.textContent).toBeTruthy());
  return block.querySelector(`[role="${role}"]`)!.textContent;
};
const blobText = (blob: Blob) => new Promise<string>((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(blob);
});
const value = (row: HTMLElement, label: string) => (within(row).getByLabelText(label) as HTMLInputElement).value;

describe('a manifest describes the files in the upload list (Veeva gap 7)', () => {
  it('gives each named file its fields, sends nothing until Upload, and the upload sends them', async () => {
    const sent = stubIngest();
    const panel = await choose([new File(['a'], 'spec-dp.pdf'), new File(['b'], 'letter.pdf')]);
    applyCsv(panel, `${HEADER}\nspec-dp.pdf,Drug product specification,Module 3 · quality,Controlled,Module 3 · Quality,Specification,3.2.P.5.1\n`);
    expect(await manifestNote(panel, 'status')).toBe('manifest.csv: fields applied to 1 file. Nothing has been uploaded; check the rows, then upload. '
      + '1 file in the list is not in the manifest and keeps its fields: letter.pdf.');
    const [row] = within(panel).getAllByTestId('vault-stage-row');
    expect([value(row, 'Title'), value(row, 'Document type'), value(row, 'Classification'), value(row, 'Folder'),
      value(row, 'Evidence kind (optional)'), value(row, 'CTD section (optional)')])
      .toEqual(['Drug product specification', 'MODULE_3', 'CONTROLLED', 'module-3', 'spec', '3.2.P.5.1']);
    expect(sent).toHaveLength(0);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(fields(sent[0])).toEqual({
      documentCode: 'spec-dp.pdf', documentTitle: 'Drug product specification', documentType: 'MODULE_3',
      classification: 'CONTROLLED', folderId: 'module-3', evidenceKind: 'spec', ctdSection: '3.2.P.5.1',
    });
    expect(fields(sent[1])).toEqual({ documentCode: 'letter.pdf', documentTitle: 'letter', documentType: 'OTHER' });
  });

  it('applies no part of a line the Vault cannot take, and names it', async () => {
    stubIngest();
    const panel = await choose([new File(['a'], 'spec-dp.pdf')]);
    applyCsv(panel, `${HEADER}\nspec-dp.pdf,Specification,Synopsis,,Module 3 · Quality,,\n`);
    expect(await manifestNote(panel, 'alert')).toContain('1 line not applied: line 2 (spec-dp.pdf): "Synopsis" is not a Vault document type.');
    const [row] = within(panel).getAllByTestId('vault-stage-row');
    expect([value(row, 'Title'), value(row, 'Folder')]).toEqual(['spec-dp', '']);
  });

  it('changes nothing when the manifest has a column the Vault does not record', async () => {
    stubIngest();
    const panel = await choose([new File(['a'], 'spec-dp.pdf')]);
    applyCsv(panel, 'File,Folderr\nspec-dp.pdf,Module 3 · Quality\n', 'library.csv');
    expect(await manifestNote(panel, 'alert')).toBe('library.csv was not applied. Its column "Folderr" is not one the Vault records. '
      + 'The columns are File, Title, Document type, Classification, Folder, Evidence kind, CTD section. Nothing in the list changed.');
    expect(value(within(panel).getAllByTestId('vault-stage-row')[0], 'Folder')).toBe('');
  });

  it('downloads the list as a manifest to fill in', async () => {
    const panel = await choose([new File(['a'], 'spec-dp.pdf'), new File(['b'], 'letter.pdf')]);
    fireEvent.click(within(panel).getByRole('button', { name: /Download this list as a manifest/ }));
    expect(H.saved.map((s) => s.name)).toEqual(['vault-upload-manifest.csv']);
    expect((await blobText(H.saved[0].blob)).split('\r\n')).toEqual([HEADER, 'spec-dp.pdf,spec-dp,Other,,,,', 'letter.pdf,letter,Other,,,,', '']);
    expect(await manifestNote(panel, 'status')).toBe('Manifest downloaded, one line per file in this list. Fill it in, then apply it here.');
  });
});
