// @vitest-environment jsdom
/**
 * Protocol workspace — the Statistics tab.
 *
 * A protocol's statistics live on its study design, not in the protocol
 * document store (which has no statistical column at all). The tab reads the
 * program's persisted designs through the biostatistics bridge, shows each
 * one's statistical readiness with the checks that still fail, and hands the
 * design to the Biostatistics designer on the navigation channel so it opens
 * pre-loaded rather than retyped.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';
import { consumeNavParams, clearNavParams } from '../navParams';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'x' }) }) as Response;

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const PROGRAM = { id: '0f3c1a2b-1111-4222-8333-444455556666', title: 'BX-204', product: 'BX-204' };

const DOC = {
  id: '41', title: 'A Phase III Study of BX-204', shortTitle: 'BX-204-301', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: 'today',
  completeness: 68, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Background', status: 'draft', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], rows: [] }, risks: [], milestones: [],
  budget: { total: 0, categories: [], spent: 0 }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [],
};

const DESIGNS = [
  {
    studyId: 'STUDY-1', programId: PROGRAM.id, title: 'BX-204 pivotal in T2D', phase: '3', indication: 'type 2 diabetes', status: 'draft', updatedAt: null,
    readiness: {
      percent: 62,
      checks: [
        { key: 'alpha', label: 'Alpha stated', ok: true },
        { key: 'estimand', label: 'Primary estimand defined (ICH E9(R1))', ok: false, hint: 'Define the estimand for the primary endpoint.' },
      ],
      plannedSampleSize: 400, power: 0.9, alpha: 0.05, primaryEndpoint: 'HbA1c change',
    },
  },
];

function route(designs: 'ok' | 'empty' | 'error' = 'ok') {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [DOC] });
    if (method === 'GET' && url.startsWith('/api/biostat-bridge/designs')) {
      if (designs === 'error') return fail(503);
      return ok({ data: designs === 'ok' ? DESIGNS : [] });
    }
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openStatistics(p = props()) {
  render(<Providers><ProtocolWorkspace {...p} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /Statistics/ }));
  return p;
}

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
  (window as any).C2C_PROJECT = PROGRAM;
});
afterEach(() => { cleanup(); clearNavParams(); delete (window as any).C2C_PROJECT; });

describe('protocol-dev — Statistics tab', () => {
  it('shows each design\'s statistical readiness and the checks that still fail', async () => {
    route('ok');
    await openStatistics();
    expect(await screen.findByText('BX-204 pivotal in T2D')).toBeTruthy();
    expect(screen.getByText('62% ready')).toBeTruthy();
    expect(screen.getByText('400')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText(/Primary estimand defined/)).toBeTruthy();
    expect(screen.getByText(/Define the estimand for the primary endpoint/)).toBeTruthy();
    // Passing checks are not listed as work.
    expect(screen.queryByText(/Alpha stated/)).toBeNull();
    // The read is scoped to the open program.
    const call = apiRequest.mock.calls.find((c) => String(c[1]).startsWith('/api/biostat-bridge/designs'));
    expect(call![1]).toContain(encodeURIComponent(PROGRAM.id));
  });

  it('hands the design to the Biostatistics designer on the navigation channel', async () => {
    route('ok');
    const p = await openStatistics();
    fireEvent.click(await screen.findByRole('button', { name: /Open in Biostatistics/ }));
    expect(p.onNav).toHaveBeenCalledWith('biostatistics');
    // The param is on the channel for the destination — keyed to its surface id.
    expect(consumeNavParams('biostatistics')).toEqual({ studyId: 'STUDY-1' });
  });

  it('renders an honest empty state when the program has no persisted design', async () => {
    route('empty');
    await openStatistics();
    expect(await screen.findByText(/No persisted study design for this scope/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open in Biostatistics/ })).toBeNull();
  });

  it('renders a failed read as a failure, not as an empty list', async () => {
    route('error');
    await openStatistics();
    expect(await screen.findByText(/Couldn't load study designs/)).toBeTruthy();
    expect(screen.queryByText(/No persisted study design/)).toBeNull();
  });
});
