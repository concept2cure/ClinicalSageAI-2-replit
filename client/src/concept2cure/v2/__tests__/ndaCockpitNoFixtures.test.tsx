// @vitest-environment jsdom
/**
 * NdaCockpit — fixture-free contract for the "BLA biologics" tab (GA real-data
 * standard).
 *
 * That tab used to seed an inline BLA_SEED fixture behind a <SampleTag> "Sample
 * data" pill and only swap in live rows when the org happened to have some. That
 * is retired. These tests pin the three honest states the tab may now render —
 * REAL org-scoped rows from GET /api/biopharma/bla/assessments (the
 * { assessments: [...] } contract off c2c_bla_assessments), an honest EMPTY
 * state, or an honest ERROR state — and prove no retired fixture content and no
 * provenance pill survive when the backend has nothing or fails.
 *
 * (The CTD readiness, Module-1 admin, and Refuse-to-File tabs were already
 * fixture-free via useLiveRows; here they are stubbed to honest-empty so the BLA
 * tab is the subject under test.)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { NdaCockpit } from '../surfaces/NdaCockpit';

const props = () => ({
  surface: { id: 'nda-cockpit', label: 'NDA cockpit' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

/* A REAL org-scoped payload — deliberately NOT the retired BLA_SEED, so anything
   the BLA tab renders proves the { assessments } response was adopted rather than
   a codebase constant. Note the endpoint uses an { assessments } envelope, not
   the standard { data } one. */
const REAL_BLA = {
  assessments: [
    {
      id: 'bla-real-1',
      program_id: 'prog-zx9',
      kind: 'immunogenicity',
      title: 'ZX-9 pivotal ADA/NAb panel',
      modality: 'ADC',
      reference_product: null,
      target_agency: 'FDA',
      verdict: 'low',
      status: 'signed',
    },
    {
      id: 'bla-real-2',
      program_id: 'prog-zx9',
      kind: 'filing_risk',
      title: 'ZX-9 351(a) filing-risk profile',
      modality: 'ADC',
      reference_product: null,
      target_agency: 'FDA',
      verdict: 'high',
      status: 'draft',
    },
  ],
};

/* BLA_SEED strings that must NEVER appear once the fixture is gone. */
const RETIRED_BLA = [
  'BX-204 vs US-licensed reference',
  'Post-change drug substance (Process C)',
  'Pivotal ADA / NAb integrated analysis',
  'BLA 761xxx filing-risk profile',
  'Sample data',
];

/** Stub the surface's other fixture-free reads (modules/rtf/m1) to honest-empty
 *  so only the BLA tab varies. `bla` is the BLA-assessments response for the run. */
function mockApi(bla: { ok: boolean; status: number; body: unknown }) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/biopharma/bla/assessments') {
      return { ok: bla.ok, status: bla.status, json: async () => bla.body } as Response;
    }
    if (method === 'GET' && url.startsWith('/api/nda-cockpit/')) {
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { count: 0 } }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
}

/** Open the "BLA biologics" tab (not the default). */
function openBlaTab() {
  fireEvent.click(screen.getByText('BLA biologics'));
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('NdaCockpit BLA tab — real rows render (no fixture)', () => {
  beforeEach(() => mockApi({ ok: true, status: 200, body: REAL_BLA }));

  it('renders the REAL org-scoped assessments, kind labels and verdicts', async () => {
    render(<NdaCockpit {...props()} />);
    openBlaTab();

    // Titles came from the response, not a fixture. The cell renders
    // `{title} · {target_agency}` in one node, so match on the title substring.
    expect(await screen.findByText(/ZX-9 pivotal ADA\/NAb panel/)).toBeTruthy();
    expect(screen.getByText(/ZX-9 351\(a\) filing-risk profile/)).toBeTruthy();
    // The kind→label display helper mapped a real row's `kind`.
    expect(screen.getByText('Immunogenicity (ADA / NAb risk)')).toBeTruthy();

    // No provenance pill and no retired fixture content.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED_BLA) expect(document.body.textContent).not.toContain(s);
  });

  it('never styles a non-passing verdict as a green "complete" pill', async () => {
    render(<NdaCockpit {...props()} />);
    openBlaTab();
    await screen.findByText(/ZX-9 pivotal ADA\/NAb panel/);

    // Passing verdict ("low") → complete; non-passing ("high") → review, never complete.
    const low = screen.getByText('low');
    expect(low.className).toContain('complete');
    const high = screen.getByText('high');
    expect(high.className).toContain('review');
    expect(high.className).not.toContain('complete');
  });
});

describe('NdaCockpit BLA tab — honest empty state', () => {
  beforeEach(() => mockApi({ ok: true, status: 200, body: { assessments: [] } }));

  it('shows an EmptyState — never a fixture — when the org has no assessments', async () => {
    render(<NdaCockpit {...props()} />);
    openBlaTab();

    expect(await screen.findByText('No BLA biologics assessments yet')).toBeTruthy();
    // No assessment table rows, no provenance pill, no retired fixtures.
    expect(document.querySelector('.reg-tbl')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED_BLA) expect(document.body.textContent).not.toContain(s);
  });
});

describe('NdaCockpit — no fabricated filing identity or review clock', () => {
  /* The surface used to hardcode an invented filing — 'BX-204 · NDA 212345 ·
     505(b)(1) · standard review' in the header, 'NDA 212345' in the eyebrow and
     in the AnA prompts (the USER's words), 'Day 60 · PDUFA Day 304' KPI tiles,
     and an NDA_CLOCK fixture (14 Jul 2026 receipt / 14 May 2027 PDUFA) rendered
     as a live review clock. All of it is retired: identity comes from the open
     program (window.C2C_PROJECT) or is claimed not at all, and the clock tab is
     an honest "no review clock recorded" state (there is no clock store). */
  const FABRICATED = [
    'NDA 212345',
    '212345',
    'BX-204',
    '505(b)(1)',
    'standard review (10-month)',
    '14 Jul 2026',
    '12 Sep 2026',
    '14 May 2027',
    'PDUFA Day 304',
    'Day 60',
  ];

  beforeEach(() => {
    mockApi({ ok: true, status: 200, body: { assessments: [] } });
    delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  });
  afterEach(() => {
    delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  });

  it('claims no application identity when no program is open', async () => {
    render(<NdaCockpit {...props()} />);
    await screen.findByText('No CTD modules yet'); // load settled
    for (const s of FABRICATED) {
      expect(document.body.textContent, `fabricated "${s}" leaked back in`).not.toContain(s);
    }
  });

  it('renders the honest no-clock state on the PDUFA tab — never invented dates', async () => {
    render(<NdaCockpit {...props()} />);
    await screen.findByText('No CTD modules yet');
    fireEvent.click(screen.getByText('PDUFA review clock'));

    expect(await screen.findByText('No review clock recorded')).toBeTruthy();
    // The honest state names the reason and the next action.
    expect(document.body.textContent).toContain('The review clock starts when FDA accepts the filing');
    for (const s of FABRICATED) expect(document.body.textContent).not.toContain(s);
  });

  it('sends AnA a generic program prompt — never an invented application number', async () => {
    const p = props();
    render(<NdaCockpit {...p} />);
    await screen.findByText('No CTD modules yet');
    fireEvent.click(screen.getByText(/Assess with AnA/));

    expect(p.onAsk).toHaveBeenCalledTimes(1);
    const sent = String(p.onAsk.mock.calls[0][0]);
    expect(sent).not.toContain('212345');
    expect(sent).not.toContain('BX-204');
    expect(sent).toContain('this NDA program');
  });

  it('names the REAL open program (window.C2C_PROJECT) when one is open', async () => {
    (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 7, title: 'ZX-9 First-in-Human' };
    render(<NdaCockpit {...props()} />);
    await screen.findByText('No CTD modules yet');

    // The name appears in the header intro (and again in the eyebrow).
    expect(screen.getAllByText(/ZX-9 First-in-Human/).length).toBeGreaterThan(0);
    for (const s of FABRICATED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('NdaCockpit BLA tab — honest error state', () => {
  beforeEach(() =>
    mockApi({ ok: false, status: 403, body: { error: 'FORBIDDEN' } }),
  );

  it("shows an error EmptyState — never a fixture — when the read fails", async () => {
    render(<NdaCockpit {...props()} />);
    openBlaTab();

    expect(await screen.findByText("Couldn't load BLA biologics assessments")).toBeTruthy();
    expect(document.querySelector('.reg-tbl')).toBeNull();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED_BLA) expect(document.body.textContent).not.toContain(s);
  });
});
