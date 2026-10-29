/**
 * AnA's task writers, the rules engine's create_task action and the blueprint
 * milestone seed never write a review route member (RR1a, B1 and M9;
 * docs/design/REVIEW_ROUTING_2026-10-23.md §2.3 and §6: "AnA has no path to
 * send, sign, withdraw, return, reassign or hand back").
 *
 *   - AnA update_task on a project task whose board mirror is a route member
 *     is refused before any write: neither project_tasks nor the board row
 *     moves, and no ledger row is written.
 *   - AnA create_task, a rule's create_task action and a blueprint milestone
 *     naming a route column create nothing.
 *
 * The CODE guard is what this file proves, so the migration's trigger is
 * dropped once the schema is built; tests/db/review-route-guard.dbtest.ts
 * proves the trigger.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from './governed-action-ledger.fixture';
import { TASK_GRAPH_PGLITE_DDL } from './pglite-pool.fixture';
import { extractTableDdl, REPO_ROOT } from '../../../../tests/golden-journeys/harness';

const holder = vi.hoisted(() => ({ pg: null as unknown as import('@electric-sql/pglite').PGlite }));

vi.mock('../../roleBasedAccess', () => ({
  default: { hasRole: async () => true, getUserRoles: async () => ['manager'] },
}));
vi.mock('../../../db', async () => {
  const { pglitePool } = await import('./pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  return { pool, getPool: () => pool, db: {} };
});

const BASELINE = 'migrations/0000_sweet_joseph.sql';
const ROUTE = '00000000-0000-4000-8000-0000000000aa';
const DDL = [
  `CREATE TABLE organizations (id serial PRIMARY KEY, name text, settings jsonb DEFAULT '{}'::jsonb);
   CREATE TABLE users (id serial PRIMARY KEY, email text, name text);
   CREATE TABLE organization_users (id serial PRIMARY KEY, organization_id integer, user_id integer, role text);
   CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);
   CREATE TABLE project_tasks (
     id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL,
     name text NOT NULL, description text, assignee_id integer, priority text, due_date date,
     module_type text, status text NOT NULL DEFAULT 'todo', risk_level text, created_by_id integer,
     created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
   );`,
  extractTableDdl(BASELINE, ['unified_tasks', 'cross_module_task_links']),
  TASK_GRAPH_PGLITE_DDL,
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_task_graph_org_columns.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
    'migrations/20261023_review_routes.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
  `DROP TRIGGER unified_tasks_route_rows_guard ON unified_tasks;`,
].join('\n');

const ORG = 7;
const PROJECT = 1;
const USER = 1;
const run = (sql: string, params: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, params);
const ledgerRows = async () => (await run('SELECT count(*)::int AS n FROM c2c_ana_actions')).rows[0].n as number;

async function command(name: string, params: Record<string, unknown>) {
  const { executeCommands } = await import('../command-executor');
  const res = await executeCommands([{ command: name, params }] as never, { organizationId: ORG, userId: USER, humanConfirmed: true } as never);
  return (res as Array<{ success: boolean; message?: string; error?: string }>)[0];
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  await holder.pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure')`);
  await holder.pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (${PROJECT}, ${ORG}, 'BX-204')`);
  await holder.pg.exec(`INSERT INTO review_routes (id, organization_id, subject_type, subject_id, round, sender_id, sender_name, review_order, approval_due_at, content_digest)
    VALUES ('${ROUTE}', ${ORG}, 'canonical_document', 'c-1', 1, 9, 'Sender', 'parallel', now() + interval '7 days', 'd')`);
  await import('../command-executor');
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec('DELETE FROM unified_tasks; DELETE FROM project_tasks; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;');
});

describe('AnA cannot move a review route member (B1)', () => {
  it('update_task on a project task mirrored by a route member: refused, nothing written', async () => {
    await run(`INSERT INTO project_tasks (id, project_id, organization_id, name, status) VALUES (31, $1, $2, 'Review v2', 'todo')`, [PROJECT, ORG]);
    await run(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, source_entity_type, source_entity_id, title, status, assignee_id, review_route_id, review_role, review_step)
       VALUES ($1, $2, 'Vault', 'project_task', '31', 'Review v2', 'pending', 6, $3, 'reviewer', 1)`,
      [`TASK-PT-${ORG}-31`, ORG, ROUTE],
    );
    const out = await command('update_task', { projectId: PROJECT, taskId: 31, updates: { status: 'done' } });
    expect(out.success).toBe(false);
    expect(out.error).toBe('ROUTE_TASK_OWNED_BY_ROUTE');
    expect((await run('SELECT status FROM unified_tasks WHERE task_id = $1', [`TASK-PT-${ORG}-31`])).rows[0].status).toBe('pending');
    expect((await run('SELECT status FROM project_tasks WHERE id = 31')).rows[0].status).toBe('todo');
    expect(await ledgerRows()).toBe(0);
  });
});

describe('the other create paths refuse route columns (M9)', () => {
  it('AnA create_task naming reviewRouteId: refused, no project task, no board row', async () => {
    const out = await command('create_task', { projectId: PROJECT, title: 'Smuggled review', reviewRouteId: ROUTE, reviewRole: 'reviewer' });
    expect(out.success).toBe(false);
    expect(out.error).toBe('ROUTE_COLUMNS_NOT_ADMITTED');
    expect((await run('SELECT count(*)::int AS n FROM project_tasks')).rows[0].n).toBe(0);
    expect((await run('SELECT count(*)::int AS n FROM unified_tasks')).rows[0].n).toBe(0);
  });

  it("a rule's create_task action naming review_route_id: the action fails, nothing inserted", async () => {
    const { CreateTaskHandler } = await import('../../rules-engine/actions/index');
    const { pglitePool } = await import('./pglite-pool.fixture');
    const handler = new CreateTaskHandler(pglitePool(() => holder.pg) as never);
    const result = await handler.execute(
      { type: 'create_task', params: { title: 'Rule task', review_route_id: ROUTE } } as never,
      { organizationId: ORG, projectId: PROJECT, userId: USER, event: 'artifact.approved', data: {} } as never,
      { ruleId: 'rule-1', name: 'Rule' } as never,
    );
    expect(result.success).toBe(false);
    expect((await run('SELECT count(*)::int AS n FROM unified_tasks')).rows[0].n).toBe(0);
  });

  it('a blueprint milestone naming reviewRouteId: nothing seeded', async () => {
    const { seedBlueprintMilestones } = await import('../../tasking/blueprint-milestones');
    await expect(
      seedBlueprintMilestones({
        organizationId: ORG,
        projectId: PROJECT,
        userId: USER,
        registryId: 'US_IND',
        milestones: [
          { id: 'pre-ind', title: 'Pre-IND meeting' },
          { id: 'review', title: 'Smuggled review', reviewRouteId: ROUTE } as never,
        ],
      }),
    ).rejects.toMatchObject({ code: 'ROUTE_COLUMNS_NOT_ADMITTED' });
    expect((await run('SELECT count(*)::int AS n FROM unified_tasks')).rows[0].n).toBe(0);
    expect(await ledgerRows()).toBe(0);
  });
});
