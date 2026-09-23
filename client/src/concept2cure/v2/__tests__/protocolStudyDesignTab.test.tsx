// @vitest-environment jsdom
/**
 * Protocol workspace — the Study design tab.
 *
 * docs/design/PROTOCOL_DESIGN_CONVERGENCE.md steps 1d and 2. The protocol
 * document is a projection of the design-as-data spine, so this tab shows:
 *
 *   • whether a study design is bound at all — and when none is, it says so
 *     and offers the bind action, WITHOUT implying the protocol has passed
 *     anything;
 *   • the DESIGN GATES' findings for a bound design, in the same
 *     `PG.FindingsList` shape the protocol's other registers use;
 *   • the five projections the spine already produces, read-only, each
 *     labelled with what it is a projection OF, each viewable and
 *     downloadable, and each rendering its own honest gaps rather than an
 *     empty success.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const fail = (status: number, body: unknown = { error: { message: 'Design store unavailable.' } }) =>
  ({ ok: false, status, json: async () => body }) as Response;

function Providers({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const BASE_DOC = {
  id: '41', title: 'A Phase III Study of BX-204', shortTitle: 'BX-204-301', kind: 'clinical',
  version: '0.7', status: 'draft', sponsor: 'Sponsor', pi: 'PI', updated: '2026-09-20',
  completeness: 68, openSection: 's1',
  sections: [{ id: 's1', num: '1', title: 'Background', status: 'draft', required: true }],
  content: {}, objectives: [], eligibility: { inclusion: [], exclusion: [] },
  soa: { visits: [], assessments: [], cells: {}, issues: [] }, risks: [], milestones: [],
  budget: { params: null, items: [], summary: null }, amendments: [], deviations: [],
  reviews: [], consent: [], completenessFindings: [], studyDesign: null,
};

const BOUND = {
  studyId: 'sd_bx204', resolved: true,
  title: 'BX-204 pivotal in type 2 diabetes', phase: '3', indication: 'type 2 diabetes',
  status: 'draft', linkedAt: '2026-09-22T00:00:00.000Z',
  riskLevel: 'critical', canAdvance: false, blocksApproval: true,
  counts: { critical: 1, major: 1, minor: 0, info: 0 },
  summary: 'Design is blocked: critical defensibility findings must be resolved before approval. (1 critical, 1 major).',
  standardsChecked: ['ICH E9(R1)', 'ICH E10'],
  findings: [
    {
      code: 'EST-001', section: '§2 Estimands', sev: 'critical',
      title: 'No estimand for primary endpoint',
      text: 'Endpoint "HbA1c change" has no estimand.',
      standard: 'ICH E9(R1)', endpoint: 'HbA1c change', fix: 'Define the estimand.',
    },
    {
      code: 'FRM-004', section: '§4 Design framework', sev: 'major',
      title: 'Control choice is not justified',
      text: 'An external control needs an ICH E10 justification.',
      standard: 'ICH E10', endpoint: '', fix: 'Record the control justification.',
    },
  ],
};

const DESIGN_LIST = {
  designs: [
    { studyId: 'sd_bx204', programId: null, title: 'BX-204 pivotal in type 2 diabetes', phase: '3', indication: 'type 2 diabetes', status: 'draft', updatedAt: null },
  ],
};

/** A protocol projection with one rendered and one missing section. */
const M11 = {
  protocol: {
    title: 'BX-204 pivotal in type 2 diabetes',
    synopsis: 'A Phase 3, randomised, double-blind study.',
    standard: 'ICH M11',
    projectedFromObject: true,
    completeness: { rendered: 1, partial: 0, missing: 1, total: 2, percent: 50 },
    sections: [
      { number: '1', title: 'Protocol summary', content: 'A Phase 3 study.', status: 'rendered', gaps: [] },
      { number: '6', title: 'Trial intervention', content: '', status: 'missing', gaps: ['No intervention is recorded on the design object.'] },
    ],
  },
};

/** A Schedule of Activities the design cannot fill — the honest-gap case. */
const SOA = {
  scheduleOfActivities: {
    present: false, epochs: [], visits: [], rows: [], footnotes: [],
    counts: { epochs: 0, visits: 0, activities: 0, scheduledCells: 0 },
    gaps: ['The design object carries no Schedule of Activities.'],
    completeness: { satisfied: 0, total: 1, percent: 0 },
    standard: 'ICH M11 §1.3',
    projectedFromObject: true,
  },
};

function route(opts: { doc?: Record<string, unknown>; projection?: 'ok' | 'error' } = {}) {
  const doc = { ...BASE_DOC, ...(opts.doc ?? {}) };
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) return ok({ success: true, data: [doc] });
    if (method === 'GET' && url === '/api/study-design') return ok(DESIGN_LIST);
    if (method === 'GET' && url.includes('/schedule-of-activities')) {
      return opts.projection === 'error' ? fail(503) : ok(SOA);
    }
    if (method === 'GET' && url.includes('/api/study-design/')) {
      return opts.projection === 'error' ? fail(503) : ok(M11);
    }
    if (method === 'POST' && url.includes('/study-design')) return ok({ documentId: 41, studyDesignId: 'sd_bx204' });
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openTab(p = props()) {
  render(<Providers><ProtocolWorkspace {...p} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /Study design/ }));
  return p;
}

/** The tab's own pane. The protocol's left-hand outline renders the DOCUMENT's
 *  completeness findings on every tab, so every assertion about what this tab
 *  claims has to be scoped to this tab. */
const pane = () => screen.getByRole('region', { name: 'Study design' });

beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('protocol-dev — Study design tab, unbound', () => {
  it('says no design is bound and offers the bind action, claiming nothing', async () => {
    route();
    await openTab();
    expect(await screen.findByText(/No study design is bound to this protocol/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bind a study design/ })).toBeTruthy();
    // Nothing on this tab that could read as a passed gate.
    expect(within(pane()).queryByText(/No findings/)).toBeNull();
    expect(screen.queryByRole('button', { name: /ICH M11 protocol/ })).toBeNull();
  });

  it('lists this tenant\'s persisted designs in the bind drawer', async () => {
    route();
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: /Bind a study design/ }));
    expect(await screen.findByText(/BX-204 pivotal in type 2 diabetes/)).toBeTruthy();
  });
});

describe('protocol-dev — Study design tab, bound', () => {
  it('shows the design identity and the design gates\' findings', async () => {
    route({ doc: { studyDesign: BOUND } });
    await openTab();
    expect(await screen.findByText('BX-204 pivotal in type 2 diabetes')).toBeTruthy();
    expect(screen.getByText(/Design is blocked/)).toBeTruthy();
    expect(screen.getByText(/EST-001 — No estimand for primary endpoint/)).toBeTruthy();
    expect(screen.getByText(/FRM-004 — Control choice is not justified/)).toBeTruthy();
    // The standard the gate rests on travels with the finding.
    expect(screen.getByText(/EST-001[\s\S]*\(ICH E9\(R1\)\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Unbind study design/ })).toBeTruthy();
  });

  it('reports an unresolved link as unresolved, not as a clean design', async () => {
    route({ doc: { studyDesign: { ...BOUND, resolved: false, findings: [], summary: '', title: '' } } });
    await openTab();
    expect(await screen.findByText(/could not be read for this organisation/)).toBeTruthy();
    expect(within(pane()).queryByText(/No findings/)).toBeNull();
  });
});

describe('protocol-dev — the five projections (read-only)', () => {
  it('offers all five, each labelled with what it is a projection OF', async () => {
    route({ doc: { studyDesign: BOUND } });
    await openTab();
    for (const label of [
      /ICH M11 protocol/, /Statistical Analysis Plan/, /Schedule of Activities/,
      /Trial registry record/, /CRF shell/,
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByText(/Nothing is written back into the protocol/)).toBeTruthy();
  });

  it('views the ICH M11 protocol projection with each section\'s status', async () => {
    route({ doc: { studyDesign: BOUND } });
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: /ICH M11 protocol/ }));
    const panel = await screen.findByRole('region', { name: /ICH M11 protocol/ });
    expect(within(panel).getByText(/Protocol summary/)).toBeTruthy();
    expect(within(panel).getByText(/A Phase 3 study\./)).toBeTruthy();
    // The honest gap the engine already reports, not papered over.
    expect(within(panel).getByText(/No intervention is recorded on the design object/)).toBeTruthy();
    expect(within(panel).getByText(/Download/)).toBeTruthy();
  });

  it('renders a projection the design cannot fill as its gap, not as an empty success', async () => {
    route({ doc: { studyDesign: BOUND } });
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: /Schedule of Activities/ }));
    const panel = await screen.findByRole('region', { name: /Schedule of Activities/ });
    expect(within(panel).getAllByText(/The design object carries no Schedule of Activities/).length).toBeGreaterThan(0);
    expect(within(panel).queryByText(/^No findings/)).toBeNull();
  });

  it('renders a failed projection read as a failure, not as an empty projection', async () => {
    route({ doc: { studyDesign: BOUND }, projection: 'error' });
    await openTab();
    fireEvent.click(screen.getByRole('button', { name: /ICH M11 protocol/ }));
    expect(await screen.findByText(/Design store unavailable/)).toBeTruthy();
  });
});
