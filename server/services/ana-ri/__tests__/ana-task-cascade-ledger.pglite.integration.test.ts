/**
 * When AnA completes a task, the dependents it unblocks move on the completion's
 * own transaction, each with its `task.transition` ledger row. END-TO-END
 * against in-process PGlite.
 *
 * WHAT WENT WRONG (D5 evidence README, "Still open"; docs/work-orders/README.md)
 * `update_task` commits the board move and its own ledger row together
 * (boardWriteWithLineage, 2026-09-24). The completion cascade then ran after
 * that COMMIT, on the pool, through the no-transaction entry point: every
 * dependent it unblocked changed status and `blocked_by` with no §11.10(e) row,
 * and a cascade that failed half-way left the completion committed and its
 * dependents still blocked. The HTTP task routes already run the cascade on the
 * completion's transaction (cascadeUnblockOnCompletionInTx) and write its rows
 * after the completion's.
 *
 * `db` here is real Drizzle over the same PGlite, so the old path really does
 * unblock the dependent — what it cannot do is record it, or roll it back.
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
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const schema = await import('../../../../shared/schema');
  const { pglitePool } = await import('./pglite-pool.fixture');
  const pool = pglitePool(() => holder.pg);
  // `db` is real Drizzle over the same connection, so the old path really moved
  // the dependent: what it could not do is record the move, or roll it back.
  return { pool, getPool: () => pool, db: drizzle(pool.client as never, { schema }) };
});

const BASELINE = 'migrations/0000_sweet_joseph.sql';
const DDL = [
  `CREATE TABLE organizations (id serial PRIMARY KEY, name text, settings jsonb DEFAULT '{}'::jsonb);
   CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);
   CREATE TABLE project_tasks (
     id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL,
     name text NOT NULL, description text, assignee_id integer, priority text, due_date date,
     module_type text, status text NOT NULL DEFAULT 'todo', risk_level text, created_by_id integer,
     created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
   );`,
  // unified_tasks and task_dependencies exactly as the migration set builds them.
  extractTableDdl(BASELINE, ['unified_tasks', 'cross_module_task_links']),
  TASK_GRAPH_PGLITE_DDL,
  ...[
    'db/migrations/20260727_unified_tasks_mdx_metadata.sql',
    'db/migrations/20260807_task_graph_org_columns.sql',
    'db/migrations/20260807_unified_tasks_soft_delete.sql',
  ].map(f => fs.readFileSync(path.join(REPO_ROOT, f), 'utf8')),
].join('\n');

const ORG = 7;
const PROJECT = 1;
const USER = 1;
const run = (sql: string, params: unknown[] = []) => holder.pg.query<Record<string, any>>(sql, params);

async function command(name: string, params: Record<string, unknown>) {
  const { executeCommands } = await import('../command-executor');
  // A person confirmed the proposal (P0-12): the execution after it is what is pinned.
  const res = await executeCommands([{ command: name, params }] as never, { organizationId: ORG, userId: USER, humanConfirmed: true } as never);
  return (res as Array<{ success: boolean; message?: string; data?: Record<string, unknown> }>)[0];
}

/** Ledger rows for a task, oldest first, from both stores the governed writer fills. */
async function transitions(taskId: string) {
  const actions = await run(`SELECT seq, payload FROM c2c_ana_actions WHERE command = 'task.transition' AND target = $1 ORDER BY seq`, [`task:${taskId}`]);
  const audit = await run(`SELECT id FROM audit_logs WHERE action = 'c2c.work.task.transition' AND target = $1`, [`task:${taskId}`]);
  return { actions: actions.rows, audit: audit.rows };
}
const boardRow = async (taskId: string) =>
  (await run(`SELECT status, blocked_by FROM unified_tasks WHERE task_id = $1`, [taskId])).rows[0];

/** Project task `id`, mirrored on the board in progress, and a dependent blocked on it. */
async function seedCompletionWithDependent(id: number) {
  await run(`INSERT INTO project_tasks (id, project_id, organization_id, name, status) VALUES ($1, $2, $3, $4, 'in_progress')`, [id, PROJECT, ORG, `Task ${id}`]);
  const predecessor = `TASK-PT-${ORG}-${id}`;
  await run(
    `INSERT INTO unified_tasks (task_id, organization_id, module_type, source_entity_type, source_entity_id, title, status, priority)
     VALUES ($1, $2, 'IND', 'project_task', $3, $4, 'in-progress', 'medium')`,
    [predecessor, ORG, String(id), `Task ${id}`],
  );
  const dependent = `DEP-${id}`;
  await run(
    `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, priority, blocked_by)
     VALUES ($1, $2, 'IND', 'Dependent', 'blocked', 'medium', ARRAY[$3]::text[])`,
    [dependent, ORG, predecessor],
  );
  return { predecessor, dependent };
}

beforeAll(async () => {
  holder.pg = new PGlite();
  await holder.pg.exec(DDL);
  await holder.pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await holder.pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  // Write order, for "cause before effect" (the fixture's ids are text).
  await holder.pg.exec('ALTER TABLE c2c_ana_actions ADD COLUMN seq serial');
  await holder.pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure')`);
  await holder.pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (${PROJECT}, ${ORG}, 'BX-204')`);
  await import('../command-executor');
}, 60_000);
afterAll(async () => {
  await holder.pg?.close();
});
beforeEach(async () => {
  await holder.pg.exec('DELETE FROM task_dependencies; DELETE FROM unified_tasks; DELETE FROM project_tasks; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;');
});

describe('AnA completes a task: its dependents move with it, on the ledger', () => {
  it('unblocks the dependent and records its move, after the completion’s own row', async () => {
    const { predecessor, dependent } = await seedCompletionWithDependent(301);
    const out = await command('update_task', { projectId: PROJECT, taskId: 301, updates: { status: 'done' } });

    expect(out.success).toBe(true);
    expect((await boardRow(predecessor)).status).toBe('completed');
    expect(await boardRow(dependent)).toEqual({ status: 'in-progress', blocked_by: [] });

    const own = await transitions(predecessor);
    const dep = await transitions(dependent);
    expect(own.actions, 'the completion’s own task.transition row').toHaveLength(1);
    expect(dep.actions, 'the dependent moved with no task.transition row').toHaveLength(1);
    expect(dep.audit).toHaveLength(1);
    expect(dep.actions[0].payload).toEqual(
      expect.objectContaining({ from: 'blocked', to: 'in-progress', cause: 'predecessor-completed', predecessor }),
    );
    // Cause before effect: the completion's row is written first.
    expect(Number(dep.actions[0].seq)).toBeGreaterThan(Number(own.actions[0].seq));
  });

  it('a cascade that cannot finish takes the completion back with it, and says so', async () => {
    const { predecessor, dependent } = await seedCompletionWithDependent(302);
    await holder.pg.exec('ALTER TABLE task_dependencies RENAME TO task_dependencies_down');
    let out: Awaited<ReturnType<typeof command>>;
    try {
      out = await command('update_task', { projectId: PROJECT, taskId: 302, updates: { status: 'done' } });
    } finally {
      await holder.pg.exec('ALTER TABLE task_dependencies_down RENAME TO task_dependencies');
    }

    expect(
      (await boardRow(predecessor)).status,
      'the completion committed while its dependents could not be moved',
    ).toBe('in-progress');
    expect(await boardRow(dependent)).toEqual({ status: 'blocked', blocked_by: [predecessor] });
    expect((await transitions(predecessor)).actions).toHaveLength(0);
    expect(out.message).toMatch(/task board still shows the previous state/i);
  });
});
