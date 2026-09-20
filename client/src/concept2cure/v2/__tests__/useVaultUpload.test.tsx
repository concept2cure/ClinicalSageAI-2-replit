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
      { name: 'stability-summary.pdf', folderLabel: 'Module 3 · Quality', needsReview: false },
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
