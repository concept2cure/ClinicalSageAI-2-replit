/** Native CAPA ownership and replacement rollback execute against real SQL; task-store adapters are seams. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  query: null as null | ((text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>),
  source: '', key: '', create: vi.fn(), transition: vi.fn(), audit: vi.fn(), actor: vi.fn(), access: vi.fn(),
}));
const runner = vi.hoisted(() => ({
  select: () => ({ from: () => ({ where: async () => (await H.query!(`SELECT task_id AS "taskId",status,metadata,
    source_entity_id AS "sourceEntityId",assignee_id AS "assigneeId",project_id AS "projectId",client_workspace_id AS "clientWorkspaceId"
    FROM unified_tasks WHERE organization_id=7 AND source_entity_type=$1 AND source_entity_id=$2 AND status NOT IN ('cancelled','completed')`, [H.source, H.key])).rows }) }),
}));
vi.mock('../../../db', () => ({ db: runner }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: () => runner }));
vi.mock('../../../db/withTenantConnection', () => ({
  withTenantConnection: async (_scope: unknown, fn: (q: unknown) => Promise<unknown>) => fn({ query: (text: string, params?: unknown[]) => H.query!(text, params) }),
}));
vi.mock('../task-project', () => ({ admitTaskCreationProject: async () => ({ projectId: 41, clientWorkspaceId: 4 }) }));
vi.mock('../../c2c/current-program-access', () => ({ readCurrentProgramActor: H.actor }));
vi.mock('../../report-os/project-access', () => ({ canAccessReportProject: H.access }));
vi.mock('../task-audit', () => ({ auditTaskActionInTx: H.audit }));
vi.mock('../../unifiedTaskService', () => ({ default: { createUnifiedTask: H.create, updateTaskStatus: H.transition } }));

import { replaceSourceTask, type ReplaceSourceTask } from '../source-task';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const CAPA = '22222222-2222-4222-8222-222222222222';
const ACTION = '33333333-3333-4333-8333-333333333333';
let pg: PGlite;

function input(kind = 'capa_record', assigneeId = 9): ReplaceSourceTask {
  H.source = kind; H.key = kind === 'capa_record' ? `capa:${CAPA}` : `capa-action:${ACTION}`;
  return { organizationId: 7, actorId: 12, sourceEntityType: kind, sourceEntityId: H.key, closeAs: 'cancelled',
    same: metadata => metadata.due === '2026-12-01',
    next: { moduleType: 'Quality', title: 'Same-date CAPA follow-up', assigneeId,
      dueDate: new Date('2026-12-01T00:00:00Z'), metadata: { due: '2026-12-01' } } };
}

async function seedOpen(kind = 'capa_record', assigneeId = 8) {
  input(kind);
  await pg.query(`INSERT INTO unified_tasks VALUES ('existing',7,$1,$2,'in_progress',8,41,4,'{"due":"2026-12-01"}')`, [H.source, H.key]);
  if (assigneeId !== 8) await pg.query('UPDATE unified_tasks SET assignee_id=$1', [assigneeId]);
}
const tasks = async () => (await pg.query('SELECT task_id,status,assignee_id FROM unified_tasks ORDER BY task_id')).rows;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE regulatory_programs (id uuid PRIMARY KEY, organization_id integer, deleted_at timestamptz);
    CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer, regulatory_program_id uuid, client_workspace_id integer);
    CREATE TABLE capa_records (id uuid PRIMARY KEY, program_id text NOT NULL, assigned_to text, created_by text,
      target_close_date timestamptz, state text);
    CREATE TABLE capa_actions (id uuid PRIMARY KEY, capa_id uuid NOT NULL, owner text,due_date timestamptz,state text);
    CREATE TABLE project_members (organization_id integer,project_id integer,user_id integer);
    CREATE TABLE project_visibility_settings (organization_id integer,project_id integer);
    CREATE TABLE concept2cure_artifacts (id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments (artifact_id integer,organization_id integer,reviewer_id integer,status text);
    CREATE TABLE unified_tasks (task_id text PRIMARY KEY,organization_id integer,source_entity_type text,source_entity_id text,
      status text,assignee_id integer,project_id integer,client_workspace_id integer,metadata jsonb);
  `);
  H.query = async (text, params) => text.includes('pg_advisory_xact_lock') ? { rows: [] } : pg.query<Record<string, unknown>>(text, params);
});
afterAll(async () => { H.query = null; await pg.close(); });

beforeEach(async () => {
  await pg.exec('TRUNCATE unified_tasks,capa_actions,capa_records,projects,regulatory_programs');
  await pg.query('INSERT INTO regulatory_programs VALUES ($1,7,NULL)', [PROGRAM]);
  await pg.query('INSERT INTO projects VALUES (41,7,$1,4)', [PROGRAM]);
  await pg.query("INSERT INTO capa_records VALUES ($1,$2,'9','12','2026-12-01','open')", [CAPA, PROGRAM]);
  await pg.query("INSERT INTO capa_actions VALUES ($1,$2,'9','2026-12-01','planned')", [ACTION, CAPA]);
  H.actor.mockReset().mockImplementation(async (_q: unknown, scope: { userId: number }) => ({ userId: scope.userId, role: 'member' }));
  H.access.mockReset().mockResolvedValue(true); H.audit.mockReset().mockResolvedValue(undefined);
  H.transition.mockReset().mockImplementation(async (taskId: string, status: string) => {
    const result = await H.query!('UPDATE unified_tasks SET status=$1 WHERE task_id=$2 RETURNING task_id', [status, taskId]);
    return result.rows[0];
  });
  H.create.mockReset().mockImplementation(async (next: { assigneeId: number; sourceEntityType: string; sourceEntityId: string; metadata: unknown }) => {
    await H.query!(`INSERT INTO unified_tasks VALUES ('replacement',7,$1,$2,'pending',$3,41,4,$4::jsonb)`,
      [next.sourceEntityType, next.sourceEntityId, next.assigneeId, JSON.stringify(next.metadata)]);
    return { taskId: 'replacement' };
  });
});

describe('same-date native CAPA task reassignment', () => {
  it.each(['capa_record', 'capa_action'])('replaces %s atomically for its current canonical numeric assignee', async kind => {
    await seedOpen(kind);
    expect(await replaceSourceTask(input(kind))).toBe('scheduled');
    expect(await tasks()).toEqual([
      { task_id: 'existing', status: 'cancelled', assignee_id: 8 },
      { task_id: 'replacement', status: 'pending', assignee_id: 9 },
    ]);
    expect(H.actor).toHaveBeenCalledWith(expect.anything(), { organizationId: 7, userId: 9, forShare: true });
    expect(H.access).toHaveBeenCalledWith(7, { userId: 9, role: 'member' }, 41, expect.anything());
    expect(H.audit.mock.calls.map(call => call[1].command)).toEqual(['task.transition', 'task.create']);
  });

  it('keeps a task when the date and assignee both already match', async () => {
    await seedOpen('capa_record', 9);
    expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(H.transition).not.toHaveBeenCalled(); expect(H.create).not.toHaveBeenCalled();
  });

  it.each(['capa_record', 'capa_action'])('refuses a stale %s producer after the native owner changed again', async kind => {
    await seedOpen(kind);
    await pg.exec(kind === 'capa_record' ? "UPDATE capa_records SET assigned_to='10'" : "UPDATE capa_actions SET owner='10'");
    expect(await replaceSourceTask(input(kind))).toBe('failed');
    expect(await tasks()).toEqual([{ task_id: 'existing', status: 'in_progress', assignee_id: 8 }]);
    expect(H.create).not.toHaveBeenCalled();
  });

  it.each([
    ['capa_record', "UPDATE capa_records SET target_close_date='2026-12-02'"],
    ['capa_record', "UPDATE capa_records SET state='closed_effective'"],
    ['capa_action', "UPDATE capa_actions SET due_date='2026-12-02'"],
    ['capa_action', "UPDATE capa_actions SET state='done'"],
  ])('preserves the old task when %s changed date or ended before the assignment reconciliation', async (kind, change) => {
    await seedOpen(kind); await pg.exec(change);
    expect(await replaceSourceTask(input(kind))).toBe('failed');
    expect(await tasks()).toEqual([{ task_id: 'existing', status: 'in_progress', assignee_id: 8 }]);
    expect(H.create).not.toHaveBeenCalled();
  });

  it.each(['inactive member', 'reader role', 'private project', 'create audit failure'])('preserves the old task on %s', async failure => {
    await seedOpen();
    if (failure === 'inactive member') H.actor.mockRejectedValue(new Error('Membership revoked'));
    if (failure === 'reader role') H.actor.mockResolvedValue({ userId: 9, role: 'reader' });
    if (failure === 'private project') H.access.mockResolvedValue(false);
    if (failure === 'create audit failure') H.audit.mockImplementation(async (_q: unknown, act: { command: string }) => {
      if (act.command === 'task.create') throw new Error('Audit ledger unavailable');
    });
    expect(await replaceSourceTask(input())).toBe('failed');
    expect(await tasks()).toEqual([{ task_id: 'existing', status: 'in_progress', assignee_id: 8 }]);
  });

  it('uses the CAPA creator fallback only when the native record names no numeric assignee', async () => {
    await seedOpen();
    await pg.exec("UPDATE capa_records SET assigned_to='Quality team',created_by='9'");
    expect(await replaceSourceTask(input())).toBe('scheduled');
    expect((await tasks())[1]).toEqual({ task_id: 'replacement', status: 'pending', assignee_id: 9 });
  });

  it('refuses to invent an action assignee from a free-text owner and the latest caller', async () => {
    await seedOpen('capa_action');
    await pg.exec("UPDATE capa_actions SET owner='Quality team'");
    expect(await replaceSourceTask(input('capa_action', 12))).toBe('failed');
    expect(await tasks()).toEqual([{ task_id: 'existing', status: 'in_progress', assignee_id: 8 }]);
  });
});
