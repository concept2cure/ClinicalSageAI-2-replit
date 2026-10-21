import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), notice: vi.fn() }));
vi.mock('../../../../db', () => ({ pool: { query: H.query, connect: H.connect }, getPool: () => ({ query: H.query }) }));
vi.mock('../../../notifications/notification-service', () => ({ createNotification: H.notice }));
import * as service from '../service';
import { runWithTenantScope } from '../../../../db/tenantStore';

let database: PGlite;
const statements: string[] = [];
let beforeQuery: ((sql: string) => Promise<void>) | undefined;
const executor = { query: async (sql: string, params?: unknown[]) => {
  statements.push(sql);
  await beforeQuery?.(sql);
  return database.query<Record<string, unknown>>(sql, params);
}, discard: vi.fn() };
const context = (actorUserId = 99) => ({ actorUserId, executor });
const params = { orgId: 7, projectId: 11, projectType: 'IND', baselineDate: new Date('2031-01-01Z') };
const operations = [
  ['read', (ctx: ReturnType<typeof context>) => service.getScheduleOfEvents(7, 11, ctx)],
  ['generate', (ctx: ReturnType<typeof context>) => service.generateProjectSchedule(params, ctx)],
  ['amend', (ctx: ReturnType<typeof context>) => service.amendMilestone({ orgId: 7, projectId: 11, milestoneKey: 'private', note: 'Private note' }, ctx)],
  ['reset', (ctx: ReturnType<typeof context>) => service.resetProjectGoals({ orgId: 7, projectId: 11, goals: [{ title: 'Secret goal' }], rationale: 'Confidential rationale' }, ctx)],
  ['review', (ctx: ReturnType<typeof context>) => service.reviewScheduleHealth({ orgId: 7, projectId: 11, apply: true }, ctx)],
] as const;
const writes = operations.slice(1);

beforeAll(async () => {
  database = new PGlite();
  await database.exec(`
    CREATE TABLE organizations(id int PRIMARY KEY, status text);
    CREATE TABLE users(id int PRIMARY KEY, status text);
    CREATE TABLE organization_users(organization_id int, user_id int, role text);
    CREATE TABLE projects(id int PRIMARY KEY, organization_id int, status text, owner_id int, created_by_id int, settings json);
    CREATE TABLE project_visibility_settings(project_id int, organization_id int, visibility text);
    CREATE TABLE project_members(project_id int, organization_id int, user_id int, role text, status text);
    CREATE TABLE concept2cure_artifacts(id int PRIMARY KEY, artifact_id text, organization_id int, project_id int);
    CREATE TABLE concept2cure_review_assignments(artifact_id int, organization_id int, reviewer_id int, status text);
    CREATE TABLE project_workflow_stages(id serial PRIMARY KEY, organization_id int, project_id int, name text,
      description text, "order" int, status text, start_date timestamp, due_date timestamp, auto_advance boolean,
      metadata json, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    CREATE TABLE project_tasks(id serial PRIMARY KEY, organization_id int, project_id int, name text,
      description text, status text, priority text, module_type text, due_date timestamp, metadata json,
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    INSERT INTO organizations VALUES(7,'active'),(8,'active');
    INSERT INTO users VALUES(5,'active'),(6,'active'),(8,'active'),(9,'active'),(10,'active'),(99,'active');
    INSERT INTO organization_users VALUES(7,5,'member'),(7,6,'member'),(7,8,'viewer'),(7,9,'member'),(7,10,'manager'),(7,99,'member');
    INSERT INTO projects VALUES(11,7,'active',99,99,'{}'),(12,7,'active',99,99,'{}'),(21,8,'active',99,99,'{}');
    INSERT INTO project_visibility_settings VALUES(11,7,'private'),(12,7,'org_public'),(21,8,'private');
    INSERT INTO project_members VALUES(11,7,6,'use','active'),(11,7,9,'edit','active');
    INSERT INTO concept2cure_artifacts VALUES(100,'private-artifact',7,11);
    INSERT INTO concept2cure_review_assignments VALUES(100,7,8,'pending');
  `);
  await database.exec(readFileSync(new URL('../../../../../db/migrations/20260617_project_schedule_of_events.sql', import.meta.url), 'utf8'));
  await database.exec('DROP INDEX unique_project_schedule; CREATE UNIQUE INDEX unique_project_schedule_org ON project_schedule_of_events(organization_id,project_id);');
}, 60_000);
afterAll(async () => { await database?.close(); });
beforeEach(async () => {
  beforeQuery = undefined;
  await database.exec(`ROLLBACK; UPDATE users SET status='active'; UPDATE organizations SET status='active';
    UPDATE projects SET status='active'; UPDATE project_members SET status='active';
    UPDATE organization_users SET role=CASE user_id WHEN 8 THEN 'viewer' WHEN 10 THEN 'manager' ELSE 'member' END;
    DELETE FROM project_schedule_revisions; DELETE FROM project_schedule_goals;
    DELETE FROM project_workflow_stages; DELETE FROM project_tasks; DELETE FROM project_schedule_of_events;
    INSERT INTO project_schedule_of_events(id,organization_id,project_id,basis_summary) VALUES(1,7,11,'Confidential plan');
    SELECT setval('project_schedule_of_events_id_seq',1,true);
    INSERT INTO project_workflow_stages(organization_id,project_id,name,"order",status,due_date,metadata)
      VALUES(7,11,'Confidential milestone',1,'pending','2020-01-01','{"source":"ana_schedule_of_events","key":"private","isCritical":true,"scheduleStatus":"not_started"}');
  `);
  statements.length = 0;
  H.query.mockReset().mockResolvedValue({ rows: [] });
  H.connect.mockReset().mockResolvedValue({ query: H.query, release: vi.fn() });
  H.notice.mockReset().mockResolvedValue(1);
  executor.discard.mockReset();
});

describe('schedule service current actor and supplied executor', () => {
  it.each(operations)('%s refuses a same-org private-project nonmember before protected data', async (_name, operation) => {
    await expect(operation(context(5))).rejects.toMatchObject({ status: 403 });
    expect(statements.some(sql => /FROM project_schedule_|FROM project_workflow_stages/.test(sql))).toBe(false);
    expect(H.query).not.toHaveBeenCalled(); expect(H.connect).not.toHaveBeenCalled(); expect(H.notice).not.toHaveBeenCalled();
  });
  it.each(operations)('%s refuses a missing executor instead of using the pool', async (_name, operation) => {
    await expect(operation({ actorUserId: 99 } as ReturnType<typeof context>)).rejects.toMatchObject({ status: 503 });
    expect(H.query).not.toHaveBeenCalled(); expect(H.connect).not.toHaveBeenCalled();
  });
  it.each(operations)('%s refuses an inactive actor despite an old owner identity', async (_name, operation) => {
    await database.exec("UPDATE users SET status='inactive' WHERE id=99");
    await expect(operation(context())).rejects.toMatchObject({ status: 403 });
    expect(H.notice).not.toHaveBeenCalled();
  });
  it.each(writes)('%s refuses use-only membership', async (_name, operation) => {
    await expect(operation(context(6))).rejects.toMatchObject({ status: 403 });
    expect(H.notice).not.toHaveBeenCalled();
  });
  it.each(writes)('%s refuses a viewer with a pending review assignment', async (_name, operation) => {
    await expect(operation(context(8))).rejects.toMatchObject({ status: 403 });
    expect(H.notice).not.toHaveBeenCalled();
  });
  it.each(writes)('%s refuses an archived project', async (_name, operation) => {
    await database.exec("UPDATE projects SET status='archived' WHERE id=11");
    await expect(operation(context())).rejects.toMatchObject({ status: 409 });
    expect(H.notice).not.toHaveBeenCalled();
  });
  it('reads the actual private plan for its owner on the supplied executor', async () => {
    expect(await service.getScheduleOfEvents(7,11,context())).toMatchObject({ plan: { basisSummary: 'Confidential plan' }, milestones: [{ title: 'Confidential milestone' }] });
    expect(H.query).not.toHaveBeenCalled();
  });
  it.each([6,8,9,10])('retains canonical use/edit/assigned-review/manager read for actor %s', async userId => {
    expect((await service.getScheduleOfEvents(7,11,context(userId))).milestones).toHaveLength(1);
  });
  it('permits a public project read without granting a public write', async () => {
    expect((await service.getScheduleOfEvents(7,12,context(5))).plan).toBeNull();
    await expect(service.amendMilestone({orgId:7,projectId:12,milestoneKey:'private'},context(5))).rejects.toMatchObject({status:403});
  });
  it('refuses permission revoked during a composed read instead of returning earlier private rows', async () => {
    beforeQuery = async sql => {
      if (sql.includes('FROM project_schedule_revisions')) await database.exec("UPDATE project_members SET status='revoked' WHERE project_id=11 AND user_id=6");
    };
    await expect(service.getScheduleOfEvents(7,11,context(6))).rejects.toMatchObject({status:403});
  });
  it('distinguishes an unavailable current-membership check from an empty schedule', async () => {
    beforeQuery = async sql => { if (sql.includes('FROM organization_users')) throw new Error('Membership database unavailable'); };
    await expect(service.getScheduleOfEvents(7,11,context())).rejects.toMatchObject({status:503});
  });
});

describe('schedule service admitted operations and targeted alerts', () => {
  it.each([99,9,10])('retains owner/edit/manager amendment for actor %s without changing milestone identity', async actorId => {
    const before = await database.query<{ id: number }>('SELECT id FROM project_workflow_stages');
    expect(await service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private',status:'completed',progress:100},context(actorId))).toMatchObject({ok:true});
    const after = await database.query('SELECT id,status,metadata FROM project_workflow_stages');
    expect(after.rows[0]).toMatchObject({id:before.rows[0].id,status:'completed',metadata:{scheduleStatus:'completed',progress:100}});
    expect(statements.findIndex(sql => sql.includes('FOR UPDATE'))).toBeLessThan(statements.findIndex(sql => sql.includes('FROM project_workflow_stages')));
    expect(statements.at(-1)).toBe('COMMIT');
  });
  it('keeps public generation available to its owner using the supplied executor', async () => {
    const result = await service.generateProjectSchedule({...params,projectId:12},context());
    expect(result.plan).toMatchObject({projectType:'IND',version:1});
    expect(result.milestones.length).toBeGreaterThan(1);
    expect(H.query).not.toHaveBeenCalled(); expect(H.connect).not.toHaveBeenCalled();
  });
  it('targets reset alerts only to the admitted actor with no private text or record identity', async () => {
    await service.resetProjectGoals({orgId:7,projectId:11,goals:[{title:'Secret goal'}],rationale:'Confidential rationale'},context(9));
    expect(H.notice).toHaveBeenCalledOnce();
    const [notice,sql] = H.notice.mock.calls[0];
    expect(notice).toMatchObject({organizationId:7,recipientUserId:9,category:'schedule_goal_reset'});
    expect(JSON.stringify(notice)).not.toMatch(/Confidential|Secret|resourceId|resourceType|actionUrl/);
    expect(sql).toBe(executor); expect(statements.at(-1)).toBe('COMMIT');
  });
  it('runs real review mutations and targeted notices on one parent-locked transaction', async () => {
    const result = await service.reviewScheduleHealth({orgId:7,projectId:11,apply:true},context());
    expect(result).toMatchObject({ok:true,applied:true,tasksCreated:1,alertsCreated:1});
    expect(H.notice.mock.calls[0][0]).toMatchObject({recipientUserId:99}); expect(H.notice.mock.calls[0][1]).toBe(executor);
    expect(JSON.stringify(H.notice.mock.calls[0][0])).not.toMatch(/Confidential|resourceId|resourceType|actionUrl/);
    expect(statements[0]).toBe('BEGIN'); expect(statements.at(-1)).toBe('COMMIT');
  });
  it('keeps read-only reviews available without writing or creating notifications', async () => {
    expect(await service.reviewScheduleHealth({orgId:7,projectId:11,apply:false},context(8))).toMatchObject({ok:true,applied:false,tasksCreated:0,alertsCreated:0});
    expect(statements.some(sql => /^(BEGIN|UPDATE|INSERT)/.test(sql.trim()))).toBe(false); expect(H.notice).not.toHaveBeenCalled();
  });
  it('rolls back goal changes and revisions if the targeted notice insert fails', async () => {
    H.notice.mockRejectedValueOnce(new Error('Notification insert unavailable'));
    await expect(service.resetProjectGoals({orgId:7,projectId:11,goals:[{title:'Secret goal'}],rationale:'Confidential rationale'},context())).rejects.toThrow('Notification insert unavailable');
    expect((await database.query('SELECT * FROM project_schedule_goals')).rows).toEqual([]);
    expect((await database.query('SELECT * FROM project_schedule_revisions')).rows).toEqual([]);
    expect(statements.at(-1)).toBe('ROLLBACK');
  });
  it('a pending-review assignment alone never grants editing to a writing org role', async () => {
    await database.exec("UPDATE organization_users SET role='member' WHERE user_id=8");
    await expect(service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private'},context(8))).rejects.toMatchObject({status:403});
  });
  it('does not reuse a revoked edit membership or stale manager role', async () => {
    await database.exec("UPDATE project_members SET status='revoked' WHERE user_id=9; UPDATE organization_users SET role='viewer' WHERE user_id=10;");
    await expect(service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private'},context(9))).rejects.toMatchObject({status:403});
    await expect(service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private'},context(10))).rejects.toMatchObject({status:403});
  });
  it('captures the caller actor and executor before awaiting admission', async () => {
    const supplied = context(6);
    beforeQuery = async sql => { if (sql.includes('FROM organization_users')) { supplied.actorUserId=99; supplied.executor={...executor,query:vi.fn().mockResolvedValue({rows:[]})}; } };
    expect((await service.getScheduleOfEvents(7,11,supplied)).milestones).toHaveLength(1);
    expect(supplied.executor.query).not.toHaveBeenCalled();
    expect(statements.filter(sql => sql.includes('FROM organization_users'))).toHaveLength(2);
  });
});

describe('schedule service lifecycle and connection reservation', () => {
  it.each(['planning','on-hold','completed'])('retains canonical human schedule edits for %s projects', async status => {
    await database.query('UPDATE projects SET status=$1 WHERE id=11',[status]);
    expect(await service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private',note:'Current plan'},context())).toMatchObject({ok:true});
  });
  it('rejects identities above the PostgreSQL integer boundary before a query', async () => {
    for (const [orgId,projectId,userId] of [[2147483648,11,99],[7,2147483648,99],[7,11,2147483648]]) {
      await expect(service.getScheduleOfEvents(orgId,projectId,context(userId))).rejects.toMatchObject({status:403});
    }
    expect(statements).toEqual([]);
  });
  it('refuses overlapping transactions on the same supplied executor before another BEGIN', async () => {
    let release!: () => void; let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release=resolve; });
    const ready = new Promise<void>(resolve => { entered=resolve; });
    let begins=0;
    beforeQuery=async sql => { if (sql==='BEGIN' && ++begins===1) { entered(); await waiting; } };
    const first=service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private',note:'First change'},context());
    await ready;
    try {
      await expect(service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private',note:'Concurrent change'},context())).rejects.toMatchObject({status:409,code:'SCHEDULE_OPERATION_IN_PROGRESS'});
      expect(begins).toBe(1);
    } finally { release(); await first; }
    expect(await service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private',note:'Later change'},context())).toMatchObject({ok:true});
  });
  it('refuses a composed read while another schedule transaction owns its executor', async () => {
    let release!: () => void; let entered!: () => void;
    const waiting = new Promise<void>(resolve => { release=resolve; });
    const ready = new Promise<void>(resolve => { entered=resolve; });
    beforeQuery=async sql => { if (sql==='BEGIN') { entered(); await waiting; } };
    const first=service.amendMilestone({orgId:7,projectId:11,milestoneKey:'private'},context());
    await ready;
    try {
      await expect(service.getScheduleOfEvents(7,11,context())).rejects.toMatchObject({status:409,code:'SCHEDULE_OPERATION_IN_PROGRESS'});
      await expect(service.reviewScheduleHealth({orgId:7,projectId:11,apply:false},context())).rejects.toMatchObject({status:409,code:'SCHEDULE_OPERATION_IN_PROGRESS'});
    } finally { release(); await first; }
    expect((await service.getScheduleOfEvents(7,11,context())).milestones).toHaveLength(1);
  });
  it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1])('rejects malformed actor identity %s without a query', async id => {
    await expect(service.getScheduleOfEvents(7,11,context(id))).rejects.toMatchObject({status:403});
    expect(statements).toEqual([]);
  });
});

describe('schedule service genuine job authority', () => {
  it('rejects scheduler authority borrowed from a human request', async () => {
    await expect(runWithTenantScope({tenantId:'7',source:'request'}, () => service.reviewScheduleHealthForSweep({orgId:7,projectId:11},executor))).rejects.toMatchObject({status:403});
    expect(statements).toEqual([]);
  });
  it('rejects a system or another-organization scope for the project job', async () => {
    for (const scope of [{tenantId:'0',source:'job' as const,role:'app_super_admin'},{tenantId:'8',source:'job' as const}]) {
      await expect(runWithTenantScope(scope, () => service.reviewScheduleHealthForSweep({orgId:7,projectId:11},executor))).rejects.toMatchObject({status:403});
    }
    expect(statements).toEqual([]);
  });
  it('reviews in a genuine organization job and targets only its actual current owner', async () => {
    const result = await runWithTenantScope({tenantId:'7',source:'job',role:null}, () => service.reviewScheduleHealthForSweep({orgId:7,projectId:11,apply:true},executor));
    expect(result).toMatchObject({ok:true,applied:true,tasksCreated:1,alertsCreated:1});
    expect(H.notice).toHaveBeenCalledOnce(); expect(H.notice.mock.calls[0][0]).toMatchObject({recipientUserId:99}); expect(H.notice.mock.calls[0][1]).toBe(executor);
    expect(JSON.stringify(H.notice.mock.calls[0][0])).not.toMatch(/Confidential|resourceId|resourceType|actionUrl/);
  });
  it('does not invent a recipient when the actual owner is inactive', async () => {
    await database.exec("UPDATE users SET status='inactive' WHERE id=99");
    const result = await runWithTenantScope({tenantId:'7',source:'job',role:null}, () => service.reviewScheduleHealthForSweep({orgId:7,projectId:11},executor));
    expect(result).toMatchObject({ok:true,alertsCreated:0}); expect(H.notice).not.toHaveBeenCalled();
  });
  it.each(['organization','project'])('refuses an inactive %s in an actual job before protected changes', async kind => {
    await database.exec(kind==='organization' ? "UPDATE organizations SET status='pending_deletion' WHERE id=7" : "UPDATE projects SET status='archived' WHERE id=11");
    await expect(runWithTenantScope({tenantId:'7',source:'job',role:null}, () => service.reviewScheduleHealthForSweep({orgId:7,projectId:11},executor))).rejects.toMatchObject({status:409});
    expect(statements.some(sql => /UPDATE project_|INSERT INTO project_/.test(sql))).toBe(false); expect(H.notice).not.toHaveBeenCalled();
  });
  it('permits estate listing only inside the audited system job scope', async () => {
    await expect(service.listActiveSchedulePlans()).rejects.toMatchObject({status:403});
    await expect(runWithTenantScope({tenantId:'7',source:'job',role:null}, () => service.listActiveSchedulePlans())).rejects.toMatchObject({status:403});
    expect(H.query).not.toHaveBeenCalled();
    H.query.mockResolvedValueOnce({rows:[{id:1,organization_id:7,project_id:11}]});
    expect(await runWithTenantScope({tenantId:'0',source:'job',role:'app_super_admin'}, () => service.listActiveSchedulePlans())).toEqual([{scheduleId:1,orgId:7,projectId:11}]);
  });
});
