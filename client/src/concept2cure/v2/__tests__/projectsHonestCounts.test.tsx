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

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === '/api/c2c/projects'
      ? ok({ data: [row('soon', iso(30)), row('later', iso(120)), row('past', iso(-5)), row('none', null)] })
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
    expect(figure(/blocked/i)).toBeNull();
  });

  it('counts the programs whose target filing date is within the next 60 days', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    // 30 days: yes. 120 days, 5 days ago, and no date: no.
    expect(figure(/filing < 60 days/i)).toBe('1');
  });

  it('offers no status filter that can only show an empty list', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program soon')).toBeTruthy());
    const segs = Array.from(document.querySelectorAll('.seg-b')).map((b) => b.textContent);
    expect(segs).not.toContain('Blocked');
    expect(segs).not.toContain('Complete');
  });
});
