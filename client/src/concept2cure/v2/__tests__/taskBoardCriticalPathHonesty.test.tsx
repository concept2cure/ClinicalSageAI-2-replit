// @vitest-environment jsdom
/**
 * TaskBoard — the "Critical path" view says what it is.
 *
 * Its header read "computed from the taskDependencies DAG (getCriticalPath)".
 * No such computation runs: the view lists the tasks a person flagged
 * critical-path and orders them by their dependencies; nothing weighs
 * durations or finds a longest path, and getCriticalPath has no client caller.
 * The header also put two code identifiers in front of the user. Found by the
 * 2026-09-24 re-baseline.
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
  useAuth: () => ({ user: { id: 'u-1', name: 'Tester', email: 't@example.com' } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

const task = (taskId: string, title: string, dependsOn: string[]) => ({
  taskId, title, project: '', moduleType: 'clinical', taskType: 'authoring',
  status: 'pending', priority: 'high', assignee: 'u-2', assignedBy: 'u-1', progress: 0, impactScore: null,
  due: null, criticalPath: true, blocked: false, blockedReason: null, dependsOn, approvalHistory: [], blocks: [],
  createdAt: '2026-08-01T00:00:00Z',
});

beforeEach(() => {
  apiRequest.mockReset();
  // Returned dependent-first, so the order on screen has to come from dependsOn.
  const board = [task('t-b', 'Write the CSR synopsis', ['t-a']), task('t-a', 'Lock the SAP', [])];
  apiRequest.mockImplementation(async (_m: string, rawPath: unknown) => {
    const data = String(rawPath ?? '') === '/api/task-management/board' ? board : [];
    return { ok: true, status: 200, json: async () => ({ data }) } as Response;
  });
});
afterEach(() => cleanup());

describe('TaskBoard — critical path view', () => {
  it('describes a hand-marked list in dependency order, not a computed path', async () => {
    render(<TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />);
    await waitFor(() => expect(document.body.textContent).toMatch(/Lock the SAP/));
    fireEvent.click(screen.getByRole('button', { name: 'Critical path' }));
    const header = document.querySelector('.tb-path-h')?.textContent ?? '';
    expect(header).not.toMatch(/computed/i);
    expect(header).not.toMatch(/getCriticalPath|taskDependencies/);
    expect(header).toMatch(/2 tasks marked critical-path/);
    expect(header).toMatch(/dependency order/);
    const rows = Array.from(document.querySelectorAll('.tb-path-t')).map((n) => n.textContent ?? '');
    expect(rows[0]).toMatch(/Lock the SAP/);
    expect(rows[1]).toMatch(/Write the CSR synopsis/);
  });
});
