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
import { statusText } from '../surfaces/VaultUploadStaging';
import { FAKE_BODY_BYTES, stubIngestXhr } from './_ingest-xhr-fake';
import { PID, ok, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const RECEIPT = { success: true,
  document: { id: '22222222-2222-4222-8222-222222222222', programId: PID, documentTitle: 'Stored upload', version: '1.0' },
  filing: { folderId: null, folderLabel: null, placementStatus: 'unfiled', needsReview: true } };

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree() }));
    return ok({ success: true, data: {} });
  });
}

function stubIngest(answers: Array<{ status: number; body: unknown }>) {
  const sent: FormData[] = [];
  stubIngestXhr(vi.fn(async (_url: string, init: { body?: unknown }) => {
    sent.push(init.body as FormData);
    const a = answers.shift() ?? { status: 201, body: RECEIPT };
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
    expect(skipped.textContent).toContain('.DS_Store: a hidden or system file');
    expect(sent).toHaveLength(0);
    expect(within(panel).getByRole('button', { name: /Upload 1 file/ })).toBeTruthy();
  });

  it("sends each row's title, type, classification and the folder chosen, with its kind and section, and no version", async () => {
    const sent = stubIngest([{ status: 201, body: { ...RECEIPT, filing: { folderId: 'module-3', folderLabel: 'Module 3 · Quality', placementStatus: 'confirmed', needsReview: false } } }]);
    const panel = await choose([new File(['a'], 'stability-24m.pdf')]);
    const row = within(panel).getByTestId('vault-stage-row');
    fireEvent.change(within(row).getByLabelText('Title'), { target: { value: 'Stability summary, 24 months' } });
    fireEvent.change(within(row).getByLabelText('Document type'), { target: { value: 'MODULE_3' } });
    expect(within(row).queryByLabelText('Version')).toBeNull();
    fireEvent.change(within(row).getByLabelText('Classification'), { target: { value: 'CONFIDENTIAL' } });
    expect(within(row).queryByLabelText('CTD section (optional)')).toBeNull();
    const folder = within(row).getByLabelText('Folder') as HTMLSelectElement;
    expect([...folder.options].map((o) => o.textContent)).toEqual(['No folder chosen: the Vault suggests one, or leaves it Unfiled', 'Module 3 · Quality', 'Agency correspondence']);
    fireEvent.change(folder, { target: { value: 'module-3' } });
    expect(within(row).getByText('Recorded as filed by you.')).toBeTruthy();
    fireEvent.change(within(row).getByLabelText('Evidence kind (optional)'), { target: { value: 'cmc' } });
    fireEvent.change(within(row).getByLabelText('CTD section (optional)'), { target: { value: '3.2.P.8' } });
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(fields(sent[0])).toEqual({
      documentCode: 'stability-24m.pdf', documentTitle: 'Stability summary, 24 months', documentType: 'MODULE_3',
      classification: 'CONFIDENTIAL', folderId: 'module-3', evidenceKind: 'cmc', ctdSection: '3.2.P.8',
    });
    // The person's folder is said as their filing, not as a suggestion.
    expect(await within(row).findByText('Recorded as v1.0 · Module 3 · Quality, filed by you')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeTruthy();
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
      { status: 201, body: RECEIPT },
      { status: 422, body: { error: { message: 'The file failed the malware scan' } } },
      { status: 201, body: RECEIPT },
    ]);
    const panel = await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    const rows = within(panel).getAllByTestId('vault-stage-row');
    expect(await within(rows[1]).findByText('Not recorded: The file failed the malware scan')).toBeTruthy();
    // A file the classifier could not place says so; it does not read as filed.
    expect(within(rows[0]).getByText('Recorded as v1.0 · Unfiled, needs a folder')).toBeTruthy();
    expect(within(panel).getByTestId('vault-stage-live').textContent).toBe('1 file recorded. 1 not recorded: b.pdf.');
    // A refused row can still be removed.
    expect(within(rows[1]).getByRole('button', { name: 'Remove b.pdf from this upload' })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Try again for 1 file' }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent[2].get('documentCode')).toBe('b.pdf');
  });

  it('says when a recorded file’s text is still being read (MR-08 Stage 3)', async () => {
    stubIngest([{ status: 201, body: { ...RECEIPT, document: { ...RECEIPT.document, extraction: 'pending' } } }]);
    const panel = await choose([new File(['%PDF scanned'], 'scan.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    const [row] = within(panel).getAllByTestId('vault-stage-row');
    expect(await within(row).findByText('Recorded as v1.0 · Unfiled, needs a folder · Its text is still being read; search finds it once that is done.')).toBeTruthy();
  });

  it('flags a second file with the same name before it is sent', async () => {
    stubIngest([]);
    const a = new File(['a'], 'protocol.pdf');
    const b = new File(['b'], 'protocol.pdf');
    Object.defineProperty(b, 'webkitRelativePath', { value: 'amendment-2/protocol.pdf' });
    const panel = await choose([a, b]);
    const rows = within(panel).getAllByTestId('vault-stage-row');
    expect(within(rows[0]).queryByText(/same name/)).toBeNull();
    expect(within(rows[1]).getByText(/Another file in this upload has this name\. The Vault identifies a document by its file name/)).toBeTruthy();
    expect(within(rows[1]).getByText('amendment-2/protocol.pdf')).toBeTruthy();
    expect(within(rows[1]).getByText('Recorded in the Vault as protocol.pdf; the folder it came from is not kept.')).toBeTruthy();
  });

});

describe('the staged list is usable without sight or a pointer (accessibility review, 2026-10-22)', () => {
  it('opens with focus on the list and says what was added; a removed row hands focus on; Close returns it', async () => {
    stubIngest([]);
    const panel = await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf'), new File(['c'], 'tool.exe')]);
    expect(document.activeElement).toBe(within(panel).getByRole('heading', { name: 'Files to upload' }));
    expect(within(panel).getByTestId('vault-stage-live').textContent).toBe('2 files added to the upload list. 1 file not uploaded.');
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove a.pdf from this upload' }));
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Remove b.pdf from this upload' })));
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove b.pdf from this upload' }));
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole('heading', { name: 'Files to upload' })));
    fireEvent.click(within(panel).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByTestId('vault-upload-staging')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('vault-upload-button')));
  });

  it('names each row by its file, offers only this view’s folders, and moves focus to Close once the upload settles', async () => {
    stubIngest([]);
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') {
        const tree = cabinetTree();
        (tree[0].children as unknown[]).push({ id: 'cab-other-view', code: '', label: 'Filed under another view · needs review', children: [] });
        return ok(vaultPayload({ tree }));
      }
      return ok({ success: true, data: {} });
    });
    const panel = await choose([new File(['a'], 'cover-letter.pdf')]);
    const group = within(panel).getByRole('group', { name: 'cover-letter.pdf' });
    const folder = within(group).getByLabelText('Folder') as HTMLSelectElement;
    expect([...folder.options].map((o) => o.value)).not.toContain('other-view');
    expect(within(group).queryByText('Internal')).toBeNull();
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole('button', { name: 'Close' })));
  });
});

describe('each row says how far its file has got (MR-08 Stage 6 step 2)', () => {
  it('shows the share sent with a progress bar, and the rows behind it wait their turn', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    stubIngestXhr(vi.fn(async () => {
      await held;
      return { ok: true, status: 201, json: async () => RECEIPT };
    }), [0.5]);
    const panel = await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    const rows = within(panel).getAllByTestId('vault-stage-row');
    expect(await within(rows[0]).findByText('Uploading… 50% of 1.9 MB sent')).toBeTruthy();
    const bar = rows[0].querySelector('progress');
    expect(bar?.getAttribute('aria-label')).toBe('Sending a.pdf');
    expect([bar?.getAttribute('value'), bar?.getAttribute('max')]).toEqual([String(FAKE_BODY_BYTES / 2), String(FAKE_BODY_BYTES)]);
    expect(within(rows[1]).getByText('Waiting: files are sent one at a time.')).toBeTruthy();
    release();
    expect(await within(rows[1]).findByText('Recorded as v1.0 · Unfiled, needs a folder')).toBeTruthy();
    expect(within(rows[0]).getByText('Recorded as v1.0 · Unfiled, needs a folder')).toBeTruthy();
    expect(panel.querySelector('progress')).toBeNull();
  });

  it('says the server is scanning and storing a file once all of it is sent, and only "Uploading…" before it knows', () => {
    expect(statusText({ state: 'uploading', sent: FAKE_BODY_BYTES, total: FAKE_BODY_BYTES })).toBe('Sent. The server is scanning it and storing it…');
    expect(statusText({ state: 'uploading', sent: 0, total: FAKE_BODY_BYTES })).toBe('Uploading… 0% of 1.9 MB sent');
    expect(statusText({ state: 'uploading' })).toBe('Uploading…');
  });
});


describe('retry queue and current upload failures remain distinct', () => {
  it('clears old refusals for a new attempt so a retry queued behind another file waits', async () => {
    let release!: () => void;
    let requests = 0;
    const held = new Promise<void>((resolve) => { release = resolve; });
    stubIngestXhr(vi.fn(async () => {
      requests += 1;
      if (requests <= 2) return { status: 422, json: async () => ({ error: { message: 'Earlier refusal' } }) };
      if (requests === 3) await held;
      return { status: 201, json: async () => RECEIPT };
    }), [0.5]);
    const panel = await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    await within(panel).findByRole('button', { name: 'Try again for 2 files' });
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    const rows = within(panel).getAllByTestId('vault-stage-row');
    await within(rows[0]).findByText(/Uploading/);
    const waiting = within(rows[1]).getByText('Waiting: files are sent one at a time.');
    expect(waiting.className).not.toContain('vd-dr-err');
    expect(within(rows[1]).queryByText(/Earlier refusal/)).toBeNull();
    release();
    await within(rows[1]).findByText(/Recorded as v1.0/);
  });

  it.each([false, true])('keeps a new refusal or unknown result visible while the next file is uploading (unknown=%s)', async (unknown) => {
    let release!: () => void;
    let requests = 0;
    const held = new Promise<void>((resolve) => { release = resolve; });
    stubIngestXhr(vi.fn(async () => {
      requests += 1;
      if (requests === 1) {
        if (unknown) throw new Error('reply lost after sending');
        return { status: 422, json: async () => ({ error: { message: 'Current refusal' } }) };
      }
      await held;
      return { status: 201, json: async () => RECEIPT };
    }), [1]);
    const panel = await choose([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')]);
    fireEvent.click(within(panel).getByTestId('vault-stage-upload'));
    const rows = within(panel).getAllByTestId('vault-stage-row');
    await within(rows[1]).findByText(/Sent\. The server/);
    const refusal = within(rows[0]).getByText(unknown ? /Not known whether it was recorded/ : 'Not recorded: Current refusal');
    expect(refusal.className).toContain('vd-dr-err');
    expect(within(rows[0]).queryByText(/Waiting/)).toBeNull();
    release();
    await within(rows[1]).findByText(/Recorded as v1.0/);
  });
});
