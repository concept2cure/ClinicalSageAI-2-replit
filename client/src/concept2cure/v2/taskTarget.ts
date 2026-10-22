/** Exact unified-task navigation. The URL carries identity, never authority. */
export interface TaskActorScope { userId: string; organizationId: string }

function scopeId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value);
  return /^[1-9]\d*$/.test(text) && Number(text) <= 2_147_483_647 ? text : null;
}

export function taskActorScope(user: unknown): TaskActorScope | null {
  if (!user || typeof user !== 'object') return null;
  const row = user as { id?: unknown; organizationId?: unknown };
  const userId = scopeId(row.id);
  const organizationId = scopeId(row.organizationId);
  return userId && organizationId ? { userId, organizationId } : null;
}

function validTaskId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

export function taskTargetLocation(taskId: string, scope: TaskActorScope | null): string | null {
  if (!scope || !scopeId(scope.userId) || !scopeId(scope.organizationId) || !validTaskId(taskId)) return null;
  const params = new URLSearchParams({ taskId, taskActor: scope.userId, taskOrg: scope.organizationId });
  return `tasks?${params.toString()}`;
}

export function readTaskTarget(search: string, scope: TaskActorScope | null): { taskId: string } | { error: string } | null {
  const params = new URLSearchParams(search);
  const keys = ['taskId', 'taskActor', 'taskOrg'];
  if (!keys.some(key => params.has(key))) return null;
  if (keys.some(key => params.getAll(key).length !== 1) || !validTaskId(params.get('taskId') ?? '')) {
    return { error: 'This task link is incomplete or invalid. Reopen the task from Your work.' };
  }
  if (!scope || !scopeId(scope.userId) || !scopeId(scope.organizationId) || params.get('taskActor') !== scope.userId || params.get('taskOrg') !== scope.organizationId) {
    return { error: 'Your signed-in account or organization changed. Reopen the task from Your work.' };
  }
  return { taskId: params.get('taskId')! };
}

/** A copied native task link joins the current account before the same exact
 * board read. Any supplied actor/org fields must satisfy the strict contract. */
export function readTaskNavigationTarget(search: string, scope: TaskActorScope | null): ReturnType<typeof readTaskTarget> {
  const params = new URLSearchParams(search);
  if (params.has('taskActor') || params.has('taskOrg') || !params.has('taskId')) return readTaskTarget(search, scope);
  const ids = params.getAll('taskId');
  if (ids.length !== 1 || !/^TASK-[A-Za-z0-9_-]{1,120}$/.test(ids[0])) {
    return { error: 'The linked task identifier is invalid or ambiguous. Open a task from the authorized board.' };
  }
  const bound = taskTargetLocation(ids[0], scope);
  return bound ? readTaskTarget(bound.slice(bound.indexOf('?') + 1), scope)
    : { error: 'Your signed-in account or organization changed. Reopen the task from Your work.' };
}
