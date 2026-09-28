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

const summaryItem = (label: RegExp) =>
  Array.from(document.querySelectorAll('.pj-summary-i')).find((el) => label.test(el.textContent ?? ''));
const figure = (label: RegExp) => summaryItem(label)?.querySelector('strong')?.textContent ?? null;

const row = (id: string, status: string, readiness: number | null) => ({
  id, title: `Program ${id}`, ws: 'Pharma', code: id.toUpperCase(), stage: 'Planning',
  readiness, status, lead: 'Rae Okafor', blocker: null, due: '—',
});

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('Projects — summary over a successful empty read', () => {
  it('states no mean readiness over zero programs', async () => {
    apiRequest.mockImplementation(async () => ok({ data: [] }));
    render(<Projects {...props()} />);
    expect(await screen.findByText('No programs yet')).toBeTruthy();

    expect(figure(/average readiness/i), 'a mean over no programmes rendered as a figure').toBe('—');
    expect(document.querySelector('.pj-summary')?.textContent).not.toMatch(/\d+%/);
    // The counts over an empty set are real zeros and stay so.
    expect(figure(/active programs/i)).toBe('0');
    expect(figure(/blocked/i)).toBe('0');
  });
});

describe('Projects — a mixed portfolio still has a mean', () => {
  it('averages readiness over every program shown', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects'
        ? ok({ data: [row('a1', 'active', 40), row('b1', 'blocked', 20), row('c1', 'complete', 90)] })
        : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program a1')).toBeTruthy());

    expect(figure(/blocked/i)).toBe('1');
    // (40 + 20 + 90) / 3 = 50 — the mean still covers every program shown.
    expect(figure(/average readiness/i)).toBe('50%');
  });
});

describe('Projects — a program with nothing measurable has no readiness figure', () => {
  /* The server answers readiness null when the measurement failed or a
     program has no governed sections to measure (server/routes/c2c/projects.ts);
     both used to reach the card as a stored, never-updated "0% ready". */
  it('says "not measured" on its card, never "0% ready"', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [row('u1', 'active', null)] }) : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program u1')).toBeTruthy());
    expect(screen.getByText('Readiness not measured')).toBeTruthy();
    expect(screen.queryByText('0% ready')).toBeNull();
    expect(figure(/average readiness/i)).toBe('—');
  });

  it('averages only the programs that were measured', async () => {
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === '/api/c2c/projects' ? ok({ data: [row('m1', 'active', 40), row('u1', 'active', null)] }) : ok({ data: [] }),
    );
    render(<Projects {...props()} />);
    await waitFor(() => expect(screen.getByText('Program m1')).toBeTruthy());
    // 40 over the one measured program — not (40 + 0) / 2.
    expect(figure(/average readiness/i)).toBe('40%');
  });
});
