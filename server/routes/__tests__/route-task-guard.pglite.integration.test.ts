/**
 * Every generic writer of a task row refuses a review route member, and every
 * create path refuses input naming a route column (RR1a, findings B1 and M9;
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.3). Through the real
 * /api/tasks router, the real assignment service, the real completion cascade
 * and the real ledger primitive, on PGlite.
 *
 * The CODE guard is what this file proves, so the database here carries the
 * Drizzle model's columns and no trigger: without the guard, each of these
 * writes lands. The trigger (unified_tasks_route_rows_guard) is proved on its
 * own, as the app role under RLS, by tests/db/review-route-guard.dbtest.ts.
 *
 * Also pinned: the remind route (which writes nothing on the row) still serves
 * a route member, and a reassignment clears the due-soon and overdue markers so
 * the new assignee is reminded afresh (B11, assignTaskInTx).
 */
import { readFile } from 'node:fs/promises';
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { unifiedTasks, taskDependencies } from '../../../shared/schema';
import { AUDIT_LOGS_PGLITE_DDL } from '../../db/pglite-harness';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, db: null as PgliteDatabase | null, notifications: vi.fn(), created: vi.fn() }));
vi.mock('../../db', () => ({ db: new Proxy({} as PgliteDatabase, { get(_target, key) {
  const value = Reflect.get(h.db!, key); return typeof value === 'function' ? value.bind(h.db) : value;
} }), pool: { query: (s: string, p?: unknown[]) => h.pg!.query(s, p),
  connect: async () => ({ query: (s: string, p?: unknown[]) => h.pg!.query(s, p), release: () => undefined }) }, getPool: () => ({ query: (s: string, p?: unknown[]) => h.pg!.query(s, p) }) }));
vi.mock('../../services/tasking/task-side-effects', async importOriginal => ({ ...(await importOriginal<object>()), notifyTaskEvent: h.notifications }));
vi.mock('../../services/notifications/notification-service', () => ({ createNotification: h.created }));
import taskRoutes from '../taskManagement.routes';

const ROUTE = '00000000-0000-4000-8000-0000000000aa';
let pg: PGlite;

function app(userId = 5, role = 'admin') {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { userId, userRole: role, user: { id: userId, organizationId: 7, role },
      tenantContext: { organizationId: 7, clientWorkspaceId: null }, dbClient: { discard: async () => undefined,
        async query(query: string | { text: string }, p?: unknown[]) { return pg.query(typeof query === 'string' ? query : query.text, p); } } });
    next();
  });
  a.use('/api/tasks', taskRoutes);
  return a;
}

async function row(taskId: string) {
  return (await pg.query<Record<string, any>>('SELECT * FROM unified_tasks WHERE task_id = $1', [taskId])).rows[0];
}
async function ledgerCount() {
  return (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM c2c_ana_actions')).rows[0].n;
}
const refused = (r: request.Response) => {
  expect(r.status, JSON.stringify(r.body)).toBe(409);
  expect(r.body.code).toBe('ROUTE_TASK_OWNED_BY_ROUTE');
};
const refusedCreate = (r: request.Response) => {
  expect(r.status, JSON.stringify(r.body)).toBe(400);
  expect(r.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED');
};

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
    CREATE TABLE unified_tasks(id serial PRIMARY KEY);
    CREATE TABLE task_dependencies(id serial PRIMARY KEY);`);
  for (const [table, name] of [[unifiedTasks, 'unified_tasks'], [taskDependencies, 'task_dependencies']] as const) {
    for (const column of getTableConfig(table).columns) if (column.name !== 'id') {
      const defaults = column.name === 'created_at' || column.name === 'updated_at' ? ' DEFAULT now()' : column.name === 'status' && name === 'unified_tasks' ? " DEFAULT 'pending'" : '';
      await pg.exec(`ALTER TABLE ${name} ADD COLUMN "${column.name}" ${column.getSQLType()}${defaults}`);
    }
  }
  await pg.exec(`${AUDIT_LOGS_PGLITE_DDL} ALTER TABLE audit_logs ADD COLUMN chain_seq BIGSERIAL;`);
  const migration = await readFile('migrations/20260527_mutation_primitives.sql', 'utf8');
  const ddl = migration.match(/CREATE TABLE IF NOT EXISTS c2c_ana_actions \([\s\S]*?\n\);/)?.[0];
  if (!ddl) throw new Error('Canonical actions fixture DDL missing');
  await pg.exec(ddl);
  await pg.exec(await readFile('db/migrations/20260730_c2c_ana_actions_command_vocab.sql', 'utf8'));
}, 60_000);

beforeEach(async () => {
  h.notifications.mockClear(); h.created.mockClear(); h.created.mockResolvedValue(1);
  await pg.exec(`TRUNCATE unified_tasks,task_dependencies,project_members,project_visibility_settings,projects,organization_users,users,organizations,client_workspaces,audit_logs,c2c_ana_actions RESTART IDENTITY;
    INSERT INTO organizations VALUES(7,'active');
    INSERT INTO users VALUES(5,'Owner','owner@example.test','active'),(6,'Rita Reviewer','rita@example.test','active'),(7,'Sam Specialist','sam@example.test','active');
    INSERT INTO organization_users(organization_id,user_id,role) VALUES(7,5,'admin'),(7,6,'member'),(7,7,'member');
    INSERT INTO unified_tasks(task_id,organization_id,module_type,title,status,priority,assignee_id,assignee_name,created_by_id,
        review_route_id,review_role,review_step,source_entity_type,source_entity_id,due_date,metadata,blocked_by)
      VALUES
      ('ROUTE-R','7','Vault','Review: Clinical overview v2','pending','medium',6,'Rita Reviewer',5,'${ROUTE}','reviewer',1,'canonical_document','c-1','2026-11-01',NULL,NULL),
      ('ROUTE-B','7','Vault','Approve: Clinical overview v2','blocked','medium',7,'Sam Specialist',5,'${ROUTE}','approver',2,'canonical_document','c-1','2026-11-02',NULL,ARRAY['TASK-A']),
      ('TASK-A','7','IND','Draft CSR shell','review','medium',6,'Rita Reviewer',5,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
      ('TASK-G','7','IND','Assemble module 5','pending','medium',6,'Rita Reviewer',5,NULL,NULL,NULL,NULL,NULL,'2026-10-30',
        '{"dueSoonNotifiedAt":"2026-10-28T00:00:00.000Z","overdueNotifiedAt":"2026-10-31T00:00:00.000Z","note":"kept"}',NULL);`);
});
afterAll(async () => pg?.close());

describe('the generic task writers refuse a review route member (B1)', () => {
  it('PATCH status: 409, the task and the ledger unchanged', async () => {
    const before = await row('ROUTE-R');
    refused(await request(app()).patch('/api/tasks/tasks/ROUTE-R').send({ status: 'in-progress' }));
    expect(await row('ROUTE-R')).toEqual(before);
    expect(await ledgerCount()).toBe(0);
  });

  it('PATCH assign: 409, the assignee unchanged', async () => {
    const r = await request(app()).patch('/api/tasks/tasks/ROUTE-R').send({
      action: 'assign', assigneeId: 7, expectedAssigneeId: 6, expectedVersion: 'a'.repeat(64), reason: 'Hand to the specialist',
    });
    refused(r);
    expect((await row('ROUTE-R')).assignee_id).toBe(6);
    expect(await ledgerCount()).toBe(0);
    expect(h.notifications).not.toHaveBeenCalled();
  });

  it('auto-assign: 409, nothing assigned', async () => {
    refused(await request(app()).post('/api/tasks/tasks/auto-assign').send({ taskIds: ['ROUTE-R'] }));
    expect((await row('ROUTE-R')).assignee_id).toBe(6);
    expect(await ledgerCount()).toBe(0);
  });

  it('DELETE (archive): 409, not archived', async () => {
    refused(await request(app()).delete('/api/tasks/tasks/ROUTE-R').send({ reason: 'No longer needed' }));
    expect((await row('ROUTE-R')).deleted_at).toBeNull();
    expect(await ledgerCount()).toBe(0);
  });

  it.each([
    ['as the predecessor', 'ROUTE-R', 'TASK-A'],
    ['as the successor', 'TASK-A', 'ROUTE-R'],
  ])('dependencies, a route member %s: 409, no edge, nothing blocked', async (_end, predecessorTaskId, successorTaskId) => {
    const r = await request(app()).post('/api/tasks/tasks/dependencies').send({
      predecessorTaskId, successorTaskId, dependencyType: 'finish-to-start',
    });
    refused(r);
    expect((await pg.query('SELECT 1 FROM task_dependencies')).rows).toHaveLength(0);
    expect((await row('TASK-A')).status).toBe('review');
    expect((await row('ROUTE-R')).status).toBe('pending');
  });

  it('the completion cascade skips a route member as a dependent', async () => {
    const r = await request(app()).patch('/api/tasks/tasks/TASK-A').send({ status: 'completed' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const b = await row('ROUTE-B');
    expect(b.status).toBe('blocked');
    expect(b.blocked_by).toEqual(['TASK-A']);
    const moved = (await pg.query<{ target: string }>('SELECT target FROM c2c_ana_actions')).rows.map(x => x.target);
    expect(moved).toEqual(['task:TASK-A']);
  });

  it('the remind route, which writes nothing on the row, still serves a route member', async () => {
    const r = await request(app()).post('/api/tasks/tasks/ROUTE-R/notify').send({ message: 'Your review is due Friday.' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(h.created).toHaveBeenCalledOnce();
  });
});

describe('the create paths refuse input naming a route column (M9)', () => {
  it('POST /tasks with reviewRouteId: 400, no row', async () => {
    refusedCreate(await request(app()).post('/api/tasks/tasks').send({
      title: 'Smuggled review', moduleType: 'Vault', assigneeId: 6, reviewRouteId: ROUTE, reviewRole: 'reviewer',
    }));
    expect((await pg.query('SELECT 1 FROM unified_tasks WHERE title = $1', ['Smuggled review'])).rows).toHaveLength(0);
    expect(await ledgerCount()).toBe(0);
  });

  it('POST /tasks/bulk-create with a task naming review_route_id: 400, nothing created', async () => {
    refusedCreate(await request(app()).post('/api/tasks/tasks/bulk-create').send({
      tasks: [{ title: 'Bulk one', moduleType: 'IND' }, { title: 'Bulk two', moduleType: 'Vault', review_route_id: ROUTE }],
    }));
    expect((await pg.query("SELECT 1 FROM unified_tasks WHERE title LIKE 'Bulk%'")).rows).toHaveLength(0);
  });

  it('POST /tasks/from-template naming reviewRouteId: 400, nothing created', async () => {
    refusedCreate(await request(app()).post('/api/tasks/tasks/from-template/BUILTIN-IND').send({ reviewRouteId: ROUTE }));
    expect((await pg.query('SELECT count(*)::int AS n FROM unified_tasks')).rows[0]).toEqual({ n: 4 });
  });
});

describe('a reassignment resets the reminder markers (B11, assignTaskInTx)', () => {
  it('clears dueSoonNotifiedAt and overdueNotifiedAt and keeps the rest of the metadata', async () => {
    const t = (await pg.query<Record<string, any>>(
      `SELECT t.*, t.xmin::text AS row_version, t.updated_at::text AS exact_updated_at FROM unified_tasks t WHERE task_id='TASK-G'`)).rows[0];
    const { createHash } = await import('node:crypto');
    const expectedVersion = createHash('sha256').update(JSON.stringify([t.id, t.task_id, t.organization_id, t.row_version, t.exact_updated_at])).digest('hex');
    const r = await request(app()).patch('/api/tasks/tasks/TASK-G').send({
      action: 'assign', assigneeId: 7, expectedAssigneeId: 6, expectedVersion, reason: 'Hand to the specialist',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const after = await row('TASK-G');
    expect(after.assignee_id).toBe(7);
    expect(after.metadata).toEqual({ note: 'kept' });
  });
});
