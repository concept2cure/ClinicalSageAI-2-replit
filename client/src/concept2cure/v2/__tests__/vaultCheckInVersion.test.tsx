// @vitest-environment jsdom
/**
 * The Vault shows every version of a document and adds the next one (VR-09).
 *
 * The detail pane showed only the current version, beside a note that no
 * version history existed. A file refused because a different file was
 * recorded at its name was a dead end ("Upload it under a new version", with
 * no way to). Here:
 *   - a document with two versions is one row, saying so;
 *   - the detail lists every version from GET …/versions, with SHA-256 prefix
 *     and uploader, each downloadable;
 *   - "Upload new version" posts supersedesDocumentId and no document code;
 *   - the 409 conflict offers "Upload as a new version of <title>";
 *   - search can include earlier versions;
 *   - the empty state claims nothing the product does not do.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { PID, DOC_ID, ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const V1 = '33333333-3333-4333-8333-333333333333';
const VERSIONS_URL = `/api/c2c/project-vault/${PID}/documents/${DOC_ID}/versions`;
const head = uploadDoc({
  ver: 'v2.0',
  versionCount: 2,
  documentCode: 'stability-summary-24m.pdf',
  details: { documentTitle: 'Stability summary', documentType: 'OTHER', classification: 'INTERNAL' },
});
const versions = [
  { id: DOC_ID, version: '2.0', contentHash: 'b'.repeat(64), fileSize: 2048, fileName: 's.pdf', uploader: 'Ada Author', createdAt: '2026-09-30T10:00:00.000Z', current: true, link: 'verified' },
  { id: V1, version: '1.0', contentHash: 'a'.repeat(64), fileSize: 1024, fileName: 's.pdf', uploader: 'Ben Builder', createdAt: '2026-09-29T09:00:00.000Z', current: false, link: 'none' },
];

const calls: string[] = [];
function mockApi(tree = cabinetTree([head])) {
  calls.length = 0;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    calls.push(url);
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree }));
    if (url === VERSIONS_URL) return ok({ success: true, data: { versions } });
    if (url.startsWith(`/api/c2c/project-vault/${PID}/search`)) {
      return ok({ success: true, data: { query: 'x', total: 0, limit: 100, offset: 0, results: [] } });
    }
    return ok({});
  });
}

/** fetch, as the upload hook calls it: the multipart bodies it was given, and the answers in order. */
function stubIngest(answers: Array<{ status: number; body: unknown }>) {
  const sent: FormData[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: unknown }) => {
    sent.push(init.body as FormData);
    const a = answers.shift() ?? { status: 201, body: {} };
    return { ok: a.status < 300, status: a.status, json: async () => a.body } as Response;
  }));
  return sent;
}

beforeEach(() => { (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete (window as any).C2C_PROJECT; });

describe('a document with versions in the Vault (VR-09)', () => {
  it('is one row and one header, saying how many versions it has', async () => {
    mockApi();
    render(<Vault {...props()} />);
    expect(await screen.findByText(/v2\.0, 2 versions/)).toBeTruthy();
    expect(screen.getByText(/v2\.0 · 2 versions/)).toBeTruthy();
  });

  it('lists every version with its SHA-256 prefix and uploader, each downloadable', async () => {
    mockApi();
    render(<Vault {...props()} />);
    const list = await screen.findByTestId('vault-versions');
    await waitFor(() => expect(list.textContent).toContain('Ben Builder'));
    expect(list.textContent).toContain('aaaaaaaaaaaa');
    expect(list.textContent).toContain('bbbbbbbbbbbb');
    expect(list.textContent).toContain('v2.0 · current');
    expect(screen.getByLabelText('Download version 1.0 of stability-summary-24m')).toBeTruthy();
  });

  it('says so when the versions cannot be read', async () => {
    mockApi();
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload({ tree: cabinetTree([head]) }));
      if (url === VERSIONS_URL) return { ok: false, status: 500, json: async () => ({ success: false }) } as Response;
      return ok({});
    });
    render(<Vault {...props()} />);
    const list = await screen.findByTestId('vault-versions');
    await waitFor(() => expect(list.textContent).toMatch(/could not be read/));
  });

  it('exports the signed history of every version, and says when the role may not', async () => {
    mockApi();
    const answer = ok({ success: true, export: { data: [], manifest: {}, signature: 'sig' } });
    const base = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string) =>
      url.startsWith('/api/audit/export/signed') ? (calls.push(url), answer) : base(method, url));
    render(<Vault {...props()} />);
    fireEvent.click(await screen.findByText('Export signed history'));
    await waitFor(() => expect(calls.some((u) => u.startsWith('/api/audit/export/signed'))).toBe(true));
    const url = calls.find((u) => u.startsWith('/api/audit/export/signed'))!;
    expect(url).toContain('resource_type=vault_document');
    expect(url).toContain(`record_ids=${DOC_ID},${V1}`);

    // As apiRequest delivers a 403 in production: thrown, never returned.
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url.startsWith('/api/audit/export/signed')) {
        calls.push(url);
        throw new ApiRequestError('You do not have permission to export the audit trail.', 403, { error: 'forbidden' }, 'FORBIDDEN');
      }
      return base(method, url);
    });
    fireEvent.click(screen.getByText('Export signed history'));
    expect(await screen.findByText(/Ask a user with audit export access/)).toBeTruthy();
    expect(screen.queryByText(/connection dropped/)).toBeNull();
  });

});

describe('adding and finding a version in the Vault (VR-09)', () => {
  it("'Upload new version' names the document and sends no document code", async () => {
    mockApi();
    const sent = stubIngest([{ status: 201, body: { success: true, document: { version: '3.0', documentTitle: 'Stability summary' } } }]);
    render(<Vault {...props()} />);
    await screen.findByTestId('vault-versions');
    fireEvent.change(screen.getByLabelText('File to add as a new version of stability-summary-24m'), {
      target: { files: [new File(['v3'], 'stability-summary-v3.pdf')] },
    });
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].get('supersedesDocumentId')).toBe(DOC_ID);
    expect(sent[0].get('documentCode')).toBeNull();
    expect(sent[0].get('documentTitle')).toBe('Stability summary');
    expect(sent[0].get('version')).toBeNull();
  });

  it('offers a refused same-name file as the next version, instead of a dead end', async () => {
    mockApi();
    const sent = stubIngest([
      { status: 409, body: { error: { code: 'VERSION_CONTENT_CONFLICT', message: 'A different document is already recorded at code "stability-summary-24m.pdf".' } } },
      { status: 201, body: { success: true, document: { version: '3.0' } } },
    ]);
    render(<Vault {...props()} />);
    await screen.findByTestId('vault-versions');
    fireEvent.change(screen.getByTestId('vault-upload-input'), {
      target: { files: [new File(['changed'], 'stability-summary-24m.pdf')] },
    });
    const offer = await screen.findByText('Upload as a new version of stability-summary-24m');
    fireEvent.click(offer);
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].get('supersedesDocumentId')).toBe(DOC_ID);
    expect(sent[1].get('documentCode')).toBeNull();
  });

  it('search includes earlier versions only when asked', async () => {
    mockApi();
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'stability' } });
    await waitFor(() => expect(calls.some((u) => u.includes('/search?q=stability'))).toBe(true));
    expect(calls.some((u) => u.includes('includeSuperseded'))).toBe(false);
    fireEvent.click(screen.getByLabelText('Include earlier versions'));
    await waitFor(() => expect(calls.some((u) => u.includes('includeSuperseded=true'))).toBe(true));
  });

  it('an earlier version found by search says so, and shows its versions and history', async () => {
    mockApi();
    const base = apiRequest.getMockImplementation()!;
    const hit = { id: V1, title: 'stability-summary-24m', fileName: 's.pdf', documentType: 'OTHER', size: '1.0 KB',
      folderId: 'module-3', ctdSection: '3.2.P.8', placementStatus: 'confirmed', snippet: null, version: '1.0', current: false };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      calls.push(url);
      if (url.startsWith(`/api/c2c/project-vault/${PID}/search`)) {
        return ok({ success: true, data: { query: 'x', total: 1, limit: 100, offset: 0, includeSuperseded: true, results: [hit] } });
      }
      if (url.endsWith(`/documents/${V1}/history`)) {
        return ok({ success: true, data: {
          entries: [{ id: 'A-1', event: 'Vault Document Ingest', actor: 'Ben Builder', at: '2026-09-29T09:00:00.000Z', when: '2026-09-29 09:00', hash: 'c'.repeat(64), prevHash: '', seq: 3, version: '1.0' }],
          chain: { store: 'audit_logs', ok: true, rowsChecked: 3, legacyRows: 0, sequencedRows: 3 },
        } });
      }
      if (url.endsWith(`/documents/${V1}/versions`)) return ok({ success: true, data: { versions } });
      return base(method, url);
    });
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'stability' } });
    fireEvent.click(screen.getByLabelText('Include earlier versions'));
    const row = await screen.findByText(/v1\.0, earlier version/);
    fireEvent.click(row.closest('button')!);
    expect(await screen.findByText(/An earlier version\. The tree lists the current one/)).toBeTruthy();
    expect(await screen.findByText(/v1\.0 · Vault Document Ingest/)).toBeTruthy();
    expect(calls).toContain(`/api/c2c/project-vault/${PID}/documents/${V1}/versions`);
  });

  it('the empty state claims only what the product does', async () => {
    mockApi(cabinetTree([]));
    apiRequest.mockImplementation(async (method: string, url: string) =>
      url === `/api/c2c/project-vault/${PID}` && method === 'GET'
        ? ok(vaultPayload({ tree: [], documentCount: 0 }))
        : ok({}));
    const { container } = render(<Vault {...props()} />);
    await waitFor(() => expect(container.textContent).toMatch(/Nothing has been filed/));
    expect(container.textContent).not.toMatch(/version-tracked/);
    expect(container.textContent).toMatch(/offered as a new version of that document/);
  });
});
