// @vitest-environment jsdom
/**
 * AnA drives the wave-2 screens — wiring proof against the REAL surfaces for
 * the task board, the review board, and the intelligence browser (the three
 * wave-2 surfaces with the cheapest honest harnesses; the other five run the
 * same bus pattern and are covered by their surfaces' behavioral suites plus
 * the shared bus/reducer tests).
 *
 * What these tests pin per surface:
 *   - mounting registers the registry-declared handlers under the surface's
 *     OWN v2 id (for the task board that means the 'tasking' → 'tasks' ALIAS
 *     path end-to-end: a nav-target-addressed directive operates the surface);
 *   - a validated directive genuinely drives the surface's own state — the
 *     same state the human's controls drive — asserted on the real DOM;
 *   - misses and busy states are honest refusals, never guesses or silent
 *     no-ops;
 *   - a not-ready surface HOLDS the directive and applies it when its read
 *     lands (the navigate→act gap).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 7, firstName: 'Ada' } }),
}));
const catalogState = vi.hoisted(() => ({
  current: { data: undefined as unknown, isLoading: true, isError: false },
}));
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => catalogState.current,
}));

import { Review } from '../surfaces/Review';
import { TaskBoard } from '../surfaces/TaskBoard';
import { GlobalRiBrowser } from '../surfaces/Surfaces';
import {
  __resetSurfaceActionBus,
  applySurfaceAction,
  registeredSurfaceId,
} from '../surfaceActions';
import { resolveSurfaceAction } from '@shared/navigation/surface-actions';

function directive(actionId: string, params: Record<string, unknown> = {}) {
  const res = resolveSurfaceAction(actionId, params);
  if (!res.ok) throw new Error(`fixture action ${actionId} does not resolve: ${res.error}`);
  return res.directive;
}

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data } as Response;
}

afterEach(() => {
  cleanup();
  __resetSurfaceActionBus();
});

/* ── Review ──────────────────────────────────────────────────────────────── */

const REVIEW_BOARD = {
  queue: [
    {
      id: '101', doc: 'Clinical Overview §2.5', prog: 'NDA 200100', pid: '55', secKey: '2.5',
      reviewer: 'Dana Chen', role: 'Clinical', due: 'Today', tone: 'err', state: 'in-review',
      comments: 1, esig: 'pending', conf: null, prov: 'v3', passage: 'The pivotal study met its endpoint.',
    },
    {
      id: '102', doc: 'Nonclinical Overview §2.4', prog: 'NDA 200100', pid: '55', secKey: '2.4',
      reviewer: 'Sam Ortiz', role: 'Nonclinical', due: 'Friday', tone: 'ok', state: 'approved',
      comments: 0, esig: 'signed', conf: null, prov: 'v2', passage: 'No findings of concern.',
    },
  ],
  workflows: {},
  thread: [],
  meta: { scope: 'all', total: 2, generatedAt: '2026-08-24T00:00:00Z' },
};

describe('Review — AnA operates the real board', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path === '/api/review/board') return ok({ success: true, data: REVIEW_BOARD });
      return ok({ success: true, data: { threads: [], tasks: [], permissions: {} } });
    });
  });

  const props = () =>
    ({ surface: { id: 'review', label: 'Review' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

  it('registers under "review", and select-document drives the SAME selection the row click drives', async () => {
    render(<Review {...props()} />);
    await screen.findAllByText('Clinical Overview §2.5');
    expect(registeredSurfaceId()).toBe('review');

    let outcome: unknown;
    act(() => {
      outcome = applySurfaceAction(directive('review.select-document', { document: 'nonclinical' }), vi.fn());
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Selected Nonclinical Overview §2.4' });
    await waitFor(() => {
      const row = screen
        .getAllByRole('button')
        .find((b) => b.className.includes('lrow') && b.textContent?.includes('Nonclinical Overview'));
      expect(row?.getAttribute('data-on')).toBe('true');
    });
  });

  it('open-queue jumps to the next document still awaiting a decision', async () => {
    render(<Review {...props()} />);
    await screen.findAllByText('Clinical Overview §2.5');
    let outcome: unknown;
    act(() => {
      outcome = applySurfaceAction(directive('review.open-queue'), vi.fn());
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Opened the queue at Clinical Overview §2.5' });
  });

  it('an unknown document is an honest refusal, never a guess', async () => {
    render(<Review {...props()} />);
    await screen.findAllByText('Clinical Overview §2.5');
    let outcome: { status: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('review.select-document', { document: 'Imaginary Dossier' }),
        vi.fn(),
      ) as { status: string; reason?: string };
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No document named');
  });
});

/* ── TaskBoard (the 'tasking' → 'tasks' alias, end to end) ──────────────── */

function taskRow(over: Record<string, unknown>) {
  return {
    taskId: 'T-0', title: 'Task', project: '31', moduleType: 'cmc', taskType: 'document',
    status: 'pending', priority: 'high', assignee: '7', assignedBy: '7', progress: 0,
    impactScore: null, criticalPath: false, regulatoryImpact: false,
    approvalRequired: false, approvalStatus: 'none', approvalHistory: [],
    dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'manual',
    due: 'Sep 1', dueDateIso: null, lifecyclePhase: null, blocked: false,
    blockedReason: null,
    ...over,
  };
}
const TASK_ROWS = [
  taskRow({ taskId: 'T-1', title: 'Draft stability summary', project: '31', moduleType: 'cmc' }),
  taskRow({
    taskId: 'T-2', title: 'Review predicate table', project: '32', moduleType: 'mdx',
    status: 'in-progress', priority: 'med', assignee: '9', due: 'Sep 3',
  }),
];
const PROJECT_OPTS = [
  { id: 31, name: 'BX-204 Oncology IND' },
  { id: 32, name: 'MD-11 510(k)' },
];

describe('TaskBoard — the aliased surface obeys nav-target-addressed directives', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, path: string) => {
      if (path.startsWith('/api/task-management/board')) return ok({ success: true, data: TASK_ROWS });
      if (path === '/api/projects') return ok(PROJECT_OPTS);
      if (path === '/api/task-management/assignees') return ok([]);
      return ok({ success: true, data: [] });
    });
  });

  const props = () =>
    ({ surface: { id: 'tasks', label: 'Tasks' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

  it('registers under "tasks"; a tasking.* directive (nav-target id) operates it through the alias', async () => {
    render(<TaskBoard {...props()} />);
    await screen.findByText('Draft stability summary');
    await waitFor(() => expect(registeredSurfaceId()).toBe('tasks'));

    let outcome: unknown;
    act(() => {
      outcome = applySurfaceAction(directive('tasking.set-view', { view: 'table' }), vi.fn());
    });
    expect(outcome).toEqual({ status: 'applied', detail: 'Switched to the table view' });
  });

  it('tasking.filter resolves programmes against the real options with honest misses', async () => {
    render(<TaskBoard {...props()} />);
    await screen.findByText('Draft stability summary');
    await waitFor(() => expect(registeredSurfaceId()).toBe('tasks'));

    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('tasking.filter', { project: 'bx-204' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toContain('BX-204 Oncology IND');
    // The board genuinely narrowed: the other programme's task is gone.
    await waitFor(() => expect(screen.queryByText('Review predicate table')).toBeNull());

    act(() => {
      outcome = applySurfaceAction(
        directive('tasking.filter', { project: 'ZZ-999' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('No programme named');
  });

  it('tasking.open-task opens the detail, and a second open is refused while it holds the canvas', async () => {
    render(<TaskBoard {...props()} />);
    await screen.findByText('Draft stability summary');
    await waitFor(() => expect(registeredSurfaceId()).toBe('tasks'));

    let outcome: { status: string; detail?: string; reason?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(
        directive('tasking.open-task', { task: 'predicate' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toContain('T-2');

    act(() => {
      outcome = applySurfaceAction(
        directive('tasking.open-task', { task: 'stability' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('task detail is open');
  });
});

/* ── Intelligence browser (retry-held apply across the catalog load) ─────── */

const CATALOG = {
  total: 3,
  anaToolCount: 3,
  groups: [
    { id: 'strategy', label: 'Strategy' },
    { id: 'quality_cmc', label: 'Quality & CMC' },
  ],
  byGroup: { strategy: 2, quality_cmc: 1 },
  capabilities: [
    { id: 'cap-1', label: 'Regulatory pathway explorer', group: 'strategy', description: '', form: [], anaTools: ['pathway_tool'], deterministic: true, routes: [], evidence: [] },
    { id: 'cap-2', label: 'Precedent scan', group: 'strategy', description: '', form: [], anaTools: [], deterministic: false, routes: [], evidence: [] },
    { id: 'cap-3', label: 'Comparability protocol scan', group: 'quality_cmc', description: '', form: [], anaTools: [], deterministic: true, routes: [], evidence: [] },
  ],
};

describe('GlobalRiBrowser — held through the catalog load, applied when it lands', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => ok({ success: true, data: {} }));
    catalogState.current = { data: undefined, isLoading: true, isError: false };
  });

  it('registers under "global-ri"; an intelligence.* directive held during loading applies on ready', async () => {
    const { rerender } = render(<GlobalRiBrowser onAsk={vi.fn()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('global-ri'));

    const deferred = vi.fn();
    let immediate: unknown;
    act(() => {
      immediate = applySurfaceAction(
        directive('intelligence.open-group', { group: 'quality_cmc' }),
        vi.fn(),
        deferred,
      );
    });
    // Mounted but the catalog has not landed: held, not failed.
    expect(immediate).toEqual({ status: 'stashed' });
    expect(deferred).not.toHaveBeenCalled();

    catalogState.current = { data: CATALOG, isLoading: false, isError: false };
    rerender(<GlobalRiBrowser onAsk={vi.fn()} />);
    await waitFor(() =>
      expect(deferred).toHaveBeenCalledWith({ status: 'applied', detail: 'Opened Quality & CMC' }),
    );
    // The surface genuinely switched groups: the group button is active.
    await waitFor(() => {
      const btn = screen
        .getAllByRole('button')
        .find((b) => b.textContent?.includes('Quality & CMC') && b.className.includes('gri-group'));
      expect(btn?.className).toContain('on');
    });
  });

  it('close-capability refuses honestly when none is open; open-capability resolves by label', async () => {
    catalogState.current = { data: CATALOG, isLoading: false, isError: false };
    render(<GlobalRiBrowser onAsk={vi.fn()} />);
    await waitFor(() => expect(registeredSurfaceId()).toBe('global-ri'));

    let outcome: { status: string; reason?: string; detail?: string } = { status: '' };
    act(() => {
      outcome = applySurfaceAction(directive('intelligence.close-capability'), vi.fn()) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toBe('No capability is open.');

    act(() => {
      outcome = applySurfaceAction(
        directive('intelligence.open-capability', { capability: 'precedent' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('applied');
    expect(outcome.detail).toBe('Opened Precedent scan');

    // Now a group switch is refused — the open capability's form would be lost.
    act(() => {
      outcome = applySurfaceAction(
        directive('intelligence.open-group', { group: 'strategy' }),
        vi.fn(),
      ) as typeof outcome;
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain('capability detail is open');
  });
});
