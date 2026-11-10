// @vitest-environment jsdom
/**
 * A Projects card reads like a Claude project card: the name, one line that
 * says what the project is, and when it was updated (D2 §1.4 items 4–5,
 * ONE_DESIGN_PLAN §2 "Projects").
 *
 * The one line is `cardLine` in surfaces/Projects.tsx, from the portfolio
 * projection's own fields (server/services/c2c/project-portfolio.ts, S11,
 * 805a6f0ee): the stated description when there is one; otherwise the filing in
 * words (filing type · agency · indication), each only when stated; otherwise,
 * for a payload from before the projection carried those fields, the stage and
 * the lead. Nothing is filled in that the record does not hold.
 *
 * `WS_LABEL` (surfaces/ProjectPortfolioFilters.tsx) names each workstream code as
 * a client type. D3-2's About card imports it (BUILD_ORDER §0 item 4, a hard
 * edge), so its export and its values are pinned here.
 *
 * Red against HEAD before D2-1 (no export; the card printed code · stage · lead):
 * docs/evidence/DESIGN/D2/D2-1/red/.
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
import * as filters from '../surfaces/ProjectPortfolioFilters';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const props = () =>
  ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: `Project ${id}`, ws: 'Biotech', code: id.toUpperCase(), stage: 'Planning',
  readiness: null, readinessState: 'no_sections', status: 'active', lead: 'Rae Okafor',
  due: '—', due_date: null, activity: 'Updated Oct 31', ...extra,
});

const ROWS = [
  // A stated description wins over everything else.
  base('described', {
    description: 'Phase 2 programme for BX-204 in moderate-to-severe plaque psoriasis.',
    program_type: 'ind', agency: 'FDA', indication: 'Moderate-to-severe plaque psoriasis in adults',
  }),
  // A blank description is not stated: the filing in words.
  base('filing', {
    description: '   ', program_type: 'ind', agency: 'FDA', indication: 'Moderate-to-severe plaque psoriasis in adults',
  }),
  // Only what is stated: no indication, no "undefined", no empty separator.
  base('partial', { description: null, program_type: '510k', agency: null, indication: null }),
  // An older payload, without the four fields: the stage and the lead.
  base('older'),
  // A target date is stated on the card's last line.
  base('dated', { program_type: 'ind', agency: 'FDA', due: 'Feb 28, 2027', due_date: '2027-02-28' }),
];

const card = (title: string) =>
  Array.from(document.querySelectorAll('.pj-card')).find((c) => c.textContent?.includes(title)) as HTMLElement;
const line = (title: string) => card(title)?.querySelector('.pj-card-m')?.textContent ?? null;
const foot = (title: string) => card(title)?.querySelector('.pj-card-r')?.textContent ?? null;

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url.startsWith('/api/c2c/projects') ? ok({ data: ROWS }) : ok({ data: [] }));
});

describe('WS_LABEL names each workstream code as a client type', () => {
  it('is exported, in sentence case, with the rail’s device name', () => {
    expect((filters as Record<string, unknown>).WS_LABEL).toEqual({
      MDX: 'Medical device & IVD', Biotech: 'Biotech', Pharma: 'Pharma', CRO: 'CRO',
    });
  });
});

describe('the card’s one line says what the project is, from what is stated', () => {
  it('reads the stated description first', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project described')).toBeTruthy());
    expect(line('Project described')).toBe('Phase 2 programme for BX-204 in moderate-to-severe plaque psoriasis.');
  });

  it('falls back to the filing in words when no description is stated', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project filing')).toBeTruthy());
    expect(line('Project filing')).toBe('IND · FDA · Moderate-to-severe plaque psoriasis in adults');
    expect(line('Project partial')).toBe('510(k)');
  });

  it('falls back to the stage and lead for a payload without the four fields', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project older')).toBeTruthy());
    expect(line('Project older')).toBe('Planning · Lead Rae Okafor');
  });

  it('never fills a value the record does not hold', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project partial')).toBeTruthy());
    for (const title of ROWS.map((row) => row.title)) {
      expect(line(title)).not.toMatch(/undefined|null|· ·|^ · | · $/);
    }
  });

  it('ends with the code and when it was updated, and the target date only when one is set', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project dated')).toBeTruthy());
    expect(foot('Project older')).toBe('OLDER · Updated Oct 31');
    expect(foot('Project dated')).toBe('DATED · Updated Oct 31Due Feb 28, 2027');
    expect(foot('Project older')).not.toMatch(/Due/);
  });

  it('carries no readiness bar, no chip and no readiness line', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project described')).toBeTruthy());
    for (const c of Array.from(document.querySelectorAll('.pj-cards > .pj-card'))) {
      expect(c.querySelector('.ph-bar-track')).toBeNull();
      expect(c.querySelector('.rd-chip')).toBeNull();
      expect(c.textContent).not.toMatch(/readiness/i);
    }
  });
});

describe('the Projects header holds the title and one primary action', () => {
  it('has no eyebrow, no sub-line and no Ask AnA button, and one New project', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project described')).toBeTruthy());
    expect(document.querySelector('.pj-index .ph-eyebrow')).toBeNull();
    expect(screen.queryByRole('button', { name: /Ask AnA/ })).toBeNull();
    expect(document.querySelectorAll('.pj-index .btn.primary')).toHaveLength(1);
    expect(document.querySelector('.ph-acts .btn.primary')?.textContent).toContain('New project');
  });

  it('states the count the search covers in its placeholder, and none while loading', async () => {
    let release!: (v: unknown) => void;
    const held = new Promise((r) => { release = r; });
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url.startsWith('/api/c2c/projects')) { await held; return ok({ data: ROWS }); }
      return ok({ data: [] });
    });
    render(<Projects {...props()} />);
    const search = screen.getByLabelText(/Search projects/i) as HTMLInputElement;
    expect(search.placeholder).toBe('Search projects');
    release(null);
    await waitFor(() => expect(search.placeholder).toBe(`Search ${ROWS.length} projects`));
  });
});

describe('the list view holds what the cards dropped, as text', () => {
  it('names the client type in words and puts the portfolio figures after the table', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(card('Project described')).toBeTruthy());
    expect(document.querySelector('.pj-summary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(document.querySelector('.ctable')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'List' }).getAttribute('aria-pressed')).toBe('true');
    const head = document.querySelector('.ct-head')?.textContent ?? '';
    expect(head).toContain('Client type');
    const table = document.querySelector('.ctable') as HTMLElement;
    const summary = document.querySelector('.pj-summary') as HTMLElement;
    expect(summary).toBeTruthy();
    // The figures are the table's footing: after it in document order.
    expect(table.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('.ctable .rd-chip')).toBeNull();
  });
});
