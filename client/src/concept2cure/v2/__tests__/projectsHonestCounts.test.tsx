// @vitest-environment jsdom
/**
 * Projects states no all-clear it has not checked.
 *
 * docs/SURFACE_DECISIONS_2026-10-08.md, step 2. Three things on the portfolio
 * read as findings and were constants:
 *  - every card said "No open blockers": the list query returns blocker as a
 *    literal NULL (server/routes/c2c/projects.ts), so no blocker was ever looked for;
 *  - "Blocked" counted status === 'blocked', a status nothing writes (programs
 *    are created active and closed out archived), so it always read 0;
 *  - "Filing < 60 days" matched /days/ against a date printed as "Mon DD, YYYY",
 *    so it always read 0, however close a filing was.
 * The status filter also offered Blocked and Complete, which always showed an
 * empty list.
 *
 * D2-1 (2026-11-01): the status filter is a select in the toolbar (item 4).
 * P-122 (2026-11-10): the figures are above the projects in both views and are
 * the server's counts (meta.counts). "Filing within 60 days" was counted in the
 * browser from the page's dates; the server counts it over the whole portfolio
 * (server/services/c2c/project-portfolio.ts), and the page shows that.
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
/** The portfolio figures are under the list (D2-1). */
const showList = () => fireEvent.click(screen.getByRole('button', { name: 'List' }));
const figure = (label: RegExp) =>
  Array.from(document.querySelectorAll('.pj-summary-i'))
    .find((el) => label.test(el.textContent ?? ''))
    ?.querySelector('strong')?.textContent ?? null;

const iso = (daysFromToday: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const row = (id: string, dueDate: string | null) => ({
  id, title: `Program ${id}`, ws: 'Pharma', code: id.toUpperCase(), stage: 'Planning',
  readiness: 30, status: 'active', lead: 'Rae Okafor', blocker: null, due: dueDate ?? '—', due_date: dueDate,
});
/** The server's counts for a portfolio of `total` projects, `soon` of them filing within 60 days. */
const counts = (total: number, soon: number) => ({ total, filingWithin60Days: soon, byWorkstream: { Pharma: total }, byPathway: { other: total } });

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/c2c/projects'
      ? ok({ data: [row('soon', iso(30)), row('later', iso(120)), row('past', iso(-5)), row('none', null)], meta: { counts: counts(4, 1) } })
      : ok({ data: [] }),
  );
});

describe('Projects — figures and cards say only what was assessed', () => {
  it('no card claims "No open blockers" when no blocker was looked for', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    expect(screen.queryByText(/No open blockers/)).toBeNull();
  });

  it('shows no "Blocked" figure, since nothing writes that status', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    showList();
    await waitFor(() => expect(document.querySelector('.pj-summary')).toBeTruthy());
    expect(figure(/blocked/i)).toBeNull();
  });

  it('shows the server’s count of filings due within the next 60 days, in either view', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    // The server counted 30 days: yes; 120 days, 5 days ago and no date: no.
    expect(figure(/filings? due within 60 days/i)).toBe('1');
    showList();
    expect(figure(/filings? due within 60 days/i)).toBe('1');
  });

  /* 2026-10-31 client demo: "1 active projects". */
  it('says one active project in the singular, and several in the plural', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('.pj-summary')?.textContent).toContain('4 active projects'));
    expect(document.querySelector('.pj-summary')?.textContent).toMatch(/\b1 filing due/);
    cleanup();
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [row('only', null)], meta: { counts: counts(1, 0) } }) : ok({ data: [] }));
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program only')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('.pj-summary')?.textContent).toMatch(/\b1 active project(?!s)/));
    expect(document.querySelector('.pj-summary')?.textContent).toMatch(/\b0 filings due/);
  });

  it('offers no status filter that can only show an empty list', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    // D2-1: the status filter is a select; one status offers none at all.
    expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
    const offered = Array.from(document.querySelectorAll('option, .seg-b')).map((o) => o.textContent);
    expect(offered).not.toContain('Blocked');
    expect(offered).not.toContain('Complete');
  });
});
