import { beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  open: [] as Array<Record<string, unknown>>, native: [] as Array<Record<string, unknown>>,
  queries: [] as Array<{ text: string; values?: unknown[] }>,
  anchor: vi.fn(), admit: vi.fn(), audit: vi.fn(), create: vi.fn(), transition: vi.fn(), placement: vi.fn(), actor: vi.fn(), qmsRead: vi.fn(),
}));
const runner = vi.hoisted(() => ({
  select: () => ({ from: () => ({ where: async () => H.open }) }),
  update: () => ({ set: (value: unknown) => ({ where: () => ({ returning: async () => { H.placement(value); return [{ taskId: 'existing' }]; } }) }) }),
}));
vi.mock('../../../db', () => ({ db: runner }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: () => runner }));
vi.mock('../../../db/withTenantConnection', () => ({
  withTenantConnection: async (_scope: unknown, fn: (client: unknown) => Promise<unknown>) => fn({
    query: async (text: string, values?: unknown[]) => {
      H.queries.push({ text, values });
      return { rows: /FROM (capa_records|capa_actions|qms_documents|authoring_documents)/.test(text) ? H.native : [] };
    },
  }),
}));
vi.mock('../../c2c/program-project-anchor', () => ({ readProgramAnchorRow: H.anchor }));
vi.mock('../../c2c/current-program-access', () => ({ readCurrentProgramActor: H.actor }));
vi.mock('../../qms/controlled-document-content', () => ({ authorizeQmsContentRead: H.qmsRead }));
vi.mock('../task-project', () => ({ admitTaskCreationProject: H.admit }));
vi.mock('../task-audit', () => ({ auditTaskActionInTx: H.audit }));
vi.mock('../../unifiedTaskService', () => ({ default: { createUnifiedTask: H.create, updateTaskStatus: H.transition } }));

import { replaceSourceTask, type ReplaceSourceTask } from '../source-task';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const CAPA = '22222222-2222-4222-8222-222222222222';
const ACTION = '33333333-3333-4333-8333-333333333333';
const input = (over: Partial<ReplaceSourceTask> = {}): ReplaceSourceTask => ({
  organizationId: 7, actorId: 12, sourceEntityType: 'capa_record', sourceEntityId: `capa:${CAPA}`,
  closeAs: 'cancelled', same: metadata => metadata.due === '2026-12-01',
  next: { moduleType: 'Quality', title: 'Close CAPA-012', metadata: { due: '2026-12-01' }, projectId: 999,
    dueDate: new Date('2026-12-01T00:00:00Z') }, ...over,
});
const existing = (projectId: number | null = null) => ({ taskId: 'existing', status: 'in_progress', metadata: { due: '2026-12-01' },
  projectId, clientWorkspaceId: projectId ? 4 : null, sourceEntityId: `capa:${CAPA}` });
const statements = () => H.queries.map(query => query.text.trim());

beforeEach(() => {
  H.open = []; H.native = [{ program_id: PROGRAM, state: 'open', due_at: new Date('2026-12-01') }]; H.queries = [];
  H.anchor.mockReset().mockResolvedValue({ id: 41, clientWorkspaceId: 4 });
  H.admit.mockReset().mockResolvedValue({ projectId: 41, clientWorkspaceId: 4 });
  H.actor.mockReset().mockResolvedValue({ userId: 12, role: 'member' }); H.qmsRead.mockReset().mockResolvedValue(undefined);
  H.audit.mockReset().mockResolvedValue(undefined); H.create.mockReset().mockResolvedValue({ taskId: 'new-task' });
  H.transition.mockReset().mockResolvedValue({ taskId: 'existing' }); H.placement.mockReset();
});

describe('native Quality source tasks retain their canonical project', () => {
  it.each([
    ['capa_record', `capa:${CAPA}`], ['capa_action', `capa-action:${ACTION}`], ['qms_periodic_review', 'qms-document:12'],
  ])('places %s from the recorded owner, ignoring a claimed numeric project', async (sourceEntityType, sourceEntityId) => {
    H.native = [{ program_id: PROGRAM, authoring_document_id: '44444444-4444-4444-8444-444444444444',
      state: sourceEntityType === 'capa_action' ? 'planned' : 'open', due_at: new Date('2026-12-01') }];
    expect(await replaceSourceTask(input({ sourceEntityType, sourceEntityId }))).toBe('scheduled');
    expect(H.anchor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ programId: PROGRAM, orgId: 7, requireUnique: true }));
    if (sourceEntityType === 'qms_periodic_review') expect(H.qmsRead).toHaveBeenCalledWith(expect.anything(), 7, 12, expect.objectContaining({ id: 12 }));
    else expect(H.admit).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, actorUserId: 12, projectId: 41 });
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 41, clientWorkspaceId: 4, organizationId: 7 }), runner);
    expect(H.queries.some(query => query.values?.includes(7))).toBe(true);
    expect(statements()).toContain('COMMIT');
  });

  it('keeps a legacy unbound controlled document organization-wide rather than borrowing the caller project', async () => {
    H.native = [{ program_id: null, authoring_document_id: null }];
    expect(await replaceSourceTask(input({ sourceEntityType: 'qms_periodic_review', sourceEntityId: 'qms-document:12' }))).toBe('scheduled');
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: undefined, clientWorkspaceId: undefined }), runner);
    expect(H.admit).not.toHaveBeenCalled();
  });

  it('preserves a delegated document approver’s reminder without demanding project edit permission', async () => {
    H.native = [{ program_id: PROGRAM, authoring_document_id: '44444444-4444-4444-8444-444444444444' }];
    H.admit.mockRejectedValue(new Error('The signer has project read and document approval permission, not project write'));
    expect(await replaceSourceTask(input({ sourceEntityType: 'qms_periodic_review', sourceEntityId: 'qms-document:12' }))).toBe('scheduled');
    expect(H.qmsRead).toHaveBeenCalledWith(expect.anything(), 7, 12, expect.objectContaining({ id: 12, organization_id: 7 }));
    expect(H.admit).not.toHaveBeenCalled();
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 41 }), runner);
  });

  it('repairs an existing matching task in place, preserving its id and status and auditing the placement', async () => {
    H.open = [existing()];
    expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(H.placement).toHaveBeenCalledWith(expect.objectContaining({ projectId: 41, clientWorkspaceId: 4 }));
    expect(H.transition).not.toHaveBeenCalled(); expect(H.create).not.toHaveBeenCalled();
    expect(H.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orgId: 7, userId: 12, taskId: 'existing', command: 'task.link',
      payload: expect.objectContaining({ before: { projectId: null, clientWorkspaceId: null }, after: { projectId: 41, clientWorkspaceId: 4 } }),
    }));
  });

  it('keeps the same task without another write once placement already matches', async () => {
    H.open = [existing(41)];
    expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(H.placement).not.toHaveBeenCalled(); expect(H.audit).not.toHaveBeenCalled();
  });
});

describe('unverified Quality ownership leaves the previous task untouched', () => {
  it.each(['missing owner', 'no unique anchor', 'project access denied', 'placement audit failed'])('fails closed on %s', async failure => {
    H.open = [existing()];
    if (failure === 'missing owner') H.native = [];
    if (failure === 'no unique anchor') H.anchor.mockResolvedValue(null);
    if (failure === 'project access denied') H.admit.mockRejectedValue(new Error('denied'));
    if (failure === 'placement audit failed') H.audit.mockRejectedValue(new Error('ledger unavailable'));
    expect(await replaceSourceTask(input())).toBe('failed');
    expect(H.transition).not.toHaveBeenCalled(); expect(H.create).not.toHaveBeenCalled();
    expect(statements()).toContain('ROLLBACK'); expect(statements()).not.toContain('COMMIT');
  });

  it('does not silently unfile a bound document whose authoring program cannot be read', async () => {
    H.native = [{ authoring_document_id: '44444444-4444-4444-8444-444444444444', program_id: null }];
    expect(await replaceSourceTask(input({ sourceEntityType: 'qms_periodic_review', sourceEntityId: 'qms-document:12' }))).toBe('failed');
    expect(H.create).not.toHaveBeenCalled();
  });

  it('rolls back a status race instead of creating a second open source task', async () => {
    H.open = [{ ...existing(), metadata: { due: '2026-11-01' } }];
    H.transition.mockResolvedValueOnce(undefined);
    expect(await replaceSourceTask(input())).toBe('failed');
    expect(H.create).not.toHaveBeenCalled();
    expect(statements()).toContain('ROLLBACK');
  });

  it('preserves the existing generic path for non-audit Quality sources', async () => {
    expect(await replaceSourceTask(input({ sourceEntityType: 'qms_supplier_audit', sourceEntityId: 'qms-supplier-audit:12' }))).toBe('scheduled');
    expect(H.queries).toEqual([]); expect(H.admit).not.toHaveBeenCalled();
    expect(H.create).toHaveBeenCalledWith(expect.objectContaining({ projectId: 999 }));
  });
});
