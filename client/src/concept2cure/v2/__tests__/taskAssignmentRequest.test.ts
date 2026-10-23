/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import type { TaskAssignmentCommand, TaskAssignmentMeta, TaskAssignmentScope } from '@shared/task-assignment';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: request }));
import { ApiRequestError } from '@/lib/queryClient';
import { autoAssignSavedTask, loadTaskAssignment, saveTaskAssignment, taskAssignmentHeaders } from '../surfaces/taskAssignmentRequest';
const VERSION = 'a'.repeat(64);
const scope: TaskAssignmentScope = { taskId: 'TASK-1', projectId: 12, actorUserId: 7, organizationId: 4, clientWorkspaceId: 21 };
const meta: TaskAssignmentMeta = { ...scope, clientWorkspaceId: 21, assigneeId: 8, assignmentVersion: VERSION, status: 'review', canAssign: true };
const command: TaskAssignmentCommand = { action: 'assign', assigneeId: 9, expectedAssigneeId: 8, expectedVersion: VERSION, reason: 'Sponsor handoff' };
const receipt = () => ({ ...scope, status: 'review', assigneeId: 9, assigneeName: 'Alex', assignedBy: 7,
  assignedAt: '2026-10-21T12:00:00.000Z', assignmentVersion: 'b'.repeat(64) });
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body }) as Response;
const token = (actor = 7, org = 4) => `x.${btoa(JSON.stringify({ userId: actor, organizationId: org }))}.x`;
beforeEach(() => setAuthToken(token()));
afterEach(() => { clearAuthToken(); request.mockReset(); });
describe('scoped task assignment transport', () => {
  it('writes only assignment fields with its exact optimistic token and captured scope', async () => {
    request.mockResolvedValue(reply({ success: true, data: receipt() }));
    expect((await saveTaskAssignment(scope, meta, command, () => true)).kind).toBe('confirmed');
    expect(request).toHaveBeenCalledWith('PATCH', '/api/tasks/tasks/TASK-1', command, {
      Authorization: `Bearer ${token()}`, 'x-organization-id': '4', 'x-client-id': '21',
    });
  });
  it.each([
    new Error('connection lost'), new ApiRequestError('Unknown', 500, { error: 'OUTCOME_UNKNOWN' }),
  ])('treats lost transport/COMMIT as unconfirmed and sends no blind retry', async error => {
    request.mockRejectedValue(error);
    const answer = await saveTaskAssignment(scope, meta, command, () => true);
    expect(answer.kind).toBe('unconfirmed'); expect('message' in answer && answer.message).toMatch(/Refresh assignment before retrying/);
    expect(request).toHaveBeenCalledOnce();
  });
  it('retains the atomic audit-failure refusal rather than claiming a saved assignment', async () => {
    request.mockRejectedValue(new ApiRequestError('Audit refused', 500, { error: 'AUDIT_WRITE_FAILED', message: 'The audit failed, so nothing was changed.' }));
    expect(await saveTaskAssignment(scope, meta, command, () => true)).toEqual({ kind: 'refused', message: 'The audit failed, so nothing was changed.' });
  });
  it.each([null, { ...receipt(), assigneeId: 8 }, { ...receipt(), status: 'pending' }, { ...receipt(), assignmentVersion: VERSION },
    { ...receipt(), clientWorkspaceId: null }])('does not confirm an ambiguous successful body', async data => {
    request.mockResolvedValue(reply({ success: true, data }));
    expect((await saveTaskAssignment(scope, meta, command, () => true)).kind).toBe('unconfirmed');
  });
  it('keeps read failure distinct from an empty eligible roster', async () => {
    request.mockResolvedValue(reply({ success: true, data: [], total: 0 }));
    expect((await loadTaskAssignment(scope, () => true)).kind).toBe('unavailable');
  });
});
describe('assignment ownership and existing automatic path', () => {
  it('sends no request from a stale task/account/organization handler', async () => {
    expect((await saveTaskAssignment(scope, meta, command, () => false)).kind).toBe('retired');
    setAuthToken(token(9)); expect((await loadTaskAssignment(scope, () => true)).kind).toBe('retired');
    setAuthToken(token(7, 5)); expect((await saveTaskAssignment(scope, meta, command, () => true)).kind).toBe('retired');
    expect(request).not.toHaveBeenCalled();
  });
  it('discards a late old-task receipt', async () => {
    let finish!: (response: Response) => void; let current = true;
    request.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = saveTaskAssignment(scope, meta, command, () => current);
    current = false; finish(reply({ success: true, data: receipt() }));
    expect((await pending).kind).toBe('retired');
  });
  it('reaches the existing automatic endpoint with the fresh scoped expected assignment', async () => {
    request.mockResolvedValue(reply({ success: true, count: 1, data: [{ taskId: 'TASK-1', assigneeId: 9, assignedTo: 'Alex' }] }));
    expect(await autoAssignSavedTask(meta, () => taskAssignmentHeaders(scope, () => true), () => true)).toEqual({ kind: 'confirmed', assigneeId: 9 });
    expect(request).toHaveBeenCalledWith('POST', '/api/tasks/tasks/auto-assign', { taskIds: ['TASK-1'], expectedAssignments: [
      { taskId: 'TASK-1', expectedAssigneeId: 8, expectedVersion: VERSION },
    ] }, expect.objectContaining({ 'x-client-id': '21' }));
  });
  it('does not turn an empty batch or a different task receipt into assignment success', async () => {
    request.mockResolvedValue(reply({ success: true, count: 0, data: [] }));
    expect((await autoAssignSavedTask(meta, () => ({}), () => true)).kind).toBe('refused');
    request.mockResolvedValue(reply({ success: true, count: 1, data: [{ taskId: 'TASK-OTHER', assigneeId: 9 }] }));
    expect((await autoAssignSavedTask(meta, () => ({}), () => true)).kind).toBe('unconfirmed');
  });
});
