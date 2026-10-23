import { apiRequest, ApiRequestError, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import {
  isTaskAssignmentRoster, isTaskAssignmentResult, taskAssignmentId,
  type TaskAssignmentCommand, type TaskAssignmentMeta, type TaskAssignmentResult,
  type TaskAssignmentRoster, type TaskAssignmentScope,
} from '@shared/task-assignment';

export type AssignmentFailure = { kind: 'unavailable' | 'refused' | 'unconfirmed' | 'retired'; message: string };
export type AssignmentRead = { kind: 'confirmed'; data: TaskAssignmentRoster } | AssignmentFailure;
export type AssignmentWrite = { kind: 'confirmed'; data: TaskAssignmentResult } | AssignmentFailure;
export type AutomaticAssignmentAnswer = { kind: 'confirmed'; assigneeId: number } | AssignmentFailure;
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function taskAssignmentHeaders(scope: TaskAssignmentScope, isCurrent: () => boolean): Record<string, string> | null {
  if (!isCurrent()) return null;
  try {
    const headers = capturedActorHeaders({ userId: scope.actorUserId, organizationId: scope.organizationId });
    if (scope.clientWorkspaceId != null) headers['x-client-id'] = String(scope.clientWorkspaceId);
    return headers;
  } catch { return null; }
}
const retired = (): AssignmentFailure => ({ kind: 'retired', message: 'The task, account or workspace changed. Reopen the task before assigning it.' });

function failure(method: string, status?: number, payload?: unknown, code?: string): AssignmentFailure {
  const payloadCode = object(payload) && typeof payload.error === 'string' ? payload.error : code;
  if (method !== 'GET' && payloadCode !== 'AUDIT_WRITE_FAILED' && (!status || status >= 500)) {
    return { kind: 'unconfirmed', message: 'Could not confirm the assignment. Refresh assignment before retrying; the change may have reached the server.' };
  }
  const message = status === 401 ? 'Your session has expired. Sign in and refresh assignment before continuing.' : serverMessage(payload);
  return { kind: method === 'GET' ? 'unavailable' : 'refused', message: message ||
    (method === 'GET' ? 'Assignment options could not be verified. Retry the read.' : 'The assignment was refused. Refresh assignment to check its current state.') };
}

export async function loadTaskAssignment(scope: TaskAssignmentScope, isCurrent: () => boolean): Promise<AssignmentRead> {
  const headers = taskAssignmentHeaders(scope, isCurrent);
  if (!headers) return retired();
  try {
    const response = await apiRequest('GET', `/api/task-management/assignees?taskId=${encodeURIComponent(scope.taskId)}`, undefined, headers);
    const body = await response.json().catch(() => null) as unknown;
    if (!taskAssignmentHeaders(scope, isCurrent)) return retired();
    if (!response.ok) return failure('GET', response.status, body);
    return isTaskAssignmentRoster(body, scope) ? { kind: 'confirmed', data: body } : failure('GET');
  } catch (error) {
    if (!taskAssignmentHeaders(scope, isCurrent)) return retired();
    return error instanceof ApiRequestError ? failure('GET', error.status, error.payload, error.code) : failure('GET');
  }
}

export async function saveTaskAssignment(scope: TaskAssignmentScope, meta: TaskAssignmentMeta, command: TaskAssignmentCommand,
  isCurrent: () => boolean): Promise<AssignmentWrite> {
  const headers = taskAssignmentHeaders(scope, isCurrent);
  if (!headers) return retired();
  try {
    const response = await apiRequest('PATCH', `/api/tasks/tasks/${encodeURIComponent(scope.taskId)}`, command, headers);
    const body = await response.json().catch(() => null) as unknown;
    if (!taskAssignmentHeaders(scope, isCurrent)) return retired();
    if (!response.ok) return failure('PATCH', response.status, body);
    const result = object(body) && body.success === true ? body.data : null;
    return isTaskAssignmentResult(result, scope, command) && result.status === meta.status
      ? { kind: 'confirmed', data: result } : failure('PATCH');
  } catch (error) {
    if (!taskAssignmentHeaders(scope, isCurrent)) return retired();
    return error instanceof ApiRequestError ? failure('PATCH', error.status, error.payload, error.code) : failure('PATCH');
  }
}

/** Existing saved-task automatic assignment, with the freshly read CAS token. */
export async function autoAssignSavedTask(meta: TaskAssignmentMeta, actorHeaders: () => Record<string, string> | null,
  isCurrent: () => boolean): Promise<AutomaticAssignmentAnswer> {
  const headers = isCurrent() ? actorHeaders() : null;
  if (!headers) return retired();
  try {
    const response = await apiRequest('POST', '/api/tasks/tasks/auto-assign', { taskIds: [meta.taskId], expectedAssignments: [
      { taskId: meta.taskId, expectedAssigneeId: meta.assigneeId, expectedVersion: meta.assignmentVersion },
    ] }, headers);
    const body = await response.json().catch(() => null) as unknown;
    if (!isCurrent() || !actorHeaders()) return retired();
    if (!response.ok) return failure('POST', response.status, body);
    return automaticAnswer(body, meta.taskId);
  } catch (error) {
    if (!isCurrent() || !actorHeaders()) return retired();
    return error instanceof ApiRequestError ? failure('POST', error.status, error.payload, error.code) : failure('POST');
  }
}

function automaticAnswer(body: unknown, taskId: string): AutomaticAssignmentAnswer {
  if (!object(body) || body.success !== true || !Array.isArray(body.data)) return failure('POST');
  if (body.count === 0 && body.data.length === 0) return { kind: 'refused', message: 'The saved task was not assigned. Refresh assignment to check eligible members before retrying.' };
  const row = body.data[0];
  return body.count === 1 && body.data.length === 1 && object(row) && row.taskId === taskId && taskAssignmentId(row.assigneeId)
    ? { kind: 'confirmed', assigneeId: row.assigneeId } : failure('POST');
}
