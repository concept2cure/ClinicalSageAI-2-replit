/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import { getSurface } from '@shared/constants/ui-surface-registry';
const request = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: { id: '7', organizationId: '7', permissions: ['governed:write'] } }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: { id: 7 }, currentClientWorkspace: { id: '21', organizationId: '7' } }) }));
import { TaskBoard } from '../surfaces/TaskBoard';

const VERSION = 'a'.repeat(64);
const TASK = { taskId: 'TASK-HANDOFF', title: 'Review the evidence package', project: '12', moduleType: 'clinical', taskType: 'review',
  status: 'review', priority: 'high', assignee: '8', assignedBy: '7', progress: 60, impactScore: null,
  due: '', dueDateIso: null, phase: null, criticalPath: false, regulatoryImpact: false, blocked: false,
  approvalRequired: true, approvalStatus: 'pending', approvalHistory: [], dependsOn: [], blocks: [], comments: 0, attachments: 0, source: 'unified' };
const CANDIDATES = [{ id: '8', name: 'Alex', label: 'Alex · Account #8' }, { id: '9', name: 'Alex', label: 'Alex · Account #9' }];
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
let board = [TASK];
beforeEach(() => {
  board = [TASK]; auth.user = { id: '7', organizationId: '7', permissions: ['governed:write'] };
  setAuthToken(`x.${btoa(JSON.stringify({ userId: 7, organizationId: 7 }))}.x`);
  window.history.replaceState(null, '', '/concept2cure/tasks');
  request.mockImplementation(async (method: string, path: string, body: Record<string, unknown>) => {
    if (path === '/api/task-management/board') return ok({ data: board });
    if (path === '/api/projects') return ok([{ id: 12, name: 'Programme A' }]);
    if (path === '/api/task-management/assignees') return ok({ data: CANDIDATES });
    if (path.startsWith('/api/task-management/assignees?')) return ok({ success: true, data: CANDIDATES, total: 2,
      meta: { organizationId: 7, actorUserId: 7, taskId: TASK.taskId, projectId: 12, clientWorkspaceId: 21,
        status: TASK.status, canAssign: true, assigneeId: Number(board[0].assignee), assignmentVersion: board[0].assignee === '8' ? VERSION : 'b'.repeat(64) } });
    if (method === 'PATCH') {
      board = [{ ...TASK, assignee: String(body.assigneeId) }];
      return ok({ success: true, data: { taskId: TASK.taskId, organizationId: 7, actorUserId: 7, projectId: 12,
        clientWorkspaceId: 21, status: TASK.status, assigneeId: body.assigneeId, assigneeName: 'Alex', assignedBy: 7,
        assignedAt: '2026-10-21T12:00:00.000Z', assignmentVersion: 'b'.repeat(64) } });
    }
    return ok({ data: [] });
  });
});
afterEach(() => { cleanup(); clearAuthToken(); request.mockReset(); window.history.replaceState(null, '', '/'); });
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <TaskBoard surface={getSurface('tasks')!} segment="biopharma" onAsk={vi.fn()} onNav={vi.fn()} />
</QueryClientProvider>);

describe('TaskBoard named handoff in the existing detail', () => {
  it('chooses a real account with a human reason and preserves its approval/progress fields', async () => {
    mount(); fireEvent.click(await screen.findByRole('button', { name: `Open ${TASK.title}` }));
    const detail = await screen.findByRole('dialog', { name: 'Task detail' });
    fireEvent.click(within(detail).getByRole('button', { name: 'Change assignee' }));
    const person = await within(detail).findByLabelText('New assignee');
    expect(person.textContent).toContain('Alex · Account #9');
    const save = within(detail).getByRole('button', { name: 'Save assignment' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(person, { target: { value: '9' } });
    fireEvent.change(within(detail).getByLabelText('Reason for assignment'), { target: { value: '  Cover the sponsor review handoff  ' } });
    fireEvent.click(save);
    await waitFor(() => expect(request).toHaveBeenCalledWith('PATCH', `/api/tasks/tasks/${TASK.taskId}`, {
      action: 'assign', assigneeId: 9, expectedAssigneeId: 8, expectedVersion: VERSION, reason: 'Cover the sponsor review handoff',
    }, expect.objectContaining({ 'x-organization-id': '7', 'x-client-id': '21' })));
    await within(detail).findByText(/Assignment saved/);
    expect(board[0]).toMatchObject({ assignee: '9', status: 'review', progress: 60, approvalRequired: true,
      approvalStatus: 'pending', approvalHistory: [] });
    expect(request.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(1);
  });
});
