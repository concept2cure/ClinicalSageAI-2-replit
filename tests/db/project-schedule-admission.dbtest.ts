/** W1/D2: actual current schedule admission on a restricted native runtime.
 * Uses the real actor/sharing readers, service transactions and FORCE RLS.
 * Identity/parent tables are deliberately narrow fixtures; only the schedule
 * creator is applied verbatim. This is not full deployment-schema proof.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseUrl } from '../setup.db';
import { setupSchedulerDb, waitFor, type SchedulerDb } from './scheduler-harness';
import type { RequestSqlClient } from '../../server/db/requestDb';
import type { ScheduleExecutionContext } from '../../server/services/projects/schedule-of-events/service';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
// Notifications remain an explicit external boundary; admission is never mocked.
vi.mock('../../server/services/notifications/notification-service', () => ({ createNotification: notify }));

const ORG = 81, PROJECT = 810, OWNER = 81001, MEMBER = 81002;
const TABLES = ['project_schedule_of_events', 'project_workflow_stages', 'project_schedule_goals', 'project_schedule_revisions', 'project_tasks'];
const ADMISSION_TABLES = ['projects', 'organization_users', 'project_visibility_settings', 'project_members', 'concept2cure_artifacts', 'concept2cure_review_assignments'];
const creator = readFileSync(new URL('../../db/migrations/20260617_project_schedule_of_events.sql', import.meta.url), 'utf8');
const DDL = `
CREATE TABLE organizations (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
CREATE TABLE users (id integer PRIMARY KEY, status text NOT NULL DEFAULT 'active');
CREATE TABLE organization_users (organization_id integer NOT NULL, user_id integer NOT NULL, role text NOT NULL, UNIQUE(organization_id,user_id));
CREATE TABLE projects (id integer PRIMARY KEY, organization_id integer NOT NULL REFERENCES organizations(id),
  status text NOT NULL DEFAULT 'active', owner_id integer, created_by_id integer, settings jsonb NOT NULL DEFAULT '{}', UNIQUE(id,organization_id));
CREATE TABLE project_visibility_settings (organization_id integer NOT NULL, project_id integer NOT NULL, visibility text NOT NULL);
CREATE TABLE project_members (organization_id integer NOT NULL, project_id integer NOT NULL, user_id integer NOT NULL, role text NOT NULL, status text NOT NULL);
CREATE TABLE concept2cure_artifacts (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL);
CREATE TABLE concept2cure_review_assignments (id serial PRIMARY KEY, organization_id integer NOT NULL, artifact_id integer NOT NULL, reviewer_id integer NOT NULL, status text NOT NULL);
CREATE TABLE project_workflow_stages (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL,
  name text NOT NULL, description text, "order" integer, status text, start_date timestamp, end_date timestamp, due_date timestamp,
  auto_advance boolean, critical_to_quality_factors json, completion_criteria json, assignees text[], reviewers text[],
  approval_status text DEFAULT 'not-started', settings json, metadata json, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
CREATE TABLE project_tasks (id serial PRIMARY KEY, organization_id integer NOT NULL, project_id integer NOT NULL,
  workflow_stage_id integer REFERENCES project_workflow_stages(id), name text NOT NULL);
${creator}
-- Match the live tenant-aware arbiter without claiming the public-qualified
-- uniqueness migration is replayed into this disposable schema.
DROP INDEX unique_project_schedule;
CREATE UNIQUE INDEX unique_project_schedule_org ON project_schedule_of_events(organization_id,project_id);
ALTER TABLE project_schedule_of_events ADD FOREIGN KEY(project_id,organization_id) REFERENCES projects(id,organization_id);
`;

let env: SchedulerDb;
let runtime: typeof import('../../server/db/runtime');
let connections: typeof import('../../server/db/withTenantConnection');
let store: typeof import('../../server/db/tenantStore');
let service: typeof import('../../server/services/projects/schedule-of-events/service');
const generation = { orgId: ORG, projectId: PROJECT, projectType: 'IND', baselineDate: new Date('2031-01-01Z'), goals: [{ title: 'Private native goal' }] };
const runAs = <T>(actorUserId: number, fn: (context: ScheduleExecutionContext) => Promise<T>) =>
  connections.withTenantConnection({ tenantId: ORG, role: null, source: 'test', caller: 'schedule-admission-native' },
    executor => fn({ actorUserId, executor }));
const operations = () => [
  (context: ScheduleExecutionContext) => service.generateProjectSchedule(generation, context),
  (context: ScheduleExecutionContext) => service.amendMilestone({ orgId: ORG, projectId: PROJECT, milestoneKey: 'kickoff', note: 'Private amendment' }, context),
  (context: ScheduleExecutionContext) => service.resetProjectGoals({ orgId: ORG, projectId: PROJECT, goals: [{ title: 'Private replacement' }], rationale: 'Private reset' }, context),
  (context: ScheduleExecutionContext) => service.reviewScheduleHealth({ orgId: ORG, projectId: PROJECT, apply: true, triggeredBy: 'scheduler' }, context),
];
const protectedStatement = (sql: string) => TABLES.some(table => sql.includes(table));
function tracedContext(context: ScheduleExecutionContext, statements: string[]): ScheduleExecutionContext {
  return { ...context, executor: { query: async (sql, params) => {
    statements.push(sql);
    return context.executor.query(sql, params);
  } } };
}
async function snapshot() {
  const values = await Promise.all(TABLES.map(async table => [table,
    (await env.owner.query(`SELECT to_jsonb(t) AS row FROM ${env.t(table)} t ORDER BY id`)).rows.map(row => row.row),
  ]));
  return Object.fromEntries(values);
}
async function configure(sql: string) {
  const client = await env.owner.connect();
  try { await client.query(`SET search_path TO ${env.schema}`); await client.query(sql); }
  finally { await client.query('RESET search_path'); client.release(); }
}

beforeAll(async () => {
  env = await setupSchedulerDb(databaseUrl, 'dbschedule_admit', DDL, [...TABLES, ...ADMISSION_TABLES]);
  await env.owner.query(`INSERT INTO ${env.t('organizations')}(id) VALUES (81),(82)`);
  await env.owner.query(`INSERT INTO ${env.t('users')}(id) VALUES ($1),($2)`, [OWNER, MEMBER]);
  await env.owner.query(`INSERT INTO ${env.t('projects')}(id,organization_id,owner_id,created_by_id,settings)
    VALUES ($1,$2,$3,$3,'{"projectSharing":{"visibility":"private","members":[]}}')`, [PROJECT, ORG, OWNER]);
  runtime = await import('../../server/db/runtime');
  connections = await import('../../server/db/withTenantConnection');
  store = await import('../../server/db/tenantStore');
  service = await import('../../server/services/projects/schedule-of-events/service');
  await runAs(OWNER, async ({ executor }) => {
    const { rows } = await executor.query("SELECT current_user AS role, rolsuper, rolbypassrls, current_setting('app.rls_enforce') AS rls FROM pg_roles WHERE rolname=current_user");
    expect(rows[0]).toEqual({ role: env.runtimeRole, rolsuper: false, rolbypassrls: false, rls: 'on' });
  });
}, 120_000);
beforeEach(async () => {
  await env.owner.query(`TRUNCATE ${[...TABLES, 'project_members', 'project_visibility_settings', 'concept2cure_review_assignments', 'concept2cure_artifacts', 'organization_users'].map(table => env.t(table)).join(',')} RESTART IDENTITY`);
  await configure(`UPDATE organizations SET status='active'; UPDATE users SET status='active';
    UPDATE projects SET status='active',owner_id=${OWNER},created_by_id=${OWNER};
    INSERT INTO organization_users VALUES (${ORG},${OWNER},'member'),(${ORG},${MEMBER},'member');`);
  await runAs(OWNER, context => service.generateProjectSchedule(generation, context));
  notify.mockClear();
});
afterAll(async () => {
  if (runtime) await runtime.getPool().end();
  if (env) await env.destroy();
});

describe('native current actor and project policy', () => {
  it.each([
    ['private nonowner', '', false, 403],
    ['use-only share', `INSERT INTO project_members VALUES (${ORG},${PROJECT},${MEMBER},'use','active')`, true, 403],
    ['viewer owner', `UPDATE organization_users SET role='viewer' WHERE user_id=${MEMBER}; UPDATE projects SET owner_id=${MEMBER}`, true, 403],
    ['revoked share', `INSERT INTO project_members VALUES (${ORG},${PROJECT},${MEMBER},'edit','revoked')`, false, 403],
    ['nonmember', `DELETE FROM organization_users WHERE user_id=${MEMBER}`, false, 403],
    ['inactive user', `UPDATE users SET status='disabled' WHERE id=${MEMBER}`, false, 403],
    ['inactive organization', "UPDATE organizations SET status='suspended'", false, 403],
    ['archived project', `INSERT INTO project_members VALUES (${ORG},${PROJECT},${MEMBER},'edit','active'); UPDATE projects SET status='archived'`, true, 409],
  ] as const)('%s cannot mutate through any human entry point', async (_label, sql, canRead, status) => {
    if (sql) await configure(sql);
    const before = await snapshot();
    await runAs(MEMBER, async context => {
      const statements: string[] = [], traced = tracedContext(context, statements);
      const read = () => service.getScheduleOfEvents(ORG, PROJECT, traced);
      const inspect = () => service.reviewScheduleHealth({ orgId: ORG, projectId: PROJECT, apply: false, triggeredBy: 'scheduler' }, traced);
      if (canRead) {
        expect((await read()).plan?.version).toBe(1);
        expect((await inspect()).ok).toBe(true);
      } else {
        await expect(read()).rejects.toMatchObject({ status: 403 });
        await expect(inspect()).rejects.toMatchObject({ status: 403 });
        expect(statements.filter(protectedStatement)).toEqual([]);
      }
      for (const operation of operations()) {
        statements.length = 0;
        await expect(operation(traced)).rejects.toMatchObject({ status });
        expect(statements.filter(protectedStatement)).toEqual([]);
      }
    });
    expect(await snapshot()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['edit', 'manager', 'public read', 'pending review'] as const)('preserves %s access without granting review-only edits', async mode => {
    if (mode === 'edit') await configure(`INSERT INTO project_members VALUES (${ORG},${PROJECT},${MEMBER},'edit','active')`);
    if (mode === 'manager') await configure(`UPDATE organization_users SET role='manager' WHERE user_id=${MEMBER}`);
    if (mode === 'public read') await configure(`INSERT INTO project_visibility_settings VALUES (${ORG},${PROJECT},'org_public')`);
    if (mode === 'pending review') await configure(`INSERT INTO concept2cure_artifacts(id,organization_id,project_id) VALUES (1,${ORG},${PROJECT}); INSERT INTO concept2cure_review_assignments(organization_id,artifact_id,reviewer_id,status) VALUES (${ORG},1,${MEMBER},'pending')`);
    await runAs(MEMBER, async context => {
      expect((await service.getScheduleOfEvents(ORG, PROJECT, context)).plan?.version).toBe(1);
      if (mode === 'edit' || mode === 'manager') expect((await service.generateProjectSchedule(generation, context)).plan?.version).toBe(2);
      else await expect(service.generateProjectSchedule(generation, context)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('rechecks a revoked share on the same supplied connection', async () => {
    await configure(`INSERT INTO project_members VALUES (${ORG},${PROJECT},${MEMBER},'edit','active')`);
    await runAs(MEMBER, async context => {
      expect((await service.getScheduleOfEvents(ORG, PROJECT, context)).plan?.version).toBe(1);
      await configure(`UPDATE project_members SET status='revoked' WHERE user_id=${MEMBER}`);
      await expect(service.generateProjectSchedule(generation, context)).rejects.toMatchObject({ status: 403 });
      await expect(service.getScheduleOfEvents(ORG, PROJECT, context)).rejects.toMatchObject({ status: 403 });
    });
  });

  it('refuses a missing executor without falling back to the shared pool', async () => {
    const context = { actorUserId: OWNER, executor: undefined } as unknown as ScheduleExecutionContext;
    await expect(service.getScheduleOfEvents(ORG, PROJECT, context)).rejects.toMatchObject({ status: 503, code: 'REQUEST_DB_CONTEXT_REQUIRED' });
    for (const operation of operations()) await expect(operation(context)).rejects.toMatchObject({ status: 503, code: 'REQUEST_DB_CONTEXT_REQUIRED' });
  });

  it('refuses an invalid actor and a foreign organization before protected data', async () => {
    await runAs(OWNER, async context => {
      const statements: string[] = [];
      const invalid = { ...tracedContext(context, statements), actorUserId: 0 };
      await expect(service.getScheduleOfEvents(ORG, PROJECT, invalid)).rejects.toMatchObject({ status: 403, code: 'PROJECT_ACTOR_REQUIRED' });
      for (const operation of operations()) await expect(operation(invalid)).rejects.toMatchObject({ status: 403, code: 'PROJECT_ACTOR_REQUIRED' });
      expect(statements).toEqual([]);
      const actual = tracedContext(context, statements);
      await expect(service.getScheduleOfEvents(82, PROJECT, actual)).rejects.toMatchObject({ status: 403 });
      await expect(service.generateProjectSchedule({ ...generation, orgId: 82 }, actual)).rejects.toMatchObject({ status: 403 });
      expect(statements.filter(protectedStatement)).toEqual([]);
    });
  });
});

describe('native job authority and uncertain commit', () => {
  it.each([
    { tenantId: ORG, source: 'request' as const, role: null },
    { tenantId: 82, source: 'job' as const, role: null },
    { tenantId: 0, source: 'job' as const, role: 'app_super_admin' },
  ])('refuses scheduler payloads in the wrong actual scope: $source/$tenantId', async scope => {
    const before = await snapshot();
    await expect(connections.withTenantConnection({ ...scope, caller: 'schedule-admission-native' }, executor =>
      service.reviewScheduleHealthForSweep({ orgId: ORG, projectId: PROJECT, apply: true, triggeredBy: 'scheduler' }, executor)))
      .rejects.toMatchObject({ status: 403, code: 'SCHEDULE_JOB_SCOPE_REQUIRED' });
    expect(await snapshot()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it('admits only the actual system listing and organization-scoped review', async () => {
    await runAs(OWNER, async () => { await expect(service.listActiveSchedulePlans()).rejects.toMatchObject({ status: 403 }); });
    const plans = await store.runWithSystemTenantScope('schedule-admission-native:listing', () => service.listActiveSchedulePlans());
    expect(plans).toEqual([{ scheduleId: expect.any(Number), orgId: ORG, projectId: PROJECT }]);
    const result = await connections.withTenantConnection({ tenantId: ORG, role: null, source: 'job', caller: 'schedule-of-events-sweep:review' },
      executor => service.reviewScheduleHealthForSweep({ orgId: ORG, projectId: PROJECT, apply: true }, executor));
    expect(result.ok).toBe(true);
  });

  it.each(["UPDATE projects SET status='archived'", "UPDATE organizations SET status='suspended'"])('refuses inactive job targets before schedule access: %s', async sql => {
    await configure(sql);
    const before = await snapshot();
    await expect(connections.withTenantConnection({ tenantId: ORG, role: null, source: 'job', caller: 'schedule-of-events-sweep:review' }, executor =>
      service.reviewScheduleHealthForSweep({ orgId: ORG, projectId: PROJECT, apply: true }, executor)))
      .rejects.toMatchObject({ status: 409, code: 'PROJECT_NOT_ACTIVE' });
    expect(await snapshot()).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a lost COMMIT acknowledgment and physically evicts that backend without retrying', async () => {
    let backend = 0, commits = 0;
    await expect(runAs(OWNER, async context => {
      backend = Number((await context.executor.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
      const executor: RequestSqlClient = { query: async (sql, values) => {
        const result = await context.executor.query(sql, values);
        if (sql === 'COMMIT') { commits += 1; throw new Error('native synthetic COMMIT acknowledgment lost'); }
        return result;
      } };
      return service.generateProjectSchedule(generation, { actorUserId: OWNER, executor });
    })).rejects.toThrow('native synthetic COMMIT acknowledgment lost');
    expect(commits).toBe(1);
    expect(await waitFor(async () => (await env.owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1', [backend])).rows.length === 0, 3_000)).toBe(true);
    expect((await runAs(OWNER, context => service.getScheduleOfEvents(ORG, PROJECT, context))).plan?.version).toBe(2);
  });
});
