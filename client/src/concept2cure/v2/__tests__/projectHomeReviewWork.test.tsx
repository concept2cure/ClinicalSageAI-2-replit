// @vitest-environment jsdom
/**
 * ProjectHome — Plan lists the OPEN program's tasks and approvals (D3-4: they were on Review until 2026-11-08,
 * D3.md §4.7; one panel on Plan, by due date, rows as hairline rows with the status in words).
 *
 * QA 2026-10-08 (j1, "Plan (schedule) and Review (tasks and approvals) stage
 * panels never load on the project home"): the Review stage said "Review tasks
 * aren't wired to this workspace yet" for every program, because the task
 * stores are keyed by the integer projects.id and the page holds the program's
 * regulatory_programs UUID. The work view
 * (GET /api/concept2cure/projects/:id/unified-work — project_tasks,
 * c2c_project_work_items, estar_submissions, unified_tasks) now takes the UUID
 * and resolves the program's anchored row on the server.
 *
 * Pinned here:
 *   - the read is by the program's UUID and lists that program's items, each
 *     labelled with the store it lives in;
 *   - a source that could not be read makes the counts a floor, and says so;
 *   - a program with no project record says so — not "no tasks", not an error;
 *   - a failed read is an error, never an empty list.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';
import { stashNavParamsForTarget, clearNavParams } from '../navParams';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';
const WORK_URL = `/api/concept2cure/projects/${PROGRAM}/unified-work`;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const status = (s: number) => ({ ok: false, status: s, json: async () => ({}) }) as Response;

function item(over: Record<string, unknown> = {}) {
  return {
    id: 'review:wi-1',
    source: 'review',
    nativeId: 'wi-1',
    projectId: 11,
    title: 'Approve the 2.5 Clinical Overview',
    status: 'open',
    priority: 'high',
    dueAt: '2026-11-02T00:00:00Z',
    ownerName: 'Raj Patel',
    blocking: true,
    detail: 'approval',
    ...over,
  };
}

function work(items: unknown[], partial = false) {
  return {
    items,
    summary: { total: items.length, blocking: 1, open: items.length, inProgress: 0, done: 0, bySource: {}, partial },
    sources: {},
  };
}

const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

function route(workResponse: () => Response) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === WORK_URL) return workResponse();
    // The conversations list above the tabs: a reply without `threads` is now
    // a failed read (projectThreads.ts), so the empty list is given as one.
    if (url.startsWith('/api/chat/threads?')) return ok({ threads: [] });
    return ok({});
  });
}

function openStage(name: string) {
  const step = Array.from(document.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')).find((b) => b.textContent?.trim() === name);
  if (!step) throw new Error(`no step ${name}`);
  fireEvent.click(step);
}
const openReviewStage = () => openStage('Plan');
const panel = () => screen.findByRole('region', { name: 'Tasks and approvals' });

beforeEach(() => {
  clearNavParams();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'BX-256' };
});
afterEach(() => {
  cleanup();
  clearNavParams();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('ProjectHome — Plan: the program’s tasks and approvals', () => {
  it('opens the exact task handed off by the board, even beyond the list cap or already done', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => item({ id: `schedule:${i}`, title: `Schedule ${i}` }));
    rows.push(item({ id: 'review:target', title: 'The requested older review', status: 'done' }));
    route(() => ok(work(rows)));
    stashNavParamsForTarget('project-home', { workId: 'review:target', stage: 'review' });
    render(<ProjectHome {...props()} />);
    const target = await screen.findByText('The requested older review');
    expect(target.closest('[data-work-target]')?.getAttribute('aria-label')).toBe('Requested task: The requested older review');
    expect(apiRequest.mock.calls.some((c) => c[1] === WORK_URL)).toBe(true);
    expect(window.C2C_NAV_PARAMS).toBeUndefined();
  });

  it('states when the task no longer belongs to the authorized program work view', async () => {
    route(() => ok(work([item()])));
    stashNavParamsForTarget('project-home', { workId: 'review:another-program' });
    render(<ProjectHome {...props()} />);
    expect(await screen.findByText(/requested task is not available in this project/)).toBeTruthy();
    expect(document.querySelector('[data-work-target]')).toBeNull();
  });

  it('reads the work view by the program UUID and lists its items with their store', async () => {
    route(() => ok(work([item(), item({ id: 'schedule:4', source: 'schedule', title: 'Pre-IND meeting', blocking: false, ownerName: null })])));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText('Approve the 2.5 Clinical Overview')).toBeTruthy();
    expect(screen.getByText('Pre-IND meeting')).toBeTruthy();
    expect(screen.getByText(/Raj Patel/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Review thread/);
    expect(document.body.textContent).toMatch(/Schedule/);
    expect(screen.queryByText(/aren't wired/)).toBeNull();
    expect(apiRequest.mock.calls.some((c) => c[1] === WORK_URL)).toBe(true);
  });

  it('says the counts are a floor when a store could not be read', async () => {
    route(() => ok(work([item()], true)));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    await screen.findByText('Approve the 2.5 Clinical Overview');
    expect(document.body.textContent).toMatch(/could not be read/i);
  });

  it('an empty work view is an honest empty, not a failure', async () => {
    route(() => ok(work([])));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText(/No tasks or approvals on this project/)).toBeTruthy();
  });

  it('a program with no project record says so, not "no tasks" and not an error', async () => {
    route(() => status(404));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText(/This project has no tracking record/)).toBeTruthy();
    expect(screen.queryByText(/No tasks or approvals on this project/)).toBeNull();
    /* The step's body, not the page: since D3-3 the Team card in Project knowledge reads the team on every step, and
       this test serves no team, so the card rightly says the team could not be read. */
    expect(within(document.querySelector('.pj-main') as HTMLElement).queryByText(/Couldn't load/)).toBeNull();
  });

  it('a failed read is an error, never an empty list', async () => {
    route(() => status(500));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText(/Couldn't load this project's tasks/)).toBeTruthy();
    expect(screen.queryByText(/No tasks or approvals on this project/)).toBeNull();
  });

});

/* D3-4 (D3.md §4.7 Plan item 3, §4.6 item 4): one panel on Plan, by due date, rows as hairline rows. */
describe('ProjectHome — Plan’s tasks and approvals, by due date (D3-4)', () => {
  it('orders open work by due date, undated last, and says each status in words at the row’s right', async () => {
    route(() => ok(work([
      item({ id: 'a', title: 'Due late', dueAt: '2026-11-28T00:00:00Z', blocking: false, status: 'open' }),
      item({ id: 'b', title: 'No date', dueAt: null, blocking: false }),
      item({ id: 'c', title: 'Due first', dueAt: '2026-11-05T00:00:00Z', blocking: true, status: 'blocked', source: 'board', ownerName: 'JM Smith' }),
      item({ id: 'd', title: 'Due middle', dueAt: '2026-11-14T00:00:00Z', blocking: false, ownerName: null, priority: null }),
    ])));
    render(<ProjectHome {...props()} />);
    openStage('Plan');
    const tasks = await panel();
    await within(tasks).findByText('Due first');
    const titles = Array.from(tasks.querySelectorAll('.pj-file-n')).map((n) => n.textContent);
    expect(titles).toEqual(['Due first', 'Due middle', 'Due late', 'No date']);
    expect(within(tasks).getByText('On this project, by due date')).toBeTruthy();
    const first = within(tasks).getByText('Due first').closest('.pj-file') as HTMLElement;
    expect(first.querySelector('.pj-work-status')?.textContent).toBe('Blocked · blocking the filing');
    expect(first.querySelector('.pj-work-status')?.getAttribute('data-blocked')).toBe('true');
    expect(first.querySelector('.pj-file-m')?.textContent).toMatch(/^Task board · JM Smith · High priority · Due Nov 5, 2026$/);
    const middle = within(tasks).getByText('Due middle').closest('.pj-file') as HTMLElement;
    expect(middle.querySelector('.pj-file-m')?.textContent).toMatch(/^Review thread · Unassigned · Due Nov 14, 2026$/);
    expect(within(tasks).getByText('No date').closest('.pj-file')?.textContent).toContain('No due date');
    expect(tasks.querySelector('.rd-chip, .pj-file-badge'), 'no chip or badge on a row').toBeNull();
  });

  it('a past due date is marked overdue', async () => {
    route(() => ok(work([item({ id: 'old', title: 'Long overdue', dueAt: '2020-01-02T00:00:00Z' })])));
    render(<ProjectHome {...props()} />);
    openStage('Plan');
    const tasks = await panel();
    await within(tasks).findByText('Long overdue');
    expect(tasks.querySelector('.pj-overdue')?.textContent).toBe('Due Jan 2, 2020');
  });

  /* P-122 (2026-11-10): Review lists the tasks and approvals again, the same panel over the same read as Plan
     (d50c5f07e had moved them to Plan only). A Tasks handoff still lands on Plan (below). */
  it('Review lists the tasks and approvals again, the same panel as Plan', async () => {
    route(() => ok(work([item(), item({ id: 'board:t-1', source: 'board', title: 'Draft the synopsis', blocking: false })])));
    render(<ProjectHome {...props()} />);
    openStage('Review');
    await screen.findByRole('region', { name: 'Reviews' });
    const tasks = await screen.findByRole('region', { name: 'Tasks and approvals' });
    expect(await within(tasks).findByText('Approve the 2.5 Clinical Overview')).toBeTruthy();
    expect(within(tasks).getByText('Draft the synopsis')).toBeTruthy();
  });

  it('a task handed over from Tasks with stage "review" opens Plan, the requested row first and focused', async () => {
    const rows = [item({ id: 'board:first', title: 'Earliest', dueAt: '2026-11-01T00:00:00Z' }), item({ id: 'board:target', title: 'The handed-over task', dueAt: '2026-12-30T00:00:00Z' })];
    route(() => ok(work(rows)));
    stashNavParamsForTarget('project-home', { workId: 'board:target', stage: 'review' });
    render(<ProjectHome {...props()} />);
    const tasks = await panel();
    const target = await within(tasks).findByText('The handed-over task');
    expect(document.querySelector('.pj-lc-stage[data-status="active"]')?.textContent?.trim()).toBe('Plan');
    expect(tasks.querySelector('.pj-file-n')?.textContent).toBe('The handed-over task');
    await waitFor(() => expect(document.activeElement).toBe(target.closest('[data-work-target]')));
  });

  /* The dev server renders under React.StrictMode, which runs mount effects twice. An effect that cleared the requested
     task on mount ran again after the handoff was consumed and dropped it (walked in the running app, 2026-11-08). */
  it('keeps the handed-over task under React.StrictMode', async () => {
    route(() => ok(work([item({ id: 'board:a', title: 'First' }), item({ id: 'board:target', title: 'The handed-over task', dueAt: '2026-12-30T00:00:00Z' })])));
    stashNavParamsForTarget('project-home', { workId: 'board:target', stage: 'review' });
    render(<React.StrictMode><ProjectHome {...props()} /></React.StrictMode>);
    const tasks = await panel();
    await within(tasks).findByText('The handed-over task');
    await waitFor(() => expect(tasks.querySelector('[data-work-target]')?.textContent).toContain('The handed-over task'));
    expect(tasks.querySelector('.pj-file-n')?.textContent).toBe('The handed-over task');
  });
});
