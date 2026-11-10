// @vitest-environment jsdom
/**
 * The Projects surface became a directory rather than a dashboard: the four
 * `.metric` tiles that headed it are one quiet summary line, and a search sits
 * beside the view toggle.
 *
 * Two things had to survive that, and both are pinned here.
 *
 * 1. THE HONEST FIGURE. `kv()` resolves every headline number to an em dash
 *    while the portfolio read is in flight or has failed. Before it existed,
 *    `projects` was `[]` in both of those states and the `|| 1` divisor turned
 *    what would at least have been a visible NaN into a clean "0%" — a
 *    portfolio-mean readiness computed over no programmes, on a screen a
 *    director reads to learn what they run. Shrinking the tiles must not
 *    quietly reintroduce that, so the failure branch is FORCED here, not
 *    observed passing.
 *
 * 2. THE LEAD IS NOT SEARCHABLE. The server projects `lead` as
 *    COALESCE(u.name, u.email, '—'), so it can be an email address. A search
 *    that matched it would let a typed fragment confirm a colleague's address
 *    one character at a time. Search covers title and code only — the same
 *    reason the surface's AnA publisher drops the field (anaSeesScreens).
 *
 * D2-1 (2026-11-01) made the summary line the list view's footing. P-122
 * (2026-11-10) put it back above the projects in both views, with the server's
 * counts only: no figure while the read is in flight or failed, and no average
 * readiness, which was the browser's mean over the page
 * (p122ProjectsFiguresByDefault.test.tsx). The guard against a confident figure
 * over no read is pinned here, forced as before.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { Projects } from '../surfaces/Projects';

/* Projects remembers the grid or list choice (P-122): each case starts from the default. */
beforeEach(() => { try { window.localStorage.removeItem('c2c-v2-projects-view'); } catch { /* none */ } });

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const fail = (status: number) =>
  ({ ok: false, status, json: async () => ({ error: 'nope' }) }) as never;

const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

/* Two programmes whose titles and codes share no substring, so a search for one
   is unambiguous evidence the other was filtered out. `lead` is an email on the
   first, which is what the privacy assertion needs. */
const ZX = {
  id: 'p1', title: 'First-in-Human ZX-9', ws: 'Pharma', code: 'ZX-9',
  stage: 'author', readiness: 40, status: 'active', lead: 'dana@sentinel.test',
  blocker: null, due: 'Q4',
};
const KP = {
  id: 'p2', title: 'Companion assay', ws: 'Biotech', code: 'KP-2',
  stage: 'review', readiness: 80, status: 'active', lead: 'Rae Okafor',
  blocker: null, due: 'Q1',
};

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('Projects — the summary line stays honest when the read fails', () => {
  it('renders no percentage at all over a FAILED portfolio read', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? fail(500) : ok({ data: [] }),
    );
    render(<Projects {...props()} />);

    await waitFor(() => expect(screen.getByText(/Couldn.t load the project portfolio/i)).toBeTruthy());
    /* The specific regression: a figure over a failed read rendering as a real,
       confident one ("0 active projects", "0%"). The failure is said once, by the
       page; the figures line says nothing in either view. */
    expect(document.querySelector('.pj-summary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(document.querySelector('.pj-summary')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+%|\b0 active/);
  });

  it('renders no percentage while the read is still in flight', async () => {
    /* Held open deliberately, then RELEASED before the test ends. A mock that
       never settles leaves the component pending and hangs cleanup rather than
       failing — a stuck suite, not a red test. */
    let release!: (v: unknown) => void;
    const held = new Promise((r) => { release = r; });
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/c2c/projects') { await held; return ok({ data: [ZX, KP] }); }
      return ok({ data: [] });
    });
    render(<Projects {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(document.querySelector('.pj-summary')).toBeNull();

    expect(document.body.textContent).not.toMatch(/\d+%/);
    expect(screen.getByText(/Loading projects/i)).toBeTruthy();

    release(null);
    // Settled, the rows' own figures show (each project's readiness in its row).
    await waitFor(() => expect(document.body.textContent).toContain('80%'));
  });

  it('does render the server’s figures once the read succeeds', async () => {
    const counts = { total: 2, filingWithin60Days: 0, byWorkstream: { Pharma: 1, Biotech: 1 }, byPathway: { other: 2 } };
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [ZX, KP], meta: { counts } }) : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    await screen.findByText('Companion assay');
    /* Proves the empty line above is the guard firing and not the figures having
       been removed: the same line, settled, says the server's counts. */
    await waitFor(() => expect(document.querySelector('.pj-summary')?.textContent).toContain('2 active projects'));
    expect(document.querySelector('.pj-summary')?.textContent).toContain('0 filings due within 60 days');
    expect(document.querySelector('.pj-summary')?.textContent).not.toMatch(/%/);
  });
});

describe('Projects — search', () => {
  const seed = () =>
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [ZX, KP] }) : ok({ data: [] }),
    );

  it('matches on title and hides the rest', async () => {
    seed();
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Companion assay')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Search projects/i), { target: { value: 'Companion' } });
    expect(screen.getByText('Companion assay')).toBeTruthy();
    expect(screen.queryByText('First-in-Human ZX-9')).toBeNull();
  });

  it('matches on the program code', async () => {
    seed();
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('First-in-Human ZX-9')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Search projects/i), { target: { value: 'KP-2' } });
    expect(screen.getByText('Companion assay')).toBeTruthy();
    expect(screen.queryByText('First-in-Human ZX-9')).toBeNull();
  });

  it('does NOT match the lead field, which can hold an email address', async () => {
    seed();
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('First-in-Human ZX-9')).toBeTruthy());

    /* A prefix of the address on ZX. If search reached `lead`, this would keep
       that card on screen and confirm the address exists. */
    fireEvent.change(screen.getByLabelText(/Search projects/i), { target: { value: 'dana@' } });
    expect(screen.queryByText('First-in-Human ZX-9')).toBeNull();
    expect(screen.getByText(/No projects match/i)).toBeTruthy();
  });

  it('names the query in the empty state instead of blaming the filters', async () => {
    seed();
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Companion assay')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Search projects/i), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No projects match .zzzz./i)).toBeTruthy();
  });
});
