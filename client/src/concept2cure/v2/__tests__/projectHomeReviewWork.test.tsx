// @vitest-environment jsdom
/**
 * ProjectHome — the Review stage lists the OPEN program's tasks and approvals.
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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
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

function openReviewStage() {
  fireEvent.click(screen.getByTitle('Review, approve & e-sign'));
}

beforeEach(() => {
  clearNavParams();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PROGRAM, title: 'BX-256' };
});
afterEach(() => {
  cleanup();
  clearNavParams();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('ProjectHome — Review stage: the program’s tasks and approvals', () => {
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
    expect(await screen.findByText(/requested task is not available in this program/)).toBeTruthy();
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

    expect(await screen.findByText(/No tasks or approvals on this program/)).toBeTruthy();
  });

  it('a program with no project record says so, not "no tasks" and not an error', async () => {
    route(() => status(404));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText(/This program has no task record/)).toBeTruthy();
    expect(screen.queryByText(/No tasks or approvals on this program/)).toBeNull();
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });

  it('a failed read is an error, never an empty list', async () => {
    route(() => status(500));
    render(<ProjectHome {...props()} />);
    openReviewStage();

    expect(await screen.findByText(/Couldn't load this program's tasks/)).toBeTruthy();
    expect(screen.queryByText(/No tasks or approvals on this program/)).toBeNull();
  });
});
