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
 *    its governed sections approved or locked — readinessByProject,
 *    server/routes/c2c/projects.ts). The card printed it as "N% ready" or
 *    "Readiness not measured", unlabelled; it now says which readiness it is,
 *    in the words Project home uses for the same figure.
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

  it('a program with a recorded blocker shows that blocker, not the no-cause line', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program ivd')).toBeTruthy());
    const c = card('Program ivd');
    expect(c.textContent).toContain('FAERS signal adjudication pending');
    expect(c.textContent).not.toMatch(/no cause recorded/i);
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
  });
});

describe('Projects card — readiness is named as the dossier readiness', () => {
  it('labels a measured figure and an unmeasured one with the same name Project home uses', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program hlv')).toBeTruthy());
    expect(card('Program hlv').textContent).toContain('Dossier readiness 0%');
    expect(card('Program bx256').textContent).toContain('Dossier readiness not measured');
    // Never a bare, unlabelled "N% ready".
    expect(card('Program hlv').textContent).not.toMatch(/\d+% ready/);
  });
});
