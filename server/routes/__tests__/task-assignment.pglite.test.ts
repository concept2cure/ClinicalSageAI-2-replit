/** Actual assignment HTTP, SQL and canonical lineage; synthetic authentication, no native RLS claim. */
import { readFile } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { unifiedTasks } from '../../../shared/schema';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, db: null as PgliteDatabase | null, notifications: vi.fn() }));
vi.mock('../../db', () => ({ db: new Proxy({} as PgliteDatabase, { get(_target, key) {
  const value = Reflect.get(h.db!, key); return typeof value === 'function' ? value.bind(h.db) : value;
} }), pool: { query: (s: string, p?: unknown[]) => h.pg!.query(s, p) }, getPool: () => ({ query: (s: string, p?: unknown[]) => h.pg!.query(s, p) }) }));
vi.mock('../../services/tasking/task-side-effects', async importOriginal => ({ ...(await importOriginal<object>()), notifyTaskEvent: h.notifications }));
import taskRoutes from '../taskManagement.routes';
import createBoardRoutes from '../taskBoard.routes';

let pg: PGlite;
let loseCommit = false;
let failRoster = false;
const discard = vi.fn(async () => undefined);
const trace: string[] = [];
function app(userId = 5, claimedRole = 'admin', workspace: number | null = 71) {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { userId, userRole: claimedRole, user: { id: userId, organizationId: 7, role: claimedRole },
      tenantContext: { organizationId: 7, clientWorkspaceId: workspace }, dbClient: { discard, async query(query: string | { text: string; rowMode?: string }, p?: unknown[]) {
        const s = typeof query === 'string' ? query : query.text;
        trace.push(s);
        if (failRoster && s.includes('task-assignment:roster')) throw new Error('Synthetic missing roster');
        const result = await pg.query(s, p);
        if (loseCommit && s === 'COMMIT') throw new Error('Synthetic lost acknowledgement');
        return typeof query !== 'string' && query.rowMode === 'array' ? { ...result, rows: result.rows.map(row => Object.values(row as Record<string, unknown>)) } : result;
      } } }); next();
  });
  a.use('/api/tasks', taskRoutes); a.use('/api/task-management', createBoardRoutes()); return a;
}
const rosterPath = '/api/task-management/assignees?taskId=T1';
const taskPath = '/api/tasks/tasks/T1';
async function snapshot() {
  const r = await request(app()).get(rosterPath);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.meta;
}
const body = (meta: { assigneeId: number | null; assignmentVersion: string }, assigneeId = 7) => ({ action: 'assign', assigneeId,
  expectedAssigneeId: meta.assigneeId, expectedVersion: meta.assignmentVersion, reason: '   Handoff to the available specialist   ' });

beforeAll(async () => {
  pg = new PGlite(); h.pg = pg; h.db = drizzle(pg);
  await pg.exec(`CREATE TABLE organizations(id integer PRIMARY KEY,status text);
    CREATE TABLE users(id integer PRIMARY KEY,name text,email text,status text);
    CREATE TABLE organization_users(id serial PRIMARY KEY,organization_id integer,user_id integer,role text);
    CREATE TABLE client_workspaces(id integer PRIMARY KEY,organization_id integer);
    CREATE TABLE projects(id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,owner_id integer,created_by_id integer,status text,settings jsonb);
    CREATE TABLE project_members(id serial PRIMARY KEY,organization_id integer,project_id integer,user_id integer,role text,status text);
    CREATE TABLE project_visibility_settings(project_id integer PRIMARY KEY,organization_id integer,visibility text);
    CREATE TABLE concept2cure_artifacts(id integer,organization_id integer,project_id integer);
    CREATE TABLE concept2cure_review_assignments(artifact_id integer,reviewer_id integer,organization_id integer,status text);
    CREATE TABLE unified_tasks(id serial PRIMARY KEY);`);
  for (const column of getTableConfig(unifiedTasks).columns) if (column.name !== 'id') {
    await pg.exec(`ALTER TABLE unified_tasks ADD COLUMN "${column.name}" ${column.getSQLType()}`);
  }
  await pg.exec(`${AUDIT_LOGS_PGLITE_DDL} ALTER TABLE audit_logs ADD COLUMN chain_seq BIGSERIAL;`);
  const migration = await readFile('migrations/20260527_mutation_primitives.sql', 'utf8');
  const ddl = migration.match(/CREATE TABLE IF NOT EXISTS c2c_ana_actions \([\s\S]*?\n\);/)?.[0];
  if (!ddl) throw new Error('Canonical actions fixture DDL missing');
  await pg.exec(ddl);
  await pg.exec(await readFile('db/migrations/20260730_c2c_ana_actions_command_vocab.sql', 'utf8'));
}, 60_000);
beforeEach(async () => {
  loseCommit = false; failRoster = false; discard.mockClear(); trace.length = 0; h.notifications.mockClear();
  await pg.exec(`TRUNCATE unified_tasks,project_members,project_visibility_settings,projects,organization_users,users,organizations,client_workspaces,audit_logs,c2c_ana_actions RESTART IDENTITY;
    INSERT INTO organizations VALUES(7,'active'),(8,'active'); INSERT INTO client_workspaces VALUES(71,7),(72,7);
    INSERT INTO users VALUES(5,'Owner','owner@example.test','active'),(6,'Same Name','one@example.test','active'),(7,'Same Name','two@example.test','active'),
      (8,'Inactive secret','inactive@example.test','inactive'),(9,'Foreign secret','foreign@example.test','active'),(10,'Read only','viewer@example.test','active'),(11,'No access','private@example.test','active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,5,'member'),(7,6,'member'),(7,7,'member'),(7,8,'member'),(8,9,'member'),(7,10,'viewer'),(7,11,'member');
    INSERT INTO projects VALUES(101,7,71,5,5,'active','{}'),(202,7,72,5,5,'active','{}');
    INSERT INTO project_visibility_settings VALUES(101,7,'private'),(202,7,'private');
    INSERT INTO project_members(organization_id,project_id,user_id,role,status) VALUES(7,101,6,'use','active'),(7,101,7,'edit','active'),(7,101,10,'edit','active');
    INSERT INTO unified_tasks(task_id,organization_id,project_id,title,status,assignee_id,assignee_name,assigned_by,assigned_at,updated_at,created_at,progress,approval_history,approval_status,estimated_hours)
      VALUES('T1',7,101,'Review evidence','blocked',6,'Same Name',5,'2026-01-01','2026-01-02 01:02:03.123456','2025-01-01',40,'[{"meaning":"prior evidence"}]','pending',8);`);
});
afterAll(async () => pg?.close());

describe('scoped assignment read and named handoff', () => {
  it('returns the exact current scope and only eligible already-admitted accounts with unique labels', async () => {
    const r = await request(app(5, 'viewer')).get(rosterPath);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toMatchObject({ taskId: 'T1', organizationId: 7, actorUserId: 5, projectId: 101, clientWorkspaceId: 71, status: 'blocked', canAssign: true, assigneeId: 6 });
    expect(r.body.meta.assignmentVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(r.body.data.map((m: { id: string }) => m.id)).toEqual(['5', '6', '7']);
    expect(r.body.data.find((m: { id: string }) => m.id === '6').label).toContain('one@example.test');
  });
  it('changes only assignment provenance, retains the task and approval facts, and commits canonical lineage before notifying', async () => {
    const meta = await snapshot();
    const before = (await pg.query<Record<string, unknown>>('SELECT * FROM unified_tasks WHERE task_id=$1', ['T1'])).rows[0];
    const r = await request(app(5, 'viewer')).patch(taskPath).send(body(meta));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ taskId: 'T1', assigneeId: 7, assigneeName: 'Same Name', assignedBy: 5, projectId: 101, clientWorkspaceId: 71, status: 'blocked' });
    const after = (await pg.query<Record<string, unknown>>('SELECT * FROM unified_tasks WHERE task_id=$1', ['T1'])).rows[0];
    const omitted = ['assignee_id','assignee_name','assigned_by','assigned_at','last_modified_by','updated_at'];
    for (const key of Object.keys(before).filter(k => !omitted.includes(k))) expect(after[key], key).toEqual(before[key]);
    expect(r.body.data.assignmentVersion).not.toBe(meta.assignmentVersion);
    expect((await pg.query('SELECT command,decision_reason,payload FROM c2c_ana_actions')).rows).toEqual([expect.objectContaining({ command: 'task.assign', decision_reason: 'Handoff to the available specialist', payload: expect.objectContaining({ previousAssigneeId: 6, assigneeId: 7, method: 'named' }) })]);
    expect((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n).toBe(1);
    expect(h.notifications).toHaveBeenCalledOnce();
    expect(trace.indexOf('COMMIT')).toBeGreaterThan(trace.findIndex(s => s.includes('INSERT INTO c2c_ana_actions')));
    expect((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM project_members')).rows[0].n).toBe(3);
  });
  it('returns no candidate directory to a project reader', async () => {
    const r = await request(app(6)).get(rosterPath);
    expect(r.status).toBe(200); expect(r.body.meta.canAssign).toBe(false); expect(r.body.data).toEqual([]);
  });
});

describe('assignment refuses stale or inadmissible requests', () => {
  it.each([8,9,10,11])('refuses recipient %i without granting access', async assigneeId => {
    const r = await request(app()).patch(taskPath).send(body(await snapshot(), assigneeId));
    expect(r.status, JSON.stringify(r.body)).toBe(403); expect(h.notifications).not.toHaveBeenCalled();
    expect((await pg.query<{ assignee_id: number | null }>('SELECT assignee_id FROM unified_tasks')).rows[0].assignee_id).toBe(6);
  });
  it('denies stale administrator claims, other client scope and mixed status bodies', async () => {
    const meta = await snapshot();
    expect((await request(app(6)).patch(taskPath).send(body(meta))).status).toBe(403);
    expect((await request(app(5, 'admin',72)).patch(taskPath).send(body(meta))).status).toBe(403);
    expect((await request(app()).patch(taskPath).send({ ...body(meta), status: 'completed' })).status).toBe(400);
    expect((await request(app()).patch(taskPath).send({ ...body(meta), reason: ' ' })).status).toBe(400);
  });
  it('refuses same-assignee and stale version or assignee snapshots', async () => {
    const meta = await snapshot();
    expect((await request(app()).patch(taskPath).send(body(meta, 6))).status).toBe(409);
    expect((await request(app()).patch(taskPath).send({ ...body(meta), expectedAssigneeId: null })).status).toBe(409);
    await pg.exec("UPDATE unified_tasks SET progress=41 WHERE task_id='T1'");
    expect((await request(app()).patch(taskPath).send(body(meta))).status).toBe(409);
  });
  it.each(['completed','cancelled'])('protects %s tasks', async status => {
    const meta = await snapshot(); await pg.query('UPDATE unified_tasks SET status=$1', [status]);
    expect((await request(app()).patch(taskPath).send(body(meta))).status).toBe(409);
    const r = await request(app()).get(rosterPath); expect(r.body.meta.canAssign).toBe(false); expect(r.body.data).toEqual([]);
  });
  it('reports roster verification failure instead of an empty success', async () => {
    failRoster = true;
    expect((await request(app()).get(rosterPath)).status).toBe(503);
  });
  it('rolls back the row and both lineage rows if the second ledger INSERT fails', async () => {
    const meta = await snapshot(); await pg.exec("ALTER TABLE c2c_ana_actions ADD CONSTRAINT fail_assignment CHECK(command <> 'task.assign') NOT VALID");
    try {
      const r = await request(app()).patch(taskPath).send(body(meta));
      expect(r.status).toBe(500); expect(r.body.error).toBe('AUDIT_WRITE_FAILED');
      expect((await pg.query<{ assignee_id: number | null }>('SELECT assignee_id FROM unified_tasks')).rows[0].assignee_id).toBe(6);
      expect((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n).toBe(0);
      expect(h.notifications).not.toHaveBeenCalled();
    } finally { await pg.exec('ALTER TABLE c2c_ana_actions DROP CONSTRAINT fail_assignment'); }
  });
  it('returns unknown and evicts after a real COMMIT loses its acknowledgement', async () => {
    const meta = await snapshot(); loseCommit = true;
    const r = await request(app()).patch(taskPath).send(body(meta));
    expect(r.status).toBe(500); expect(r.body.error).toBe('OUTCOME_UNKNOWN'); expect(discard).toHaveBeenCalledOnce();
    expect((await pg.query<{ assignee_id: number | null }>('SELECT assignee_id FROM unified_tasks')).rows[0].assignee_id).toBe(7);
    expect(h.notifications).not.toHaveBeenCalled();
    expect(trace.slice(trace.lastIndexOf('COMMIT')+1)).not.toContain('ROLLBACK');
  });
});

describe('existing automatic assignment uses the same admission and ledger', () => {
  it('selects only eligible users and preserves optional real reason and old result shape', async () => {
    await pg.exec("INSERT INTO unified_tasks(task_id,organization_id,title,status,assignee_id,estimated_hours,updated_at) VALUES('LOAD',7,'Other work','pending',5,100,now()),('LOAD2',7,'Existing work','pending',6,100,now())");
    const meta = await snapshot();
    const r = await request(app()).post('/api/tasks/tasks/auto-assign').send({ taskIds: ['T1'], expectedAssignments: [{ taskId: 'T1', expectedAssigneeId: 6, expectedVersion: meta.assignmentVersion }], reason: '  Workload handoff  ' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ count: 1, data: [{ taskId: 'T1', assignedTo: 'Same Name', assigneeId: 7 }] });
    expect((await pg.query('SELECT command,decision_reason FROM c2c_ana_actions')).rows).toEqual([{ command: 'task.assign', decision_reason: 'Workload handoff' }]);
  });
  it('denies a project reader and skips terminal work without inventing a reason', async () => {
    expect((await request(app(6)).post('/api/tasks/tasks/auto-assign').send({ taskIds: ['T1'] })).status).toBe(403);
    await pg.exec("UPDATE unified_tasks SET status='completed'");
    const r = await request(app()).post('/api/tasks/tasks/auto-assign').send({ taskIds: ['T1'] });
    expect(r.status).toBe(200); expect(r.body.count).toBe(0); expect((await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_logs')).rows[0].n).toBe(0);
  });
});
