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

    /* The specific regression: a portfolio mean over zero programmes rendering
       as a real, confident figure. Not "0%" and not any other percentage. */
    expect(document.body.textContent).not.toMatch(/\d+%/);
    expect(document.body.textContent).toContain('—');
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

    expect(document.body.textContent).not.toMatch(/\d+%/);
    expect(screen.getByText(/Loading programs/i)).toBeTruthy();

    release(null);
    await waitFor(() => expect(document.body.textContent).toContain('60%'));
  });

  it('does render the real figures once the read succeeds', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [ZX, KP] }) : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    /* (40 + 80) / 2 = 60. Proves the em dashes above are the guard firing and
       not the figures having been removed by the redesign. */
    await waitFor(() => expect(document.body.textContent).toContain('60%'));
    expect(document.body.textContent).toContain('2');
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
    expect(screen.getByText(/No programs match/i)).toBeTruthy();
  });

  it('names the query in the empty state instead of blaming the filters', async () => {
    seed();
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Companion assay')).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/Search projects/i), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No programs match .zzzz./i)).toBeTruthy();
  });
});
