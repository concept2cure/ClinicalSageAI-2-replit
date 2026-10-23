/** D2 PM-04b: actual task assignment HTTP/SQL/ledger under native PostgreSQL
 * FORCE RLS. Narrow schema and synthetic auth/tenant middleware; no deployed
 * authentication or complete migration qualification is implied. */
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';
import { tenantIsolationPolicySql } from './harness';

const sinks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../server/auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/middleware/tenantContext', () => ({ tenantContextMiddleware: (_q: unknown, _s: unknown, next: () => void) => next(), requireOrganizationContext: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/middleware/redisRateLimiter', () => ({ createRedisRateLimiter: () => (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/services/tasking/task-side-effects', async original => ({ ...await original<object>(), notifyTaskEvent: sinks.notify }));

const TABLES = ['organization_users', 'client_workspaces', 'projects', 'project_members', 'project_visibility_settings', 'concept2cure_artifacts', 'concept2cure_review_assignments', 'unified_tasks'];
const DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY,status text);
CREATE TABLE users (id integer PRIMARY KEY,name text,email text,status text);
CREATE TABLE organization_users (id serial PRIMARY KEY,organization_id integer,user_id integer,role text);
CREATE TABLE client_workspaces (id integer PRIMARY KEY,organization_id integer);
CREATE TABLE projects (id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,status text,owner_id integer,created_by_id integer,settings jsonb);
CREATE TABLE project_members (id serial PRIMARY KEY,project_id integer,organization_id integer,user_id integer,role text,status text);
CREATE TABLE project_visibility_settings (project_id integer PRIMARY KEY,organization_id integer,visibility text);
CREATE TABLE concept2cure_artifacts (id integer,organization_id integer,project_id integer);
CREATE TABLE concept2cure_review_assignments (artifact_id integer,reviewer_id integer,organization_id integer,status text);
CREATE TABLE unified_tasks (id serial PRIMARY KEY,task_id text UNIQUE,organization_id integer,client_workspace_id integer,project_id integer,title text,
 assignee_id integer,assignee_name text,assigned_by integer,assigned_at timestamptz,status text,last_modified_by integer,updated_at timestamptz,
 deleted_at timestamptz,estimated_hours numeric,progress integer,completed_at timestamptz,approval_history jsonb,approval_status text,
 approval_required boolean,created_by_id integer,created_at timestamptz,dependencies jsonb,blocked_by jsonb,metadata jsonb);
`;
let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let board: express.Router;
let loseCommitAck = false;
let discards = 0;
let rendezvous: (() => Promise<void>) | undefined;
const pids = new Set<number>();

function app(userId = 7, organizationId = 9, workspace = 71) {
  const a = express(); a.use(express.json());
  a.use((req, res, next) => {
    void store.runWithTenantScope({ tenantId: String(organizationId), role: 'member', source: 'test', caller: 'pm04b-native-http' }, async () => {
      const client = await runtime.getPool().connect();
      pids.add(Number((await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
      let released = false;
      const readTransaction = req.method === 'GET';
      // Production's lazy request owner pins GUCs; this narrow reader pins them
      // in a real transaction. Assignment writers open their own actual BEGIN.
      if (readTransaction) await client.query('BEGIN');
      res.once('finish', () => {
        if (released) return;
        released = true;
        if (readTransaction) void client.query('ROLLBACK').then(() => client.release(), error => client.release(error));
        else client.release();
      });
      Object.assign(req, { userId, userRole: 'admin', user: { id: userId, organizationId, role: 'admin' }, organizationId,
        tenantId: organizationId, tenantContext: { organizationId, clientWorkspaceId: workspace },
        dbClient: { async query(sql: string, params?: unknown[]) {
          if (rendezvous && sql.trim().toUpperCase() === 'BEGIN') await rendezvous();
          const result = await client.query(sql, params);
          if (loseCommitAck && sql.trim().toUpperCase() === 'COMMIT') {
            loseCommitAck = false; throw Object.assign(new Error('Synthetic lost actual COMMIT acknowledgement'), { code: 'ECONNRESET' });
          }
          return result;
        }, async discard(error: Error) { if (!released) { released = true; discards++; client.release(error); } } } });
      next();
    }).catch(next);
  });
  a.use('/api/tasks', router); a.use('/api/task-management', board);
  return a;
}
const taskId = 'TASK-DELEGATE';
const optionsUrl = `/api/task-management/assignees?taskId=${taskId}`;
const taskUrl = `/api/tasks/tasks/${taskId}`;
type Expectation = { expectedAssigneeId: number | null; expectedVersion: string };
async function current(): Promise<Expectation> {
  const r = await request(app()).get(optionsUrl);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return { expectedAssigneeId: r.body.meta.assigneeId, expectedVersion: r.body.meta.assignmentVersion };
}
const change = (expected: Expectation, assigneeId = 9) => ({ action: 'assign', assigneeId, ...expected, reason: '  Cover the validation handoff  ' });
const count = async (table: string) => Number((await env.owner.query(`SELECT count(*) AS n FROM ${env.t(table)}`)).rows[0].n);

beforeAll(async () => {
  // Reuse canonical narrow ledger fixtures from disk, without importing the
  // PGlite harness or replacing the actual PostgreSQL driver.
  const auditSource = await readFile('server/db/pglite-harness.ts', 'utf8');
  const audit = auditSource.match(/export const AUDIT_LOGS_PGLITE_DDL = `([\s\S]*?)`;/)?.[1];
  const actionSource = await readFile('server/db/fixtures/governed-signing-pglite.ts', 'utf8');
  const actions = actionSource.match(/CREATE TABLE IF NOT EXISTS c2c_ana_actions \([\s\S]*?\n\);/)?.[0];
  if (!audit || !actions) throw new Error('Canonical narrow ledger fixture unavailable');
  env = await setupSchedulerDb(databaseUrl, 'dbpm04b', DDL + audit + actions, TABLES);
  for (const [table, column] of [['audit_logs', 'tenant_id'], ['c2c_ana_actions', 'org_id']]) {
    await env.owner.query(`ALTER TABLE ${env.t(table)} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${env.t(table)} FORCE ROW LEVEL SECURITY; ${tenantIsolationPolicySql(env.t(table), column)}`);
  }
  // Apply the real chain-order trigger/migration, changing only the disposable
  // schema references. No fake sequence/default or mocked ledger writer.
  const migration = (await readFile('migrations/20260921_audit_logs_chain_seq.sql', 'utf8'))
    .replaceAll('public.', `${env.schema}.`).replaceAll("table_schema = 'public'", `table_schema = '${env.schema}'`);
  await env.owner.query(migration);
  await env.owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${env.schema} TO ${env.runtimeRole}`);
  process.env.AUDIT_HMAC_KEY = 'pm04b-synthetic-chain-seal-key-not-a-production-secret';
  runtime = await import('../../server/db/runtime'); store = await import('../../server/db/tenantStore');
  router = (await import('../../server/routes/taskManagement.routes')).default;
  board = (await import('../../server/routes/taskBoard.routes')).default();
  const proof = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 'pm04b-role-proof' }, () =>
    runtime.getPool().query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(proof.rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false });
}, 120_000);
beforeEach(async () => {
  loseCommitAck = false; discards = 0; rendezvous = undefined; pids.clear(); sinks.notify.mockReset();
  await env.owner.query(`ALTER TABLE ${env.t('c2c_ana_actions')} DROP CONSTRAINT IF EXISTS synthetic_ledger_failure`);
  await env.owner.query(`TRUNCATE ${[...TABLES, 'users', 'organizations', 'audit_logs', 'c2c_ana_actions'].map(t => env.t(t)).join(', ')} RESTART IDENTITY`);
  await env.owner.query(`INSERT INTO ${env.t('organizations')} VALUES (9,'active'),(10,'active');
    INSERT INTO ${env.t('users')} VALUES (7,'Manager','manager@example.test','active'),(8,'Same Name','one@example.test','active'),
      (9,'Same Name','two@example.test','active'),(10,'No access','private@example.test','active'),(11,'Inactive','inactive@example.test','inactive'),
      (12,'Readonly owner','viewer@example.test','active'),(13,'Foreign','foreign@example.test','active'),(14,'Third recipient','third@example.test','active');
    INSERT INTO ${env.t('organization_users')}(organization_id,user_id,role) VALUES (9,7,'member'),(9,8,'member'),(9,9,'member'),(9,10,'member'),(9,11,'member'),(9,12,'viewer'),(10,13,'admin'),(9,14,'member');
    INSERT INTO ${env.t('client_workspaces')} VALUES (71,9),(72,9),(81,10);
    INSERT INTO ${env.t('projects')} VALUES (11,9,71,'active',7,7,'{}'),(12,9,72,'active',9,9,'{}'),(13,10,81,'active',13,13,'{}');
    INSERT INTO ${env.t('project_visibility_settings')} VALUES (11,9,'private'),(12,9,'private'),(13,10,'private');
    INSERT INTO ${env.t('project_members')}(project_id,organization_id,user_id,role,status) VALUES (11,9,8,'use','active'),(11,9,9,'use','active'),(11,9,12,'owner','active'),(11,9,14,'use','active');
    INSERT INTO ${env.t('unified_tasks')}(task_id,organization_id,client_workspace_id,project_id,title,assignee_id,assignee_name,assigned_by,assigned_at,status,updated_at,
      estimated_hours,progress,completed_at,approval_history,approval_status,approval_required,created_by_id,created_at,dependencies,blocked_by,metadata)
      VALUES ('${taskId}',9,NULL,11,'Validation handoff',8,'Same Name',7,'2026-10-01','in-progress','2026-10-01T00:00:00.123456Z',
      8,35,NULL,'[{"reviewer":7}]','pending',true,7,'2026-09-01','["TASK-PRE"]','["TASK-BLOCK"]','{"retained":true}');`);
});
afterAll(async () => { delete process.env.AUDIT_HMAC_KEY; if (runtime) await runtime.getPool().end(); if (env) await env.destroy(); });

describe('existing task delegation with actual PostgreSQL assignment and chained ledger', () => {
  it('scopes real active candidates by project and disambiguates duplicate names', async () => {
    const r = await request(app()).get(optionsUrl);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toMatchObject({ organizationId: 9, actorUserId: 7, taskId, projectId: 11, clientWorkspaceId: 71, canAssign: true, assigneeId: 8 });
    expect(r.body.meta.assignmentVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(r.body.data.map((row: {id: string}) => row.id)).toEqual(['7','8','9','14']);
    expect(r.body.data.find((row: {id: string}) => row.id === '8').label).toContain('one@example.test');
    expect(r.body.data.find((row: {id: string}) => row.id === '9').label).toContain('two@example.test');
  });
  it('atomically saves assignment, both ledger rows and exact human reason while preserving task history', async () => {
    const before = (await env.owner.query(`SELECT * FROM ${env.t('unified_tasks')}`)).rows[0];
    const r = await request(app()).patch(taskUrl).send(change(await current()));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({taskId,organizationId:9,actorUserId:7,projectId:11,clientWorkspaceId:71,assigneeId:9,assignedBy:7,status:'in-progress'});
    const after = (await env.owner.query(`SELECT *,xmin::text AS tx FROM ${env.t('unified_tasks')}`)).rows[0];
    for (const key of ['status','progress','completed_at','approval_history','approval_status','approval_required','created_by_id','created_at','dependencies','blocked_by','metadata']) expect(after[key]).toEqual(before[key]);
    const audit = (await env.owner.query(`SELECT *,xmin::text AS tx FROM ${env.t('audit_logs')}`)).rows;
    const actions = (await env.owner.query(`SELECT *,xmin::text AS tx FROM ${env.t('c2c_ana_actions')}`)).rows;
    expect(audit).toHaveLength(1); expect(actions).toHaveLength(1);
    expect(audit[0]).toMatchObject({tx:after.tx,tenant_id:9,reason:'Cover the validation handoff'});
    expect(actions[0]).toMatchObject({tx:after.tx,org_id:9,command:'task.assign',target:`task:${taskId}`,proposed_by:7});
    expect(actions[0].payload).toMatchObject({previousAssigneeId:8,assigneeId:9,method:'named',assignedBy:7,summary:'Named task reassignment'});
    expect(audit[0].chain_seq).not.toBeNull(); expect(audit[0].hmac_seal).toBeTruthy();
    expect(sinks.notify).toHaveBeenCalledTimes(1);
  });
  it('can assign a genuinely unassigned saved task', async () => {
    await env.owner.query(`UPDATE ${env.t('unified_tasks')} SET assignee_id=NULL,assignee_name=NULL`);
    const r = await request(app()).patch(taskUrl).send(change(await current()));
    expect(r.status, JSON.stringify(r.body)).toBe(200); expect(r.body.data.assigneeId).toBe(9);
  });
  it.each([8,12])('does not trust claimed admin role or use-only/read-only owner actor %s', async actor => {
    const expected = await current();
    const read = await request(app(actor)).get(optionsUrl);
    expect(read.status).toBe(200); expect(read.body.meta.canAssign).toBe(false); expect(read.body.data).toEqual([]);
    expect((await request(app(actor)).patch(taskUrl).send(change(expected))).status).toBe(403);
    expect(await count('audit_logs')).toBe(0);
  });
  it.each([10,11,12,13])('refuses recipient %s without creating access or lineage', async recipient => {
    const shares = await count('project_members');
    const r = await request(app()).patch(taskUrl).send(change(await current(),recipient));
    expect(r.status).toBeGreaterThanOrEqual(400); expect(r.status).toBeLessThan(500);
    expect(await count('audit_logs')).toBe(0); expect(await count('c2c_ana_actions')).toBe(0); expect(await count('project_members')).toBe(shares);
  });
  it('refuses another claimed client and a corrupt recorded task/client link', async () => {
    const expected = await current();
    expect((await request(app(7,9,72)).patch(taskUrl).send(change(expected))).status).toBe(403);
    await env.owner.query(`UPDATE ${env.t('unified_tasks')} SET client_workspace_id=72`);
    expect((await request(app()).patch(taskUrl).send(change(expected))).status).toBe(409);
    expect(await count('audit_logs')).toBe(0);
  });
  it.each(['completed','cancelled'])('retains terminal %s task and lets bulk auto report a genuine skip', async status => {
    const expected = await current(); await env.owner.query(`UPDATE ${env.t('unified_tasks')} SET status=$1`,[status]);
    expect((await request(app()).patch(taskUrl).send(change(expected))).status).toBe(409);
    const auto = await request(app()).post('/api/tasks/tasks/auto-assign').send({taskIds:[taskId]});
    expect(auto.status, JSON.stringify(auto.body)).toBe(200); expect(auto.body.count).toBe(0); expect(await count('audit_logs')).toBe(0);
  });
  it('rejects an old version even after A to B to A returns to the old assignee', async () => {
    const old = await current();
    expect((await request(app()).patch(taskUrl).send(change(old))).status).toBe(200);
    expect((await request(app()).patch(taskUrl).send(change(await current(),8))).status).toBe(200);
    const r = await request(app()).patch(taskUrl).send(change(old,14));
    expect(r.status).toBe(409); expect(await count('audit_logs')).toBe(2);
  });
});

describe('native assignment atomicity and independent-session conflicts', () => {
  it('retains a recorded client-wide task scope without inventing a project', async () => {
    await env.owner.query(`UPDATE ${env.t('unified_tasks')} SET project_id=NULL,client_workspace_id=72`);
    expect((await request(app()).get(optionsUrl)).status).toBe(403);
    const read = await request(app(7,9,72)).get(optionsUrl);
    expect(read.status,JSON.stringify(read.body)).toBe(200);
    expect(read.body.meta).toMatchObject({projectId:null,clientWorkspaceId:72,canAssign:true});
    const changed = await request(app(7,9,72)).patch(taskUrl).send(change({expectedAssigneeId:read.body.meta.assigneeId,expectedVersion:read.body.meta.assignmentVersion},10));
    expect(changed.status,JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data).toMatchObject({projectId:null,clientWorkspaceId:72,assigneeId:10});
  });
  it('does not stamp the selected client onto an organization-wide task', async () => {
    await env.owner.query(`UPDATE ${env.t('unified_tasks')} SET project_id=NULL,client_workspace_id=NULL`);
    const read = await request(app(7,9,72)).get(optionsUrl);
    expect(read.status,JSON.stringify(read.body)).toBe(200);
    expect(read.body.meta).toMatchObject({projectId:null,clientWorkspaceId:null});
    const changed = await request(app(7,9,72)).patch(taskUrl).send(change({expectedAssigneeId:read.body.meta.assigneeId,expectedVersion:read.body.meta.assignmentVersion},10));
    expect(changed.status,JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data).toMatchObject({projectId:null,clientWorkspaceId:null,assigneeId:10});
  });
  it('rolls the task and first ledger insert back when the second ledger insert fails', async () => {
    const expected = await current();
    await env.owner.query(`ALTER TABLE ${env.t('c2c_ana_actions')} ADD CONSTRAINT synthetic_ledger_failure CHECK (false) NOT VALID`);
    const r = await request(app()).patch(taskUrl).send(change(expected));
    expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(500);
    expect((await env.owner.query(`SELECT assignee_id FROM ${env.t('unified_tasks')}`)).rows[0].assignee_id).toBe(8);
    expect(await count('audit_logs')).toBe(0); expect(await count('c2c_ana_actions')).toBe(0); expect(sinks.notify).not.toHaveBeenCalled();
  });
  it('reports lost actual COMMIT acknowledgement as unknown, discards once and permits a safe reread', async () => {
    const expected = await current(); loseCommitAck = true;
    const r = await request(app()).patch(taskUrl).send(change(expected));
    expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(500);
    expect(JSON.stringify(r.body)).not.toMatch(/nothing was changed|rolled back/i);
    expect(discards).toBe(1); expect(sinks.notify).not.toHaveBeenCalled();
    expect(await count('audit_logs')).toBe(1); expect(await count('c2c_ana_actions')).toBe(1);
    const reread = await current(); expect(reread.expectedAssigneeId).toBe(9); expect(reread.expectedVersion).not.toBe(expected.expectedVersion);
  });
  it('allows only one concurrent independent HTTP writer for the same observed version', async () => {
    const expected = await current(); pids.clear();
    let arrivals = 0; let release!: () => void;
    const both = new Promise<void>(resolve => { release = resolve; });
    rendezvous = async () => {
      if (++arrivals === 2) release();
      await Promise.race([both,new Promise<never>((_,reject) => { const timer = setTimeout(() => reject(new Error('Concurrent BEGIN barrier timeout')),5000); timer.unref(); })]);
    };
    const results = await Promise.all([request(app()).patch(taskUrl).send(change(expected,9)),request(app()).patch(taskUrl).send(change(expected,14))]);
    rendezvous = undefined;
    expect(results.map(r => r.status).sort(),JSON.stringify(results.map(r => r.body))).toEqual([200,409]);
    expect(pids.size).toBe(2); expect(await count('audit_logs')).toBe(1); expect(await count('c2c_ana_actions')).toBe(1);
  });
  it('verifies the real sequenced chain and HMAC seals after two native assignment transactions', async () => {
    expect((await request(app()).patch(taskUrl).send(change(await current(),9))).status).toBe(200);
    expect((await request(app()).patch(taskUrl).send(change(await current(),14))).status).toBe(200);
    const chain = await import('../../server/services/audit/chain');
    const client = await env.owner.connect();
    try {
      await client.query(`SET search_path TO ${env.schema}`);
      expect(await chain.verifyAuditChain(client,{tenantId:9})).toMatchObject({ok:true,rowsChecked:2,sequencedRows:2,legacyRows:0});
      expect(await chain.verifyAuditChainSeals(client,{tenantId:9})).toMatchObject({valid:true,verified:2});
    } finally { await client.query('RESET search_path'); client.release(); }
  });
});
