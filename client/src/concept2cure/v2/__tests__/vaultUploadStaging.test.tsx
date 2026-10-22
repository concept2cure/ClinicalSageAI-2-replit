// @vitest-environment jsdom
/**
 * The Vault's uploader says what each file is before it is recorded (gap 7.1,
 * docs/design/VEEVA_GAP_2026-10-22.md; MR-08 Stage 6 steps 1-2).
 *
 * POST /api/vault/ingest takes a title, type, version, classification, folder,
 * evidence kind and CTD section per file. The uploader sent one type for the
 * batch and a title from the file name, the moment files were chosen. Here:
 *   - chosen or dropped files wait as one row each;
 *   - a file the Vault does not take, and a system file, are listed with the
 *     reason, not dropped;
 *   - each row's fields go with its own file, and a folder chosen here offers
 *     its evidence kind and CTD section;
 *   - each row says what became of it, and a refused one can be tried again;
 *   - two files with the same name are flagged.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { PID, ok, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree() }));
    return ok({ success: true, data: {} });
  });
}

function stubIngest(answers: Array<{ status: number; body: unknown }>) {
  const sent: FormData[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: unknown }) => {
    sent.push(init.body as FormData);
    const a = answers.shift() ?? { status: 201, body: { success: true, document: { version: '1.0' } } };
    return { ok: a.status < 300, status: a.status, json: async () => a.body } as Response;
  }));
  return sent;
}
const fields = (form: FormData) => Object.fromEntries([...form.entries()].filter(([k]) => k !== 'file' && k !== 'programId'));

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; mockApi(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

async function choose(files: File[]) {
  render(<Vault {...props()} />);
  const input = await screen.findByTestId('vault-upload-zone-files');
  fireEvent.change(input, { target: { files } });
  return screen.findByTestId('vault-upload-staging');
}

describe('the Vault uploader stages each file with its own fields (gap 7.1)', () => {
  it('lists chosen files as rows and sends nothing until asked', async () => {
    const sent = stubIngest([]);
    const panel = await choose([new File(['a'], 'stability-24m.pdf'), new File(['b'], 'tool.exe'), new File(['c'], '.DS_Store')]);
    expect(within(panel).getAllByTestId('vault-stage-row')).toHaveLength(1);
    const skipped = within(panel).getByTestId('vault-stage-skipped');
    expect(skipped.textContent).toContain('tool.exe: the Vault does not take .exe');
    expect(skipped.textContent).toContain('.DS_Store: a system file, not a document');
    expect(sent).toHaveLength(0);
    expect(within(panel).getByRole('button', { name: /Upload 1 file/ })).toBeTruthy();
  });

  it("sends each row's title, type, version, classification and the folder chosen, with its kind and section", async () => {
    const sent = stubIngest([{ status: 201, body: { success: true, document: { version: '2.1' }, filing: { folderId: 'module-3', folderLabel: 'Module 3 · Quality', needsReview: false } } }]);
    const panel = await choose([new File(['a'], 'stability-24m.pdf')]);
    const row = within(panel).getByTestId('vault-stage-row');
    fireEvent.change(within(row).getByLabelText('Title'), { target: { value: 'Stability summary, 24 months' } });
    fireEvent.change(within(row).getByLabelText('Document type'), { target: { value: 'MODULE_3' } });
    fireEvent.change(within(row).getByLabelText('Version'), { target: { value: '2.1' } });
    fireEvent.change(within(row).getByLabelText('Classification'), { target: { value: 'CONFIDENTIAL' } });
    expect(within(row).queryByLabelText('CTD section')).toBeNull();
    const folder = within(row).getByLabelText('Folder') as HTMLSelectElement;
    expect([...folder.options].map((o) => o.textContent)).toEqual(['Let the Vault suggest a folder', 'Module 3 · Quality', 'Agency correspondence']);
    fireEvent.change(folder, { target: { value: 'module-3' } });
    fireEvent.change(within(row).getByLabelText('Evidence kind'), { target: { value: 'cmc' } });
    fireEvent.change(within(row).getByLabelText('CTD section'), { target: { value: '3.2.P.8' } });
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(fields(sent[0])).toEqual({
      documentCode: 'stability-24m.pdf', documentTitle: 'Stability summary, 24 months', documentType: 'MODULE_3',
      version: '2.1', classification: 'CONFIDENTIAL', folderId: 'module-3', evidenceKind: 'cmc', ctdSection: '3.2.P.8',
    });
    expect(await within(row).findByText('Recorded as v2.1 · Module 3 · Quality')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('leaves every blank field to the Vault, and the folder to its classifier', async () => {
    const sent = stubIngest([]);
    const panel = await choose([new File(['a'], 'cover-letter.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(fields(sent[0])).toEqual({ documentCode: 'cover-letter.pdf', documentTitle: 'cover-letter', documentType: 'OTHER' });
  });

  it('says what the Vault refused, row by row, and tries only that one again', async () => {
    const sent = stubIngest([
      { status: 201, body: { success: true, document: { version: '1.0' } } },
      { status: 422, body: { error: { message: 'The file failed the malware scan' } } },
      { status: 201, body: { success: true, document: { version: '1.0' } } },
    ]);
    const panel = await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    const rows = within(panel).getAllByTestId('vault-stage-row');
    expect(await within(rows[1]).findByText('Not recorded: The file failed the malware scan')).toBeTruthy();
    expect(within(rows[0]).getByText('Recorded as v1.0')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again for 1 file' }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2].get('documentCode')).toBe('b.pdf');
  });

  it('flags a second file with the same name before it is sent', async () => {
    stubIngest([]);
    const a = new File(['a'], 'protocol.pdf');
    const b = new File(['b'], 'protocol.pdf');
    Object.defineProperty(b, 'webkitRelativePath', { value: 'amendment-2/protocol.pdf' });
    const panel = await choose([a, b]);
    const rows = within(panel).getAllByTestId('vault-stage-row');
    expect(within(rows[0]).queryByText(/same name/)).toBeNull();
    expect(within(rows[1]).getByText(/Another file in this upload has the same name/)).toBeTruthy();
    expect(within(rows[1]).getByText('amendment-2/protocol.pdf')).toBeTruthy();
  });
});
