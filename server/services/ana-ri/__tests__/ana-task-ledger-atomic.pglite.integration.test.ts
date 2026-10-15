/**
 * AnA's task writes land on the canonical board WITH their ledger row, or not
 * at all. END-TO-END against in-process PGlite.
 *
 * WHAT WENT WRONG (WO-16C hand-on, docs/work-orders/README.md)
 * `create_task` and `update_task` mirror a project_tasks change onto the
 * canonical regulated table `unified_tasks`, then record the `task.create` /
 * `task.transition` lineage row. The mirror was written on the pool and the
 * lineage row in a separate, best-effort transaction afterwards. When the
 * lineage write failed, the board row had already committed: a governed change
 * to the regulated task table with no §11.10(e) record of it. Every HTTP task
 * route commits its row on the write's own transaction (`auditTaskActionInTx`)
 * and rolls the write back when the row cannot be recorded.
 *
 * Why a real engine: the property is atomicity. A mocked pool cannot roll
 * anything back, so it would pass whether or not the two writes share a
 * transaction.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { AUDIT_LOGS_PGLITE_DDL } from '../../../db/pglite-harness';
import { GOVERNED_ACTION_LEDGER_PGLITE_DDL } from './governed-action-ledger.fixture';
import { pglitePool, TASK_GRAPH_PGLITE_DDL } from './pglite-pool.fixture';

let pg: PGlite;

// create_task / update_task are role-gated through the canonical RBAC service;
// grant it so the test reaches the writes (the gate has its own tests).
vi.mock('../../roleBasedAccess', () => ({
  default: { hasRole: async () => true, getUserRoles: async () => ['manager'] },
}));

type Row = Record<string, unknown>;
const run = async (sql: string, params?: unknown[]) => {
  const r = await pg.query(sql, params as unknown[]);
  return {
    rows: r.rows as Row[],
    rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
  };
};
// PGlite is one connection, so a "client" is that connection: BEGIN, the
// writes and COMMIT/ROLLBACK issued through it form one real transaction. The
// pool answers pg's and Drizzle's call shapes (a completion's cascade runs
// Drizzle over the same client).
const pool = pglitePool(() => pg);
vi.mock('../../../db', () => ({
  pool: { query: (...a: Parameters<typeof pool.query>) => pool.query(...a), connect: () => pool.connect() },
  getPool: () => ({ query: (...a: Parameters<typeof pool.query>) => pool.query(...a), connect: () => pool.connect() }),
  db: {},
}));

const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text, settings jsonb DEFAULT '{}'::jsonb);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);
CREATE TABLE project_tasks (
  id serial PRIMARY KEY, project_id integer NOT NULL, organization_id integer NOT NULL,
  name text NOT NULL, description text, assignee_id integer, priority text, due_date date,
  module_type text, status text NOT NULL DEFAULT 'todo', risk_level text, created_by_id integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE unified_tasks (
  id serial PRIMARY KEY, task_id text NOT NULL UNIQUE, organization_id integer NOT NULL,
  project_id integer, module_type text, title text NOT NULL, description text,
  assignee_id integer, priority text NOT NULL DEFAULT 'medium', due_date date,
  status text NOT NULL DEFAULT 'pending', source_entity_type text, source_entity_id text,
  created_by_id integer, progress integer DEFAULT 0, completion_percentage integer DEFAULT 0,
  completed_at timestamptz, approval_required boolean DEFAULT false, approval_status text,
  approvers json, blocked_by text[], deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const ORG = 7;
const PROJECT = 1;
const USER = 1;

async function command(name: string, params: Record<string, unknown>, ctx: Record<string, unknown> = {}) {
  const { executeCommands } = await import('../command-executor');
  // A person confirmed the proposal: since 2026-09-26 (audit DP-08, P0-12)
  // every write is a proposal, and the ledger atomicity these cases pin is
  // the execution after that confirmation.
  const res = await executeCommands([{ command: name, params }] as never, { organizationId: ORG, userId: USER, humanConfirmed: true, ...ctx } as never);
  return (res as Array<{ success: boolean; message?: string; data?: Row }>)[0];
}

async function ledger(commandName: string, taskId: string) {
  const actions = await run(`SELECT id FROM c2c_ana_actions WHERE command = $1 AND target = $2`, [
    commandName,
    `task:${taskId}`,
  ]);
  const audit = await run(`SELECT id FROM audit_logs WHERE action = $1 AND target = $2`, [
    `c2c.work.${commandName}`,
    `task:${taskId}`,
  ]);
  return { actions: actions.rows.length, audit: audit.rows.length };
}

/** The ledger store refuses writes: the c2c_ana_actions INSERT fails. */
async function withLedgerDown<T>(fn: () => Promise<T>): Promise<T> {
  await pg.exec('ALTER TABLE c2c_ana_actions RENAME TO c2c_ana_actions_down');
  try {
    return await fn();
  } finally {
    await pg.exec('ALTER TABLE c2c_ana_actions_down RENAME TO c2c_ana_actions');
  }
}

async function seedMirroredTask(id: number, status = 'in_progress', mirrorStatus = 'in-progress') {
  await run(`INSERT INTO project_tasks (id, project_id, organization_id, name, status) VALUES ($1, $2, $3, $4, $5)`, [
    id,
    PROJECT,
    ORG,
    `Task ${id}`,
    status,
  ]);
  await run(
    `INSERT INTO unified_tasks (task_id, organization_id, source_entity_type, source_entity_id, title, status)
     VALUES ($1, $2, 'project_task', $3, $4, $5)`,
    [`TASK-PT-${ORG}-${id}`, ORG, String(id), `Task ${id}`, mirrorStatus],
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  await pg.exec(AUDIT_LOGS_PGLITE_DDL);
  await pg.exec(GOVERNED_ACTION_LEDGER_PGLITE_DDL);
  await pg.exec(TASK_GRAPH_PGLITE_DDL);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG}, 'Concept2Cure')`);
  await pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (${PROJECT}, ${ORG}, 'BX-204')`);
  await import('../command-executor');
}, 60_000);
afterAll(async () => {
  await pg?.close();
});
beforeEach(async () => {
  await pg.exec('DELETE FROM unified_tasks; DELETE FROM project_tasks; DELETE FROM c2c_ana_actions; DELETE FROM audit_logs;');
});

describe('AnA create_task', () => {
  it('puts the task on the board with its task.create ledger row', async () => {
    const out = await command('create_task', { projectId: PROJECT, title: 'Draft Module 2.7.4' });
    expect(out.success).toBe(true);
    const taskId = `TASK-PT-${ORG}-${out.data?.taskId}`;
    expect((await run('SELECT 1 FROM unified_tasks WHERE task_id = $1', [taskId])).rows).toHaveLength(1);
    expect(await ledger('task.create', taskId)).toEqual({ actions: 1, audit: 1 });
  });

  it('puts nothing on the board when its ledger row cannot be written, and says so', async () => {
    const out = await withLedgerDown(() => command('create_task', { projectId: PROJECT, title: 'Draft Module 2.7.3' }));
    const taskId = `TASK-PT-${ORG}-${out.data?.taskId}`;
    expect(
      (await run('SELECT 1 FROM unified_tasks WHERE task_id = $1', [taskId])).rows,
      'a board row committed without its task.create ledger row',
    ).toHaveLength(0);
    expect(await ledger('task.create', taskId)).toEqual({ actions: 0, audit: 0 });
    expect(out.message).toMatch(/not on the task board/i);
  });
});

describe('AnA update_task', () => {
  it('moves the board row with its task.transition ledger row', async () => {
    await seedMirroredTask(201);
    const out = await command('update_task', { projectId: PROJECT, taskId: 201, updates: { status: 'review' } });
    expect(out.success).toBe(true);
    expect((await run('SELECT status FROM unified_tasks WHERE source_entity_id = $1', ['201'])).rows[0].status).toBe('review');
    expect(await ledger('task.transition', `TASK-PT-${ORG}-201`)).toEqual({ actions: 1, audit: 1 });
  });

  it('leaves the board row where it was when its ledger row cannot be written, and says so', async () => {
    await seedMirroredTask(202);
    const out = await withLedgerDown(() =>
      command('update_task', { projectId: PROJECT, taskId: 202, updates: { status: 'review' } }),
    );
    expect(
      (await run('SELECT status FROM unified_tasks WHERE source_entity_id = $1', ['202'])).rows[0].status,
      'the board status changed without its task.transition ledger row',
    ).toBe('in-progress');
    expect(await ledger('task.transition', `TASK-PT-${ORG}-202`)).toEqual({ actions: 0, audit: 0 });
    expect(out.message).toMatch(/task board/i);
  });
});

/**
 * D5 (2026-10-01): the reason on these rows is the person's, or null. Both
 * commands are the confirm tier (part11-governance.ts governedTierOf): a person
 * says yes and is asked for no reason, so none exists to record. They used to
 * record "Task created by AnA and mirrored to the canonical task board" and
 * "Task status changed by AnA" as the reason for change. A `reason` the model
 * wrote into params is not the person's either. A reason reaches the row only
 * from a verified sign-off (ctx.signoff, stamped by POST /governed-action).
 */
describe('AnA task events record the person’s reason, or none', () => {
  const reasons = async (commandName: string, taskId: string) => {
    const target = `task:${taskId}`;
    const action = await run(`SELECT decision_reason, payload FROM c2c_ana_actions WHERE command = $1 AND target = $2`, [commandName, target]);
    const audit = await run(`SELECT reason FROM audit_logs WHERE action = $1 AND target = $2`, [`c2c.work.${commandName}`, target]);
    return { decision: action.rows[0]?.decision_reason, audit: audit.rows[0]?.reason, payload: action.rows[0]?.payload as Row };
  };

  it('create_task with no stated reason records null — not a sentence, not the model’s params.reason', async () => {
    const out = await command('create_task', { projectId: PROJECT, title: 'Draft Module 2.5', reason: 'Because the model said so' });
    const got = await reasons('task.create', `TASK-PT-${ORG}-${out.data?.taskId}`);
    expect(got.audit).toBeNull();
    expect(got.decision).toBeNull();
    expect(got.payload.summary).toBe('Task created by AnA and mirrored to the canonical task board');
  });

  it('update_task with no stated reason records null; what happened is the payload summary', async () => {
    await seedMirroredTask(203);
    await command('update_task', { projectId: PROJECT, taskId: 203, updates: { status: 'review' }, reason: 'Model-written' });
    const got = await reasons('task.transition', `TASK-PT-${ORG}-203`);
    expect(got.audit).toBeNull();
    expect(got.decision).toBeNull();
    expect(got.payload).toMatchObject({ from: 'in-progress', to: 'review', summary: 'Task status changed by AnA' });
  });

  it('a reason the person stated through a verified sign-off is recorded verbatim, trimmed', async () => {
    const signoff = { reasonForChange: '  Sponsor asked for the 2.7.4 gap to be tracked  ', signatureVerified: false };
    const out = await command('create_task', { projectId: PROJECT, title: 'Close the 2.7.4 gap' }, { signoff });
    const created = await reasons('task.create', `TASK-PT-${ORG}-${out.data?.taskId}`);
    await seedMirroredTask(204);
    await command('update_task', { projectId: PROJECT, taskId: 204, updates: { status: 'review' } }, { signoff });
    const moved = await reasons('task.transition', `TASK-PT-${ORG}-204`);
    for (const got of [created, moved]) {
      expect(got.audit).toBe('Sponsor asked for the 2.7.4 gap to be tracked');
      expect(got.decision).toBe('Sponsor asked for the 2.7.4 gap to be tracked');
    }
  });
});
