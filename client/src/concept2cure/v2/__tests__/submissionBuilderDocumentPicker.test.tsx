// @vitest-environment jsdom
/**
 * The Builder's co-author document picker never truncates silently.
 *
 * QA 2026-10-08 (j6): GET /api/coauthor/documents answered total 53 and
 * returned 50 (its default page), and "Place a Co-Author document as a leaf"
 * listed the 50 with no word that 3 were hidden and no way to reach them —
 * "Pharmacokinetics · m4.2.2" could not be placed. The picker now says how many
 * of how many it shows, pages with the list's `offset`, and searches with its
 * `q` (title or module number), so every placeable document can be found.
 *
 * Same idiom as submissionCenterLifecycleQa: apiRequest mocked at the module
 * boundary, the Submission Center real.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { SubmissionCenter } from '../surfaces/SubmissionCenter';

const SUBS = [{ id: 7, title: 'ZX-9 First-in-Human', productName: 'Zexanib', applicationType: 'ind', clientType: 'biotech', primaryRegion: 'fda', status: 'active', lifecycleStage: 'original', programId: '0a000000-0000-4000-8000-00000000000a' }];
const SEQ = { id: 21, sequenceNumber: '0000', type: 'original', status: 'assembling', region: 'fda', validationStatus: null };
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, headers: new Headers() }) as unknown as Response;

/** 53 documents, most recent first; the last three are the ones a 50-row page hid. */
const ALL = Array.from({ length: 53 }, (_, i) => ({
  id: i + 1,
  title: i === 50 ? 'Pharmacokinetics' : `Document ${i + 1}`,
  moduleNumber: i === 50 ? '4.2.2' : '2.5',
  status: 'approved',
}));

function page(url: string): Response {
  const u = new URL(url, 'http://x');
  const q = (u.searchParams.get('q') ?? '').toLowerCase();
  const offset = Number(u.searchParams.get('offset') ?? 0);
  const limit = Number(u.searchParams.get('limit') ?? 50);
  const hits = q ? ALL.filter((d) => d.title.toLowerCase().includes(q) || d.moduleNumber.includes(q)) : ALL;
  const documents = hits.slice(offset, offset + limit);
  return ok({ documents, total: hits.length, returned: documents.length, offset });
}

function mockApi(docs: (url: string) => Response = page) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/7/sequences') return ok([SEQ]);
    if (method === 'GET' && url === '/api/submissions/sequences/21/leaves') return ok([]);
    if (method === 'GET' && url.startsWith('/api/coauthor/documents')) return docs(url);
    if (method === 'GET' && url === '/api/510k/estar/submissions') return ok({ submissions: [] });
    if (method === 'POST' && url === '/api/510k/estar/assemble') return ok({ artifactKind: 'none', blockers: [] });
    return ok([]);
  });
}
const docReads = () => apiRequest.mock.calls.filter((c) => c[0] === 'GET' && String(c[1]).startsWith('/api/coauthor/documents')).map((c) => c[1]);

async function openPicker() {
  render(<SubmissionCenter onAsk={vi.fn()} onNav={vi.fn()} />);
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
  fireEvent.click(screen.getByRole('tab', { name: 'Builder' }));
  fireEvent.click(await screen.findByRole('button', { name: /Place a Co-Author document as a leaf/ }));
  return (await screen.findByLabelText('Source document')) as HTMLSelectElement;
}
const optionTitles = (select: HTMLSelectElement) => within(select).getAllByRole('option').map((o) => o.textContent ?? '');

afterEach(() => {
  cleanup();
  apiRequest.mockReset();
});

describe('the co-author document picker', () => {
  it('says it shows 50 of 53, and offers the rest', async () => {
    mockApi();
    const select = await openPicker();
    expect(optionTitles(select)).toHaveLength(51); // the prompt + 50
    expect(optionTitles(select).some((t) => t.startsWith('Pharmacokinetics'))).toBe(false);
    expect(document.body.textContent).toContain('50 of 53 documents shown');

    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    await waitFor(() => expect(optionTitles(select).some((t) => t.startsWith('Pharmacokinetics · 4.2.2'))).toBe(true));
    expect(docReads()).toContain('/api/coauthor/documents?offset=50');
    expect(optionTitles(select)).toHaveLength(54);
    expect(document.body.textContent).toContain('All 53 documents shown');
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
  });

  it('searches the list by title or module number, on the server', async () => {
    mockApi();
    const select = await openPicker();
    fireEvent.change(screen.getByLabelText('Find a document'), { target: { value: 'pharmaco' } });
    await waitFor(() => expect(optionTitles(select)).toEqual(['Choose a document…', 'Pharmacokinetics · 4.2.2 · approved']));
    expect(docReads()).toContain('/api/coauthor/documents?q=pharmaco');
    expect(document.body.textContent).toContain('1 document matches “pharmaco”');
  });

  it('a search that matches nothing says so and keeps the search box', async () => {
    mockApi();
    await openPicker();
    fireEvent.change(screen.getByLabelText('Find a document'), { target: { value: 'zzz' } });
    await waitFor(() => expect(document.body.textContent).toContain('No Co-Author document matches “zzz”'));
    expect(screen.getByLabelText('Find a document')).toBeTruthy();
  });

  it('a list that fits on one page says all are shown and offers no more', async () => {
    mockApi(() => ok({ documents: ALL.slice(0, 3), total: 3, returned: 3, offset: 0 }));
    await openPicker();
    expect(document.body.textContent).toContain('All 3 documents shown');
    expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
  });

  it('a failed next page says so and keeps what was shown', async () => {
    mockApi((url) => (url.includes('offset=50') ? ok({ error: 'down' }, 500) : page(url)));
    const select = await openPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    await waitFor(() => expect(document.body.textContent).toContain('The next documents could not be read'));
    expect(optionTitles(select)).toHaveLength(51);
    expect(document.body.textContent).toContain('50 of 53 documents shown');
  });
});
