// @vitest-environment jsdom
/**
 * Protocol development — which protocol is on screen is the author's choice.
 *
 * Audit 2026-10-17. GET /api/protocol-dev returns every in-development protocol
 * of the organisation, and the surface rendered `rows[0]` with nothing to pick
 * another: an organisation with two protocols could never open the second. The
 * surface now offers a picker over the rows the read already returned, keeps
 * the choice in component state, and carries it in `?protocol=` so a reload
 * or a shared link opens the same protocol.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;

const docOf = (id: string, shortTitle: string, title: string) => ({
  id, title, shortTitle, kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: '2026-09-20',
  completeness: 68, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Synopsis', status: 'draft', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
});
const NEWEST = docOf('52', 'Y-301', 'A Phase III Study of Y');
const OLDER = docOf('41', 'X-201', 'A Phase II Study of X');

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function mount() {
  render(
    <Providers>
      <ProtocolWorkspace surface={{ id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as never}
        onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" />
    </Providers>,
  );
  await screen.findByRole('button', { name: /^Ask AnA$/ });
}

let rows: unknown[];
beforeEach(() => {
  rows = [NEWEST, OLDER];
  window.history.replaceState(null, '', '/p/protocol-dev');
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method !== 'GET' || !url.startsWith('/api/protocol-dev')) return ok({});
    const documentId = new URL(url, 'http://localhost').searchParams.get('documentId');
    return ok({ success: true, data: documentId
      ? rows.filter((row) => String((row as { id: string }).id) === documentId) : rows });
  });
});
afterEach(() => cleanup());

const picker = () => screen.getByRole('combobox', { name: /^Protocol document$/ }) as HTMLSelectElement;

describe('protocol development — choosing the protocol', () => {
  it('lists every protocol the read returned and opens the one chosen', async () => {
    await mount();
    expect(Array.from(picker().options).map((o) => o.textContent)).toEqual([
      expect.stringContaining('Y-301'),
      expect.stringContaining('X-201'),
    ]);
    expect(screen.getAllByText(/A Phase III Study of Y/).length).toBeGreaterThan(0);
    fireEvent.change(picker(), { target: { value: '41' } });
    expect(await screen.findAllByText(/A Phase II Study of X/)).not.toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'A Phase III Study of Y' })).toBeNull();
    expect(new URLSearchParams(window.location.search).get('protocol')).toBe('41');
  });

  it('opens the protocol a ?protocol= link names', async () => {
    window.history.replaceState(null, '', '/p/protocol-dev?protocol=41');
    await mount();
    expect(picker().value).toBe('41');
    expect(screen.getAllByText(/A Phase II Study of X/).length).toBeGreaterThan(0);
  });

  it('keeps an inaccessible explicit protocol target refused instead of substituting another document', async () => {
    window.history.replaceState(null, '', '/p/protocol-dev?protocol=999');
    render(<Providers><ProtocolWorkspace surface={{ id: 'protocol-dev' } as never}
      onAsk={vi.fn()} onNav={vi.fn()} segment="biotech" /></Providers>);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent',
      expect.stringContaining('The selected protocol is unavailable in this scope'));
    expect(screen.queryByRole('heading', { name: 'A Phase III Study of Y' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'A Phase II Study of X' })).toBeNull();
  });

  it('keeps the selected document and scope visible when there is only one protocol', async () => {
    rows = [OLDER];
    await mount();
    expect(picker().value).toBe('41');
    expect(screen.getByRole('combobox', { name: 'Protocol scope' })).toBeTruthy();
  });
});
