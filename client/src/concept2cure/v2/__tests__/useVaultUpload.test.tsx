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
