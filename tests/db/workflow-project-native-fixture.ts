/** Existing workflow/ordinary/unified writers, actual PostgreSQL and FORCE RLS.
 * Synthetic authenticated requests exercise real actor/project admission and
 * canonical task/audit SQL; notifications alone are spied. This is not
 * deployed-auth or full-schema proof. */
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { QueryConfig } from 'pg';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import { unifiedTasks, taskTemplates, taskDependencies } from '../../shared/schema';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, type SchedulerDb } from './scheduler-harness';
import { tenantIsolationPolicySql } from './harness';

const effects = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../../server/services/tasking/task-side-effects', async original => ({
  ...await original<typeof import('../../server/services/tasking/task-side-effects')>(), notifyTaskEvent: effects.notify,
}));
vi.mock('../../server/auth', () => ({ authMiddleware: (_q: unknown, _s: unknown, next: () => void) => next() }));
vi.mock('../../server/middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: unknown, _s: unknown, next: () => void) => next(),
  requireOrganizationContext: (_q: unknown, _s: unknown, next: () => void) => next(),
}));
vi.mock('../../server/middleware/redisRateLimiter', () => ({
  createRedisRateLimiter: () => (_q: unknown, _s: unknown, next: () => void) => next(),
}));

const TABLES = ['organization_users', 'client_workspaces', 'projects', 'project_members',
  'project_visibility_settings', 'concept2cure_artifacts', 'concept2cure_review_assignments',
  'unified_tasks', 'task_templates', 'task_dependencies', 'canonical_documents'];
const BASE_DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY,status text);
CREATE TABLE users (id integer PRIMARY KEY,name text,email text,status text);
CREATE TABLE organization_users (id serial PRIMARY KEY,organization_id integer,user_id integer,role text);
CREATE TABLE client_workspaces (id integer PRIMARY KEY,organization_id integer);
CREATE TABLE projects (id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,
  status text,owner_id integer,created_by_id integer,settings jsonb,regulatory_program_id uuid);
CREATE TABLE project_members (id serial PRIMARY KEY,project_id integer,organization_id integer,
  user_id integer,role text,status text);
CREATE TABLE project_visibility_settings (project_id integer PRIMARY KEY,organization_id integer,visibility text);
CREATE TABLE concept2cure_artifacts (id integer,organization_id integer,project_id integer);
CREATE TABLE concept2cure_review_assignments (artifact_id integer,reviewer_id integer,organization_id integer,status text);
CREATE TABLE authoring_documents (id uuid PRIMARY KEY,tenant_id integer,client_program_id uuid);
CREATE TABLE canonical_documents (canonical_id uuid PRIMARY KEY,organization_id integer,project_id uuid);
`;
const DOCS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const PROGRAMS = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
const TEMPLATE = 'NATIVE-PROJECT-WORKFLOW';
const DEFINITIONS = [{ id: 'a', title: 'Review source data', moduleType: 'general', dayOffset: 0, duration: 2 },
  { id: 'b', title: 'Record the conclusion', moduleType: 'general', dayOffset: 2, duration: 1 }];
const EDGES = [{ predecessor: 'a', successor: 'b', type: 'finish-to-start' }];
let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let unifiedRouter: express.Router;
let losesCommit = false;
let discards = 0;
const transactionEvents: string[] = [];
const statement = (sql: string | QueryConfig) => typeof sql === 'string' ? sql : sql.text;

/** Same model-column fixture pattern as task-assignment.pglite.test.ts. */
function modeledDdl(table: typeof unifiedTasks | typeof taskTemplates | typeof taskDependencies): string {
  const config = getTableConfig(table);
  const columns = config.columns.filter(column => column.name !== 'id').map(column => {
    const defaults = ['created_at', 'updated_at'].includes(column.name) ? ' DEFAULT now()' : '';
    return `"${column.name}" ${column.getSQLType()}${defaults}`;
  });
  return `CREATE TABLE "${config.name}" (id serial PRIMARY KEY,${columns.join(',')});`;
}

function app(userId = 7, organizationId = 9, workspace: unknown = 71, claimedRole = 'admin') {
  const a = express(); a.use(express.json());
  a.use((req, res, next) => {
    void store.runWithTenantScope({ tenantId: String(organizationId), role: 'member', source: 'test',
      caller: 'workflow-project-native-http' }, async () => {
      const client = await runtime.getPool().connect();
      let released = false;
      const release = (error?: Error) => { if (!released) { released = true; client.release(error); } };
      res.once('finish', () => release());
      Object.assign(req, { userId, userRole: claimedRole, user: { id: userId, organizationId, role: claimedRole },
        organizationId, tenantId: organizationId,
        tenantContext: { organizationId, ...(workspace === undefined ? {} : { clientWorkspaceId: workspace }) },
        dbClient: { async query(sql: string | QueryConfig, params?: unknown[]) {
          const answer = await client.query(sql, params);
          if (statement(sql).trim().toUpperCase() === 'COMMIT') transactionEvents.push('COMMIT');
          if (losesCommit && statement(sql).trim().toUpperCase() === 'COMMIT') {
            losesCommit = false; throw Object.assign(new Error('Lost actual workflow COMMIT acknowledgement'), { code: 'ECONNRESET' });
          }
          return answer;
        }, async discard(error: Error) { discards++; release(error); } } });
      next();
    }).catch(next);
  });
  a.use('/api/tasks', router); a.use('/api/task-management', router);
  a.use('/api/regulatory/tasks', unifiedRouter); a.use('/api/unified-tasks', unifiedRouter);
  return a;
}
const create = (body: Record<string, unknown> = { projectId: 11 }, actor = 7, workspace: unknown = 71,
  template = TEMPLATE, alias = '/api/task-management') => request(app(actor, 9, workspace))
  .post(`${alias}/tasks/from-template/${encodeURIComponent(template)}`).send(body);
const ordinary = (body: Record<string, unknown> = {}, actor = 7, workspace: unknown = 71, alias = '/api/task-management') =>
  request(app(actor, 9, workspace)).post(`${alias}/tasks`)
    .send({ title: 'Native ordinary project task', moduleType: 'general', assigneeId: actor, projectId: 11, ...body });
const unified = (body: Record<string, unknown> = {}, actor = 7, workspace: unknown = 71, alias = '/api/regulatory/tasks') =>
  request(app(actor, 9, workspace)).post(`${alias}/unified`)
    .send({ title: 'Native unified project task', moduleType: 'CMC', organizationId: 9, assigneeId: actor, projectId: 11, ...body });

async function counts() {
  const { rows } = await env.owner.query(`SELECT
    (SELECT count(*)::int FROM ${env.t('unified_tasks')}) AS tasks,
    (SELECT count(*)::int FROM ${env.t('task_dependencies')}) AS edges,
    (SELECT count(*)::int FROM ${env.t('c2c_ana_actions')}) AS actions,
    (SELECT count(*)::int FROM ${env.t('audit_logs')}) AS audits,
    (SELECT coalesce(sum(usage_count),0)::int FROM ${env.t('task_templates')}) AS usage`);
  return rows[0];
}

async function refused(body: Record<string, unknown>, status: number, code: string, actor = 7, workspace: unknown = 71) {
  const before = await counts(); const answer = await create(body, actor, workspace);
  expect(answer.status, JSON.stringify(answer.body)).toBe(status);
  expect(answer.body.code).toBe(code); expect(await counts()).toEqual(before);
}
async function ordinaryRefused(body: Record<string, unknown>, status: number, actor = 7, workspace: unknown = 71) {
  const before = await counts(); const answer = await ordinary(body, actor, workspace);
  expect(answer.status, JSON.stringify(answer.body)).toBe(status); expect(await counts()).toEqual(before);
}
async function unifiedRefused(body: Record<string, unknown>, status: number, actor = 7, workspace: unknown = 71) {
  const before = await counts(); const answer = await unified(body, actor, workspace);
  expect(answer.status, JSON.stringify(answer.body)).toBe(status); expect(await counts()).toEqual(before);
  return answer;
}

async function injectedFailure(table: string, predicate: string, run: () => Promise<void>) {
  const name = 'native_workflow_failure';
  await env.owner.query(`ALTER TABLE ${env.t(table)} ADD CONSTRAINT ${name} CHECK (${predicate}) NOT VALID`);
  try { await run(); }
  finally { await env.owner.query(`ALTER TABLE ${env.t(table)} DROP CONSTRAINT ${name}`); }
}

beforeAll(async () => {
  const audit = (await readFile('server/db/pglite-harness.ts', 'utf8'))
    .match(/export const AUDIT_LOGS_PGLITE_DDL = `([\s\S]*?)`;/)?.[1];
  const actions = (await readFile('server/db/fixtures/governed-signing-pglite.ts', 'utf8'))
    .match(/CREATE TABLE IF NOT EXISTS c2c_ana_actions \([\s\S]*?\n\);/)?.[0];
  if (!audit || !actions) throw new Error('Canonical ledger fixture is unavailable');
  const ddl = BASE_DDL + [unifiedTasks, taskTemplates, taskDependencies].map(modeledDdl).join('\n') + audit + actions;
  env = await setupSchedulerDb(databaseUrl, 'dbwfproject', ddl, TABLES);
  for (const [table, column] of [['audit_logs', 'tenant_id'], ['c2c_ana_actions', 'org_id'], ['authoring_documents', 'tenant_id']]) {
    await env.owner.query(`ALTER TABLE ${env.t(table)} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${env.t(table)} FORCE ROW LEVEL SECURITY; ${tenantIsolationPolicySql(env.t(table), column)}`);
  }
  const migration = (await readFile('migrations/20260921_audit_logs_chain_seq.sql', 'utf8'))
    .replaceAll('public.', `${env.schema}.`).replaceAll("table_schema = 'public'", `table_schema = '${env.schema}'`);
  await env.owner.query(migration);
  await env.owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${env.schema} TO ${env.runtimeRole}`);
  process.env.AUDIT_HMAC_KEY = 'workflow-project-synthetic-test-chain-key';
  runtime = await import('../../server/db/runtime'); store = await import('../../server/db/tenantStore');
  router = (await import('../../server/routes/taskManagement.routes')).default;
  unifiedRouter = (await import('../../server/routes/unifiedTasks.routes')).default;
  const role = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 'workflow-native-role' },
    () => runtime.getPool().query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(role.rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false });
}, 120_000);
beforeEach(async () => {
  losesCommit = false; discards = 0;
  transactionEvents.length = 0; effects.notify.mockReset().mockImplementation(() => transactionEvents.push('notification'));
  await env.owner.query(`TRUNCATE ${[...TABLES, 'users', 'organizations', 'audit_logs', 'c2c_ana_actions', 'authoring_documents']
    .map(table => env.t(table)).join(',')} RESTART IDENTITY;
    INSERT INTO ${env.t('organizations')} VALUES (9,'active'),(10,'active');
    INSERT INTO ${env.t('users')} VALUES (7,'Project owner','owner@example.test','active'),
      (8,'Project editor','editor@example.test','active'),(9,'Other owner','other@example.test','active'),
      (10,'Private outsider','outsider@example.test','active'),(11,'Inactive','inactive@example.test','inactive'),
      (12,'Organization viewer','viewer@example.test','active');
    INSERT INTO ${env.t('organization_users')}(organization_id,user_id,role) VALUES
      (9,7,'member'),(9,8,'member'),(9,9,'member'),(9,10,'member'),(9,11,'member'),(9,12,'viewer');
    INSERT INTO ${env.t('client_workspaces')} VALUES (71,9),(72,9),(81,10);
    INSERT INTO ${env.t('projects')}(id,organization_id,client_workspace_id,status,owner_id,created_by_id,settings) VALUES (11,9,71,'active',7,7,'{}'),
      (12,9,72,'active',9,9,'{}'),(13,10,81,'active',9,9,'{}'),(14,9,NULL,'active',7,7,'{}');
    INSERT INTO ${env.t('project_visibility_settings')} VALUES (11,9,'private'),(12,9,'private'),(13,10,'private'),(14,9,'private');
    INSERT INTO ${env.t('project_members')}(project_id,organization_id,user_id,role,status) VALUES
      (11,9,8,'edit','active'),(11,9,10,'use','active'),(11,9,12,'edit','active');`);
  await env.owner.query(`UPDATE ${env.t('projects')} SET regulatory_program_id=CASE id WHEN 11 THEN $1::uuid ELSE $2::uuid END WHERE id IN(11,12)`, PROGRAMS.slice(0, 2));
  await env.owner.query(`INSERT INTO ${env.t('authoring_documents')} SELECT doc::uuid,9,program::uuid FROM unnest($1::text[],$2::text[]) AS source(doc,program)`, [DOCS, PROGRAMS]);
  await env.owner.query(`INSERT INTO ${env.t('canonical_documents')} SELECT id,tenant_id,client_program_id FROM ${env.t('authoring_documents')}`);
  await env.owner.query(`INSERT INTO ${env.t('task_templates')}
    (template_id,organization_id,name,category,is_active,tasks,dependencies,usage_count)
    VALUES ($1,9,'Native project workflow','general',true,$2::json,$3::json,0)`,
  [TEMPLATE, JSON.stringify(DEFINITIONS), JSON.stringify(EDGES)]);
});
afterAll(async () => {
  delete process.env.AUDIT_HMAC_KEY;
  if (runtime) {
    const pool = runtime.getPool(); await pool.end();
    expect((pool as unknown as { ended: boolean }).ended).toBe(true);
  }
  if (env) {
    const pool = env.owner; await env.destroy();
    expect((pool as unknown as { ended: boolean }).ended).toBe(true);
  }
});

const loseNextCommit = () => { losesCommit = true; };
export { env, app, create, ordinary, unified, counts, refused, ordinaryRefused, unifiedRefused, injectedFailure,
  effects, transactionEvents, discards, loseNextCommit, DOCS, TEMPLATE, DEFINITIONS };
