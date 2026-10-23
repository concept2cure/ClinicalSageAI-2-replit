// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { id: '7', organizationId: 7, permissions: ['governed:write'] } }) }));
import { TaskBoard } from '../surfaces/TaskBoard';

const task = {
  taskId: 'TASK-SHAPE', title: 'Read the saved task after retry', project: '', moduleType: 'ind', taskType: '',
  status: 'pending', priority: 'high', assignee: '', assignedBy: null, progress: 0, impactScore: null,
  criticalPath: false, regulatoryImpact: false, approvalRequired: false, approvalStatus: 'not_started',
  approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified',
  due: '', dueDateIso: null, phase: null,
};
let payload: unknown;
let metadata: Record<string, unknown>;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const mount = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TaskBoard {...({ onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof TaskBoard>)} />
  </QueryClientProvider>,
);

beforeEach(() => {
  setAuthToken(`fixture.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.fixture`);
  payload = [task];
  metadata = { partial: false, unreadSources: [] };
  apiRequest.mockReset().mockImplementation(async (_method: string, path: string) => ok({
    data: path === '/api/task-management/board' ? payload : [],
    meta: path === '/api/task-management/board' ? metadata : undefined,
  }));
});
afterEach(() => { cleanup(); clearAuthToken(); });

describe('task board response shape', () => {
  it.each([
    { label: 'object', value: { unexpected: 'object' } },
    { label: 'scalar', value: 'unexpected scalar' },
    { label: 'incomplete row', value: [{ unexpected: 'row' }] },
  ])('keeps a malformed successful $label unavailable and recovers on retry', async ({ value }) => {
    payload = value;
    mount();
    expect(await screen.findByText("Couldn't load the task board")).toBeTruthy();
    expect(screen.queryByText('No tasks on the board yet')).toBeNull();
    expect(screen.queryByRole('button', { name: `Open ${task.title}` })).toBeNull();
    payload = [task];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: `Open ${task.title}` })).toBeTruthy();
    expect(screen.queryByText("Couldn't load the task board")).toBeNull();
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });

  it('keeps a valid empty array as the honest empty board', async () => {
    payload = [];
    mount();
    expect(await screen.findByText('No tasks on the board yet')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the task board")).toBeNull();
  });

  it('does not call a partial read with no readable cards an empty board', async () => {
    payload = [];
    metadata = { partial: true, unreadSources: ['unified_tasks'] };
    mount();
    expect(await screen.findByText("Couldn't load the task board")).toBeTruthy();
    expect(screen.queryByText('No tasks on the board yet')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/incomplete.*board's own tasks/i);
    payload = [task];
    metadata = { partial: false, unreadSources: [] };
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: `Open ${task.title}` })).toBeTruthy();
  });

  it('renders a valid saved task', async () => {
    mount();
    expect(await screen.findByRole('button', { name: `Open ${task.title}` })).toBeTruthy();
    expect(screen.queryByText("Couldn't load the task board")).toBeNull();
  });
});
