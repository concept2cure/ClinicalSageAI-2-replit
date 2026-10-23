/** Existing unified-task handoff. Assignment never grants access or signing rights. */
export interface TaskAssignmentCandidate { id: string; name: string; label: string }
export interface TaskAssignmentMeta {
  organizationId: number;
  actorUserId: number;
  taskId: string;
  projectId: number | null;
  clientWorkspaceId: number | null;
  status: string;
  canAssign: boolean;
  assigneeId: number | null;
  assignmentVersion: string;
}
export interface TaskAssignmentRoster {
  success: true;
  data: TaskAssignmentCandidate[];
  total: number;
  meta: TaskAssignmentMeta;
}
export interface TaskAssignmentResult {
  taskId: string;
  organizationId: number;
  actorUserId: number;
  projectId: number | null;
  clientWorkspaceId: number | null;
  status: string;
  assigneeId: number;
  assigneeName: string | null;
  assignedBy: number;
  assignedAt: string;
  assignmentVersion: string;
}
export interface TaskAssignmentCommand {
  action: 'assign';
  assigneeId: number;
  expectedAssigneeId: number | null;
  expectedVersion: string;
  reason: string;
}
export interface TaskAssignmentScope {
  taskId: string;
  organizationId: number;
  actorUserId: number;
  projectId: number | null;
  clientWorkspaceId?: number | null;
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export const taskAssignmentId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
const nullableId = (value: unknown) => value === null || taskAssignmentId(value);
const version = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const terminal = (status: unknown) => status === 'completed' || status === 'cancelled';
const recordedWorkspaceMatches = (value: unknown, expected: TaskAssignmentScope) =>
  expected.clientWorkspaceId === undefined || value === expected.clientWorkspaceId;

function currentScope(value: Record<string, unknown>, expected: TaskAssignmentScope): boolean {
  return value.taskId === expected.taskId && value.organizationId === expected.organizationId && value.actorUserId === expected.actorUserId &&
    taskAssignmentId(value.organizationId) && taskAssignmentId(value.actorUserId) &&
    nullableId(value.projectId) && value.projectId === expected.projectId && nullableId(value.clientWorkspaceId) &&
    (expected.clientWorkspaceId == null || value.clientWorkspaceId === null || value.clientWorkspaceId === expected.clientWorkspaceId);
}

function assignmentMeta(value: unknown, expected: TaskAssignmentScope): value is TaskAssignmentMeta {
  if (!object(value) || !currentScope(value, expected)) return false;
  return typeof value.status === 'string' && Boolean(value.status.trim()) && typeof value.canAssign === 'boolean' &&
    nullableId(value.assigneeId) && version(value.assignmentVersion) && (!terminal(value.status) || !value.canAssign);
}

function candidate(value: unknown): value is TaskAssignmentCandidate {
  if (!object(value) || typeof value.id !== 'string' || !/^[1-9]\d*$/.test(value.id)) return false;
  return taskAssignmentId(Number(value.id)) && typeof value.name === 'string' && typeof value.label === 'string' && Boolean(value.label.trim());
}

export function isTaskAssignmentRoster(value: unknown, expected: TaskAssignmentScope): value is TaskAssignmentRoster {
  if (!object(value) || value.success !== true || !assignmentMeta(value.meta, expected) || !Array.isArray(value.data) ||
      !value.data.every(candidate) || value.total !== value.data.length) return false;
  const ids = new Set(value.data.map(row => row.id));
  const labels = new Set(value.data.map(row => row.label.trim().toLowerCase()));
  return ids.size === value.data.length && labels.size === value.data.length && (value.meta.canAssign || value.data.length === 0);
}

export function isTaskAssignmentResult(value: unknown, expected: TaskAssignmentScope, command: TaskAssignmentCommand): value is TaskAssignmentResult {
  if (!object(value) || !currentScope(value, expected) || value.assigneeId !== command.assigneeId || !taskAssignmentId(value.assigneeId)) return false;
  // Reads reconcile the selected workspace against recorded scope. A write
  // receipt must retain the exact recorded workspace captured by that read.
  if (!recordedWorkspaceMatches(value.clientWorkspaceId, expected)) return false;
  return typeof value.status === 'string' && Boolean(value.status.trim()) && !terminal(value.status) &&
    (value.assigneeName === null || typeof value.assigneeName === 'string') && value.assignedBy === expected.actorUserId &&
    typeof value.assignedAt === 'string' && Number.isFinite(Date.parse(value.assignedAt)) &&
    version(value.assignmentVersion) && value.assignmentVersion !== command.expectedVersion;
}
