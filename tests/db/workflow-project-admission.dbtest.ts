/** Existing workflow writer, actual PostgreSQL and FORCE RLS.
 * Synthetic authenticated requests exercise real actor/project admission and
 * canonical task/audit SQL; this is not deployed-auth or full-schema proof. */
import express from 'express';
import request from 'supertest';
import { readFile } from 'node:fs/promises';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { QueryConfig } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { unifiedTasks, taskTemplates, taskDependencies } from '../../shared/schema';
import { getBuiltinWorkflowTemplate } from '../../server/services/tasking/workflow-templates';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, waitFor, type SchedulerDb } from './scheduler-harness';
import { tenantIsolationPolicySql } from './harness';

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
  'unified_tasks', 'task_templates', 'task_dependencies'];
const BASE_DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY,status text);
CREATE TABLE users (id integer PRIMARY KEY,name text,email text,status text);
CREATE TABLE organization_users (id serial PRIMARY KEY,organization_id integer,user_id integer,role text);
CREATE TABLE client_workspaces (id integer PRIMARY KEY,organization_id integer);
CREATE TABLE projects (id integer PRIMARY KEY,organization_id integer,client_workspace_id integer,
  status text,owner_id integer,created_by_id integer,settings jsonb);
CREATE TABLE project_members (id serial PRIMARY KEY,project_id integer,organization_id integer,
  user_id integer,role text,status text);
CREATE TABLE project_visibility_settings (project_id integer PRIMARY KEY,organization_id integer,visibility text);
CREATE TABLE concept2cure_artifacts (id integer,organization_id integer,project_id integer);
CREATE TABLE concept2cure_review_assignments (artifact_id integer,reviewer_id integer,organization_id integer,status text);
`;
const TEMPLATE = 'NATIVE-PROJECT-WORKFLOW';
const DEFINITIONS = [{ id: 'a', title: 'Review source data', moduleType: 'general', dayOffset: 0, duration: 2 },
  { id: 'b', title: 'Record the conclusion', moduleType: 'general', dayOffset: 2, duration: 1 }];
const EDGES = [{ predecessor: 'a', successor: 'b', type: 'finish-to-start' }];
let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let store: typeof import('../../server/db/tenantStore');
let router: express.Router;
let losesCommit = false;
let discards = 0;
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
          if (losesCommit && statement(sql).trim().toUpperCase() === 'COMMIT') {
            losesCommit = false; throw Object.assign(new Error('Lost actual workflow COMMIT acknowledgement'), { code: 'ECONNRESET' });
          }
          return answer;
        }, async discard(error: Error) { discards++; release(error); } } });
      next();
    }).catch(next);
  });
  a.use('/api/tasks', router); a.use('/api/task-management', router);
  return a;
}
const create = (body: Record<string, unknown> = { projectId: 11 }, actor = 7, workspace: unknown = 71,
  template = TEMPLATE, alias = '/api/task-management') => request(app(actor, 9, workspace))
  .post(`${alias}/tasks/from-template/${encodeURIComponent(template)}`).send(body);

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
  for (const [table, column] of [['audit_logs', 'tenant_id'], ['c2c_ana_actions', 'org_id']]) {
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
  const role = await store.runWithTenantScope({ tenantId: '9', role: 'member', source: 'test', caller: 'workflow-native-role' },
    () => runtime.getPool().query('SELECT current_user AS role,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'));
  expect(role.rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false });
}, 120_000);
beforeEach(async () => {
  losesCommit = false; discards = 0;
  await env.owner.query(`TRUNCATE ${[...TABLES, 'users', 'organizations', 'audit_logs', 'c2c_ana_actions']
    .map(table => env.t(table)).join(',')} RESTART IDENTITY;
    INSERT INTO ${env.t('organizations')} VALUES (9,'active'),(10,'active');
    INSERT INTO ${env.t('users')} VALUES (7,'Project owner','owner@example.test','active'),
      (8,'Project editor','editor@example.test','active'),(9,'Other owner','other@example.test','active'),
      (10,'Private outsider','outsider@example.test','active'),(11,'Inactive','inactive@example.test','inactive'),
      (12,'Organization viewer','viewer@example.test','active');
    INSERT INTO ${env.t('organization_users')}(organization_id,user_id,role) VALUES
      (9,7,'member'),(9,8,'member'),(9,9,'member'),(9,10,'member'),(9,11,'member'),(9,12,'viewer');
    INSERT INTO ${env.t('client_workspaces')} VALUES (71,9),(72,9),(81,10);
    INSERT INTO ${env.t('projects')} VALUES (11,9,71,'active',7,7,'{}'),
      (12,9,72,'active',9,9,'{}'),(13,10,81,'active',9,9,'{}'),(14,9,NULL,'active',7,7,'{}');
    INSERT INTO ${env.t('project_visibility_settings')} VALUES (11,9,'private'),(12,9,'private'),(13,10,'private'),(14,9,'private');
    INSERT INTO ${env.t('project_members')}(project_id,organization_id,user_id,role,status) VALUES
      (11,9,8,'edit','active'),(11,9,10,'use','active'),(11,9,12,'edit','active');`);
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

describe('current workflow project admission counterexamples', () => {
  it('refuses the same-organization private project outsider without any workflow write', async () => {
    const before = await counts(); const answer = await create({ projectId: 12 }, 7, 72);
    expect({ status: answer.status, writes: await counts() }, JSON.stringify(answer.body))
      .toEqual({ status: 403, writes: before });
  });
  it('records the actual project workspace on every created workflow task', async () => {
    const answer = await create(); expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data).toHaveLength(2);
    for (const task of answer.body.data) expect(task).toMatchObject({ organizationId: 9, projectId: 11, clientWorkspaceId: 71, createdById: 7 });
  });
});

describe('workflow creation requires its actual project and current authority', () => {
  it.each([undefined, null, 0, -1, 1.5, '11', '11x', true, [], {}, 2_147_483_648])('refuses invalid project %j without writes', async projectId => {
      await refused({ projectId }, 400, 'TASK_PROJECT_INVALID');
    });
  it.each([13, 999_999])('refuses foreign or missing project %s', async projectId => {
    await refused({ projectId }, 404, 'TASK_PROJECT_NOT_FOUND');
  });
  it.each(['archived', 'deleted'])('refuses the actual %s parent', async status => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET status=$1 WHERE id=11`, [status]);
    await refused({ projectId: 11 }, 409, 'TASK_PROJECT_CLOSED');
  });
  it('does not trust a claimed administrator whose actual organization role is viewer', async () => {
    await env.owner.query(`UPDATE ${env.t('organization_users')} SET role='viewer' WHERE user_id=7`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('does not trust a removed organization member', async () => {
    await env.owner.query(`DELETE FROM ${env.t('organization_users')} WHERE user_id=7`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('refuses the actual inactive actor even with a claimed administrator role', async () => {
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 11);
  });
  it('refuses an inactive organization', async () => {
    await env.owner.query(`UPDATE ${env.t('organizations')} SET status='inactive' WHERE id=9`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('refuses a project use/read share as task-create authority', async () => {
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 10);
  });
  it('refuses an inactive edit share', async () => {
    await env.owner.query(`UPDATE ${env.t('project_members')} SET status='inactive' WHERE user_id=8`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 8);
  });
  it('uses the actual current edit share, recording its real creator and parent', async () => {
    const answer = await create({ projectId: 11 }, 8);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.data.every((row: { createdById: number; projectId: number; clientWorkspaceId: number }) =>
      row.createdById === 8 && row.projectId === 11 && row.clientWorkspaceId === 71)).toBe(true);
    expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
  });
  it('keeps the existing authenticated viewer role gate', async () => {
    const before = await counts(); const answer = await request(app(7, 9, 71, 'viewer'))
      .post(`/api/task-management/tasks/from-template/${TEMPLATE}`).send({ projectId: 11 });
    expect(answer.status).toBe(403); expect(await counts()).toEqual(before);
  });
});

describe('the project determines workspace scope', () => {
  it.each([72, '71x', 0, -1, 1.5, true, {}, 2_147_483_648])('refuses mismatched or malformed client claim %j', async workspace => {
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 7, workspace);
  });
  it.each([null, '71'])('records actual workspace with an absent or normalized claim %j', async workspace => {
    const answer = await create({ projectId: 11 }, 7, workspace);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    for (const row of answer.body.data) expect(row.clientWorkspaceId).toBe(71);
  });
  it('keeps an actually unfiled project workspace null', async () => {
    const answer = await create({ projectId: 14 }, 7, null);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    for (const row of answer.body.data) expect(row).toMatchObject({ projectId: 14, clientWorkspaceId: null });
  });
  it('refuses an explicit client claim on a project with no workspace', async () => {
    await refused({ projectId: 14 }, 403, 'TASK_PROJECT_ACCESS_DENIED');
  });
  it('refuses a project whose actual workspace belongs to another organization', async () => {
    await env.owner.query(`UPDATE ${env.t('projects')} SET client_workspace_id=81 WHERE id=11`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 7, null);
  });
  it('refuses a project whose recorded workspace is missing', async () => {
    await env.owner.query(`DELETE FROM ${env.t('client_workspaces')} WHERE id=71`);
    await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 7, null);
  });
  it('does not let body client, organization or creator values redirect admitted tasks', async () => {
    const answer = await create({ projectId: 11, clientWorkspaceId: 72, organizationId: 10, createdById: 9 });
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    for (const row of answer.body.data) expect(row).toMatchObject({ organizationId: 9, projectId: 11, clientWorkspaceId: 71, createdById: 7 });
  });
});

describe('workflow transaction and review-route protections remain canonical', () => {
  it.each(['/api/task-management', '/api/tasks'])('keeps the existing legacy envelope and atomic lineage through %s', async alias => {
    const answer = await create({ projectId: 11, startDate: '2026-11-06T10:00:00.000Z', adjustDates: true }, 7, 71, TEMPLATE, alias);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body).toMatchObject({ success: true, count: 2, template: 'Native project workflow' });
    expect(answer.body.data).toHaveLength(2);
    const saved = (await env.owner.query(`SELECT task_id,project_id,client_workspace_id,start_date,source_entity_type,source_entity_id,
      xmin::text AS tx FROM ${env.t('unified_tasks')} ORDER BY id`)).rows;
    expect(saved[0].start_date.toISOString()).toBe('2026-11-06T10:00:00.000Z');
    expect(saved[1].start_date.toISOString()).toBe('2026-11-08T10:00:00.000Z');
    for (const row of saved) expect(row).toMatchObject({ project_id: 11, client_workspace_id: 71, source_entity_type: 'taskTemplate', source_entity_id: TEMPLATE });
    const transactions = (await env.owner.query(`SELECT xmin::text AS tx FROM ${env.t('unified_tasks')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('task_dependencies')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('audit_logs')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('c2c_ana_actions')}
      UNION ALL SELECT xmin::text AS tx FROM ${env.t('task_templates')}`)).rows;
    expect(new Set(transactions.map(row => row.tx)).size).toBe(1);
    const actions = (await env.owner.query(`SELECT a.id AS action_id,a.command,a.target,a.proposed_by,a.audit_row_id,l.reason,l.ana_action_id,
      l.sha256_chain,l.chain_seq,l.hmac_seal FROM ${env.t('c2c_ana_actions')} a
      JOIN ${env.t('audit_logs')} l ON l.id=a.audit_row_id::text AND l.tenant_id=a.org_id`)).rows;
    expect(actions.filter(row => row.command === 'task.create')).toHaveLength(2);
    expect(actions.filter(row => row.command === 'task.link')).toHaveLength(1);
    for (const row of actions) {
      expect(row.proposed_by).toBe(7); expect(row.reason).toBeNull(); expect(row.ana_action_id).toBe(row.action_id);
      expect(row.sha256_chain).toMatch(/^[a-f0-9]{64}$/); expect(row.chain_seq).not.toBeNull(); expect(row.hmac_seal).toBeTruthy();
    }
    expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
  });
  it.each(['reviewRouteId', 'reviewRole', 'reviewStep', 'routeSignatureId', 'routeActId', 'routeAuthoringSignatureId'])(
    'still refuses protected request column %s before project or workflow writes', async column => {
      const before = await counts(); const answer = await create({ projectId: 11, [column]: 'protected' });
      expect(answer.status, JSON.stringify(answer.body)).toBe(400);
      expect(answer.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED'); expect(await counts()).toEqual(before);
    });
  it('still refuses a stored task definition naming a protected review column', async () => {
    await env.owner.query(`UPDATE ${env.t('task_templates')} SET tasks=$1::json WHERE template_id=$2`,
      [JSON.stringify([{ ...DEFINITIONS[0], reviewRouteId: '11111111-2222-4333-8444-555555555555' }, DEFINITIONS[1]]), TEMPLATE]);
    const before = await counts(); const answer = await create();
    expect(answer.status, JSON.stringify(answer.body)).toBe(400);
    expect(answer.body.code).toBe('ROUTE_COLUMNS_NOT_ADMITTED'); expect(await counts()).toEqual(before);
  });
});

describe('workflow rollback and uncertain acknowledgement', () => {
  it.each(['unified_tasks', 'task_dependencies', 'c2c_ana_actions', 'task_templates'])(
    'rolls back every workflow fact when actual %s persistence fails', async table => {
      const before = await counts();
      const predicate = table === 'unified_tasks' ? "title <> 'Record the conclusion'"
        : table === 'task_templates' ? 'usage_count=0' : table === 'c2c_ana_actions' ? 'org_id<>9' : 'organization_id<>9';
      await injectedFailure(table, predicate, async () => {
        const answer = await create(); expect(answer.status, JSON.stringify(answer.body)).toBe(500);
        expect(answer.body.error).not.toBe('OUTCOME_UNKNOWN'); expect(await counts()).toEqual(before);
      });
    });
  it('reports an actually committed lost acknowledgement as unknown and discards its request connection', async () => {
    losesCommit = true; const answer = await create();
    expect(answer.status, JSON.stringify(answer.body)).toBe(500); expect(answer.body.error).toBe('OUTCOME_UNKNOWN');
    expect(discards).toBe(1); expect(answer.body.message).not.toMatch(/nothing was (created|changed)/i);
    expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
  });
  it('keeps built-in template creation on the admitted parent without inventing stored usage', async () => {
    const builtin = getBuiltinWorkflowTemplate('BUILTIN-IND')!;
    const answer = await create({ projectId: 11 }, 7, 71, builtin.templateId);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    expect(answer.body.count).toBe(builtin.tasks.length);
    for (const row of answer.body.data) expect(row).toMatchObject({ projectId: 11, clientWorkspaceId: 71 });
    expect(await counts()).toEqual({ tasks: builtin.tasks.length, edges: builtin.dependencies.length,
      actions: builtin.tasks.length + builtin.dependencies.length, audits: builtin.tasks.length + builtin.dependencies.length, usage: 0 });
  });
});

describe('workflow admission retains current project permissions', () => {
  it('rechecks the edit membership after a real parent-lock wait instead of retaining an earlier grant', async () => {
    const holder = await env.owner.connect(); let open = true;
    let pending: Promise<request.Response> | undefined;
    try {
      await holder.query('BEGIN'); const blocker = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query(`SELECT id FROM ${env.t('projects')} WHERE id=11 FOR UPDATE`);
      pending = create({ projectId: 11 }, 8).then(answer => answer);
      expect(await waitFor(async () => (await env.owner.query(`SELECT pid FROM pg_stat_activity
        WHERE usename=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))`, [env.runtimeRole, blocker])).rows.length > 0, 5_000)).toBe(true);
      await holder.query(`DELETE FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`);
      await holder.query('COMMIT'); open = false;
      const answer = await pending; expect(answer.status, JSON.stringify(answer.body)).toBe(403);
      expect(answer.body.code).toBe('TASK_PROJECT_ACCESS_DENIED');
      expect(await counts()).toEqual({ tasks: 0, edges: 0, actions: 0, audits: 0, usage: 0 });
    } finally {
      if (open) await holder.query('ROLLBACK'); holder.release(); await pending?.catch(() => undefined);
    }
  });
  it('retains actual edit membership until its workflow transaction commits, before a waiting revocation', async () => {
    const holder = await env.owner.connect(); const revoker = await env.owner.connect();
    let holderOpen = false; let revokerOpen = false;
    let pending: Promise<request.Response> | undefined;
    let revocation: Promise<unknown> | undefined;
    try {
      await holder.query('BEGIN'); holderOpen = true;
      const blocker = Number((await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      await holder.query(`LOCK TABLE ${env.t('unified_tasks')} IN ACCESS EXCLUSIVE MODE`);
      pending = create({ projectId: 11 }, 8).then(answer => answer);
      let requestPid = 0;
      expect(await waitFor(async () => {
        const rows = (await env.owner.query(`SELECT pid FROM pg_stat_activity
          WHERE usename=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))`, [env.runtimeRole, blocker])).rows;
        requestPid = Number(rows[0]?.pid ?? 0); return requestPid > 0;
      }, 5_000)).toBe(true);
      await revoker.query('BEGIN'); revokerOpen = true;
      const revokerPid = Number((await revoker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      revocation = revoker.query(`DELETE FROM ${env.t('project_members')} WHERE project_id=11 AND user_id=8`);
      expect(await waitFor(async () => (await env.owner.query(`SELECT pid FROM pg_stat_activity
        WHERE pid=$1 AND wait_event_type='Lock' AND $2::int=ANY(pg_blocking_pids(pid))`, [revokerPid, requestPid])).rows.length === 1, 5_000)).toBe(true);
      await holder.query('COMMIT'); holderOpen = false;
      const answer = await pending; expect(answer.status, JSON.stringify(answer.body)).toBe(200);
      await revocation; await revoker.query('COMMIT'); revokerOpen = false;
      expect(await counts()).toEqual({ tasks: 2, edges: 1, actions: 3, audits: 3, usage: 1 });
      await refused({ projectId: 11 }, 403, 'TASK_PROJECT_ACCESS_DENIED', 8);
    } finally {
      if (holderOpen) await holder.query('ROLLBACK'); holder.release();
      await pending?.catch(() => undefined); await revocation?.catch(() => undefined);
      if (revokerOpen) await revoker.query('ROLLBACK'); revoker.release();
    }
  });
});
