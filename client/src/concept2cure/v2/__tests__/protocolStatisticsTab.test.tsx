// @vitest-environment jsdom
/**
 * Protocol workspace — the Statistics tab.
 *
 * A protocol's statistics live on its study design, not in the protocol
 * document store (which has no statistical column at all). The tab resolves
 * the design BOUND to this protocol by id through the biostatistics bridge,
 * shows its statistical readiness with the checks that still fail, and hands
 * the design to the Biostatistics designer on the navigation channel so it
 * opens pre-loaded rather than retyped.
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
  reviews: [], reviewComments: [], consent: [], completenessFindings: [],
};

/* The protocol names ITS design; the tab resolves that one by id. It used to
   list every design in the program (fixed in 62dd9281a / 2afe0d82a — this test
   was left asserting the old list and failed from then until 2026-09-22). */
const BOUND_DOC = {
  ...DOC,
  // The server's PdevStudyDesignView shape (pdev-view-assembler), as the workspace receives it.
  studyDesign: {
    studyId: 'STUDY-1', resolved: true, title: 'BX-204 pivotal in T2D', phase: '3', indication: 'type 2 diabetes',
    status: 'draft', linkedAt: '', riskLevel: 'medium', canAdvance: false, blocksApproval: false,
    counts: { critical: 0, major: 1, minor: 0, info: 0 }, summary: '', standardsChecked: [], findings: [],
  },
};

const ASSESSMENT = {
  studyId: 'STUDY-1', title: 'BX-204 pivotal in T2D',
  readiness: {
    percent: 62,
    checks: [
      { key: 'alpha', label: 'Alpha stated', ok: true },
      { key: 'estimand', label: 'Primary estimand defined (ICH E9(R1))', ok: false, hint: 'Define the estimand for the primary endpoint.' },
    ],
    plannedSampleSize: 400, power: 0.9, alpha: 0.05, primaryEndpoint: 'HbA1c change',
  },
  // The stored run behind the planned N (bridge-service sizingRunFor).
  sizingRun: { state: 'found', runId: 12, recordedAt: '2026-11-06T09:30:00.000Z', plannedSampleSize: 400 },
};

function route(opts: { bound?: boolean; assessment?: 'ok' | 'error' } = {}) {
  const doc = opts.bound === false ? DOC : BOUND_DOC;
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [doc] });
    if (method === 'GET' && url === '/api/biostat-bridge/designs/STUDY-1/assessment') {
      return opts.assessment === 'error' ? fail(503) : ok({ data: ASSESSMENT });
    }
    // Any other design read — the program list included — is a request the tab must not make.
    if (method === 'GET' && url.startsWith('/api/biostat-bridge/designs')) return ok({ data: [{ studyId: 'OTHER', title: 'Another program design' }] });
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openStatistics(p = props()) {
  render(<Providers><ProtocolWorkspace {...p} /></Providers>);
  // 2026-09-28 · GA-2: the protocol strip's entries are tabs (role="tab"), not plain buttons.
  fireEvent.click(await screen.findByRole('tab', { name: /Statistics/ }));
  return p;
}

beforeEach(() => {
  apiRequest.mockReset();
  clearNavParams();
  (window as any).C2C_PROJECT = PROGRAM;
});
afterEach(() => { cleanup(); clearNavParams(); delete (window as any).C2C_PROJECT; });

describe('protocol-dev — Statistics tab', () => {
  it("shows the bound design's statistical readiness and the checks that still fail", async () => {
    route();
    await openStatistics();
    expect(await screen.findByText('BX-204 pivotal in T2D')).toBeTruthy();
    expect(screen.getByText('62% ready')).toBeTruthy();
    expect(screen.getByText('400')).toBeTruthy();
    expect(screen.getByText('90%')).toBeTruthy();
    expect(screen.getByText(/Primary estimand defined/)).toBeTruthy();
    expect(screen.getByText(/Define the estimand for the primary endpoint/)).toBeTruthy();
    // Passing checks are not listed as work.
    expect(screen.queryByText(/Alpha stated/)).toBeNull();
  });

  it('resolves the bound design by id and never shows another design in the program', async () => {
    route();
    await openStatistics();
    await screen.findByText('BX-204 pivotal in T2D');
    const reads = apiRequest.mock.calls.map((c) => String(c[1])).filter((u) => u.startsWith('/api/biostat-bridge/designs'));
    expect(reads).toEqual(['/api/biostat-bridge/designs/STUDY-1/assessment']);
    expect(screen.queryByText('Another program design')).toBeNull();
  });

  it('hands the design to the Biostatistics designer on the navigation channel', async () => {
    route();
    const p = await openStatistics();
    fireEvent.click(await screen.findByRole('button', { name: /Open in Biostatistics/ }));
    expect(p.onNav).toHaveBeenCalledWith('biostatistics');
    expect(consumeNavParams('biostatistics')).toEqual({ studyId: 'STUDY-1' });
  });

  it('says plainly when no design is bound — and does not borrow one from the program', async () => {
    route({ bound: false });
    await openStatistics();
    expect(await screen.findByText(/No study design is bound to this protocol/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open in Biostatistics/ })).toBeNull();
    expect(apiRequest.mock.calls.some((c) => String(c[1]).startsWith('/api/biostat-bridge/designs'))).toBe(false);
  });

  it('names the stored run behind the planned N, and asks the server to reproduce it (R1, 2026-11-06)', async () => {
    route();
    await openStatistics();
    expect(await screen.findByText(/Stored run #12, 2026-11-06, computed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Check it reproduces' }));
    expect(apiRequest.mock.calls.some((c) => c[0] === 'GET' && c[1] === '/api/biostat-bridge/computation-runs/12/reproduce')).toBe(true);
  });

  it('gives the shell’s .page-full row one root, the selection bar above the protocol (R1, 2026-11-06)', async () => {
    // .page-full is a flex row. With two roots the bar and the protocol sat side by side, the protocol at 325 px.
    route();
    const { container } = render(<Providers><ProtocolWorkspace {...props()} /></Providers>);
    await screen.findByRole('tab', { name: /Statistics/ });
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toBe('pde-shell');
    expect(root.querySelector(':scope > .pde-note')).toBeTruthy();
    expect(root.querySelector(':scope > .pd-wrap')).toBeTruthy();
  });

  it('renders a failed read as a failure, not as "no design"', async () => {
    route({ assessment: 'error' });
    await openStatistics();
    expect(await screen.findByText(/Couldn't load the bound study design/)).toBeTruthy();
    expect(screen.queryByText(/No study design is bound/)).toBeNull();
  });
});
