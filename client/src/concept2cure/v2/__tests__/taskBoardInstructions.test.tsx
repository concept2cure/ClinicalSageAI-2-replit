// @vitest-environment jsdom
/**
 * The task drawer shows the instructions the task was created with
 * (QA 2026-10-08, browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
 *
 * Assign review records the author's instructions to the reviewer as the task
 * description ("Please review 2.5 Clinical Overview …"). The board read model
 * never carried the field and the drawer never rendered it, so the reviewer
 * opened the task and could not read what they were asked to check.
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
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: '2', name: 'Sarah Chen', email: 'sarah@example.test' } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

const INSTRUCTIONS = 'Please review 2.5 Clinical Overview against the cited sources and the SAP.';
const TASK = {
  taskId: 'TASK-18', title: 'Review: QA J4 2.5 Clinical Overview', project: '', moduleType: 'Authoring', taskType: 'review',
  status: 'in-progress', priority: 'medium', assignee: '2', assignedBy: '4', progress: 10, impactScore: null,
  due: '—', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: true, blocked: false,
  approvalRequired: false, approvalStatus: 'not_started', approvalHistory: [], dependsOn: [], blocks: [],
  comments: 0, attachments: 0, source: 'unified', createdAt: '2026-10-08T01:20:00Z',
};

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
let board: unknown[] = [];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_method: string, rawPath: unknown) => {
    const path = String(rawPath ?? '');
    if (path === '/api/task-management/board') return ok({ data: board });
    if (path === '/api/task-management/assignees') return ok({ success: true, data: [{ id: '2', name: 'Sarah Chen' }, { id: '4', name: 'Emily Watson' }] });
    return ok({ data: [] });
  });
});
afterEach(() => cleanup());

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />
    </QueryClientProvider>,
  );

describe('the task drawer shows the instructions', () => {
  it('renders the description the task was created with', async () => {
    board = [{ ...TASK, description: INSTRUCTIONS }];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(detail).getByText(INSTRUCTIONS)).toBeTruthy();
    expect(within(detail).getByText('Instructions')).toBeTruthy();
  });

  it('shows no instructions section for a task created without any', async () => {
    board = [{ ...TASK, description: null }];
    mount();
    fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    expect(within(detail).queryByText('Instructions')).toBeNull();
  });
});
