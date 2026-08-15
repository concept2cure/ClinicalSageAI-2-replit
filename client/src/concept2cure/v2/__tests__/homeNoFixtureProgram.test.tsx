// @vitest-environment jsdom
/**
 * The first authenticated screen must not invent a drug programme.
 *
 * Home rendered `SEGMENT_CONTEXT[segment].program` under a branch icon — a
 * constant, which for a biotech tenant read 'BX-301 — BLA · 351(a)'. So the
 * landing page named a BLA programme the organization had never created, while
 * the Projects page one click away, reading the same `/api/c2c/projects`,
 * correctly reported none. An independent readiness assessment called this out
 * as a data-integrity defect, which on a regulated platform is what it is.
 *
 * These tests pin the four honest states of that line — loading, the REAL lead
 * programme, "No programs yet", a failed read said plainly — and assert that no
 * retired sample programme string can render on Home in ANY of them, for any
 * segment. They also pin the surrounding pathway chips as reference config that
 * legitimately stays: '510(k)' and 'BLA' are what a client category files under,
 * for every customer.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Dana' } }),
}));
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => ({ catalog: null, loading: false, error: undefined }),
}));

import { Home } from '../surfaces/Surfaces';
import { SEGMENT_CONTEXT, getSegmentContext } from '../registryModel';

/* Every sample programme the kit shipped in the per-segment context. Not one of
   them may reach the DOM again, on any segment, in any load state. */
const RETIRED = [
  'BX-301',
  'BX-204',
  'CardioFlow CX',
  'DxAssay RT-PCR',
  '7 sponsors',
  'investigator-initiated oncology trial',
];

/* REAL rows, deliberately unlike anything in the codebase, so whatever renders
   proves the response was adopted rather than a constant. `/api/c2c/projects`
   returns the canonical `{ data: [...] }` envelope. */
const PROGRAMS = [
  { id: 'p-1', title: 'First-in-Human, ZX-9', code: 'ZX-9', status: 'active', ws: 'Biotech' },
  { id: 'p-2', title: 'Companion assay', code: 'CA-2', status: 'complete', ws: 'Biotech' },
];

const props = () => ({ onNav: vi.fn(), onAsk: vi.fn(), segment: 'biotech' });

function expectNoRetiredProgram() {
  for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
}

// Braces, not an implicit return: `mockReset()` returns the mock itself, and
// vitest invokes anything a beforeEach RETURNS as a cleanup hook after the
// test — i.e. it called `apiRequest()` bare. Five tests shrugged that off; the
// 403 test's mock made the stray call reject, and vitest pinned the unhandled
// "Forbidden" on an assertion that had already passed (the DOM contained the
// error state it was looking for). The component was never wrong — the hook was.
beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(cleanup);

describe('Home — the lead programme is real or absent, never invented', () => {
  it('renders the org’s REAL lead programme (not a constant)', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: PROGRAMS }),
    } as Response);

    render(<Home {...props()} />);

    // The ACTIVE programme leads — "what am I working on" — and the rest are
    // counted, not listed.
    expect(await screen.findByText(/ZX-9 — First-in-Human, ZX-9/)).toBeTruthy();
    expect(document.body.textContent).toContain('+1 more');
    expectNoRetiredProgram();
  });

  it('shows an honest empty state — never a fixture — when the org has no programs', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response);

    render(<Home {...props()} />);

    expect(await screen.findByText('No programs yet')).toBeTruthy();
    expectNoRetiredProgram();
  });

  it('says the read failed rather than falling back to a sample programme', async () => {
    apiRequest.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

    render(<Home {...props()} />);

    expect(await screen.findByText(/Couldn’t load your programs/)).toBeTruthy();
    expectNoRetiredProgram();
  });

  it('renders no sample programme for ANY segment', async () => {
    apiRequest.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response);

    for (const segment of Object.keys(SEGMENT_CONTEXT)) {
      render(<Home {...props()} segment={segment} />);
      await waitFor(() => expect(screen.getAllByText('No programs yet').length).toBeGreaterThan(0));
      expectNoRetiredProgram();
      cleanup();
    }
  });
});

describe('SEGMENT_CONTEXT is reference config, not programme data', () => {
  it('carries no `program` field on any segment', () => {
    for (const [id, ctx] of Object.entries(SEGMENT_CONTEXT)) {
      expect(ctx, `${id} must not name a programme`).not.toHaveProperty('program');
    }
  });

  it('still carries the category label and its regulatory pathways', () => {
    // The half that is genuinely tenant-independent, and is still rendered.
    const biotech = getSegmentContext('biotech');
    expect(biotech.label).toBe('Biotech');
    expect(biotech.pathways).toContain('BLA');
  });
});
