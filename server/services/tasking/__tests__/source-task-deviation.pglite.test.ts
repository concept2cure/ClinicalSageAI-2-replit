/** Current native deviations, actor admission and task/ledger effects use real SQL; adapters are seams. */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: null as null | ((sql: string,args?: unknown[]) => Promise<{rows: Record<string,unknown>[]}>) ,
  key: 'qms-deviation:7',trace: [] as string[],create: vi.fn(),transition: vi.fn(),audit: vi.fn(),count: 0,
  beforeRefresh: null as null | (() => Promise<void>) }));
const runner = vi.hoisted(() => ({ select: () => ({ from: () => ({ where: async () => (await h.query!(`
  SELECT task_id AS "taskId",status,metadata,title,description,priority,source_entity_id AS "sourceEntityId",assignee_id AS "assigneeId",
    project_id AS "projectId",client_workspace_id AS "clientWorkspaceId" FROM unified_tasks
  WHERE organization_id=7 AND source_entity_type='qms_deviation' AND source_entity_id=$1
    AND status NOT IN ('completed','cancelled') AND deleted_at IS NULL`,[h.key])).rows }) }) }));
vi.mock('../../../db', () => ({ db: runner,pool: {query: (sql: string,args?: unknown[]) => h.query!(sql,args)},
  getPool: () => ({query: (sql: string,args?: unknown[]) => h.query!(sql,args)}) }));
vi.mock('drizzle-orm/node-postgres', () => ({drizzle: () => runner}));
vi.mock('../../../db/withTenantConnection', () => ({ withTenantConnection: async (_scope: unknown,fn: (q: unknown) => Promise<unknown>) =>
  fn({query: (sql: string,args?: unknown[]) => h.query!(sql,args)}) }));
vi.mock('../../unifiedTaskService', () => ({ default: {createUnifiedTask: h.create,updateTaskStatus: h.transition} }));
vi.mock('../task-audit', () => ({auditTaskActionInTx: h.audit}));

import { reconcileSourceTasks,replaceSourceTask,type ReplaceSourceTask,type SourceTaskNext } from '../source-task';
import { deviationTaskPlan,type DeviationTaskSource } from '../../qms/qms-record-tasks';
const native: DeviationTaskSource = {id: 7,deviation_number: 'DEV-2026-007',title: 'Fictional documentation deviation',
  classification: 'minor',status: 'open',target_closure_date: '2026-12-15'};
let pg: PGlite;
function input(over: Partial<DeviationTaskSource> = {},actorId = 12): ReplaceSourceTask {
  const plan = deviationTaskPlan({...native,...over},actorId); h.key = plan.sourceEntityId;
  return {organizationId: 7,actorId,...plan};
}
const tasks = async () => (await pg.query<Record<string,unknown>>(`SELECT task_id,status,assignee_id,title,description,priority,
  metadata,project_id,client_workspace_id,progress,completion_percentage,due_date,approval_status,notes FROM unified_tasks ORDER BY task_id`)).rows;
const audits = async () => (await pg.query<Record<string,unknown>>('SELECT task_id,command,payload FROM task_audit_rows ORDER BY id')).rows;
async function seedOpen(over: Partial<DeviationTaskSource> = {},assigneeId = 11) {
  const task = deviationTaskPlan({...native,...over},12).next!;
  await pg.query(`INSERT INTO unified_tasks(task_id,organization_id,source_entity_type,source_entity_id,status,assignee_id,title,description,
    priority,metadata,progress,completion_percentage,due_date,approval_status,notes)
    VALUES('existing',7,'qms_deviation',$1,'in_progress',$2,$3,$4,$5,$6::jsonb,60,60,$7,'pending','A manual task note')`,
  [`qms-deviation:${native.id}`,assigneeId,task.title,task.description,task.priority,JSON.stringify({...task.metadata,manualTag: 'retain me'}),task.dueDate]);
}
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE organizations(id int PRIMARY KEY,status text); CREATE TABLE users(id int PRIMARY KEY,status text);
    CREATE TABLE organization_users(organization_id int,user_id int,role text);
    CREATE TABLE qc_deviations(id int PRIMARY KEY,organization_id int,deviation_number text,title text,classification text,status text,
      target_closure_date timestamptz,priority text DEFAULT 'medium');
    CREATE TABLE unified_tasks(task_id text PRIMARY KEY,organization_id int,source_entity_type text,source_entity_id text,status text,assignee_id int,
      title text,description text,priority text,metadata jsonb,project_id int,client_workspace_id int,progress int DEFAULT 0,completion_percentage int DEFAULT 0,
      due_date timestamptz,approval_status text,notes text,deleted_at timestamptz,updated_at timestamptz DEFAULT '2026-11-13',last_modified_by int DEFAULT 99);
    CREATE TABLE task_audit_rows(id serial PRIMARY KEY,organization_id int,actor_id int,task_id text,command text,payload jsonb);`);
  h.query = async (sql,args) => {
    h.trace.push(sql);
    if (sql.startsWith('UPDATE unified_tasks SET title=') && h.beforeRefresh) {
      const before = h.beforeRefresh; h.beforeRefresh = null; await before();
    }
    // Single connection: execute ownership, row-lock and task/audit SQL; record the advisory-lock contract.
    if (sql.includes('pg_advisory_xact_lock')) return {rows: []};
    return pg.query<Record<string,unknown>>(sql,args);
  };
});
afterAll(async () => {h.query = null; await pg.close();});
beforeEach(async () => {
  await pg.exec(`TRUNCATE task_audit_rows,unified_tasks,qc_deviations,organization_users,users,organizations;
    INSERT INTO organizations VALUES(7,'active'),(8,'active'); INSERT INTO users VALUES(11,'active'),(12,'active'),(13,'active');
    INSERT INTO organization_users VALUES(7,11,'member'),(7,12,'member'),(7,13,'viewer');
    INSERT INTO qc_deviations(id,organization_id,deviation_number,title,classification,status,target_closure_date) VALUES
      (7,7,'DEV-2026-007','Fictional documentation deviation','minor','open','2026-12-15'),
      (8,8,'FOREIGN-DEV','Other tenant private title','minor','open','2026-12-15');`);
  h.key = 'qms-deviation:7'; h.trace = []; h.count = 0; h.beforeRefresh = null;
  h.create.mockReset().mockImplementation(async (next: SourceTaskNext & {organizationId: number;sourceEntityType: string;sourceEntityId: string}) => {
    const taskId = `written-${++h.count}`;
    await h.query!(`INSERT INTO unified_tasks(task_id,organization_id,source_entity_type,source_entity_id,status,assignee_id,title,description,priority,
      metadata,project_id,client_workspace_id,due_date) VALUES($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
    [taskId,next.organizationId,next.sourceEntityType,next.sourceEntityId,next.assigneeId,next.title,next.description,next.priority,
      JSON.stringify(next.metadata),next.projectId ?? null,next.clientWorkspaceId ?? null,next.dueDate]);
    return {taskId};
  });
  h.transition.mockReset().mockImplementation(async (taskId: string,status: string,_actor: number,opts: {organizationId: number;expectedStatus: string}) => {
    return (await h.query!('UPDATE unified_tasks SET status=$1 WHERE task_id=$2 AND organization_id=$3 AND status=$4 RETURNING task_id',
      [status,taskId,opts.organizationId,opts.expectedStatus])).rows[0];
  });
  h.audit.mockReset().mockImplementation(async (_q: unknown,action: {orgId: number;userId: number;taskId: string;command: string;payload: Record<string,unknown>;summary?: string}) => {
    await h.query!('INSERT INTO task_audit_rows(organization_id,actor_id,task_id,command,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
      [action.orgId,action.userId,action.taskId,action.command,JSON.stringify({...action.payload,...(action.summary ? {summary: action.summary} : {})})]);
  });
});

describe('deviation classification controls reminder priority without resetting task work', () => {
  it.each([['minor','major','high'],['minor','critical','critical'],['major','critical','critical'],
    ['critical','major','high'],['critical','minor','medium'],['major','minor','medium']])('%s to %s preserves manual work and sets priority %s',async (from,to,priority) => {
    await pg.query('UPDATE qc_deviations SET classification=$1 WHERE id=7',[from]); await seedOpen({classification: from});
    const before = (await tasks())[0]; await pg.query('UPDATE qc_deviations SET classification=$1 WHERE id=7',[to]);
    const desired = deviationTaskPlan({...native,classification: to},12).next!;
    expect(await replaceSourceTask(input({classification: to}))).toBe('unchanged');
    expect(await tasks()).toEqual([{...before,title: desired.title,description: desired.description,priority}]);
    expect(h.create).not.toHaveBeenCalled(); expect(h.transition).not.toHaveBeenCalled();
    expect(await audits()).toEqual([{task_id: 'existing',command: 'task.transition',payload: {
      sourceEntityType: 'qms_deviation',sourceEntityId: 'qms-deviation:7',before: 'in_progress',after: 'in_progress',
      fields: {before: {title: before.title,description: before.description,priority: before.priority},
        after: {title: desired.title,description: desired.description,priority}},summary: 'Updated task fields from its current Quality deviation record',
    }}]);
    expect(h.audit.mock.calls[0][1]).not.toHaveProperty('reason');
    const stamp = (await pg.query<Record<string,unknown>>('SELECT updated_at,last_modified_by FROM unified_tasks')).rows[0];
    expect(stamp.last_modified_by).toBe(12);
    expect(await replaceSourceTask(input({classification: to}))).toBe('unchanged');
    expect(await audits()).toHaveLength(1);
    expect((await pg.query<Record<string,unknown>>('SELECT updated_at,last_modified_by FROM unified_tasks')).rows[0]).toEqual(stamp);
  });
  it('repairs priority-only drift even when text is already current, ignoring the legacy native priority field',async () => {
    await pg.exec("UPDATE qc_deviations SET classification='critical',priority='medium' WHERE id=7");
    await seedOpen({classification: 'critical'}); await pg.exec("UPDATE unified_tasks SET priority='medium'");
    const before = (await tasks())[0];
    expect(await replaceSourceTask(input({classification: 'critical'}))).toBe('unchanged');
    expect(await tasks()).toEqual([{...before,priority: 'critical'}]); expect(await audits()).toHaveLength(1);
  });
  it('a different editing actor does not replace the existing assignee during a same-date refresh',async () => {
    await seedOpen({},12); await pg.exec("UPDATE qc_deviations SET classification='major' WHERE id=7");
    const before = (await tasks())[0],desired = deviationTaskPlan({...native,classification: 'major'},11).next!;
    expect(await replaceSourceTask(input({classification: 'major'},11))).toBe('unchanged');
    expect(await tasks()).toEqual([{...before,description: desired.description,priority: 'high'}]);
  });
});

describe('current deviation lifecycle and actor admission', () => {
  it.each(['open','under_investigation','pending_approval'])('keeps semantically equivalent unfinished %s work',async status => {
    await seedOpen(); await pg.query('UPDATE qc_deviations SET status=$1 WHERE id=7',[status]);
    const before = await tasks(); expect(await replaceSourceTask(input())).toBe('unchanged');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it('creates organization-owned work for the acting editor through the current native and actor locks',async () => {
    expect(await replaceSourceTask(input({},11))).toBe('scheduled');
    expect(await tasks()).toMatchObject([{assignee_id: 11,project_id: null,client_workspace_id: null,priority: 'medium'}]);
    expect(h.trace.some(sql => sql.includes('organization_users') && sql.includes('FOR SHARE'))).toBe(true);
    expect(h.trace.some(sql => sql.includes('qc_deviations') && sql.includes('FOR SHARE'))).toBe(true);
    expect(h.trace.some(sql => sql.includes('pg_advisory_xact_lock'))).toBe(true); expect(await audits()).toHaveLength(1);
  });
  it.each([['closed','completed'],['cancelled','cancelled']])('ends task only with current %s outcome %s',async (status,closeAs) => {
    await seedOpen(); await pg.query('UPDATE qc_deviations SET status=$1 WHERE id=7',[status]);
    expect(await replaceSourceTask(input({status}))).toBe('closed'); expect(await tasks()).toMatchObject([{status: closeAs}]);
  });
  it('withdraws a current undated unfinished reminder',async () => {
    await seedOpen(); await pg.exec('UPDATE qc_deviations SET target_closure_date=NULL WHERE id=7');
    expect(await replaceSourceTask(input({target_closure_date: null}))).toBe('closed');
    expect(await tasks()).toMatchObject([{status: 'cancelled'}]);
  });
  it.each([['actor inactive',"UPDATE users SET status='inactive' WHERE id=12"],['organization inactive',"UPDATE organizations SET status='inactive' WHERE id=7"],
    ['membership removed','DELETE FROM organization_users WHERE user_id=12'],['viewer',"UPDATE organization_users SET role='viewer' WHERE user_id=12"],
    ['unknown classification',"UPDATE qc_deviations SET classification='unknown' WHERE id=7"],['unknown status',"UPDATE qc_deviations SET status='unknown' WHERE id=7"]])('preserves current task on %s',async (_label,change) => {
    await seedOpen(); const before = await tasks(); await pg.exec(change);
    expect(await replaceSourceTask(input())).toBe('failed'); expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it.each([8,99])('refuses foreign/missing native owner %s',async id => {
    expect(await replaceSourceTask(input({id}))).toBe('failed'); expect(await tasks()).toEqual([]);
  });
  it.each(['closed','cancelled'])('still validates the current actor for terminal %s with no task',async status => {
    await pg.query('UPDATE qc_deviations SET status=$1 WHERE id=7',[status]); await pg.exec('DELETE FROM organization_users WHERE user_id=12');
    expect(await replaceSourceTask(input({status}))).toBe('failed'); expect(await tasks()).toEqual([]);
  });
});

describe('delayed native plans cannot overwrite current deviation work', () => {
  it.each(['closed','cancelled'])('does not recreate an active task after current native %s',async status => {
    const stale = input(); await seedOpen(); await pg.query('UPDATE qc_deviations SET status=$1 WHERE id=7',[status]);
    await pg.query('UPDATE unified_tasks SET status=$1',[status === 'closed' ? 'completed' : 'cancelled']); const before = await tasks();
    expect(await replaceSourceTask(stale)).toBe('failed'); expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
  it.each([['date',"UPDATE qc_deviations SET target_closure_date='2026-12-20' WHERE id=7"],
    ['classification',"UPDATE qc_deviations SET classification='critical' WHERE id=7"]])('refuses old %s plans, including with no task',async (_label,change) => {
    const stale = input(); await pg.exec(change);
    expect(await replaceSourceTask(stale)).toBe('failed'); expect(await tasks()).toEqual([]);
  });
  it('does not let an earlier date-removal cancellation close a newly dated unfinished deviation task',async () => {
    const stale = input({target_closure_date: null}); await pg.exec("UPDATE qc_deviations SET target_closure_date='2026-12-20' WHERE id=7");
    await seedOpen({target_closure_date: '2026-12-20'}); const before = await tasks();
    expect(await replaceSourceTask(stale)).toBe('failed'); expect(await tasks()).toEqual(before);
  });
  it.each([['closed','cancelled'],['cancelled','completed']])('refuses false closure %s as %s',async (status,closeAs) => {
    await pg.query('UPDATE qc_deviations SET status=$1 WHERE id=7',[status]);
    expect(await replaceSourceTask({...input({status}),closeAs: closeAs as 'completed' | 'cancelled'})).toBe('failed');
  });
  it('uses the canonical due matcher rather than a caller that asks to keep an obsolete task',async () => {
    await seedOpen(); await pg.exec("UPDATE qc_deviations SET target_closure_date='2026-12-20' WHERE id=7");
    expect(await replaceSourceTask({...input({target_closure_date: '2026-12-20'}),same: () => true})).toBe('scheduled');
    expect(await tasks()).toMatchObject([{task_id: 'existing',status: 'cancelled'},{task_id: 'written-1',metadata: {due: '2026-12-20'}}]);
  });
});

describe('deviation task scope and requested payload are exact', () => {
  it.each(['qms-deviation:0','qms-deviation:07','qms-deviation:-7','qms-deviation:2147483648','qms-deviation:7:extra','qms-internal-audit:7'])('refuses key %s',async key => {
    const request = input(); h.key = key;
    expect(await replaceSourceTask({...request,sourceEntityId: key})).toBe('failed'); expect(await tasks()).toEqual([]);
  });
  it('refuses a prefix and mismatched extra desired keys',async () => {
    const request = input(),desired = new Map([[request.sourceEntityId,{next: request.next!,same: request.same}]]);
    const reconcile = {organizationId: 7,actorId: 12,sourceEntityType: request.sourceEntityType,desired,closeAs: () => request.closeAs};
    expect((await reconcileSourceTasks({...reconcile,match: {prefix: 'qms-deviation:'}})).failed).toBe(true);
    desired.set('qms-deviation:99',{next: request.next!,same: request.same});
    expect((await reconcileSourceTasks({...reconcile,match: {exact: request.sourceEntityId}})).failed).toBe(true);
    expect(await tasks()).toEqual([]);
  });
  it.each(['priority','assignee','metadata','description','project'])('refuses a noncanonical desired %s',async field => {
    const request = input(); request.next = {...request.next!,
      ...(field === 'priority' ? {priority: 'critical' as const} : {}),...(field === 'assignee' ? {assigneeId: 11} : {}),
      ...(field === 'metadata' ? {metadata: {due: '2026-12-20'}} : {}),...(field === 'description' ? {description: 'Unverified current text'} : {}),
      ...(field === 'project' ? {projectId: 123} : {})};
    expect(await replaceSourceTask(request)).toBe('failed'); expect(await tasks()).toEqual([]);
  });
});

describe('deviation task field CAS and transaction failures', () => {
  it.each(['title','description','priority','status','audit'])('rolls field refresh back on %s race/failure',async failure => {
    await seedOpen(); const before = await tasks(); await pg.exec("UPDATE qc_deviations SET classification='critical' WHERE id=7");
    if (failure === 'audit') {
      const write = h.audit.getMockImplementation()!;
      h.audit.mockImplementation(async (...args: Parameters<typeof write>) => {await write(...args); throw new Error('Ledger unavailable');});
    } else h.beforeRefresh = async () => {
      if (failure === 'title') await pg.exec("UPDATE unified_tasks SET title='Concurrent manual title'");
      if (failure === 'description') await pg.exec("UPDATE unified_tasks SET description='Concurrent manual description'");
      if (failure === 'priority') await pg.exec("UPDATE unified_tasks SET priority='low'");
      if (failure === 'status') await pg.exec("UPDATE unified_tasks SET status='completed'");
    };
    expect(await replaceSourceTask(input({classification: 'critical'}))).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]); expect(h.create).not.toHaveBeenCalled();
    expect((await pg.query<Record<string,unknown>>('SELECT classification FROM qc_deviations WHERE id=7')).rows).toEqual([{classification: 'critical'}]);
  });
  it.each(['create','transition audit','create audit','status CAS'])('keeps date replacement atomic on %s failure',async failure => {
    await seedOpen(); const before = await tasks(); await pg.exec("UPDATE qc_deviations SET target_closure_date='2026-12-20' WHERE id=7");
    if (failure === 'create') h.create.mockRejectedValueOnce(new Error('Task writer unavailable'));
    if (failure === 'status CAS') h.transition.mockResolvedValueOnce(undefined);
    if (failure.endsWith('audit')) {
      const write = h.audit.getMockImplementation()!;
      h.audit.mockImplementation(async (...args: Parameters<typeof write>) => {await write(...args);
        if (args[1].command === (failure === 'transition audit' ? 'task.transition' : 'task.create')) throw new Error('Ledger unavailable');});
    }
    expect(await replaceSourceTask(input({target_closure_date: '2026-12-20'}))).toBe('failed');
    expect(await tasks()).toEqual(before); expect(await audits()).toEqual([]);
  });
});
