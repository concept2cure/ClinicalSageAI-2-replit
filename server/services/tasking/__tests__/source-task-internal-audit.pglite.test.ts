/** Native audit, actor, task and task-audit state use real SQL; writer adapters are seams. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: null as null | ((text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>),
  org: 7, key: 'qms-internal-audit:4', trace: [] as Array<{ text: string; params?: unknown[] }>,
  create: vi.fn(), transition: vi.fn(), audit: vi.fn(), count: 0,
  beforeTextUpdate: null as null | (() => Promise<void>),
}));
const runner = vi.hoisted(() => ({
  select: () => ({ from: () => ({ where: async () => (await h.query!(`SELECT task_id AS "taskId",status,metadata,title,description,
    source_entity_id AS "sourceEntityId",assignee_id AS "assigneeId",project_id AS "projectId",client_workspace_id AS "clientWorkspaceId"
    FROM unified_tasks WHERE organization_id=$1 AND source_entity_type='qms_internal_audit' AND source_entity_id=$2
      AND status NOT IN ('cancelled','completed') AND deleted_at IS NULL`, [h.org, h.key])).rows }) }),
}));
vi.mock('../../../db', () => ({ db: runner, pool: { query: (sql: string, args?: unknown[]) => h.query!(sql, args) },
  getPool: () => ({ query: (sql: string, args?: unknown[]) => h.query!(sql, args) }) }));
vi.mock('drizzle-orm/node-postgres', () => ({ drizzle: () => runner }));
vi.mock('../../../db/withTenantConnection', () => ({
  withTenantConnection: async (_scope: unknown, fn: (q: unknown) => Promise<unknown>) => fn({ query: (sql: string, args?: unknown[]) => h.query!(sql, args) }),
}));
vi.mock('../../unifiedTaskService', () => ({ default: { createUnifiedTask: h.create, updateTaskStatus: h.transition } }));
vi.mock('../task-audit', () => ({ auditTaskActionInTx: h.audit }));

import { reconcileSourceTasks, replaceSourceTask, type ReplaceSourceTask, type SourceTaskNext } from '../source-task';
import { internalAuditTaskPlan, type InternalAuditTaskSource } from '../../qms/qms-record-tasks';

const native: InternalAuditTaskSource = { id: 4, audit_number: 'IA-2026-04', scope: 'Document control', status: 'planned',
  planned_date: '2026-12-01', auditor_lead_id: 12 };
let pg: PGlite;
function input(over: Partial<InternalAuditTaskSource> = {}, actorId = 12): ReplaceSourceTask {
  const plan = internalAuditTaskPlan({ ...native, ...over }, actorId);
  h.key = plan.sourceEntityId;
  return { organizationId: 7, actorId, ...plan };
}
const tasks = async () => (await pg.query<Record<string, unknown>>(`SELECT task_id,status,assignee_id,title,description,metadata,project_id,client_workspace_id,
  progress,completion_percentage,due_at,approval_status,notes
  FROM unified_tasks WHERE organization_id=7 ORDER BY task_id`)).rows;
const audits = async () => (await pg.query('SELECT task_id,command FROM task_audit_rows ORDER BY id')).rows;
async function seedOpen(over: Partial<InternalAuditTaskSource> = {}, assigneeId = 12) {
  const plan = internalAuditTaskPlan({ ...native, ...over }, 12);
  const task = plan.next!;
  await pg.query(`INSERT INTO unified_tasks(task_id,organization_id,source_entity_type,source_entity_id,status,assignee_id,title,description,metadata,progress,completion_percentage)
    VALUES('existing',7,'qms_internal_audit',$1,'in_progress',$2,$3,$4,$5::jsonb,40,40)`,
  [plan.sourceEntityId, assigneeId, task.title, task.description, JSON.stringify(task.metadata)]);
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id int PRIMARY KEY,status text);
    CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE qms_internal_audits(id int PRIMARY KEY,organization_id int,audit_number text,scope text,status text,planned_date timestamptz,auditor_lead_id int);
    CREATE TABLE unified_tasks(task_id text PRIMARY KEY,organization_id int,source_entity_type text,source_entity_id text,status text,
      assignee_id int,title text,description text,metadata jsonb,project_id int,client_workspace_id int,deleted_at timestamptz,
      progress int DEFAULT 0,completion_percentage int DEFAULT 0,due_at timestamptz DEFAULT '2026-12-01',
      approval_status text DEFAULT 'pending',notes text DEFAULT 'Manual task note',updated_at timestamptz DEFAULT '2026-11-13',last_modified_by int DEFAULT 99);
    CREATE TABLE task_audit_rows(id serial PRIMARY KEY,organization_id int,actor_id int,task_id text,command text,payload jsonb);`);
  h.query = async (text, params) => {
    h.trace.push({ text, params });
    if (text.startsWith('UPDATE unified_tasks SET title=') && h.beforeTextUpdate) {
      const beforeUpdate = h.beforeTextUpdate; h.beforeTextUpdate = null;
      await beforeUpdate();
    }
    // PGlite is a single connection; native ownership, row locks and all state writes execute unchanged.
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] };
    return pg.query<Record<string, unknown>>(text, params);
  };
});
afterAll(async () => { h.query = null; await pg.close(); });
beforeEach(async () => {
  await pg.exec(`TRUNCATE task_audit_rows,unified_tasks,qms_internal_audits,organization_users,users,organizations;
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(11,'active'),(12,'active'),(13,'active');
    INSERT INTO organization_users VALUES(7,11,'member'),(7,12,'member'),(7,13,'viewer');
    INSERT INTO qms_internal_audits VALUES(4,7,'IA-2026-04','Document control','planned','2026-12-01',12),
      (5,8,'FOREIGN-AUDIT','Private other tenant scope','planned','2026-12-01',12);`);
  h.org = 7; h.key = 'qms-internal-audit:4'; h.trace = []; h.count = 0; h.beforeTextUpdate = null;
  h.create.mockReset().mockImplementation(async (next: SourceTaskNext & { organizationId: number; sourceEntityId: string; sourceEntityType: string }) => {
    const taskId = `written-${++h.count}`;
    await h.query!(`INSERT INTO unified_tasks(task_id,organization_id,source_entity_type,source_entity_id,status,assignee_id,title,description,metadata,project_id,client_workspace_id)
      VALUES($1,$2,$3,$4,'pending',$5,$6,$7,$8::jsonb,$9,$10)`, [taskId,next.organizationId,next.sourceEntityType,next.sourceEntityId,
      next.assigneeId ?? null,next.title,next.description ?? null,JSON.stringify(next.metadata),next.projectId ?? null,next.clientWorkspaceId ?? null]);
    return { taskId };
  });
  h.transition.mockReset().mockImplementation(async (taskId: string, status: string, _actor: number, options: { organizationId: number; expectedStatus: string }) => {
    const result = await h.query!(`UPDATE unified_tasks SET status=$1 WHERE task_id=$2 AND organization_id=$3 AND status=$4 RETURNING task_id`,
      [status,taskId,options.organizationId,options.expectedStatus]);
    return result.rows[0];
  });
  h.audit.mockReset().mockImplementation(async (_q: unknown, action: { orgId: number; userId: number; taskId: string; command: string; payload: Record<string, unknown>; summary?: string }) => {
    await h.query!('INSERT INTO task_audit_rows(organization_id,actor_id,task_id,command,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
      [action.orgId,action.userId,action.taskId,action.command,JSON.stringify({ ...action.payload,...(action.summary ? { summary: action.summary } : {}) })]);
  });
});

describe('current internal-audit task scheduling', () => {
  it('schedules the native lead in organization scope with a locked current writer and an atomic audit row', async () => {
    expect(await replaceSourceTask(input())).toBe('scheduled');
    expect(await tasks()).toMatchObject([{ task_id: 'written-1',status: 'pending',assignee_id: 12,project_id: null,client_workspace_id: null }]);
    expect(await audits()).toEqual([{ task_id: 'written-1',command: 'task.create' }]);
    expect(h.trace.some(query => query.text.includes('organization_users') && query.text.includes('FOR SHARE'))).toBe(true);
    expect(h.trace.some(query => query.text.includes('qms_internal_audits') && query.text.includes('FOR SHARE'))).toBe(true);
    expect(h.trace.some(query => query.text.includes('pg_advisory_xact_lock'))).toBe(true);
  });
  it('keeps an unchanged task identity, progress and manual assignee without audit churn', async () => {
    await seedOpen({}, 11);
    expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(await tasks()).toMatchObject([{ task_id: 'existing',status: 'in_progress',assignee_id: 11 }]);
    expect(await audits()).toEqual([]); expect(h.create).not.toHaveBeenCalled();
  });
  it('uses the acting editor only when the current native audit has no lead', async () => {
    await pg.exec('UPDATE qms_internal_audits SET auditor_lead_id=NULL WHERE id=4');
    expect(await replaceSourceTask(input({ auditor_lead_id: null }, 11))).toBe('scheduled');
    expect(await tasks()).toMatchObject([{ assignee_id: 11 }]);
  });
  it('compares canonical payloads independently of key insertion order and Date serialization', async () => {
    const request = input();
    request.next = { ...request.next!, metadata: { remindDaysBefore: 14,due: '2026-12-01',auditId: 4 }, dueDate: new Date('2026-12-01T00:00:00.000Z') };
    expect(await replaceSourceTask(request)).toBe('scheduled');
  });
  it.each([['in_progress','completed'],['closed','completed'],['cancelled','cancelled']] as const)('closes the task when the current audit is %s', async (status, closeAs) => {
    await seedOpen(); await pg.query('UPDATE qms_internal_audits SET status=$1 WHERE id=4',[status]);
    expect(await replaceSourceTask(input({ status }))).toBe('closed');
    expect(await tasks()).toMatchObject([{ task_id: 'existing',status: closeAs }]);
    expect(await audits()).toEqual([{ task_id: 'existing',command: 'task.transition' }]);
  });
  it('withdraws the task when the current planned audit has no date', async () => {
    await seedOpen(); await pg.exec('UPDATE qms_internal_audits SET planned_date=NULL WHERE id=4');
    expect(await replaceSourceTask(input({ planned_date: null }))).toBe('closed');
    expect(await tasks()).toMatchObject([{ task_id: 'existing',status: 'cancelled' }]);
  });
});

describe('delayed internal-audit plans cannot replace current native work', () => {
  it.each(['in_progress','closed','cancelled'])('refuses an older planned snapshot after the current audit became %s', async status => {
    const stale = input();
    await seedOpen();
    await pg.query('UPDATE qms_internal_audits SET status=$1 WHERE id=4',[status]);
    await pg.query('UPDATE unified_tasks SET status=$1',[status === 'cancelled' ? 'cancelled' : 'completed']);
    const before = await tasks();
    expect(await replaceSourceTask(stale)).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
    expect(h.create).not.toHaveBeenCalled(); expect(h.transition).not.toHaveBeenCalled();
  });
  it.each(['in_progress','cancelled'])('preserves a replanned task when an old %s close arrives last', async status => {
    const stale = input({ status });
    await pg.exec("UPDATE qms_internal_audits SET planned_date='2026-12-04' WHERE id=4");
    await seedOpen({ planned_date: '2026-12-04' });
    const before = await tasks();
    expect(await replaceSourceTask(stale)).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it.each([
    ['date',"UPDATE qms_internal_audits SET planned_date='2026-12-04' WHERE id=4"],
    ['number',"UPDATE qms_internal_audits SET audit_number='IA-2026-REVISED' WHERE id=4"],
    ['scope',"UPDATE qms_internal_audits SET scope='Updated current audit scope' WHERE id=4"],
    ['lead','UPDATE qms_internal_audits SET auditor_lead_id=11 WHERE id=4'],
  ])('refuses an older current-row %s claim before closing any task', async (_label, change) => {
    const stale = input(); await seedOpen(); await pg.exec(change);
    const before = await tasks();
    expect(await replaceSourceTask(stale)).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it('refuses stale dates even when there is no existing task to protect', async () => {
    await pg.exec("UPDATE qms_internal_audits SET planned_date='2026-12-04' WHERE id=4");
    expect(await replaceSourceTask(input())).toBe('failed'); expect(await tasks()).toEqual([]);
  });
  it('refuses a false completed outcome for the current cancelled audit', async () => {
    await seedOpen(); await pg.exec("UPDATE qms_internal_audits SET status='cancelled' WHERE id=4");
    expect(await replaceSourceTask({ ...input({ status: 'cancelled' }), closeAs: 'completed' })).toBe('failed');
    expect(await tasks()).toMatchObject([{ status: 'in_progress' }]);
  });
});

describe('native audit task text and source identity', () => {
  it.each([['number','IA-2026-REVISED'],['scope','Updated current audit scope']])('refreshes same-date task text in place after a confirmed %s change', async (field,value) => {
    await seedOpen();
    const before = await tasks();
    const changed = field === 'number' ? { audit_number: value } : { scope: value };
    await pg.query(field === 'number' ? 'UPDATE qms_internal_audits SET audit_number=$1 WHERE id=4' : 'UPDATE qms_internal_audits SET scope=$1 WHERE id=4',[value]);
    const desired = internalAuditTaskPlan({ ...native,...changed },12).next!;
    expect(await replaceSourceTask(input(changed))).toBe('unchanged');
    expect(await tasks()).toEqual([{ ...before[0],title: desired.title,description: desired.description }]);
    expect(await audits()).toEqual([{ task_id: 'existing',command: 'task.transition' }]);
  });
  it('uses the canonical date comparison even if a delayed caller asks to keep everything', async () => {
    await seedOpen(); await pg.exec("UPDATE qms_internal_audits SET planned_date='2026-12-04' WHERE id=4");
    expect(await replaceSourceTask({ ...input({ planned_date: '2026-12-04' }),same: () => true })).toBe('scheduled');
    expect(await tasks()).toMatchObject([{ status: 'cancelled' },{ metadata: { due: '2026-12-04' } }]);
  });
  it.each(['qms-internal-audit:04','qms-internal-audit:0','qms-internal-audit:-4','qms-internal-audit:2147483648','qms-internal-audit:4:extra','audit:4'])('refuses malformed source key %s', async key => {
    const request = input(); h.key = key;
    expect(await replaceSourceTask({ ...request,sourceEntityId: key })).toBe('failed');
    expect(await tasks()).toEqual([]); expect(await audits()).toEqual([]);
  });
  it('refuses prefix reconciliation instead of treating it as an audited native key', async () => {
    const request = input();
    expect((await reconcileSourceTasks({ organizationId: 7,actorId: 12,sourceEntityType: request.sourceEntityType,
      match: { prefix: 'qms-internal-audit:' },desired: new Map([[request.sourceEntityId,{next: request.next!,same: request.same}]]),closeAs: () => request.closeAs })).failed).toBe(true);
    expect(await tasks()).toEqual([]);
  });
  it.each(['project','metadata','description','due time'])('refuses a noncanonical desired %s payload', async mismatch => {
    const request = input();
    request.next = { ...request.next!,...(mismatch === 'project' ? {projectId: 99} : {}),
      ...(mismatch === 'metadata' ? {metadata: {auditId: 99,due: '2026-12-01'}} : {}),
      ...(mismatch === 'description' ? {description: 'Invented current facts'} : {}),
      ...(mismatch === 'due time' ? {dueDate: new Date('2026-12-01T12:00:00Z')} : {}) };
    expect(await replaceSourceTask(request)).toBe('failed'); expect(await tasks()).toEqual([]);
  });
});

describe('audit text refresh preserves a person’s task work', () => {
  it.each([['number','IA-2026-REVISED'],['scope','Updated current audit scope']])('preserves manual assignee, progress and identity on same-date %s edits', async (field,value) => {
    await seedOpen({},11);
    await pg.exec(`UPDATE unified_tasks SET metadata=metadata || '{"manualTag":"retain me"}'::jsonb WHERE task_id='existing'`);
    const before = (await tasks())[0];
    const changed = field === 'number' ? { audit_number: value } : { scope: value };
    await pg.query(field === 'number' ? 'UPDATE qms_internal_audits SET audit_number=$1 WHERE id=4' : 'UPDATE qms_internal_audits SET scope=$1 WHERE id=4',[value]);
    const desired = internalAuditTaskPlan({ ...native,...changed },12).next!;
    expect(await replaceSourceTask(input(changed))).toBe('unchanged');
    expect(await tasks()).toEqual([{ ...before,title: desired.title,description: desired.description }]);
    expect(h.create).not.toHaveBeenCalled(); expect(h.transition).not.toHaveBeenCalled();
    expect((await pg.query('SELECT payload FROM task_audit_rows')).rows).toEqual([{ payload: {
      sourceEntityType: 'qms_internal_audit',sourceEntityId: 'qms-internal-audit:4',before: 'in_progress',after: 'in_progress',
      text: { before: { title: before.title,description: before.description },after: { title: desired.title,description: desired.description } },
      summary: 'Updated task text from its current Quality audit record',
    } }]);
    expect(h.audit.mock.calls[0][1]).not.toHaveProperty('reason');
    const stamp = (await pg.query<Record<string, unknown>>('SELECT updated_at,last_modified_by FROM unified_tasks')).rows[0];
    expect(stamp.last_modified_by).toBe(12); expect(new Date(String(stamp.updated_at)).getTime()).toBeGreaterThan(new Date('2026-11-13').getTime());
    expect(await replaceSourceTask(input(changed))).toBe('unchanged');
    expect(await audits()).toEqual([{ task_id: 'existing',command: 'task.transition' }]);
    expect((await pg.query<Record<string, unknown>>('SELECT updated_at,last_modified_by FROM unified_tasks')).rows[0]).toEqual(stamp);
  });

  it('refreshes a nullable old description with the same task and business state', async () => {
    await seedOpen({},11); await pg.exec("UPDATE unified_tasks SET description=NULL WHERE task_id='existing'");
    const before = (await tasks())[0];
    expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(await tasks()).toEqual([{ ...before,description: internalAuditTaskPlan(native,12).next!.description }]);
    expect(await audits()).toEqual([{ task_id: 'existing',command: 'task.transition' }]);
    expect(h.create).not.toHaveBeenCalled(); expect(h.transition).not.toHaveBeenCalled();
  });

  it.each(['title','description','status','audit'])('rolls text and ledger back after a %s race or failure', async failure => {
    await seedOpen({},11); const before = await tasks();
    await pg.exec("UPDATE qms_internal_audits SET scope='Updated current audit scope' WHERE id=4");
    if (failure === 'audit') {
      const writeAudit = h.audit.getMockImplementation()!;
      h.audit.mockImplementation(async (...args: Parameters<typeof writeAudit>) => { await writeAudit(...args); throw new Error('Task audit unavailable'); });
    } else {
      h.beforeTextUpdate = async () => {
        if (failure === 'title') await pg.exec("UPDATE unified_tasks SET title='A concurrent manual title' WHERE task_id='existing'");
        if (failure === 'description') await pg.exec("UPDATE unified_tasks SET description='A concurrent manual description' WHERE task_id='existing'");
        if (failure === 'status') await pg.exec("UPDATE unified_tasks SET status='completed' WHERE task_id='existing'");
      };
    }
    expect(await replaceSourceTask(input({ scope: 'Updated current audit scope' }))).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
    expect(h.create).not.toHaveBeenCalled(); expect(h.transition).not.toHaveBeenCalled();
    expect((await pg.query('SELECT scope FROM qms_internal_audits WHERE id=4')).rows).toEqual([{ scope: 'Updated current audit scope' }]);
  });
});

describe('current audit and actor admission before task writes', () => {
  it.each([5,99])('refuses foreign or missing native audit %s', async id => {
    expect(await replaceSourceTask(input({ id }))).toBe('failed');
    expect(await tasks()).toEqual([]); expect(await audits()).toEqual([]);
  });
  it.each([
    ['inactive actor',"UPDATE users SET status='inactive' WHERE id=12"],
    ['inactive organization',"UPDATE organizations SET status='inactive' WHERE id=7"],
    ['removed membership','DELETE FROM organization_users WHERE user_id=12'],
    ['viewer actor',"UPDATE organization_users SET role='viewer' WHERE user_id=12"],
    ['ambiguous membership',"INSERT INTO organization_users VALUES(7,12,'member')"],
    ['unknown native state',"UPDATE qms_internal_audits SET status='unknown' WHERE id=4"],
  ])('preserves existing work on %s', async (_label, change) => {
    await seedOpen(); const before = await tasks(); await pg.exec(change);
    expect(await replaceSourceTask(input())).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it('checks the current actor even for a close-only request with no open task', async () => {
    await pg.exec("UPDATE qms_internal_audits SET status='closed' WHERE id=4; DELETE FROM organization_users WHERE user_id=12");
    expect(await replaceSourceTask(input({ status: 'closed' }))).toBe('failed');
    expect(await tasks()).toEqual([]);
  });
});

describe('internal-audit task replacement is atomic', () => {
  it.each(['create','transition audit','create audit','status CAS'])('preserves tasks and audit rows after %s failure', async failure => {
    await seedOpen(); const before = await tasks();
    await pg.exec("UPDATE qms_internal_audits SET planned_date='2026-12-04' WHERE id=4");
    if (failure === 'create') h.create.mockRejectedValueOnce(new Error('Task writer unavailable'));
    if (failure === 'status CAS') h.transition.mockImplementationOnce(async () => {
      const result = await h.query!("UPDATE unified_tasks SET status='cancelled' WHERE task_id='existing' AND status='no-longer-current' RETURNING task_id");
      return result.rows[0];
    });
    if (failure.endsWith('audit')) {
      const writeAudit = h.audit.getMockImplementation()!;
      h.audit.mockImplementation(async (...args: Parameters<typeof writeAudit>) => {
        await writeAudit(...args);
        if (args[1].command === (failure === 'transition audit' ? 'task.transition' : 'task.create')) throw new Error('Task audit unavailable');
      });
    }
    expect(await replaceSourceTask(input({ planned_date: '2026-12-04' }))).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
    expect((await pg.query('SELECT planned_date::date::text AS due FROM qms_internal_audits WHERE id=4')).rows).toEqual([{ due: '2026-12-04' }]);
  });
});
