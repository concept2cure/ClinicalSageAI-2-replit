// @vitest-environment jsdom
/**
 * TaskBoard offers task writes only to a role the server lets write.
 *
 * Every task write is refused to an organisation viewer by requireEditorAccess.
 * The board offered the viewer New task, Start workflow, move, archive and sign
 * anyway, and refused each one only after the click (T2's UI half, review of
 * 2026-09-22, re-verified 2026-09-24). The session now carries `governed:write`
 * for exactly the roles the server admits (shared/constants/permissions.ts).
 *
 * Three states: a writer sees the controls; a viewer sees none and is told why;
 * a user object with no permissions array (a session stored before the field
 * existed) is unknown and keeps the controls, because the server still refuses.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const auth = vi.hoisted(() => ({ user: {} as Record<string, unknown> }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: auth.user }) }));

import { TaskBoard } from '../surfaces/TaskBoard';

const TASK = {
  taskId: 'TASK-1', title: 'Freeze CSR shell', project: '', moduleType: 'clinical', taskType: 'authoring',
  status: 'review', priority: 'high', assignee: 'u-2', assignedBy: 'u-1', progress: 60, impactScore: null,
  due: '—', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false, blocked: false,
  approvalRequired: false, approvalStatus: null, approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0, source: 'unified', createdAt: '2026-08-01T00:00:00Z',
};
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (method !== 'GET') return ok({ success: true });
    if (path === '/api/task-management/board') return ok({ data: [TASK] });
    return ok({ data: [] });
  });
});
afterEach(cleanup);

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );

async function openDetail() {
  fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
  return screen.findByRole('dialog', { name: 'Task detail' });
}

describe('TaskBoard — write controls follow the session permission', () => {
  it('offers a viewer no task write, and says why', async () => {
    auth.user = { id: 'u-9', permissions: [] };
    mount();
    await screen.findByRole('button', { name: `Open ${TASK.title}` });
    expect(screen.queryByRole('button', { name: /New task/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Start workflow/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Advance' })).toBeNull();
    expect(screen.getByTestId('tb-view-only').textContent).toMatch(/editor role/);

    const detail = await openDetail();
    expect(within(detail).queryByRole('button', { name: /Archive/ })).toBeNull();
    expect(within(detail).queryByRole('button', { name: /Advance/ })).toBeNull();
    expect(within(detail).queryByRole('button', { name: /Move back/ })).toBeNull();
    expect(apiRequest.mock.calls.filter(([m]) => m !== 'GET')).toHaveLength(0);
  });

  it('offers a writer every control', async () => {
    auth.user = { id: 'u-1', permissions: ['governed:write'] };
    mount();
    expect(await screen.findByRole('button', { name: /New task/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start workflow/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Advance' }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('tb-view-only')).toBeNull();
    const detail = await openDetail();
    expect(within(detail).getByRole('button', { name: `Archive "${TASK.title}"` })).toBeTruthy();
    expect(within(detail).getByRole('button', { name: /Advance/ })).toBeTruthy();
  });

  it('keeps the controls when the session says nothing about permissions — the server still decides', async () => {
    auth.user = { id: 'u-1' };
    mount();
    expect(await screen.findByRole('button', { name: /New task/ })).toBeTruthy();
    expect(screen.queryByTestId('tb-view-only')).toBeNull();
  });
});
