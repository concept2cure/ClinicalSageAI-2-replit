// @vitest-environment jsdom
/**
 * TaskBoard — the Analytics tab states what it measured.
 *
 * Its figures are computed from `list`, the board's FILTERED rows, under the
 * bare labels "Open tasks", "Blocked", "By module" and "Team productivity".
 * With a filter on, those read as the whole board: "Blocked: 0" meant no
 * blocked task of the module the reader had selected, and "Team productivity"
 * with "Assigned to me" on showed one person as the team. A measurement whose
 * scope is not stated is read as the whole.
 *
 * Both halves are asserted, because only one of them is the regression: the
 * sentence appears when the figures are partial, and does NOT appear when they
 * cover every card. A note on every load is noise a reader learns to skip, and
 * then it is not there when it counts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { taskAnalyticsScope } from '../surfaces/taskBoardAnalyticsScope';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Tester', email: 't@example.com' } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';
import type { SurfaceViewProps } from '../surfaceViews';

/* The shell's four required props, built rather than cast: the board reads
   none of them on the Analytics path, and a real object says so where an
   `as unknown as` would only silence the compiler. */
const SHELL: SurfaceViewProps = {
  surface: { id: 'tasks', label: 'Tasks' } as SurfaceViewProps['surface'],
  onAsk: () => {},
  onNav: () => {},
  segment: 'pharma',
};

const task = (over: Record<string, unknown>) => ({
  taskId: 't-1', title: 'A task', project: '', moduleType: 'clinical', taskType: 'authoring',
  status: 'pending', priority: 'medium', assignee: 'u-2', assignedBy: 'u-1', progress: 0,
  impactScore: null, due: null, criticalPath: false, blocked: false, blockedReason: null,
  dependsOn: [], approvalHistory: [], blocks: [], createdAt: '2026-08-01T00:00:00Z',
  ...over,
});

const serve = (board: unknown[]) => {
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    const data = path === '/api/task-management/board' ? board : [];
    return { ok: true, status: 200, json: async () => ({ success: true, data }) } as unknown as Response;
  });
};

beforeEach(() => apiRequest.mockReset());
afterEach(cleanup);

const openAnalytics = async () => {
  await screen.findByText('Analytics');
  fireEvent.click(screen.getByText('Analytics'));
};

describe('the Analytics tab says what it measured', () => {
  it('says nothing when the figures cover every card the board read', async () => {
    serve([task({ taskId: 't-1' }), task({ taskId: 't-2', moduleType: 'cmc' })]);
    render(<TaskBoard {...SHELL} />);
    await openAnalytics();
    await waitFor(() => expect(screen.getByText('By module')).toBeDefined());
    expect(screen.queryByTestId('tb-analytics-scope')).toBeNull();
  });

  it('names the cancelled cards it did not count, with no filter in play', async () => {
    /* `list` drops cancelled rows unconditionally, so `shown === total` is NOT
       the unfiltered case and the tab cannot stay silent on the strength of
       "no filter is on". */
    serve([
      task({ taskId: 't-1' }),
      task({ taskId: 't-2' }),
      task({ taskId: 't-3', status: 'cancelled' }),
    ]);
    render(<TaskBoard {...SHELL} />);
    await openAnalytics();
    const note = await screen.findByTestId('tb-analytics-scope');
    expect(note.textContent ?? '').toMatch(/cover 2 of the 3 cards on the board/);
    expect(note.textContent ?? '').toMatch(/1 cancelled card is not counted/);
  });

  it('names the filter when one narrows what was measured', async () => {
    /* THE REGRESSION. Before this, selecting a module left every figure under
       its bare label — "Team productivity" over one module's work, read as the
       team's. */
    serve([
      task({ taskId: 't-1', moduleType: 'clinical' }),
      task({ taskId: 't-2', moduleType: 'cmc' }),
      task({ taskId: 't-3', moduleType: 'cmc' }),
    ]);
    render(<TaskBoard {...SHELL} />);
    await openAnalytics();
    await waitFor(() => expect(screen.getByText('By module')).toBeDefined());
    expect(screen.queryByTestId('tb-analytics-scope')).toBeNull();

    const moduleSelect = document.querySelector('select[aria-label="Module"], select#tb-mod') as HTMLSelectElement | null;
    const select = moduleSelect ?? Array.from(document.querySelectorAll('select')).find(
      (el) => Array.from(el.options).some((o) => o.value === 'cmc'),
    ) as HTMLSelectElement | undefined;
    expect(select, 'the board offers a module filter').toBeDefined();
    fireEvent.change(select!, { target: { value: 'cmc' } });

    const note = await screen.findByTestId('tb-analytics-scope');
    expect(note.textContent ?? '').toMatch(/cover the 2 of 3 cards this board is filtered to/);
    expect(note.textContent ?? '').toMatch(/module “cmc”/);
    expect(note.textContent ?? '').toMatch(/Clear the filters to measure the whole board/);
  });
});

describe('taskAnalyticsScope, over the cases a board cannot easily reach', () => {
  const unfiltered = { project: 'all', moduleType: 'all', mineOnly: false };

  it('is silent only when the figures are the whole read', () => {
    expect(taskAnalyticsScope({ shown: 12, total: 12, filters: unfiltered })).toBeNull();
    // An empty board measured as empty is still a complete measurement.
    expect(taskAnalyticsScope({ shown: 0, total: 0, filters: unfiltered })).toBeNull();
  });

  it('pluralises the cancelled clause', () => {
    expect(taskAnalyticsScope({ shown: 9, total: 10, filters: unfiltered }))
      .toMatch(/1 cancelled card is not counted/);
    expect(taskAnalyticsScope({ shown: 8, total: 10, filters: unfiltered }))
      .toMatch(/2 cancelled cards are not counted/);
  });

  it('lists several filters as prose, in the order the controls appear', () => {
    const said = taskAnalyticsScope({
      shown: 1, total: 40,
      filters: { project: 'Aurora IND', moduleType: 'cmc', mineOnly: true },
    })!;
    expect(said).toMatch(/project “Aurora IND”, module “cmc” and assigned to you/);
    expect(said).toMatch(/the 1 of 40 cards/);
  });

  it('speaks when a filter matched nothing — the case most easily read as a clear board', () => {
    /* "Blocked: 0" and "Open tasks: 0" over a filter that matched no card is
       the reading this sentence exists to prevent. */
    const said = taskAnalyticsScope({
      shown: 0, total: 40, filters: { ...unfiltered, moduleType: 'cmc' },
    })!;
    expect(said).toMatch(/the 0 of 40 cards/);
    expect(said).toMatch(/module “cmc”/);
  });

  it('never reports a negative exclusion if the counts disagree', () => {
    /* `shown > total` should not happen, but a sentence reading "-3 cancelled
       cards" would be worse than the silence it replaced. */
    expect(taskAnalyticsScope({ shown: 11, total: 10, filters: unfiltered })).toBeNull();
  });
});
