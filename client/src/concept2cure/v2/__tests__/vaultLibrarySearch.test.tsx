// @vitest-environment jsdom
/**
 * Library search: projects the viewer can access (plan critique 15, row D2).
 *
 * With "Accessible projects" on, the Vault's search reads the library, not the
 * project. Each hit is named with the project that holds it, and downloads
 * through that project. A library search that failed says its result could not
 * be verified, never "no matches". Server half: tests/db/vault-library-search.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { Vault } from '../surfaces/Vault';
import { libraryHeadline } from '../surfaces/VaultLibraryResults';
import { PID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const OTHER = '99999999-9999-4999-8999-999999999999';
const DOC = '44444444-4444-4444-8444-444444444444';
const LIB = '/api/c2c/project-vault/search?q=stability&limit=50';

const hit = (over: Record<string, unknown> = {}) => ({
  id: DOC, title: 'Stability report', documentType: 'OTHER', size: '2 KB', version: '2.0', current: true,
  snippet: 'the <b>stability</b> data at T12', program: { id: OTHER, name: 'BX-302' }, ...over,
});

let onLibrary: () => Response;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    if (url.startsWith('/api/c2c/project-vault/search?')) return onLibrary();
    if (url.includes('/download')) return { ok: false, status: 404, json: async () => ({ message: 'Gone' }) } as Response;
    return ok({ success: true, data: { query: 'x', total: 0, limit: 100, offset: 0, results: [] } });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

async function searchLibrary() {
  render(<Vault {...props()} />);
  fireEvent.click(await screen.findByLabelText('Accessible projects'));
  fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability' } });
}

describe('library search (critique 15)', () => {
  it('limits the headline to accessible projects, names each hit’s project, and downloads through that project', async () => {
    onLibrary = () => ok({
      success: true,
      data: { scope: 'verified-accessible-programs', query: 'stability', total: 2, limit: 50, offset: 0, results: [hit(), hit({ id: 'd-2', title: 'Stability summary', program: { id: PID, name: 'BX-301' }, snippet: null })] },
    });
    await searchLibrary();
    const list = await screen.findByTestId('vault-library-results');
    expect(apiRequest).toHaveBeenCalledWith('GET', LIB);
    expect(within(list).getByRole('status').textContent).toBe('2 documents in projects you can access match “stability”.');
    expect(list.textContent).toContain('BX-302');
    expect(list.textContent).toContain('BX-301 (this project)');
    expect(list.textContent).toContain('the stability data at T12');
    expect(list.textContent).not.toContain('<b>');
    // The project search did not run while the library was searched.
    expect(apiRequest.mock.calls.some(([, url]) => String(url).startsWith(`/api/c2c/project-vault/${PID}/search`))).toBe(false);
    fireEvent.click(within(list).getByRole('button', { name: 'Download Stability report from BX-302' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${OTHER}/documents/${DOC}/download`));
  });

  it('a failed library search leaves its result unverified', async () => {
    onLibrary = () => { throw new ApiRequestError('Failed', 500, { error: 'SEARCH_FAILED' }, 'SEARCH_FAILED'); };
    await searchLibrary();
    const list = await screen.findByTestId('vault-library-results');
    expect((await within(list).findByRole('alert')).textContent).toContain('The library search could not be verified. This is not a result of zero matches.');
  });

  it('a page short of the total says how many are shown', () => {
    expect(libraryHeadline({ scope: 'verified-accessible-programs', query: 'q', total: 120, limit: 50, results: new Array(50).fill(hit()) }))
      .toBe('120 documents in projects you can access match “q”. Showing the 50 best matches.');
  });

  it('an accessible empty search makes no claim about every project', async () => {
    onLibrary = () => ok({ success: true, data: { scope: 'verified-accessible-programs', query: 'stability', total: 0, limit: 50, results: [] } });
    await searchLibrary();
    const list = await screen.findByTestId('vault-library-results');
    expect((await within(list).findByRole('status')).textContent).toBe('0 documents in projects you can access match “stability”.');
    expect(list.textContent).not.toMatch(/all projects|every project|hidden|private/i);
  });

  it('a contradictory successful response is a failed read, never a zero-match claim', async () => {
    onLibrary = () => ok({ success: true, data: { scope: 'verified-accessible-programs', query: 'stability', total: 0, limit: 50, results: [hit()] } });
    await searchLibrary();
    const list = await screen.findByTestId('vault-library-results');
    expect((await within(list).findByRole('alert')).textContent).toContain('not a result of zero matches');
    expect(within(list).queryByRole('status')).toBeNull();
    expect(within(list).queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it.each([undefined, 'organization-wide'])('an unverified search scope %s cannot establish zero matches', async scope => {
    onLibrary = () => ok({ success: true, data: { scope, query: 'stability', total: 0, limit: 50, results: [] } });
    await searchLibrary();
    const list = await screen.findByTestId('vault-library-results');
    expect((await within(list).findByRole('alert')).textContent).toContain('not a result of zero matches');
    expect(within(list).queryByRole('status')).toBeNull();
  });
});
