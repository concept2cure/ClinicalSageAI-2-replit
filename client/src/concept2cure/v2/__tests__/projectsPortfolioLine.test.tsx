// @vitest-environment jsdom
/**
 * The portfolio line on Projects (S11; THE_PROGRAM §5 and §9 step 6): each card, and each list row, says in one quiet
 * line where its plan stands, from the schedule engine's summary (services/regulatory/SubmissionPyramidSchedule.ts
 * `scheduleSummary`), read once for the page (GET /api/v1/pyramids/by-project?refs=…), never once per card. A project
 * with no work breakdown says nothing more than its card does; a failed read is said once, never a page that only
 * looks calm.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }) }));
vi.mock('@/utils/authToken', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/authToken')>()),
  getAuthToken: () => 't',
  getAuthHeaders: () => ({ Authorization: 'Bearer t', 'x-organization-id': '1' }),
}));

import { Projects } from '../surfaces/Projects';

/* Projects remembers the grid or list choice (P-122): each case starts from the default. */
beforeEach(() => { try { window.localStorage.removeItem('c2c-v2-projects-view'); } catch { /* none */ } });
import { portfolioWords } from '../surfaces/PyramidProject';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as never;
const fail = () => ({ ok: false, status: 500, json: async () => ({ error: 'down' }) }) as never;
const props = () => ({ surface: { id: 'projects', label: 'Projects' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const row = (id: string) => ({ id, title: `Project ${id}`, ws: 'Biotech', code: id.toUpperCase(), stage: 'Planning', readiness: null,
  readinessState: 'no_sections', status: 'active', lead: 'Rae Okafor', due: 'Jun 4, 2027', due_date: '2027-06-04', activity: 'Updated Nov 5' });
const summary = (over: Record<string, unknown>) => ({ total: 58, done: 3, blocked: 0, overdue: 0, lateToStart: 0,
  next: { phaseId: 'phase2', phaseName: 'Pre-IND Engagement', taskId: 'phase2.complete', due: '2027-01-12' }, status: 'on-track', ...over });
const ROWS = ['ontrack', 'late', 'blocked', 'unscheduled', 'noplan', 'done'].map(row);
const LINES = {
  ontrack: { type: 'IND', target: '2027-06-04', summary: summary({}) },
  late: { type: 'IND', target: '2027-06-04', summary: summary({ status: 'at-risk', overdue: 2 }) },
  blocked: { type: 'NDA', target: '2027-06-04', summary: summary({ status: 'blocked', blocked: 1 }) },
  unscheduled: { type: 'IND', target: null, summary: summary({ status: 'unscheduled', next: { phaseId: 'phase1', phaseName: 'Planning', taskId: 'phase1.complete', due: null } }) },
  noplan: { type: null, filing: 'ca_nds' },
  done: { type: 'IND', target: '2027-06-04', summary: summary({ status: 'complete', done: 58, next: null }) },
};
let batch: 'ok' | 'fail';
const plan = (title: string) =>
  (Array.from(document.querySelectorAll('.pj-card')).find((c) => c.textContent?.includes(title)) as HTMLElement)?.querySelector('.pj-card-plan');

afterEach(cleanup);
beforeEach(() => {
  batch = 'ok';
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.startsWith('/api/v1/pyramids/by-project?refs=')) return batch === 'ok' ? ok({ success: true, data: { asOf: '2026-11-05', lines: LINES } }) : fail();
    return url.startsWith('/api/c2c/projects') ? ok({ data: ROWS }) : ok({ data: [] });
  });
});

describe('the portfolio line on Projects', () => {
  it('reads every card\'s plan in one request for the page', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(plan('Project ontrack')).toBeTruthy());
    const reads = apiRequest.mock.calls.filter(([, u]) => String(u).startsWith('/api/v1/pyramids/by-project'));
    expect(reads).toHaveLength(1);
    expect(decodeURIComponent(String(reads[0][1]).split('refs=')[1]).split(',')).toEqual(ROWS.map((r) => r.id));
  });

  it("says where each plan stands, colour only beside the words where it is behind", async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(plan('Project ontrack')).toBeTruthy());
    expect(plan('Project ontrack')?.textContent).toBe('On schedule · Pre-IND Engagement by Jan 12, 2027');
    expect(plan('Project late')?.textContent).toBe('2 tasks past due · Pre-IND Engagement by Jan 12, 2027');
    expect(plan('Project late')?.getAttribute('data-tone')).toBe('warn');
    expect(plan('Project blocked')?.textContent).toBe('1 task blocked · Pre-IND Engagement by Jan 12, 2027');
    expect(plan('Project unscheduled')?.textContent).toBe('Not scheduled: no target date');
    expect(plan('Project done')?.textContent).toBe('Plan complete');
    // A filing with no work breakdown: nothing more than the card says.
    expect(plan('Project noplan')).toBeNull();
  });

  it('puts the same line under the target date in the list view', async () => {
    render(<Projects {...props()} />);
    await waitFor(() => expect(plan('Project ontrack')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /List/ }));
    const listRow = Array.from(document.querySelectorAll('.ct-row')).find((r) => r.textContent?.includes('Project late')) as HTMLElement;
    expect(listRow.querySelector('[data-testid="portfolio-line"]')?.textContent).toBe('2 tasks past due · Pre-IND Engagement by Jan 12, 2027');
  });

  it('says once that the plans could not be read, rather than showing calm cards', async () => {
    batch = 'fail';
    render(<Projects {...props()} />);
    expect((await screen.findByTestId('portfolio-lines-error')).textContent).toBe('Where each project’s plan stands could not be read.');
    expect(document.querySelectorAll('.pj-card-plan')).toHaveLength(0);
  });

  it('words a late start, an unreadable plan and an unavailable one', () => {
    expect(portfolioWords({ summary: summary({ status: 'at-risk', lateToStart: 1, next: null }) as never })?.text).toBe('1 task should have started');
    expect(portfolioWords({ unreadable: true })?.text).toBe('The plan could not be read.');
    expect(portfolioWords({ unavailable: true })).toBeNull();
    // Hours laid end to end are a floor: "on schedule" is said against minimum dates, never as a forecast.
    expect(portfolioWords({ durations: 'hours-only', summary: summary({}) as never })?.text).toBe('On schedule against minimum dates · Pre-IND Engagement by Jan 12, 2027');
    expect(portfolioWords({ durations: 'mixed', summary: summary({}) as never })?.text).toBe('On schedule · Pre-IND Engagement by Jan 12, 2027');
  });
});
