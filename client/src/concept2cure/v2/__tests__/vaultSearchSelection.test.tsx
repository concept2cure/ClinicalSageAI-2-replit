// @vitest-environment jsdom
/**
 * Vault search — selecting a hit opens THAT document.
 *
 * Hits were keyed by the raw document uuid while tree leaves are keyed
 * `up-<uuid>`, and the selection was resolved against the tree only, falling
 * back to the first hit. So clicking any hit after the first highlighted its row
 * and showed the FIRST hit in the detail pane — and told AnA the same wrong
 * document. A hit for a document that is in the filing cabinet also lost its
 * filing actions (Confirm, Move, Place into submission), because the hit carries
 * no filing block. Found by the 2026-09-24 Vault/Veeva mapping.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { useActiveSurfaceContext, type SurfaceContext } from '../surfaceContext';
import { PID, DOC_ID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const OTHER = '33333333-3333-4333-8333-333333333333';

const hit = (id: string, title: string) => ({
  id, title, fileName: `${title}.pdf`, documentType: 'REPORT', size: '1.0 MB',
  folderId: 'module-3', ctdSection: '3.2.P.8', placementStatus: 'suggested', snippet: null,
});

function Probe({ onCtx }: { onCtx: (c: SurfaceContext | null) => void }) {
  onCtx(useActiveSurfaceContext('vault'));
  return null;
}

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url.startsWith(`/api/c2c/project-vault/${PID}/search`)) {
      // The other document ranks first; the one in the cabinet second.
      return ok({ success: true, data: { query: 'stab', total: 2, limit: 100, offset: 0,
        results: [hit(OTHER, 'Other report'), hit(DOC_ID, 'stability-summary-24m')] } });
    }
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    return ok({});
  });
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

const selectedTitle = (c: SurfaceContext | null) =>
  (c?.facts as { selected?: { title?: string } } | undefined)?.selected?.title;

describe('Vault search — selection', () => {
  it('clicking the second hit shows the second hit, not the first', async () => {
    const seen: { ctx: SurfaceContext | null } = { ctx: null };
    render(<><Vault {...props()} /><Probe onCtx={(c) => { seen.ctx = c; }} /></>);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'stab' } });
    await waitFor(() => expect(document.querySelectorAll('.vd-rows .vd-row').length).toBe(2));
    await waitFor(() => expect(selectedTitle(seen.ctx)).toBe('Other report'));

    const rows = Array.from(document.querySelectorAll('.vd-rows .vd-row')) as HTMLElement[];
    fireEvent.click(rows[1]);
    await waitFor(() => expect(selectedTitle(seen.ctx)).toBe('stability-summary-24m'));
    expect(rows[1].getAttribute('data-on')).toBe('true');
  });

  it('a hit for a filed document keeps its filing actions', async () => {
    render(<Vault {...props()} />);
    fireEvent.change(await screen.findByLabelText('Search this vault'), { target: { value: 'stab' } });
    await waitFor(() => expect(document.querySelectorAll('.vd-rows .vd-row').length).toBe(2));
    fireEvent.click((Array.from(document.querySelectorAll('.vd-rows .vd-row')) as HTMLElement[])[1]);
    expect(await screen.findByTestId('vault-filing-block')).toBeTruthy();
  });
});
