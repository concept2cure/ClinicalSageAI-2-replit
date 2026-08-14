/**
 * AnA cannot clear an approval gate — END-TO-END against in-process PGlite.
 *
 * WHAT WENT WRONG
 * `update_task` mirrors a project_tasks change onto the canonical
 * `unified_tasks` row, stamping completed_at / progress=100 and firing the
 * unblock cascade. It never consulted `approval_required` / `approval_status`.
 * The HTTP route that does the same transition answers 428 ESIGN_REQUIRED
 * without a PIN-verified §11.50 signature (taskManagement.routes.ts), so asking
 * AnA to "mark it done" cleared a gate that the button in front of the user
 * could not clear.
 *
 * The signature is precisely the thing that cannot be delegated: §11.200
 * requires it to attest that a PERSON decided. An agent has no PIN to offer, so
 * there is no version of this where AnA signs — the only correct behaviour is to
 * refuse and hand the user back to the surface that can run the ceremony.
 *
 * Why a real engine: the bug is in what the SQL selects and what the row
 * actually holds. A mocked pool returns whatever the test hands it, so it would
 * happily "prove" a gate that reads a column the query never asked for.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

let pg: PGlite;

/* update_task is manager-tier, and the RBAC check reads the canonical
   roleBasedAccess service rather than ctx.userRole (deliberately — a
   self-asserted role on the context would be the model's word for it). Grant
   manager here so the test exercises the APPROVAL gate rather than stopping at
   the permission gate; the permission gate has its own tests in
   command-rbac.test.ts. */
const rbac = vi.hoisted(() => ({
  hasRole: vi.fn(async () => true),
  getUserRoles: vi.fn(async () => ['manager'] as string[]),
}));
vi.mock('../../roleBasedAccess', () => ({
  default: {
    hasRole: (...args: unknown[]) => (rbac.hasRole as any)(...args),
    getUserRoles: (...args: unknown[]) => (rbac.getUserRoles as any)(...args),
  },
}));

const pool = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as Array<Record<string, unknown>>,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};
vi.mock('../../../db', () => ({
  pool: { query: (sql: string, p?: unknown[]) => pool.query(sql, p) },
  getPool: () => ({ query: (sql: string, p?: unknown[]) => pool.query(sql, p) }),
  db: {},
}));

const DDL = `
-- The governance gate reads organizations.settings and FAILS CLOSED when it
-- cannot (command-rbac.ts GOVERNANCE_UNAVAILABLE). Without this table every
-- mutation is refused for the right reason but the wrong one, and the approval
-- gate below would never be reached — the test would pass while proving
-- nothing about it.
CREATE TABLE organizations (id serial PRIMARY KEY, name text, settings jsonb DEFAULT '{}'::jsonb);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);
CREATE TABLE project_tasks (
  id serial PRIMARY KEY,
  project_id integer NOT NULL,
  organization_id integer NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'todo',
  priority text,
  risk_level text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE unified_tasks (
  id serial PRIMARY KEY,
  task_id text NOT NULL UNIQUE,
  organization_id integer NOT NULL,
  source_entity_type text,
  source_entity_id text,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  progress integer DEFAULT 0,
  completion_percentage integer DEFAULT 0,
  completed_at timestamptz,
  approval_required boolean DEFAULT false,
  approval_status text,
  approvers json,
  blocked_by text[],
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

const ORG = 7;
const PROJECT = 1;

/** A project_tasks row plus its unified_tasks mirror, as createTask writes them. */
async function seedTask(id: number, opts: { approvalRequired: boolean; approvalStatus?: string | null }) {
  await pg.query(
    `INSERT INTO project_tasks (id, project_id, organization_id, name, status)
     VALUES ($1, ${PROJECT}, ${ORG}, $2, 'in_progress')`,
    [id, `Task ${id}`]
  );
  await pg.query(
    `INSERT INTO unified_tasks
       (task_id, organization_id, source_entity_type, source_entity_id, title,
        status, approval_required, approval_status)
     VALUES ($1, ${ORG}, 'project_task', $2, $3, 'in-progress', $4, $5)`,
    [`TASK-PT-${ORG}-${id}`, String(id), `Task ${id}`, opts.approvalRequired, opts.approvalStatus ?? null]
  );
}

async function mirrorRow(id: number) {
  const r = await pg.query<Record<string, unknown>>(
    `SELECT status, completed_at, progress FROM unified_tasks WHERE source_entity_id = $1`,
    [String(id)]
  );
  return r.rows[0];
}

async function projectTaskStatus(id: number) {
  const r = await pg.query<{ status: string }>('SELECT status FROM project_tasks WHERE id = $1', [id]);
  return r.rows[0]?.status;
}

async function updateTask(taskId: number, status: string) {
  const { executeCommands } = await import('../command-executor');
  const res = await executeCommands(
    [{ command: 'update_task', params: { projectId: PROJECT, taskId, updates: { status } } }] as never,
    { organizationId: ORG, userId: 1 } as never
  );
  return (res as Array<{ success: boolean; message?: string }>)[0];
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
  await pg.exec(`INSERT INTO organizations (id, name, settings) VALUES (${ORG}, 'Concept2Cure', '{}'::jsonb)`);
  await pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (${PROJECT}, ${ORG}, 'BX-099')`);
});
afterAll(async () => { await pg?.close(); });

beforeEach(async () => {
  await pg.exec('DELETE FROM unified_tasks; DELETE FROM project_tasks;');
});

describe('AnA update_task and the §11.50 approval gate', () => {
  it('REFUSES to complete an approval-gated task', async () => {
    await seedTask(101, { approvalRequired: true, approvalStatus: null });

    const out = await updateTask(101, 'completed');

    expect(out.success).toBe(false);
    expect(out.message).toMatch(/electronic signature/i);
    // It must say whose signature it has to be, not merely that one is needed.
    expect(out.message).toMatch(/can't sign on your behalf|has to be yours/i);
  });

  it('leaves BOTH tables untouched when it refuses', async () => {
    await seedTask(102, { approvalRequired: true, approvalStatus: null });

    await updateTask(102, 'completed');

    // The refusal is checked before any write. An earlier version of this path
    // validated after mutating project_tasks, which left the two tables
    // disagreeing and reported failure having already changed the record.
    expect(await projectTaskStatus(102)).toBe('in_progress');
    const m = await mirrorRow(102);
    expect(m.status).toBe('in-progress');
    expect(m.completed_at).toBeNull();
  });

  it('allows completion once the signature has already been recorded', async () => {
    // approval_status 'approved' means the ceremony ran on a surface that could
    // collect a PIN. AnA is not re-litigating a signature that exists.
    await seedTask(103, { approvalRequired: true, approvalStatus: 'approved' });

    const out = await updateTask(103, 'completed');

    expect(out.success).toBe(true);
    const m = await mirrorRow(103);
    expect(m.status).toBe('completed');
    expect(m.completed_at).not.toBeNull();
  });

  it('does not gate a task that was never approval-gated', async () => {
    await seedTask(104, { approvalRequired: false });

    const out = await updateTask(104, 'completed');

    expect(out.success).toBe(true);
    expect((await mirrorRow(104)).status).toBe('completed');
  });

  it('does not gate a non-completing transition on a gated task', async () => {
    // The gate is on COMPLETION. Moving an approval-gated task to review is
    // ordinary work and must not be blocked, or AnA becomes useless on exactly
    // the tasks that matter most.
    await seedTask(105, { approvalRequired: true, approvalStatus: null });

    const out = await updateTask(105, 'review');

    expect(out.success).toBe(true);
    expect((await mirrorRow(105)).status).toBe('review');
  });
});
