/** The existing task/project boundary delegates actual edit policy on one transaction. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestSqlClient } from '../../../db/requestDb';

const policy = vi.hoisted(() => ({ actor: vi.fn(), edit: vi.fn() }));
vi.mock('../../c2c/current-program-access', async original => ({
  ...await original<typeof import('../../c2c/current-program-access')>(), readCurrentProgramActor: policy.actor,
}));
vi.mock('../../report-os/project-access', async original => ({
  ...await original<typeof import('../../report-os/project-access')>(), canAccessReportProject: policy.edit,
}));
import { ProgramReadAccessError } from '../../c2c/current-program-access';
import { admitTaskCreationActor, admitTaskCreationProject, requireTaskProjectId } from '../task-project';

const actor = { userId: 7, role: 'member' };
const input = { organizationId: 9, actorUserId: 7, projectId: 3 };
function fixture(options: { status?: unknown; workspace?: unknown; missing?: boolean; unownedWorkspace?: boolean } = {}) {
  const query = vi.fn(async (text: string, _params?: unknown[]) => {
    if (text.includes('FROM projects')) return { rows: options.missing ? [] : [{ id: 3,
      status: options.status ?? 'active', client_workspace_id: options.workspace === undefined ? 71 : options.workspace }] };
    if (text.includes('FROM client_workspaces')) return { rows: options.unownedWorkspace ? [] : [{ id: 71 }] };
    return { rows: [] };
  });
  return { query, q: { query } as RequestSqlClient };
}
beforeEach(() => { policy.actor.mockReset().mockResolvedValue(actor); policy.edit.mockReset().mockResolvedValue(true); });

describe('explicit workflow project identity', () => {
  it.each([undefined, null, '', '3', 0, -1, 1.5, NaN, Infinity, 2_147_483_648])('refuses %j before any database work', async projectId => {
    const { q, query } = fixture();
    expect(() => requireTaskProjectId(projectId)).toThrow(expect.objectContaining({ status: 400, code: 'TASK_PROJECT_INVALID' }));
    await expect(admitTaskCreationProject(q, { ...input, projectId: projectId as number }))
      .rejects.toMatchObject({ status: 400, code: 'TASK_PROJECT_INVALID' });
    expect(query).not.toHaveBeenCalled(); expect(policy.actor).not.toHaveBeenCalled();
  });
  it('admits the actual positive integer without coercing it', () => { expect(requireTaskProjectId(3)).toBe(3); });
});

describe('current actor, actual project and workspace', () => {
  it('retains actor, parent, workspace and visibility, then asks the existing edit policy on the same client', async () => {
    const { q, query } = fixture();
    await expect(admitTaskCreationProject(q, { ...input, clientWorkspaceId: '71' })).resolves.toEqual({ projectId: 3, clientWorkspaceId: 71 });
    expect(policy.actor).toHaveBeenCalledWith(q, { organizationId: 9, userId: 7, forShare: true });
    expect(policy.actor).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(([text]) => text)).toEqual([
      expect.stringMatching(/FROM projects[\s\S]*FOR SHARE/),
      expect.stringMatching(/FROM client_workspaces[\s\S]*FOR SHARE/),
      expect.stringMatching(/FROM project_visibility_settings[\s\S]*FOR SHARE/),
    ]);
    expect(query.mock.calls[0][1]).toEqual([3, 9]); expect(query.mock.calls[1][1]).toEqual([71, 9]);
    expect(policy.edit).toHaveBeenCalledWith(9, actor, 3, q, { forWrite: true });
  });
  it('does not invent a workspace for an actual unscoped project', async () => {
    const { q, query } = fixture({ workspace: null });
    await expect(admitTaskCreationProject(q, input)).resolves.toEqual({ projectId: 3, clientWorkspaceId: null });
    expect(query.mock.calls.some(([text]) => text.includes('client_workspaces'))).toBe(false);
  });
  it.each([72, '', 'wrong', 0, '1e3', '71.0'])('rejects mismatched or malformed workspace claim %j', async clientWorkspaceId => {
    const { q } = fixture();
    await expect(admitTaskCreationProject(q, { ...input, clientWorkspaceId }))
      .rejects.toMatchObject({ status: 403, code: 'TASK_PROJECT_ACCESS_DENIED' });
    expect(policy.edit).not.toHaveBeenCalled();
  });
  it('rejects a claimed client workspace on a project whose actual workspace is null', async () => {
    const { q } = fixture({ workspace: null });
    await expect(admitTaskCreationProject(q, { ...input, clientWorkspaceId: 71 })).rejects.toMatchObject({ status: 403 });
  });
  it('refuses an actual workspace not retained in the same organization', async () => {
    const { q } = fixture({ unownedWorkspace: true });
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 403 });
    expect(policy.edit).not.toHaveBeenCalled();
  });
  it('uses the fresh role rather than an earlier editor claim', async () => {
    policy.actor.mockResolvedValue({ userId: 7, role: 'viewer' }); const { q, query } = fixture();
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled(); expect(policy.edit).not.toHaveBeenCalled();
  });
  it('refuses missing or foreign parents without asking another project policy', async () => {
    const { q } = fixture({ missing: true });
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 404, code: 'TASK_PROJECT_NOT_FOUND' });
    expect(policy.edit).not.toHaveBeenCalled();
  });
  it.each(['archived', 'deleted'])('retains and refuses a %s parent', async status => {
    const { q } = fixture({ status });
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 409, code: 'TASK_PROJECT_CLOSED' });
    expect(policy.edit).not.toHaveBeenCalled();
  });
  it('refuses read-only sharing instead of treating read access as a write grant', async () => {
    const { q } = fixture(); policy.edit.mockResolvedValue(false);
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 403 });
    expect(policy.edit).toHaveBeenCalledWith(9, actor, 3, q, { forWrite: true });
  });
});

describe('current actor admission for unfiled work', () => {
  it('retains current active write membership without a project or workspace lookup', async () => {
    const { q, query } = fixture();
    await expect(admitTaskCreationActor(q, input)).resolves.toEqual(actor);
    expect(policy.actor).toHaveBeenCalledWith(q, { organizationId: 9, userId: 7, forShare: true });
    expect(query).not.toHaveBeenCalled(); expect(policy.edit).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'guest', ''])('refuses fresh role %j without relying on a claimed write role', async role => {
    policy.actor.mockResolvedValue({ ...actor, role }); const { q, query } = fixture();
    await expect(admitTaskCreationActor(q, input)).rejects.toMatchObject({ status: 403, code: 'TASK_PROJECT_ACCESS_DENIED' });
    expect(query).not.toHaveBeenCalled(); expect(policy.edit).not.toHaveBeenCalled();
  });
  it('maps revoked current membership to the existing sanitized denial', async () => {
    policy.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Revoked'));
    await expect(admitTaskCreationActor(fixture().q, input)).rejects.toMatchObject({ status: 403, code: 'TASK_PROJECT_ACCESS_DENIED' });
  });
  it('refuses an unavailable current actor read without exposing its database detail', async () => {
    policy.actor.mockRejectedValue(new Error('internal connection detail'));
    await expect(admitTaskCreationActor(fixture().q, input)).rejects.toMatchObject({ status: 503,
      code: 'TASK_PROJECT_ACCESS_UNAVAILABLE', message: 'Current project access could not be verified. Nothing was created. Try again.' });
  });
});

describe('admission uncertainty stays distinct from permission denial', () => {
  it('sanitizes an unavailable current membership read', async () => {
    const { q } = fixture(); policy.actor.mockRejectedValue(new Error('SELECT tenant table secret detail'));
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 503, code: 'TASK_PROJECT_ACCESS_UNAVAILABLE' });
    await expect(admitTaskCreationProject(q, input)).rejects.toThrow('Current project access could not be verified.');
  });
  it('maps a positively revoked membership to a known denial', async () => {
    const { q } = fixture(); policy.actor.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_ACTOR_ACCESS_DENIED', 'Revoked'));
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 403, code: 'TASK_PROJECT_ACCESS_DENIED' });
  });
  it('does not turn an unavailable sharing check into permission to write', async () => {
    const { q } = fixture(); policy.edit.mockRejectedValue(new Error('Policy read failed'));
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 503 });
  });
  it.each([0, '71', 1.5])('refuses malformed actual workspace %j', async workspace => {
    const { q } = fixture({ workspace });
    await expect(admitTaskCreationProject(q, input)).rejects.toMatchObject({ status: 503 });
  });
});
