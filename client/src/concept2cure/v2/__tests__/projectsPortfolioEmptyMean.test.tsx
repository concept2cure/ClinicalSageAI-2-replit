// @vitest-environment jsdom
/**
 * Projects — the portfolio summary over an empty and a mixed portfolio.
 *
 * ── The defect (launch sweep, empty org) ─────────────────────────────────────
 * "0 active programs · 0% average readiness · 0 blocked" above "No programs
 * yet". `kv()` gated the figures on a read that had not settled (loading,
 * failed) — pinned in projectsDirectory.test.tsx — but a read that SETTLED with
 * zero rows still went through the `|| 1` divisor and rendered a mean over no
 * programmes as a confident "0%".
 *
 * The "active programs" figure is upstream's truncation-aware count
 * (countFloor, 7332200d8) and is pinned by its own tests, not here.
 *
 * D2-1 (2026-11-01): each row's readiness is a column in the list view.
 *
 * P-122 (2026-11-10): the portfolio mean is gone. It was the browser's mean over
 * the loaded page, and the server sends no portfolio figure for it (Rule 2), so
 * the defect above cannot recur: no mean is computed at all. What stays pinned is
 * that a program with no figure never reads as 0, now on its card as well as its
 * row, and that the server's zero counts over an empty portfolio are zeros.
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
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const summaryItem = (label: RegExp) =>
  Array.from(document.querySelectorAll('.pj-summary-i')).find((el) => label.test(el.textContent ?? ''));
const figure = (label: RegExp) => summaryItem(label)?.querySelector('strong')?.textContent ?? null;
const showList = () => fireEvent.click(screen.getByRole('button', { name: 'List' }));
const listRow = (title: string) =>
  Array.from(document.querySelectorAll('.ct-row')).find((c) => c.textContent?.includes(title)) as HTMLElement;

const row = (id: string, status: string, readiness: number | null) => ({
  id, title: `Program ${id}`, ws: 'Pharma', code: id.toUpperCase(), stage: 'Planning',
  readiness, status, lead: 'Rae Okafor', blocker: null, due: '—',
});

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

/** The server's counts for `total` projects (meta.counts). */
const counts = (total: number) => ({ total, filingWithin60Days: 0, byWorkstream: { Pharma: total }, byPathway: { other: total } });
const card = (title: string) =>
  Array.from(document.querySelectorAll('.pj-card')).find((c) => c.textContent?.includes(title)) as HTMLElement;

describe('Projects — summary over a successful empty read', () => {
  it('states no readiness over zero programs, and the server’s zero counts as zeros', async () => {
    apiRequest.mockImplementation(async () => ok({ data: [], meta: { counts: counts(0) } }));
    render(<Projects {...props()} />);
    expect(await screen.findByText('No projects yet')).toBeTruthy();
    expect(document.querySelector('.pj-summary')?.textContent).not.toMatch(/\d+%|average/i);
    // The counts over an empty set are real zeros, counted by the server, and stay so.
    expect(figure(/active projects/i)).toBe('0');
    // No "Blocked" figure at all since 2026-10-08: nothing writes a blocked
    // status or computes a blocker, so it could only state an unchecked 0
    // (projectsHonestCounts.test.tsx).
    expect(figure(/blocked/i)).toBeNull();
    showList();
    expect(figure(/average readiness/i)).toBeNull();
  });
});

/* Was "a mixed portfolio still has a mean": the mean was the browser's, over the
   loaded page; the server sends no portfolio figure for it (P-122, Rule 2). */
describe('Projects — a mixed portfolio states each program’s figure, and no mean', () => {
  it('shows each program’s own dossier readiness on its card, and no average', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects'
        ? ok({ data: [row('a1', 'active', 40), row('b1', 'blocked', 20), row('c1', 'complete', 90)], meta: { counts: counts(3) } })
        : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program a1')).toBeTruthy());
    expect(card('Program a1').textContent).toContain('Dossier readiness 40%');
    expect(card('Program c1').textContent).toContain('Dossier readiness 90%');
    expect(figure(/average readiness/i)).toBeNull();
    expect(document.querySelector('.pj-summary')?.textContent).not.toMatch(/50%/);
  });
});

describe('Projects — a program with nothing measurable has no readiness figure', () => {
  it('keeps a failed dossier measurement unavailable, on its card and its row', async () => {
    apiRequest.mockImplementation(async () => ok({ data: [{ ...row('failed', 'active', null), readinessState: 'unavailable' }], meta: { counts: counts(1) } }));
    render(<Projects {...props()} />);
    await screen.findByText('Program failed');
    expect(card('Program failed').textContent).toContain('Dossier readiness unavailable');
    showList();
    expect(listRow('Program failed').textContent).toContain('unavailable');
  });
  /* The server answers readiness null when the measurement failed or a
     program has no governed sections to measure (server/routes/c2c/projects.ts);
     both used to reach the card as a stored, never-updated "0% ready". */
  it('says "Not recorded" on its card and its list row, never "0% ready"', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [row('u1', 'active', null)], meta: { counts: counts(1) } }) : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program u1')).toBeTruthy());
    expect(card('Program u1').textContent).toContain('Dossier readiness Not recorded');
    showList();
    expect(document.querySelector('.ct-head')?.textContent).toContain('Dossier readiness');
    expect(listRow('Program u1').textContent).toContain('Not recorded');
    expect(screen.queryByText('0% ready')).toBeNull();
  });
});
