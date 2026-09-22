// @vitest-environment jsdom
/**
 * Protocol workspace — the Design derivation tab (protocol → design).
 *
 * `docs/design/PROTOCOL_INTELLIGENCE.md`, direction two, and the founder's
 * explicit ask: a protocol a human edits is a fact about the study, and today
 * that fact dies on the page. The derivation engine
 * (`server/services/protocol-development/design-derivation.ts`) turns it into a
 * PROPOSAL with five buckets, and this tab is the reviewed diff.
 *
 * The buckets mean specific things and this file exists to stop the UI blurring
 * them:
 *
 *   • `incomplete` is not a disabled proposal — the accept control must not
 *     exist for those rows at all;
 *   • `unevidenced` is not a gap in the design — silence is not a value, and
 *     the design field is untouched;
 *   • an unbound protocol (409 INVALID_STATE) is not an empty diff;
 *   • a failed read is not an empty derivation (CLAUDE.md: an error is never
 *     rendered as an empty result);
 *   • apply sends PATHS, never derived values — the server recomputes the
 *     derivation from the live rows;
 *   • a `rejected` path is not a silent no-op.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProtocolWorkspace } from '../surfaces/ProtocolDev';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as Response;
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body }) as Response;

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

/** The engine's five buckets, in the shapes `design-derivation.ts` exports. */
const DERIVATION = {
  proposed: [
    {
      path: 'title',
      value: 'A Phase III Study of BX-204',
      provenance: { table: 'protocol_documents', rowIds: [41], confidence: 'structured', note: 'protocol_documents.title' },
    },
  ],
  conflicts: [
    {
      path: 'phase',
      designValue: '2',
      protocolValue: '3',
      why: 'The protocol and the design disagree on the development phase.',
      provenance: { table: 'protocol_documents', rowIds: [41], confidence: 'structured', note: 'protocol_documents.phase = "Phase 3"' },
    },
  ],
  unchanged: ['endpoints'],
  unevidenced: [
    { path: 'population.eligibility', reason: 'The protocol records no eligibility criteria.' },
  ],
  incomplete: [
    {
      path: 'scheduleOfActivities.visits',
      partial: [{ name: 'Screening', order: 1, studyDay: -14 }],
      missing: ['scheduleOfActivities.visits["Screening"].epochId'],
      reason: 'A visit belongs to a trial epoch and the protocol visit register records none.',
      provenance: {
        table: 'protocol_schedule_visits', rowIds: [7, 8], confidence: 'text_scan',
        note: '2 visits; study day and window read from the free-text timepoint where it parses unambiguously',
      },
    },
  ],
};

const APPLIED = {
  documentId: 41,
  studyDesignId: 'sd_bx204',
  applied: ['title'],
  rejected: [{ path: 'phase', reason: 'The protocol no longer evidences this path — the derivation moved since the diff was shown.' }],
  derivation: { ...DERIVATION, proposed: [], conflicts: [], unchanged: ['title', 'endpoints'] },
};

interface Posted { url: string; body: unknown }

function route(opts: { read?: 'ok' | 'unbound' | 'failed'; posted?: Posted[] } = {}) {
  const read = opts.read ?? 'ok';
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    // Checked FIRST: `/api/protocol-development/...` also starts with
    // `/api/protocol-dev`, so the read-model arm would otherwise swallow it.
    if (method === 'GET' && url.includes('/design-derivation')) {
      if (read === 'unbound') {
        return fail(409, { error: { code: 'INVALID_STATE', message: 'No study design is bound to this protocol, so there is nothing to derive into. Bind a design first.' } });
      }
      if (read === 'failed') {
        return fail(503, { error: { code: 'INTERNAL', message: 'The study-design store did not answer.' } });
      }
      return ok({ documentId: 41, studyDesignId: 'sd_bx204', derivation: DERIVATION });
    }
    if (method === 'GET' && url.startsWith('/api/protocol-dev')) {
      return ok({ success: true, data: [BASE_DOC] });
    }
    if (method === 'POST' && url.includes('/design-derivation/apply')) {
      opts.posted?.push({ url, body });
      return ok(APPLIED);
    }
    return ok({});
  });
}

const props = () => ({ surface: { id: 'protocol-dev', label: 'Protocol', navTier: 'project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

async function openTab() {
  render(<Providers><ProtocolWorkspace {...props()} /></Providers>);
  fireEvent.click(await screen.findByRole('button', { name: /Design derivation/ }));
}

const pane = () => screen.getByRole('region', { name: 'Design derivation' });
const bucket = (name: RegExp) => within(pane()).getByRole('group', { name });

beforeEach(() => { apiRequest.mockReset(); });
afterEach(() => cleanup());

describe('protocol-dev — Design derivation, honest states', () => {
  it('an unbound protocol says so and draws NO diff groups', async () => {
    route({ read: 'unbound' });
    await openTab();
    expect(await within(pane()).findByText(/No study design is bound/)).toBeTruthy();
    expect(within(pane()).getByText(/Study design tab/)).toBeTruthy();
    expect(within(pane()).queryAllByRole('group')).toHaveLength(0);
    expect(within(pane()).queryByRole('checkbox')).toBeNull();
  });

  it('a failed read is reported as a failure, not as an empty derivation', async () => {
    route({ read: 'failed' });
    await openTab();
    expect(await within(pane()).findByText(/did not answer/)).toBeTruthy();
    expect(within(pane()).getByText(/could not be read/i)).toBeTruthy();
    expect(within(pane()).queryAllByRole('group')).toHaveLength(0);
    // The failure must not read as "nothing to derive".
    expect(pane().textContent ?? '').not.toMatch(/No study design is bound/);
  });
});

describe('protocol-dev — Design derivation, the five buckets', () => {
  it('renders all five, each explaining what the bucket means', async () => {
    route();
    await openTab();
    await within(pane()).findByRole('group', { name: /Proposed/ });
    for (const name of [/Proposed/, /Conflicts/, /Unchanged/, /Unevidenced/, /Incomplete/]) {
      expect(bucket(name)).toBeTruthy();
    }
    expect(within(bucket(/Proposed/)).getByText(/the design has nothing there/i)).toBeTruthy();
    expect(within(bucket(/Unchanged/)).getByText(/already agree/i)).toBeTruthy();
  });

  it('a conflict shows both values, the reason, and what accepting means', async () => {
    route();
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Conflicts/ });
    expect(within(g).getByText(/disagree on the development phase/)).toBeTruthy();
    expect(within(g).getByText(/Design value/)).toBeTruthy();
    expect(within(g).getByText(/Protocol value/)).toBeTruthy();
    expect(within(g).getByText(/choosing the protocol’s value over the design’s/i)).toBeTruthy();
  });

  it('a proposed row names the protocol rows it came from', async () => {
    route();
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Proposed/ });
    expect(within(g).getAllByText(/protocol_documents/).length).toBeGreaterThan(0);
    expect(within(g).getByText(/row 41/)).toBeTruthy();
  });

  it('an incomplete row offers NO accept control and names the fields a human must supply', async () => {
    route();
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Incomplete/ });
    expect(within(g).queryByRole('checkbox')).toBeNull();
    expect(within(g).queryByRole('button')).toBeNull();
    expect(within(g).getByText(/scheduleOfActivities\.visits\["Screening"\]\.epochId/)).toBeTruthy();
    expect(within(g).getByText(/belongs to a trial epoch/)).toBeTruthy();
    // A text_scan value must say, in words, that it was read from free text.
    expect(within(g).getByText(/read from free text/i)).toBeTruthy();
  });

  it('an unevidenced row offers NO accept control and is not described as a defect', async () => {
    route();
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Unevidenced/ });
    expect(within(g).queryByRole('checkbox')).toBeNull();
    expect(within(g).getByText(/records no eligibility criteria/)).toBeTruthy();
    expect(within(g).getByText(/not a gap in the design/i)).toBeTruthy();
    expect(g.textContent ?? '').not.toMatch(/missing|defect|unmet|incomplete/i);
  });
});

describe('protocol-dev — Design derivation, apply', () => {
  it('posts acceptedPaths and a reason, and never a derived value', async () => {
    const posted: Posted[] = [];
    route({ posted });
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Proposed/ });
    fireEvent.click(within(g).getByRole('checkbox'));
    fireEvent.click(within(pane()).getByRole('button', { name: /Apply accepted/ }));

    fireEvent.change(await screen.findByLabelText(/Reason for change/), {
      target: { value: 'Adopt the protocol title into the bound design.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply and record/ }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].body).toEqual({
      acceptedPaths: ['title'],
      reason: 'Adopt the protocol title into the bound design.',
    });
    const wire = JSON.stringify(posted[0].body);
    expect(wire).not.toContain('A Phase III Study of BX-204');
    expect(wire).not.toContain('protocol_documents');
    expect(wire).not.toContain('value');
  });

  it('shows applied and rejected paths distinctly after the write', async () => {
    const posted: Posted[] = [];
    route({ posted });
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Proposed/ });
    fireEvent.click(within(g).getByRole('checkbox'));
    fireEvent.click(within(pane()).getByRole('button', { name: /Apply accepted/ }));
    fireEvent.change(await screen.findByLabelText(/Reason for change/), {
      target: { value: 'Adopt the protocol title into the bound design.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Apply and record/ }));

    const result = await within(pane()).findByRole('group', { name: /Result of the last apply/ });
    const applied = within(result).getByRole('group', { name: /Written to the design/ });
    expect(within(applied).getByText(/title/)).toBeTruthy();
    const rejected = within(result).getByRole('group', { name: /Not written/ });
    expect(within(rejected).getByText(/phase/)).toBeTruthy();
    expect(within(rejected).getByText(/no longer evidences this path/)).toBeTruthy();
  });

  it('refuses a reason shorter than the governed minimum without posting', async () => {
    const posted: Posted[] = [];
    route({ posted });
    await openTab();
    const g = await within(pane()).findByRole('group', { name: /Proposed/ });
    fireEvent.click(within(g).getByRole('checkbox'));
    fireEvent.click(within(pane()).getByRole('button', { name: /Apply accepted/ }));
    fireEvent.change(await screen.findByLabelText(/Reason for change/), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply and record/ }));
    await waitFor(() => expect(screen.getByText(/at least 8 characters/)).toBeTruthy());
    expect(posted).toHaveLength(0);
  });
});
