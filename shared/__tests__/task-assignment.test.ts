import { describe, expect, it } from 'vitest';
import { isTaskAssignmentRoster, isTaskAssignmentResult, type TaskAssignmentCommand, type TaskAssignmentRoster,
  type TaskAssignmentScope, type TaskAssignmentResult } from '../task-assignment';
const VERSION = 'a'.repeat(64);
const scope: TaskAssignmentScope = { taskId: 'TASK-1', actorUserId: 7, organizationId: 4, projectId: 12, clientWorkspaceId: 21 };
const command: TaskAssignmentCommand = { action: 'assign', assigneeId: 9, expectedAssigneeId: 8, expectedVersion: VERSION, reason: 'Sponsor handoff' };
function roster(): TaskAssignmentRoster {
  return { success: true, data: [{ id: '9', name: 'Alex', label: 'Alex · Account #9' }], total: 1,
    meta: { ...scope, clientWorkspaceId: 21, status: 'review', canAssign: true, assigneeId: 8, assignmentVersion: VERSION } };
}
function result(): TaskAssignmentResult {
  return { ...scope, clientWorkspaceId: 21, status: 'review', assigneeId: 9, assigneeName: 'Alex', assignedBy: 7,
    assignedAt: '2026-10-21T12:00:00.000Z', assignmentVersion: 'b'.repeat(64) };
}
describe('task-specific assignment roster', () => {
  it('accepts verified candidates and genuine empty eligible rosters', () => {
    expect(isTaskAssignmentRoster(roster(), scope)).toBe(true);
    expect(isTaskAssignmentRoster({ ...roster(), data: [], total: 0 }, scope)).toBe(true);
  });
  it.each([
    { taskId: 'TASK-OTHER' }, { projectId: 13 }, { organizationId: 5 }, { actorUserId: 8 }, { clientWorkspaceId: 22 },
    { assignmentVersion: 'today' }, { assigneeId: 0 }, { canAssign: 'yes' }, { status: null },
    { status: 'completed' }, { status: 'cancelled' },
  ])('refuses stale or malformed task metadata %j', over => {
    const data = roster();
    expect(isTaskAssignmentRoster({ ...data, meta: { ...data.meta, ...over } }, scope)).toBe(false);
  });
  it.each([
    { id: '09' }, { id: 'unknown' }, { id: '2147483648' }, { label: '' }, { name: null },
  ])('refuses malformed candidate identity %j', over => {
    const data = roster(); data.data = [{ ...data.data[0], ...over } as never];
    expect(isTaskAssignmentRoster(data, scope)).toBe(false);
  });
  it('refuses duplicate identities or labels, partial counts and directory disclosure to denied actors', () => {
    const data = roster();
    expect(isTaskAssignmentRoster({ ...data, data: [data.data[0], data.data[0]], total: 2 }, scope)).toBe(false);
    expect(isTaskAssignmentRoster({ ...data, data: [data.data[0], { ...data.data[0], id: '10' }], total: 2 }, scope)).toBe(false);
    expect(isTaskAssignmentRoster({ ...data, total: 2 }, scope)).toBe(false);
    expect(isTaskAssignmentRoster({ ...data, meta: { ...data.meta, canAssign: false } }, scope)).toBe(false);
    expect(isTaskAssignmentRoster({ ...data, data: [], total: 0, meta: { ...data.meta, canAssign: false, status: 'completed' } }, scope)).toBe(true);
  });
  it('keeps organization-wide work unanchored instead of inventing a workspace', () => {
    const data = roster(); data.meta.projectId = null; data.meta.clientWorkspaceId = null;
    const orgScope = { ...scope, projectId: null, clientWorkspaceId: null };
    expect(isTaskAssignmentRoster(data, orgScope)).toBe(true);
    expect(isTaskAssignmentRoster(data, { ...orgScope, clientWorkspaceId: 21 })).toBe(true);
    expect(isTaskAssignmentRoster({ ...data, meta: { ...data.meta, clientWorkspaceId: 21 } }, { ...orgScope, clientWorkspaceId: 21 })).toBe(true);
    expect(isTaskAssignmentRoster({ ...data, meta: { ...data.meta, clientWorkspaceId: 21 } }, { ...orgScope, clientWorkspaceId: 22 })).toBe(false);
  });
});
describe('confirmed named task assignment receipt', () => {
  it('accepts only the exact saved account, actor, scope, new version and recorded timestamp', () => {
    expect(isTaskAssignmentResult(result(), scope, command)).toBe(true);
  });
  it.each([
    { assigneeId: 8 }, { assignedBy: 9 }, { assignmentVersion: VERSION }, { assignmentVersion: '' },
    { assignedAt: null }, { assignedAt: 'not recorded' }, { taskId: 'TASK-OTHER' }, { projectId: 99 },
    { actorUserId: 9 }, { organizationId: 5 }, { clientWorkspaceId: 22 }, { clientWorkspaceId: null }, { status: 'completed' }, { assigneeName: 42 },
  ])('rejects ambiguous or changed receipt %j', over => {
    expect(isTaskAssignmentResult({ ...result(), ...over }, scope, command)).toBe(false);
  });
  it('does not confirm an organization-wide assignment as saved under a client workspace', () => {
    const organizationScope = { ...scope, projectId: null, clientWorkspaceId: null };
    expect(isTaskAssignmentResult({ ...result(), projectId: null, clientWorkspaceId: null }, organizationScope, command)).toBe(true);
    expect(isTaskAssignmentResult({ ...result(), projectId: null, clientWorkspaceId: 21 }, organizationScope, command)).toBe(false);
  });
});
