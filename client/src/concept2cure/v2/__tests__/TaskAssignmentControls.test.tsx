/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import type { TaskAssignmentRoster } from '@shared/task-assignment';
const request = vi.hoisted(() => vi.fn());
const tenant = vi.hoisted(() => ({ currentOrganization: { id: 4 }, currentClientWorkspace: { id: '21', organizationId: '4' } }));
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => tenant }));
import { TaskAssignmentControls } from '../surfaces/TaskAssignmentControls';
const VERSION = 'a'.repeat(64);
const token = (actor = 7, org = 4) => `x.${btoa(JSON.stringify({ userId: actor, organizationId: org }))}.x`;
const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
function roster(): TaskAssignmentRoster {
  return { success: true, data: [{ id: '8', name: 'Alex', label: 'Alex · Account #8' }, { id: '9', name: 'Alex', label: 'Alex · Account #9' }], total: 2,
    meta: { taskId: 'TASK-1', projectId: 12, actorUserId: 7, organizationId: 4, clientWorkspaceId: 21,
      status: 'review', canAssign: true, assigneeId: 8, assignmentVersion: VERSION } };
}
const saved = () => ({ taskId: 'TASK-1', projectId: 12, actorUserId: 7, organizationId: 4, clientWorkspaceId: 21,
  status: 'review', assigneeId: 9, assigneeName: 'Alex', assignedBy: 7, assignedAt: '2026-10-21T12:00:00.000Z', assignmentVersion: 'b'.repeat(64) });
const changed = vi.fn(); const blocked = vi.fn();
const props = () => ({ taskId: 'TASK-1', projectId: 12, status: 'review', actorScope: { userId: '7', organizationId: '4' },
  isCurrent: () => true, onSaved: changed, onBlockedChange: blocked });
let current: TaskAssignmentRoster;
beforeEach(() => {
  current = roster(); changed.mockReset(); blocked.mockReset(); setAuthToken(token());
  tenant.currentOrganization = { id: 4 }; tenant.currentClientWorkspace = { id: '21', organizationId: '4' };
  request.mockImplementation(async () => reply(current));
});
afterEach(() => { cleanup(); clearAuthToken(); request.mockReset(); });
async function openManual() {
  fireEvent.click(screen.getByRole('button', { name: 'Change assignee' }));
  return screen.findByLabelText('New assignee');
}
async function submitManual() {
  const select = await openManual(); fireEvent.change(select, { target: { value: '9' } });
  fireEvent.change(screen.getByLabelText('Reason for assignment'), { target: { value: '  Sponsor handoff  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save assignment' }));
}

describe('named task handoff controls', () => {
  it('loads lazily, disambiguates accounts, prevents no-op/invalid reasons and records exact saved facts', async () => {
    request.mockImplementation(async (method: string) => {
      if (method === 'PATCH') { current.meta.assigneeId = 9; current.meta.assignmentVersion = 'b'.repeat(64); return reply({ success: true, data: saved() }); }
      return reply(current);
    });
    render(<TaskAssignmentControls {...props()} />); expect(request).not.toHaveBeenCalled();
    const select = await openManual();
    expect(screen.getByText('Alex · Account #8', { exact: true })).toBeTruthy();
    expect(select.textContent).toContain('Alex · Account #9'); expect(select.textContent).not.toContain('Alex · Account #8');
    const save = screen.getByRole('button', { name: 'Save assignment' }) as HTMLButtonElement;
    fireEvent.change(select, { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Reason for assignment'), { target: { value: '  x ' } }); expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for assignment'), { target: { value: 'x'.repeat(1001) } }); expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for assignment'), { target: { value: '  Sponsor handoff  ' } }); fireEvent.click(save);
    await screen.findByText('Assignment saved.');
    expect(request).toHaveBeenCalledWith('PATCH', '/api/tasks/tasks/TASK-1', { action: 'assign', assigneeId: 9,
      expectedAssigneeId: 8, expectedVersion: VERSION, reason: 'Sponsor handoff' }, expect.objectContaining({ 'x-client-id': '21' }));
    expect(changed).toHaveBeenCalledOnce();
    expect(document.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-21T12:00:00.000Z');
    await waitFor(() => expect(request.mock.calls.filter(([method]) => method === 'GET')).toHaveLength(2));
  });

  it('keeps an unresolved assignee account reference distinct from Unassigned', async () => {
    current.meta.assigneeId = 99; render(<TaskAssignmentControls {...props()} />); await openManual();
    expect(screen.getByText('Account #99', { exact: true })).toBeTruthy();
    expect(screen.queryByText('Unassigned', { exact: true })).toBeNull();
  });

  it('distinguishes a verified empty directory and denied reassignment', async () => {
    current.data = []; current.total = 0;
    const view = render(<TaskAssignmentControls {...props()} />); await openManual();
    expect(screen.getByText('No other eligible colleagues are available for this task.')).toBeTruthy();
    current.meta.canAssign = false;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh assignment' }));
    await screen.findByText(/This task cannot currently be reassigned/);
    expect(screen.queryByLabelText('New assignee')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auto-assign task' })).toBeNull();
    view.unmount();
  });

  it('renders unread or wrong-task metadata as unavailable instead of empty candidates', async () => {
    request.mockResolvedValue(reply({ ...current, meta: { ...current.meta, taskId: 'TASK-OTHER' } }));
    render(<TaskAssignmentControls {...props()} />); fireEvent.click(screen.getByRole('button', { name: 'Change assignee' }));
    await screen.findByText("Couldn't load task assignment");
    expect(screen.queryByText('No other eligible colleagues are available for this task.')).toBeNull();
    expect(screen.queryByLabelText('New assignee')).toBeNull();
  });
});

describe('assignment outcome and scope protection', () => {
  it('blocks overlapping named/automatic saves and requires a read after an unknown outcome', async () => {
    let fail!: (error: Error) => void;
    request.mockImplementation((method: string) => method === 'PATCH' ? new Promise((_resolve, reject) => { fail = reject; }) : Promise.resolve(reply(current)));
    render(<TaskAssignmentControls {...props()} />); await submitManual();
    expect((screen.getByRole('button', { name: 'Auto-assign task' }) as HTMLButtonElement).disabled).toBe(true);
    expect(request.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(1);
    current.meta.assigneeId = 9; current.meta.assignmentVersion = 'b'.repeat(64);
    await act(async () => fail(new Error('lost connection after write')));
    await screen.findByText(/Could not confirm the assignment\. Refresh assignment before retrying/);
    expect((screen.getByRole('button', { name: 'Auto-assign task' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh assignment' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Auto-assign task' }) as HTMLButtonElement).disabled).toBe(false));
    expect(request.mock.calls.filter(([method]) => method !== 'GET')).toHaveLength(1);
  });

  it('does not send an old handler after the token changes', async () => {
    render(<TaskAssignmentControls {...props()} />); const person = await openManual();
    fireEvent.change(person, { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Reason for assignment'), { target: { value: 'Sponsor handoff' } });
    setAuthToken(token(9)); fireEvent.click(screen.getByRole('button', { name: 'Save assignment' }));
    await screen.findByText(/task, account or workspace changed/);
    expect(request.mock.calls.some(([method]) => method !== 'GET')).toBe(false);
  });

  it('discards a late old-task save without changing the newly selected task', async () => {
    let finish!: (response: Response) => void;
    request.mockImplementation((method: string) => method === 'PATCH' ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(reply(current)));
    const view = render(<TaskAssignmentControls {...props()} />); await submitManual();
    view.rerender(<TaskAssignmentControls {...props()} taskId="TASK-2" />);
    expect(screen.queryByLabelText('Reason for assignment')).toBeNull();
    await act(async () => finish(reply({ success: true, data: saved() })));
    expect(changed).not.toHaveBeenCalled(); expect(screen.queryByText('Assignment saved.')).toBeNull();
  });

  it('does not carry an automatic assignment intent into a different selected workspace', async () => {
    let finish!: (response: Response) => void;
    request.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const view = render(<TaskAssignmentControls {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Auto-assign task' }));
    tenant.currentClientWorkspace = { id: '22', organizationId: '4' };
    current.meta.clientWorkspaceId = 22; request.mockResolvedValue(reply(current));
    view.rerender(<TaskAssignmentControls {...props()} />);
    await screen.findByLabelText('New assignee');
    await act(async () => finish(reply(roster())));
    expect(request.mock.calls.some(([method]) => method === 'POST')).toBe(false);
    expect(request.mock.calls.at(-1)?.[3]).toEqual(expect.objectContaining({ 'x-client-id': '22' }));
  });

  it.each([{ status: 'completed' }, { status: 'cancelled' }, { readOnly: true }, { actorScope: null }])('offers no assignment operation for %j', over => {
    render(<TaskAssignmentControls {...props()} {...over} />);
    expect(screen.queryByRole('button')).toBeNull(); expect(request).not.toHaveBeenCalled();
  });
});
