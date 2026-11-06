/** Training placement is classification, never a new project or document grant. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  actor: vi.fn(), assigned: vi.fn(), read: vi.fn(), document: vi.fn(), context: vi.fn(), inForce: vi.fn(), pending: vi.fn(),
  anchor: vi.fn(), admit: vi.fn(), audit: vi.fn(), create: vi.fn(), transition: vi.fn(), placement: vi.fn(),
  open: [] as Array<Record<string, unknown>>, queries: [] as Array<{ text: string; values?: unknown[] }>,
}));
const runner = vi.hoisted(() => ({
  select: () => ({ from: () => ({ where: async () => H.open }) }),
  update: () => ({ set: (value: unknown) => ({ where: () => ({ returning: async () => { H.placement(value); return [{ taskId: 'old-training' }]; } }) }) }),
}));
vi.mock('../../../db', () => ({ db: runner }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: () => runner }));
vi.mock('../../../db/withTenantConnection', () => ({ withTenantConnection: async (_scope: unknown, fn: (q: unknown) => Promise<unknown>) => fn({
  query: async (text: string, values?: unknown[]) => { H.queries.push({ text, values }); return { rows: [{ client_program_id: '11111111-1111-4111-8111-111111111111' }] }; },
}) }));
vi.mock('../../c2c/current-program-access', () => ({ readCurrentProgramActor: H.actor }));
vi.mock('../../c2c/program-project-anchor', () => ({ readProgramAnchorRow: H.anchor }));
vi.mock('../task-project', () => ({ admitTaskCreationProject: H.admit }));
vi.mock('../task-audit', () => ({ auditTaskActionInTx: H.audit }));
vi.mock('../../qms/training-assignment', () => ({ isQmsTrainingAssignee: H.assigned, authorizeQmsTrainingRead: H.read, readTrainingDocument: H.document }));
vi.mock('../../qms/current-release-approval', () => ({ readQmsTrainingReleaseContext: H.context }));
vi.mock('../../qms/in-force-release', () => ({ resolveInForceRelease: H.inForce, isPendingEffective: H.pending }));
vi.mock('../../unifiedTaskService', () => ({ default: { createUnifiedTask: H.create, updateTaskStatus: H.transition } }));

import { reconcileSourceTasks, replaceSourceTask, type ReplaceSourceTask } from '../source-task';

const DOC = { id: 12, organization_id: 7, status: 'effective', version: '1.0', authoring_document_id: '44444444-4444-4444-8444-444444444444' };
const input = (actorId = 9): ReplaceSourceTask => ({ organizationId: 7, actorId, sourceEntityType: 'qms_training',
  sourceEntityId: 'qms-document:12:user:9', closeAs: 'completed', same: metadata => metadata.version === '1.0',
  next: { moduleType: 'Quality', title: 'Read SOP-012', assigneeId: 9, projectId: 999, metadata: { version: '1.0' } },
});
const queries = () => H.queries.map(query => query.text.trim());

beforeEach(() => {
  H.open = []; H.queries = [];
  H.actor.mockReset().mockResolvedValue({ userId: 9, role: 'viewer' });
  H.assigned.mockReset().mockResolvedValue(true); H.read.mockReset().mockResolvedValue(undefined);
  H.document.mockReset().mockResolvedValue(DOC); H.context.mockReset().mockResolvedValue({ context: { eligible: true, contentDigest: 'signed-content' } });
  H.inForce.mockReset().mockResolvedValue(null); H.pending.mockReset().mockReturnValue(false);
  H.anchor.mockReset().mockResolvedValue({ id: 41, clientWorkspaceId: 4 }); H.admit.mockReset();
  H.audit.mockReset().mockResolvedValue(undefined); H.create.mockReset().mockResolvedValue({ taskId: 'training-new' });
  H.transition.mockReset().mockResolvedValue({ taskId: 'old-training' }); H.placement.mockReset();
});

describe('assigned training tasks keep native project placement without requiring a project writer', () => {
  it.each([9, 12])('classifies a legitimate task from active actor %i and verifies the intended assignee', async actorId => {
    expect(await replaceSourceTask(input(actorId))).toBe('scheduled');
    expect(H.actor).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: actorId, forShare: true });
    expect(H.assigned).toHaveBeenCalledWith(expect.anything(), 7, 12, 9);
    expect(H.read).toHaveBeenCalledWith(expect.anything(), 7, 9, DOC);
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 41, clientWorkspaceId: 4, assigneeId: 9 }), runner);
    expect(H.admit).not.toHaveBeenCalled();
  });

  it('keeps a verified legacy unbound release organization-wide', async () => {
    H.document.mockResolvedValue({ ...DOC, authoring_document_id: null });
    expect(await replaceSourceTask(input())).toBe('scheduled');
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: undefined, clientWorkspaceId: undefined }), runner);
    expect(H.anchor).not.toHaveBeenCalled();
  });

  it('repairs an existing matching training task without completing or replacing it', async () => {
    H.open = [{ taskId: 'old-training', status: 'pending', sourceEntityId: 'qms-document:12:user:9', metadata: { version: '1.0' }, projectId: null, clientWorkspaceId: null }];
    expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(H.placement).toHaveBeenCalledWith(expect.objectContaining({ projectId: 41, clientWorkspaceId: 4 }));
    expect(H.create).not.toHaveBeenCalled(); expect(H.transition).not.toHaveBeenCalled();
  });

  it('uses the version in force while a later working revision is unsigned', async () => {
    H.document.mockResolvedValue({ ...DOC, version: '2.0', status: 'draft' });
    H.inForce.mockResolvedValue({ release: DOC });
    expect(await replaceSourceTask(input())).toBe('scheduled');
    expect(H.context).toHaveBeenCalledWith(expect.anything(), DOC, expect.any(Date), expect.objectContaining({ ahead: true }));
  });

  it('retains training on the approved version waiting to take effect', async () => {
    H.pending.mockReturnValue(true); H.document.mockResolvedValue({ ...DOC, version: '2.0' });
    const request = input(); request.next!.metadata.version = '2.0';
    expect(await replaceSourceTask(request)).toBe('scheduled');
    expect(H.inForce).not.toHaveBeenCalled();
  });

  it('classifies only the reader key this reconciliation owns', async () => {
    const request = input();
    H.assigned.mockImplementation(async (_q: unknown, _org: number, _document: number, reader: number) => reader === 9);
    const result = await reconcileSourceTasks({ organizationId: 7, actorId: 9, sourceEntityType: 'qms_training',
      match: { exact: request.sourceEntityId }, closeAs: () => 'completed', desired: new Map([
        [request.sourceEntityId, { next: request.next!, same: request.same }],
        ['qms-document:12:user:10', { next: { ...request.next!, assigneeId: 10 }, same: request.same }],
      ]),
    });
    expect(result).toMatchObject({ failed: false, written: [{ sourceEntityId: request.sourceEntityId, taskId: 'training-new' }] });
    expect(H.assigned).toHaveBeenCalledTimes(1);
  });

  it('serializes document-wide and personal reconciliation under the same document lock', async () => {
    const request = input();
    await replaceSourceTask(request);
    await reconcileSourceTasks({ organizationId: 7, actorId: 9, sourceEntityType: 'qms_training',
      match: { prefix: 'qms-document:12:user:' }, closeAs: () => 'completed',
      desired: new Map([[request.sourceEntityId, { next: request.next!, same: request.same }]]),
    });
    const locks = H.queries.filter(query => query.text.includes('pg_advisory_xact_lock')).map(query => query.values);
    expect(locks).toHaveLength(2);
    expect(locks[0]).toEqual(locks[1]);
  });
});

describe('unverified training classification leaves existing delivery untouched', () => {
  it.each(['unrelated assignee', 'revoked assignment', 'revoked actor', 'ambiguous anchor', 'changed version', 'unverified release'])('refuses %s and rolls back', async failure => {
    H.open = [{ taskId: 'old-training', status: 'pending', sourceEntityId: 'qms-document:12:user:9', metadata: { version: '1.0' }, projectId: null, clientWorkspaceId: null }];
    const request = input();
    if (failure === 'unrelated assignee') request.next!.assigneeId = 10;
    if (failure === 'revoked assignment') H.assigned.mockResolvedValue(false);
    if (failure === 'revoked actor') H.actor.mockRejectedValue(new Error('inactive'));
    if (failure === 'ambiguous anchor') H.anchor.mockResolvedValue(null);
    if (failure === 'changed version') request.next!.metadata.version = '0.9';
    if (failure === 'unverified release') H.context.mockResolvedValue({ context: { eligible: false, contentDigest: null } });
    expect(await replaceSourceTask(request)).toBe('failed');
    expect(H.create).not.toHaveBeenCalled(); expect(H.transition).not.toHaveBeenCalled(); expect(H.placement).not.toHaveBeenCalled();
    expect(queries()).toContain('ROLLBACK'); expect(queries()).not.toContain('COMMIT');
  });
});
