// @vitest-environment jsdom
/**
 * useVaultUpload — the note reports where each file LANDED, from the server's
 * own stored filing outcome, never a guess. An auto-filed placement is called a
 * suggestion; an unplaceable file is reported as Unfiled, not silently counted
 * as success-with-no-detail.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

import { useVaultUpload, type VaultUploadState } from '../useVaultUpload';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';

function HookHost({ onState }: { onState: (s: VaultUploadState) => void }) {
  const state = useVaultUpload('11111111-1111-4111-8111-111111111111');
  onState(state);
  return null;
}

function ingestResponse(filing: unknown) {
  return {
    ok: true,
    status: 201,
    json: async () => ({ success: true, document: {}, filing }),
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearAuthToken();
});

describe('useVaultUpload — filing-aware outcome copy', () => {
  it('names the suggested folder for an auto-filed upload, as a suggestion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      ingestResponse({
        folderId: 'module-3', folderLabel: 'Module 3 · Quality',
        placementStatus: 'suggested', needsReview: false,
      }),
    ));
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    const outcome = await latest!.upload([new File(['x'], 'stability-summary.pdf')]);

    expect(outcome.succeeded).toEqual(['stability-summary.pdf']);
    expect(outcome.filings).toEqual([
      { name: 'stability-summary.pdf', folderLabel: 'Module 3 · Quality', needsReview: false, placement: 'suggested' },
    ]);
    await waitFor(() => expect(latest!.note).toBeTruthy());
    expect(latest!.note!.tone).toBe('ok');
    expect(latest!.note!.text).toContain('stability-summary.pdf → Module 3 · Quality');
    expect(latest!.note!.text).toMatch(/suggested until confirmed/i);
  });

  it('reports an unplaceable file as Unfiled needing review', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      ingestResponse({ folderId: null, folderLabel: '', placementStatus: 'unfiled', needsReview: true }),
    ));
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    await latest!.upload([new File(['x'], 'scan0001.pdf')]);

    await waitFor(() => expect(latest!.note).toBeTruthy());
    expect(latest!.note!.text).toMatch(/Unfiled/);
    expect(latest!.note!.text).toMatch(/could not place/i);
  });

  it('a file the Vault already holds is reported as unchanged, never as auto-filed (VR-05)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        document: { documentTitle: 'Protocol' },
        filing: { folderId: 'module-5', folderLabel: 'Module 5 · Clinical', placementStatus: 'suggested', needsReview: false },
        reupload: {
          unchanged: true,
          changes: [],
          differs: [{ field: 'document_type', recorded: 'OTHER', requested: 'PROTOCOL' }],
        },
      }),
    }) as Response));
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    const outcome = await latest!.upload([new File(['x'], 'protocol.pdf')], { documentType: 'PROTOCOL' });

    expect(outcome.filings).toEqual([]);
    expect(outcome.alreadyRecorded).toEqual([{ name: 'protocol.pdf', title: 'Protocol', differs: true }]);
    await waitFor(() => expect(latest!.note).toBeTruthy());
    expect(latest!.note!.text).toMatch(/Already in the Vault, nothing changed: protocol\.pdf \(as "Protocol"\)/);
    expect(latest!.note!.text).toMatch(/Edit details/);
    expect(latest!.note!.text).not.toMatch(/Auto-filed|suggested until confirmed/i);
  });

  it('a refusal is still a refusal — filing copy never masks a failed file', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ingestResponse({
        folderId: 'corresp', folderLabel: 'Agency correspondence',
        placementStatus: 'suggested', needsReview: false,
      }))
      .mockResolvedValueOnce({
        ok: false, status: 415,
        json: async () => ({ error: { message: 'File type .exe is not allowed' } }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    const outcome = await latest!.upload([
      new File(['x'], 'fda-letter.pdf'),
      new File(['x'], 'tool.exe'),
    ]);

    expect(outcome.succeeded).toEqual(['fda-letter.pdf']);
    expect(outcome.failed[0].name).toBe('tool.exe');
    await waitFor(() => expect(latest!.note).toBeTruthy());
    expect(latest!.note!.tone).toBe('error');
    expect(latest!.note!.text).toMatch(/Not filed: tool\.exe/);
  });
});

describe('useVaultUpload — the document each file was recorded as', () => {
  it('lists the ids the server returned, in the order sent, and invents none', async () => {
    const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(answer(201, { success: true, document: { id: 'doc-new' }, filing: {} }))
      .mockResolvedValueOnce(answer(415, { error: { message: 'File type .exe is not allowed' } }))
      .mockResolvedValueOnce(ingestResponse({}))
      .mockResolvedValueOnce(answer(200, { success: true, document: { id: 'doc-held', documentTitle: 'Protocol' }, reupload: { differs: [] } })));
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    const outcome = await latest!.upload(['a.pdf', 'tool.exe', 'no-id.pdf', 'protocol.pdf'].map((n) => new File(['x'], n)));

    // The refused file and the response that names no document add nothing.
    expect(outcome.succeeded).toEqual(['a.pdf', 'no-id.pdf', 'protocol.pdf']);
    expect(outcome.recorded).toEqual(['doc-new', 'doc-held']);
  });
});

describe('useVaultUpload — the request actually authenticates', () => {
  /**
   * `/api/vault/ingest` is mounted behind `authMiddleware`
   * (server/bootstrap/register-inline-routes.ts), whose own header says it
   * "Validates Bearer JWT tokens only" and which answers a request with no
   * Authorization header `401 { error: 'Bearer token required' }`. There is no
   * cookie fallback: it reads `req.headers.authorization` and nothing else.
   *
   * So `credentials: 'include'` alone cannot authenticate this request, and
   * every upload through this hook — the v2 Vault, the MDX Document vault and
   * the MDX pathway attach, its three production callers — was refused.
   */
  it('sends the Authorization bearer header the ingest route requires', async () => {
    setAuthToken('a-real-access-token');
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ingestResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    await latest!.upload([new File(['x'], 'protocol.pdf')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer a-real-access-token');
  });

  it('still sends the multipart body and credentials', async () => {
    setAuthToken('a-real-access-token');
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ingestResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);

    await latest!.upload([new File(['x'], 'protocol.pdf')]);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeInstanceOf(FormData);
    // Never a hand-set Content-Type: the browser must add the multipart
    // boundary, and setting it here produces a body the server cannot parse.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });
});

describe('useVaultUpload — each file carries the fields its row gave (gap 7.1)', () => {
  function capture() {
    const sent: FormData[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body?: unknown }) => {
      sent.push(init.body as FormData);
      return ingestResponse({ folderId: 'eng', folderLabel: 'Engineering (DHF + RMF)', placementStatus: 'confirmed', needsReview: false });
    }));
    return sent;
  }

  it('sends each file its own title, type, classification and filing, and never a version', async () => {
    const sent = capture();
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);
    await latest!.upload([new File(['a'], 'risk-file.pdf'), new File(['b'], 'notes.txt')], {
      documentType: 'OTHER',
      fields: [
        { title: 'Risk management file', documentType: 'REPORT', classification: 'CONFIDENTIAL',
          folderId: 'eng', evidenceKind: 'report', ctdSection: '3.2.P.8' },
        { title: '  ', evidenceKind: 'report', ctdSection: '3.2.P.8' },
      ],
    });
    expect(sent).toHaveLength(2);
    const first = Object.fromEntries([...sent[0].entries()].filter(([k]) => k !== 'file'));
    expect(first).toMatchObject({
      documentCode: 'risk-file.pdf', documentTitle: 'Risk management file', documentType: 'REPORT',
      classification: 'CONFIDENTIAL', folderId: 'eng', evidenceKind: 'report', ctdSection: '3.2.P.8',
    });
    // No version is ever sent: a new document is 1.0, and later ones are numbered by the Vault.
    expect(sent[0].get('version')).toBeNull();
    // A blank title takes the file name; a blank version is not sent; without a folder
    // the kind and section are not sent, because the Vault writes them only with one.
    const second = Object.fromEntries([...sent[1].entries()].filter(([k]) => k !== 'file'));
    expect(second).toEqual({ programId: '11111111-1111-4111-8111-111111111111', documentCode: 'notes.txt', documentTitle: 'notes', documentType: 'OTHER' });
  });

  it("says a folder the person chose is their filing, not a suggestion awaiting confirmation", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ingestResponse({
      folderId: 'eng', folderLabel: 'Engineering (DHF + RMF)', placementStatus: 'confirmed', needsReview: false,
    })));
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);
    const seen: unknown[] = [];
    await latest!.upload([new File(['a'], 'risk-file.pdf')], {
      fields: [{ folderId: 'eng' }], onFileStatus: (_i, st) => seen.push(st),
    });
    expect(seen.at(-1)).toMatchObject({ state: 'stored', placement: 'confirmed', folderLabel: 'Engineering (DHF + RMF)' });
    await waitFor(() => expect(latest!.note).toBeTruthy());
    expect(latest!.note!.text).toContain('Filed risk-file.pdf → Engineering (DHF + RMF), as you chose.');
    expect(latest!.note!.text).not.toMatch(/suggested until confirmed/);
  });

  it('tells the caller where each file stands as it starts and settles', async () => {
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n === 1
      ? { ok: true, status: 201, json: async () => ({ success: true, document: { version: '1.0' }, filing: { folderId: 'eng', folderLabel: 'Engineering', needsReview: false } }) }
      : { ok: false, status: 422, json: async () => ({ error: { message: 'The file failed the malware scan' } }) }) as Response));
    let latest: VaultUploadState | null = null;
    render(<HookHost onState={(s) => { latest = s; }} />);
    const seen: Array<[number, string, string?]> = [];
    await latest!.upload([new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')], {
      onFileStatus: (i, st) => seen.push([i, st.state, st.state === 'refused' ? st.reason : st.state === 'stored' ? `v${st.version} ${st.folderLabel}` : undefined]),
    });
    expect(seen).toEqual([
      [0, 'uploading', undefined], [0, 'stored', 'v1.0 Engineering'],
      [1, 'uploading', undefined], [1, 'refused', 'The file failed the malware scan'],
    ]);
  });
});
