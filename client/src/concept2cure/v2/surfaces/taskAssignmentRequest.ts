import { apiRequest, ApiRequestError, errorCodeOf, serverMessage } from '@/lib/queryClient';
import { capturedActorHeaders } from '@/utils/authToken';
import {
  isTaskAssignmentRoster, isTaskAssignmentResult, taskAssignmentId,
  type TaskAssignmentCommand, type TaskAssignmentMeta, type TaskAssignmentResult,
  type TaskAssignmentRoster, type TaskAssignmentScope,
} from '@shared/task-assignment';

export type AssignmentFailure = { kind: 'unavailable' | 'refused' | 'unconfirmed' | 'retired'; message: string };
export type AssignmentRead = { kind: 'confirmed'; data: TaskAssignmentRoster } | AssignmentFailure;
export type AssignmentWrite = { kind: 'confirmed'; data: TaskAssignmentResult } | AssignmentFailure;
/** `unchanged`: the route assigned nothing and refused nothing (an empty batch). */
export type AutomaticAssignmentAnswer = { kind: 'confirmed'; assigneeId: number } | { kind: 'unchanged' } | AssignmentFailure;
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
  const payloadCode = errorCodeOf(payload) ?? code;
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
  /* An empty batch is the route's answer when workload-balanced assignment chose
     the member who already has the task (task-assignment.ts `mutate` returns
     null for it), and equally when nobody could take it or it left the
     assignable states meanwhile. It was reported as a refusal in all three, so
     auto-assigning an already-assigned task read as a failure. It is not a
     success either: the caller re-reads the assignment to say which it was. */
  if (body.count === 0 && body.data.length === 0) return { kind: 'unchanged' };
  const row = body.data[0];
  return body.count === 1 && body.data.length === 1 && object(row) && row.taskId === taskId && taskAssignmentId(row.assigneeId)
    ? { kind: 'confirmed', assigneeId: row.assigneeId } : failure('POST');
}

/**
 * Whether an automatic assignment that changed nothing left the task with the
 * member the server's workload rule picks. The route answers an empty batch
 * both when that member already has the task and when nobody could take it or
 * it left the assignable states (`automaticAnswer` above). A
 * fresh read that shows the same assignee, at the same version, still
 * assignable and still on the eligible list rules out the other two: an
 * eligible list always yields a pick, and an unassignable task changes state.
 * Returns that member's label, or null when the answer cannot be told apart.
 */
export function unchangedHolder(before: TaskAssignmentMeta, after: TaskAssignmentRoster): string | null {
  const m = after.meta;
  if (!m.canAssign || before.assigneeId === null || m.assigneeId !== before.assigneeId ||
      m.assignmentVersion !== before.assignmentVersion) return null;
  return after.data.find(row => row.id === String(m.assigneeId))?.label ?? null;
}
