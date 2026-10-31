// @vitest-environment jsdom
/**
 * TaskBoard — "Workload is balanced across the team." is a measurement, and
 * must not be printed over a board with no assigned open work.
 *
 * The lead's body fell through to that sentence whenever `heaviest` was
 * undefined, i.e. the filter matched zero tasks: absence of workload data
 * presented as a measured balance. Revert-proven: fails with the fall-through
 * restored.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Tester', email: 't@example.com' } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

const text = () => document.body.textContent ?? '';

let board: unknown[];
let roster: unknown[];
const OPEN = (n: number) => Array.from({ length: n }, (_, i) => ({
  taskId: `t-open-${i}`, title: `Open task ${i}`, project: '', moduleType: 'clinical', taskType: 'review',
  status: 'pending', priority: 'medium', assignee: 'u-2', assignedBy: 'u-1', progress: 0, impactScore: null,
  due: null, criticalPath: false, blocked: false, blockedReason: null, dependsOn: [], approvalHistory: [], blocks: [], createdAt: '2026-08-01T00:00:00Z',
}));

beforeEach(() => {
  apiRequest.mockReset();
  // A board with work on it — all of it completed — so the lead renders but
  // there is no open assigned work to be "balanced".
  const DONE = {
    taskId: 't-1', title: 'Close out CSR appendix', project: '', moduleType: 'clinical', taskType: 'authoring',
    status: 'completed', priority: 'medium', assignee: 'u-2', assignedBy: 'u-1', progress: 100, impactScore: null,
    due: null, criticalPath: false, blocked: false, blockedReason: null, dependsOn: [], approvalHistory: [], blocks: [], createdAt: '2026-08-01T00:00:00Z',
  };
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    const data = path === '/api/task-management/board' ? board
      : path === '/api/task-management/assignees' ? roster : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
  board = [DONE];
  roster = [{ id: 'u-1', name: 'Tester' }, { id: 'u-2', name: 'Rae Okafor' }];
});
afterEach(() => cleanup());

describe('TaskBoard — workload honesty', () => {
  it('does not call a board with no open assigned work a balanced team', async () => {
    render(<TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />);
    await waitFor(() => expect(text()).toMatch(/No open work is assigned on this board/));
    expect(text()).not.toMatch(/Workload is balanced across the team/);
  });

  /* 2026-10-31 client demo: "JM Smith is the busiest at 11 open tasks —
     workload-balanced auto-assign can spread the next batch", over a roster of
     one. Busiest, balanced and rebalance are claims about a team. */
  it('makes no workload claim over a roster of one person', async () => {
    board = OPEN(11);
    roster = [{ id: 'u-2', name: 'Rae Okafor' }];
    render(<TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />);
    await waitFor(() => expect(text()).toMatch(/Open task 10/));
    expect(text()).not.toMatch(/busiest|most open work|balanced|rebalance|no workload to balance/i);
  });

  it('names who has the most open work when the roster has more than one person', async () => {
    board = OPEN(4);
    render(<TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />);
    await waitFor(() => expect(text()).toMatch(/Rae Okafor has the most open work, 4 tasks/));
  });
});
