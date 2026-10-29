// @vitest-environment jsdom
/**
 * The Vault find view's metadata filters (VR-18, Veeva gap 7 slice B, row D2).
 *
 * The filters go to the same server search as the text: type, filing status,
 * classification, evidence kind, review stage and CTD section. Filters alone
 * browse what they select. A failed filtered read is a failure, never "no
 * documents match". A CTD section that is not a code is said to be not applied,
 * and is not sent. Leaving the find view clears the filters with the text.
 * Server half: server/routes/__tests__/vault-search.test.ts and
 * server/services/vault/__tests__/vault-search-filters.pglite.integration.test.ts.
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
import { vaultFilterParams } from '../surfaces/VaultLibraryResults';
import { PID, ok, vaultPayload, props } from './_vault-surface-fixtures';

const DOC = '44444444-4444-4444-8444-444444444444';
const projectSearch = `/api/c2c/project-vault/${PID}/search?`;
const hit = (over: Record<string, unknown> = {}) => ({
  id: DOC, title: 'Batch analysis report', fileName: 'batch.pdf', documentType: 'MODULE_3', size: '2 KB',
  folderId: 'module-3', ctdSection: '3.2.P.5.4', placementStatus: 'confirmed', version: '1.0', current: true,
  snippet: null, evidenceKind: 'cmc', classification: 'CONTROLLED', lifecycleStage: 'approved', updatedAt: '2026-10-02T00:00:00.000Z',
  ...over,
});

let onSearch: (url: string) => Response;
const searchUrls = () => apiRequest.mock.calls.map(([, url]) => String(url)).filter((u) => u.includes('/search?'));
const params = (url: string) => new URL(url, 'https://example.test').searchParams;

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  onSearch = () => ok({ success: true, data: { query: '', mode: 'browse', total: 1, limit: 100, offset: 0, results: [hit()] } });
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}` && method === 'GET') return ok(vaultPayload());
    if (url.includes('/search?')) return onSearch(url);
    // The Vault's seals (VR-19), answered as a Vault never sealed, so a failed
    // filtered read stays the one alert these tests look for.
    if (url.endsWith('/seals')) return ok({ success: true, data: { seals: [] } });
    return ok({ success: true, data: {} });
  });
});
afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });

async function open() {
  render(<Vault {...props()} />);
  return screen.findByRole('group', { name: 'Filter documents' });
}
const choose = (row: HTMLElement, label: string, option: string) => {
  const select = within(row).getByLabelText(label) as HTMLSelectElement;
  const value = [...select.options].find((o) => o.textContent === option)?.value;
  expect(value, `${label} offers ${option}`).toBeDefined();
  fireEvent.change(select, { target: { value } });
};

describe('the find view filters by metadata on the server', () => {
  it('a type alone browses: sent with an empty query, shown as filtered, with the server total', async () => {
    onSearch = () => ok({ success: true, data: { query: '', mode: 'browse', total: 140, limit: 100, offset: 0, results: [hit()] } });
    const row = await open();
    choose(row, 'Type', 'Module 3 · quality');
    await screen.findByText('Batch analysis report');
    const url = searchUrls().at(-1)!;
    expect(url.startsWith(projectSearch)).toBe(true);
    expect(params(url).get('q')).toBe('');
    expect(params(url).getAll('documentType')).toEqual(['MODULE_3']);
    expect(screen.getByText(/Filtered — 1 of 140/)).toBeTruthy();
  });

  it('each control sends its own parameter, and "Approved" covers every approved stage', async () => {
    const row = await open();
    choose(row, 'Filing', 'Unfiled');
    choose(row, 'Classification', 'Controlled');
    choose(row, 'Evidence kind', 'CMC document');
    choose(row, 'Review', 'Approved');
    await waitFor(() => expect(params(searchUrls().at(-1)!).getAll('lifecycleStage')).toEqual(['approved', 'placed', 'packaged', 'submitted']));
    const p = params(searchUrls().at(-1)!);
    expect(p.getAll('placementStatus')).toEqual(['unfiled']);
    expect(p.getAll('classification')).toEqual(['CONTROLLED']);
    expect(p.getAll('evidenceKind')).toEqual(['cmc']);
  });

  it('a CTD section is normalised and sent once it is a code; text that is not one is said, and not sent', async () => {
    const row = await open();
    const box = within(row).getByLabelText('CTD section');
    fireEvent.change(box, { target: { value: 'banana' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect((await within(row).findByRole('status')).textContent).toContain('is not a CTD section code');
    expect(searchUrls().some((u) => params(u).has('ctdSection'))).toBe(false);
    fireEvent.change(box, { target: { value: 'm3.2.p.5' } });
    fireEvent.blur(box);
    await waitFor(() => expect(params(searchUrls().at(-1)!).getAll('ctdSection')).toEqual(['3.2.P.5']));
    expect(within(row).queryByRole('status')).toBeNull();
  });

  it('a failed filtered read is a failure, never "no documents match these filters"', async () => {
    onSearch = () => { throw new ApiRequestError('Failed', 500, { error: 'SEARCH_FAILED' }, 'SEARCH_FAILED'); };
    const row = await open();
    choose(row, 'Type', 'Clinical study report');
    expect((await screen.findByRole('alert')).textContent).toContain('this is not a result of zero matches');
    expect(screen.queryByText(/No documents match these filters/)).toBeNull();
  });

  it('a verified empty filtered read says the filters matched nothing', async () => {
    onSearch = () => ok({ success: true, data: { query: '', mode: 'browse', total: 0, limit: 100, offset: 0, results: [] } });
    const row = await open();
    choose(row, 'Type', 'Clinical study report');
    expect(await screen.findByText('No documents match these filters.')).toBeTruthy();
  });

  it('the text and the filters narrow together', async () => {
    const row = await open();
    choose(row, 'Type', 'Clinical study report');
    fireEvent.change(screen.getByLabelText('Search this vault'), { target: { value: 'stability' } });
    await waitFor(() => expect(params(searchUrls().at(-1)!).get('q')).toBe('stability'));
    expect(params(searchUrls().at(-1)!).getAll('documentType')).toEqual(['CSR']);
    expect(screen.getByText(/Search "stability", filtered/)).toBeTruthy();
  });

  it('Clear filters returns to the folder, and asks nothing more of the search', async () => {
    const row = await open();
    choose(row, 'Type', 'Clinical study report');
    await screen.findByText('Batch analysis report');
    const asked = searchUrls().length;
    fireEvent.click(within(row).getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(screen.queryByText('Batch analysis report')).toBeNull());
    expect(searchUrls().length).toBe(asked);
    expect(within(await screen.findByRole('group', { name: 'Filter documents' })).queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('the library search takes the same filters, and its headline says what it matched', async () => {
    const libraryHit = { ...hit(), version: '1.0', current: true, snippet: null, program: { id: PID, name: 'BX-301' } };
    onSearch = (url) => ok({ success: true, data: { scope: 'verified-accessible-programs', query: params(url).get('q') ?? '', mode: 'browse', total: 1, limit: 50, offset: 0, results: [libraryHit] } });
    const row = await open();
    fireEvent.click(screen.getByLabelText('Accessible projects'));
    choose(row, 'Type', 'Clinical study report');
    const list = await screen.findByTestId('vault-library-results');
    expect((await within(list).findByRole('status')).textContent).toBe('1 document in projects you can access match the filters.');
    const url = searchUrls().at(-1)!;
    expect(url.startsWith('/api/c2c/project-vault/search?')).toBe(true);
    expect(params(url).getAll('documentType')).toEqual(['CSR']);
  });
});

describe('facet counts in the options', () => {
  const optionText = (row: HTMLElement, label: string) =>
    [...(within(row).getByLabelText(label) as HTMLSelectElement).options].map((o) => o.textContent);

  it('asks for counts, and shows each value\'s count from the verified read; a stage choice sums its stages', async () => {
    onSearch = () => ok({ success: true, data: {
      query: '', mode: 'browse', total: 1, limit: 100, offset: 0, results: [hit()],
      facets: {
        documentType: [{ value: 'MODULE_3', count: 4 }, { value: 'CSR', count: 2 }, { value: 'report', count: 1 }],
        lifecycleStage: [{ value: 'approved', count: 3 }, { value: 'submitted', count: 2 }, { value: 'none', count: 5 }, { value: 'authoring', count: 1 }],
      },
    } });
    const row = await open();
    choose(row, 'Type', 'Module 3 · quality');
    await waitFor(() => expect(optionText(row, 'Type')).toContain('Module 3 · quality (4)'));
    expect(params(searchUrls().at(-1)!).get('facets')).toBe('true');
    expect(optionText(row, 'Type')).toContain('Clinical study report (2)');
    // A value the read did not count selects nothing under the other filters.
    expect(optionText(row, 'Type')).toContain('Protocol (0)');
    expect(optionText(row, 'Review')).toContain('Approved (5)');
    expect(optionText(row, 'Review')).toContain('Not sent for review (6)');
    // A dimension the read did not count shows no number at all, not zero.
    expect(optionText(row, 'Classification')).toContain('Controlled');
  });

  it('a failed read shows no counts', async () => {
    onSearch = () => { throw new ApiRequestError('Failed', 500, { error: 'SEARCH_FAILED' }, 'SEARCH_FAILED'); };
    const row = await open();
    choose(row, 'Type', 'Clinical study report');
    await screen.findByRole('alert');
    expect(optionText(row, 'Type').some((t) => /\(\d+\)$/.test(t ?? ''))).toBe(false);
  });

  it('malformed counts are not shown as counts', async () => {
    onSearch = () => ok({ success: true, data: { query: '', mode: 'browse', total: 1, limit: 100, offset: 0, results: [hit()],
      facets: { documentType: [{ value: 'CSR', count: -1 }] } } });
    const row = await open();
    choose(row, 'Type', 'Clinical study report');
    await screen.findByText('Batch analysis report');
    expect(optionText(row, 'Type').some((t) => /\(\d+\)$/.test(t ?? ''))).toBe(false);
  });
});

describe('vaultFilterParams', () => {
  it('is empty with no filter, and encodes repeated values in a stable order', () => {
    expect(vaultFilterParams({})).toBe('');
    expect(vaultFilterParams({ lifecycleStage: ['none', 'authoring'], documentType: ['CSR'], ctdSection: ['3.2.P'] }))
      .toBe('&ctdSection=3.2.P&documentType=CSR&lifecycleStage=none&lifecycleStage=authoring');
  });
});
