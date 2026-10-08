// @vitest-environment jsdom
/**
 * Artifacts Center shows a signature only for the version it covers.
 *
 * The gallery read computes, per artifact, the version the active signature
 * covers and whether that is still the current one (`sigVersion`, `sigStale`,
 * server/routes/artifacts-center-routes.ts). The client dropped both and drew
 * the "E-signed (21 CFR Part 11)" shield whenever any signature existed, so an
 * artifact edited after it was signed read as signed: a Part 11 status claim
 * the record does not support (docs/SURFACE_DECISIONS_2026-10-08.md, step 2).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { ArtifactsCenter } from '../surfaces/AdminSurfaces';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const art = (id: string, over: Record<string, unknown>) => ({
  id, name: `Artifact ${id}`, kind: 'clinical_overview', fmt: 'docx', size: '24 KB', model: null,
  when: 'today', ver: 'v3', sig: false, sigVersion: null, sigStale: null, reviewed: false, sourceCount: 0,
  prog: 'BX-204', ...over,
});

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url.startsWith('/api/artifacts-center')
      ? ok({
          success: true,
          data: [
            art('cur', { sig: true, sigVersion: 3, sigStale: false }),
            art('old', { sig: true, sigVersion: 2, sigStale: true }),
            art('unk', { sig: true, sigVersion: null, sigStale: null }),
            art('none', {}),
          ],
        })
      : ok({ data: [] }),
  );
});

const rowOf = (name: string) =>
  (screen.getByText(name).closest('.ct-row, [role="row"], tr, .art-row') ?? screen.getByText(name).parentElement!.parentElement!) as HTMLElement;

describe('Artifacts Center — signature status per version', () => {
  it('draws the e-signed shield once: only for the signature that covers the current version', async () => {
    render(<ArtifactsCenter surface={{ id: 'artifacts-center', label: 'Artifacts Center' } as never} onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Artifact cur')).toBeTruthy());
    expect(screen.getAllByLabelText('E-signed (21 CFR Part 11)')).toHaveLength(1);
    expect(rowOf('Artifact cur').querySelector('[aria-label="E-signed (21 CFR Part 11)"]')).toBeTruthy();
  });

  it('says in words that an earlier version is the one signed', async () => {
    render(<ArtifactsCenter surface={{ id: 'artifacts-center', label: 'Artifacts Center' } as never} onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Artifact old')).toBeTruthy());
    expect(screen.getByText(/Signed v2 only/)).toBeTruthy();
    expect(rowOf('Artifact old').querySelector('[aria-label="E-signed (21 CFR Part 11)"]')).toBeNull();
  });

  it('does not claim the current version is signed when the covered version is unknown', async () => {
    render(<ArtifactsCenter surface={{ id: 'artifacts-center', label: 'Artifacts Center' } as never} onAsk={vi.fn()} onNav={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Artifact unk')).toBeTruthy());
    expect(screen.getByText(/Signed · version unknown/)).toBeTruthy();
  });
});
