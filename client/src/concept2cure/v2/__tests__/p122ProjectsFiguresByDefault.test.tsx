// @vitest-environment jsdom
/**
 * P-122 §3 item 2 (2026-11-10): Projects shows, by default and in grid and list,
 * the portfolio figures and each card's readiness, stage, lead and status. The
 * figures come from the server; the browser computes none of them (Rule 2).
 *
 * WHY THIS EXISTS
 * 78842ee08 (D2-1, 2026-11-01) moved the portfolio figures under the List view's
 * table and took readiness, stage, lead and status off the cards. Grid was the
 * default and the choice was not remembered, so a person opening Projects saw
 * none of it (P-122 inventory, C1 and C2).
 *
 * WHAT IS PINNED
 *   - the figures line sits above the projects in both views: active projects and
 *     filings due within 60 days, as the server counted them (meta.counts), even
 *     where the loaded page would count differently;
 *   - no average readiness: the server sends no portfolio figure for it, and the
 *     browser's mean over the loaded page is not shown (Rule 2). Each project's own
 *     readiness, which the server measures, is on its card and its row;
 *   - a read with no server figures says so, and is never recounted from the rows;
 *   - each card says its dossier readiness, stage, lead and status in words;
 *   - the grid or list choice is remembered for the next visit.
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
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const iso = (daysFromToday: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ROWS = [
  { id: 'a', title: 'Program alpha', ws: 'Biotech', code: 'ALP-1', stage: 'Planning', readiness: 42, readinessState: 'measured',
    status: 'active', lead: 'Rae Okafor', due: 'Dec 10, 2026', due_date: iso(30), activity: 'Updated Nov 10' },
  { id: 'b', title: 'Program beta', ws: 'MDX', code: 'BET-2', stage: 'Design', readiness: null, readinessState: 'no_sections',
    status: 'blocked', lead: '—', due: '—', due_date: null, activity: 'Updated Nov 9' },
];
/* The server's counts cover the whole access-scoped portfolio, which is larger than this page:
   1,234 projects, three of them filing within 60 days, where the page holds two and one. */
const COUNTS = { total: 1234, filingWithin60Days: 3, byWorkstream: { Biotech: 1200, MDX: 34 }, byPathway: { other: 1200, k510: 34 } };
let body: unknown;

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* none */ }
  body = { data: ROWS, meta: { count: 2, hasMore: false, counts: COUNTS } };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url.startsWith('/api/c2c/projects') && !url.includes('/portfolio') ? ok(body) : ok({ data: [] }));
});
afterEach(cleanup);

const summary = () => document.querySelector('.pj-summary') as HTMLElement | null;
const card = (title: string) =>
  Array.from(document.querySelectorAll('.pj-card')).find((c) => c.textContent?.includes(title)) as HTMLElement;
const follows = (a: Element | null, b: Element | null) =>
  !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const viewButton = (name: 'Grid' | 'List') => screen.getByRole('button', { name });

describe('Projects shows the portfolio figures by default, from the server (P-122 §3.2)', () => {
  it('in the default grid view, above the cards: active projects and filings due within 60 days', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    expect(viewButton('Grid').getAttribute('aria-pressed')).toBe('true');
    const line = summary();
    expect(line, 'the figures are shown in grid view').toBeTruthy();
    expect(line?.textContent).toContain('1,234 active projects');
    expect(line?.textContent).toContain('3 filings due within 60 days');
    expect(follows(line, document.querySelector('.pj-cards')), 'above the cards').toBe(true);
  });

  it('shows the server’s counts, not the loaded page’s recount, and no browser-computed average', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    // One row of the page is due within 60 days; the server counted three across the portfolio.
    expect(summary()?.textContent).not.toMatch(/\b1 filings?\b/);
    expect(summary()?.textContent).not.toMatch(/average readiness/i);
    expect(summary()?.textContent).not.toMatch(/\d+%/);
  });

  it('a read that carries no server figures says so, and is not recounted from its rows', async () => {
    body = { data: ROWS };
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    expect(summary()?.textContent).toMatch(/portfolio figures could not be read/i);
    expect(summary()?.textContent).not.toMatch(/\b2 active|\b1 filing/);
  });

  it('in list view the same figures sit above the table', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    fireEvent.click(viewButton('List'));
    await waitFor(() => expect(document.querySelector('.ctable')).toBeTruthy());
    expect(summary()?.textContent).toContain('1,234 active projects');
    expect(follows(summary(), document.querySelector('.ctable'))).toBe(true);
  });
});

describe('each card says its readiness, stage, lead and status (P-122 §3.2)', () => {
  it('a measured project: its dossier readiness, stage, lead and status, in words', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    const text = card('Program alpha').textContent ?? '';
    expect(text).toContain('Dossier readiness 42%');
    expect(text).toContain('Planning');
    expect(text).toContain('Lead Rae Okafor');
    expect(text).toContain('Active');
  });

  it('no figure is "Not recorded", no lead is said, and a blocked status names its missing cause', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Program beta');
    const text = card('Program beta').textContent ?? '';
    expect(text).toContain('Dossier readiness Not recorded');
    expect(text).toContain('Design');
    expect(text).toContain('No lead named');
    expect(text).toMatch(/Blocked · No cause recorded/);
    expect(text).not.toMatch(/Lead —/);
  });
});

describe('the grid or list choice is remembered (P-122 §3.2)', () => {
  it('opens in the view the person chose last time', async () => {
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    fireEvent.click(viewButton('List'));
    await waitFor(() => expect(document.querySelector('.ctable')).toBeTruthy());
    cleanup();
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    expect(viewButton('List').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.ctable')).toBeTruthy();
    fireEvent.click(viewButton('Grid'));
    cleanup();
    render(<Projects {...props()} />);
    await screen.findByText('Program alpha');
    expect(viewButton('Grid').getAttribute('aria-pressed')).toBe('true');
  });
});
