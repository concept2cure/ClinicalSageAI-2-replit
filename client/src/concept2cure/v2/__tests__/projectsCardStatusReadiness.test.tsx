// @vitest-environment jsdom
/**
 * A Projects card says what its status rests on, and names its readiness.
 *
 * ── The defects (QA 2026-10-08, journey j1) ──────────────────────────────────
 * 1. NM-512 is recorded `blocked` (regulatory_programs.status) and the list
 *    projects no blocker for it (the list returns blocker NULL — blockers are
 *    not assessed there). Its card showed a red BLOCKED chip and, since
 *    2026-10-08, nothing else: a status with no cause, which a reader takes
 *    as "something is wrong, and nobody knows what". The card now says, in
 *    words, that no cause is recorded.
 * 2. One program's readiness read four ways across screens. The one figure
 *    the server computes for a program is its dossier readiness (the share of
 *    its home filing's governed sections approved or locked,
 *    server/services/c2c/dossier-read.ts since F23). The card printed it as
 *    "N% ready" or "Readiness not measured", unlabelled; it now says which
 *    readiness it is, in the words Project home uses for the same figure.
 * 3. (F23 3/9) A card with no figure drew an empty bar, `width: 0%`, beside
 *    "not measured": the bar said 0 while the words said nothing was counted.
 *    And a figure the server could not read was "not measured" too. Now no
 *    figure draws no bar, and an unavailable figure says so, with the reason.
 * 4. (D2-1, 2026-11-01) The card is Claude's quiet card: no readiness bar, no
 *    readiness line, no chip (ONE_DESIGN_PLAN §2: "There are no readiness bars
 *    and no stat strip"). The figure, its name and its reason moved to the list
 *    view's "Dossier readiness" column, as text; the portfolio figures moved to
 *    the list's footing (.design/claude-convergence/D2.md §1.4 items 2, 5–7).
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

const row = (id: string, status: string, readiness: number | null, blocker: string | null = null) => ({
  id, title: `Program ${id}`, ws: 'MDX', code: id.toUpperCase(), stage: 'Manufacturing',
  readiness, status, lead: 'Rae Okafor', blocker, due: '—', due_date: null,
});

const card = (title: string) =>
  Array.from(document.querySelectorAll('.pj-card')).find((c) => c.textContent?.includes(title)) as HTMLElement;
const listRow = (title: string) =>
  Array.from(document.querySelectorAll('.ct-row')).find((c) => c.textContent?.includes(title)) as HTMLElement;

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/c2c/projects'
      ? ok({
          data: [
            row('nm512', 'blocked', null),
            row('ivd', 'blocked', 20, 'FAERS signal adjudication pending'),
            row('bx256', 'active', null),
            row('hlv', 'active', 0),
          ],
        })
      : ok({ data: [] }),
  );
});

describe('Projects card — a blocked status carries its cause, or says none is recorded', () => {
  it('a program recorded blocked with no blocker says no cause is recorded (the NM-512 case)', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program nm512')).toBeTruthy());
    const c = card('Program nm512');
    expect(c.textContent).toMatch(/blocked/i);
    expect(c.textContent).toMatch(/no cause recorded/i);
    expect(c.textContent).not.toMatch(/No open blockers/);
  });

  /* 2026-10-31: the portfolio projection carries no blocker (it was a literal
     NULL, server/services/c2c/project-portfolio.ts), so the card reads none,
     even from a row that carries one, and a blocked status says no cause is
     recorded here. A project's blockers are on its project home. */
  it('reads no blocker from a list row, and a blocked status still says no cause is recorded', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program ivd')).toBeTruthy());
    const c = card('Program ivd');
    expect(c.textContent).not.toContain('FAERS signal adjudication pending');
    expect(c.textContent).toMatch(/no cause recorded/i);
  });

  it('an active program makes no blocker claim either way', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program bx256')).toBeTruthy());
    expect(card('Program bx256').textContent).not.toMatch(/cause recorded|blocker/i);
  });

  it('the list view says the same for the blocked program', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program nm512')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(listRow('Program nm512')).toBeTruthy());
    expect(listRow('Program nm512').textContent).toMatch(/no cause recorded/i);
    expect(listRow('Program bx256').textContent).not.toMatch(/cause recorded/i);
    // A Status column, where a Blocker column read "—" on every row (2026-10-31).
    const head = document.querySelector('.ct-head')?.textContent ?? '';
    // D2-1: the workstream column names the client type (WS_LABEL), not the code.
    expect(head).toContain('Client type');
    expect(head).toContain('Status');
    expect(head).not.toMatch(/Blocker|\bWS\b/);
    expect(listRow('Program bx256').textContent).toContain('Active');
  });
});

describe('Projects list — readiness is named as the dossier readiness', () => {
  /* D2-1: the figure left the card for the list's column, which carries the
     name Project home uses; each row prints the figure under it. */
  it('labels a measured figure and an unmeasured one with the same name Project home uses', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program hlv')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(listRow('Program hlv')).toBeTruthy());
    expect(document.querySelector('.ct-head')?.textContent).toContain('Dossier readiness');
    expect(listRow('Program hlv').textContent).toContain('0%');
    expect(listRow('Program bx256').textContent).toContain('Not recorded');
    // Never a bare, unlabelled "N% ready".
    expect(listRow('Program hlv').textContent).not.toMatch(/\d+% ready/);
  });
});

describe('Projects — no bar anywhere; the figure is text with its reason (F23, D2-1)', () => {
  const stated = (id: string, readiness: number | null, readinessState: string, readinessReason?: string) =>
    ({ ...row(id, 'active', readiness), readinessState, ...(readinessReason ? { readinessReason } : {}) });
  const READ_FAILED = 'The governed sections could not be read.';
  beforeEach(() => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects'
        ? ok({ data: [stated('zero', 0, 'measured'), stated('none', null, 'no_sections'), stated('down', null, 'unavailable', READ_FAILED), stated('half', 50, 'measured')] })
        : ok({ data: [] }),
    );
  });
  const bar = (el: HTMLElement) => el.querySelector('.ph-bar-track');

  /* Was "a measured 0 draws its empty bar": D2-1 takes the bar off the card
     (plan §2, no readiness bars); the card states no readiness at all. */
  it('no card draws a bar or states a readiness figure', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program zero')).toBeTruthy());
    for (const id of ['zero', 'half', 'none', 'down']) {
      expect(bar(card(`Program ${id}`))).toBeNull();
      expect(card(`Program ${id}`).textContent).not.toMatch(/readiness|\d+%|unavailable/i);
    }
  });

  /* Was "the list view draws the same bars": the list states the figure as
     text, under its name, with the server's reason as the tooltip. */
  it('the list view states each figure as text, with no bar', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program zero')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(listRow('Program zero')).toBeTruthy());
    for (const id of ['zero', 'half', 'none', 'down']) expect(bar(listRow(`Program ${id}`))).toBeNull();
    expect(listRow('Program zero').textContent).toContain('0%');
    expect(listRow('Program half').textContent).toContain('50%');
    expect(listRow('Program none').textContent).toContain('Not recorded');
  });

  it('an unavailable figure says so, and why, never "Not recorded"', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program down')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    await waitFor(() => expect(listRow('Program down')).toBeTruthy());
    const r = listRow('Program down');
    expect(r.textContent).toContain('unavailable');
    expect(r.textContent).not.toContain('Not recorded');
    expect(r.querySelector(`[title="${READ_FAILED}"]`)?.textContent).toBe('unavailable');
  });

  it('the portfolio mean says how many programs it covers when some have no recorded measurement', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program zero')).toBeTruthy());
    // D2-1: the portfolio figures are the list's footing, not the grid's chrome.
    expect(document.querySelector('.pj-summary')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    // (0 + 50) / 2, over the two measured of four.
    await waitFor(() => expect(document.querySelector('.pj-summary')?.textContent).toContain('25% average readiness, 2 of 4 measured'));
  });
});
