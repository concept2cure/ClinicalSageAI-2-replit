/**
 * Regression test for the update_project command handler.
 *
 * Two defects, both proven here against a REAL Postgres (PGlite):
 *
 *  1. DISPATCH BUG. The dispatcher invokes every handler as
 *     `handler(ctx, cmd.params)` (command-executor.ts). updateProject was
 *     declared `(ctx, projectId, updates)`, which NO call site satisfied — so
 *     `projectId` received the whole params object and `updates` was undefined,
 *     making `Object.entries(updates)` throw on every invocation. update_project
 *     could never update a project; a cast in COMMAND_HANDLERS hid the mismatch
 *     from the compiler. Now (ctx, params), matching the sibling update_task.
 *
 *  2. FALSE SUCCESS. The UPDATE is tenant-scoped
 *     (WHERE id = $1 AND organization_id = $2), but the handler returned
 *     success:true regardless of how many rows it changed. Updating a
 *     non-existent project — or another tenant's project — reported "updated"
 *     while changing nothing. Now a zero-row UPDATE returns success:false.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ pool: null as unknown }));

// getPool() is what command-executor's lazy `pool` Proxy resolves to; point it
// at an in-process Postgres so the handler's real SQL executes.
vi.mock('../../../db', () => ({
  getPool: () => h.pool,
  pool: h.pool,
  db: {},
}));

import { updateProject } from '../command-executor';

let pglite: import('@electric-sql/pglite').PGlite;

const ctx = (organizationId: number) => ({ userId: 1, organizationId }) as never;

beforeEach(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE projects (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      name TEXT,
      description TEXT,
      status TEXT,
      submission_type TEXT,
      therapeutic_area TEXT,
      phase TEXT,
      priority TEXT,
      risk_level TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    INSERT INTO projects (id, organization_id, name, priority) VALUES
      (1, 1, 'Org1 IND', 'medium'),
      (2, 2, 'Org2 IND', 'medium');
  `);
  // node-postgres-compatible shim: rowCount must reflect affected rows for an
  // UPDATE (PGlite returns affectedRows; rows is empty without RETURNING).
  h.pool = {
    query: async (text: string, params?: unknown[]) => {
      const r = await pglite.query(text, params);
      const rows = r.rows as unknown[];
      const affected = (r as { affectedRows?: number }).affectedRows ?? 0;
      return { rows, rowCount: rows.length > 0 ? rows.length : affected };
    },
  };
});

afterEach(async () => {
  await pglite?.close();
});

async function priorityOf(id: number): Promise<string | undefined> {
  const r = await pglite.query<{ priority: string }>('SELECT priority FROM projects WHERE id = $1', [id]);
  return r.rows[0]?.priority;
}

describe('update_project — dispatch contract', () => {
  it('updates a project via the (ctx, params) dispatch contract', async () => {
    const res = await updateProject(ctx(1), { projectId: 1, updates: { priority: 'high' } });
    expect(res.success).toBe(true);
    expect(res.action).toBe('update_project');
    // The write actually landed.
    expect(await priorityOf(1)).toBe('high');
  });

  it('tolerates a flat { projectId, ...fields } params shape', async () => {
    const res = await updateProject(ctx(1), { projectId: 1, status: 'active' } as never);
    expect(res.success).toBe(true);
    const r = await pglite.query<{ status: string }>('SELECT status FROM projects WHERE id = 1');
    expect(r.rows[0].status).toBe('active');
  });

  it('returns a clean error (not a throw) when projectId is missing', async () => {
    const res = await updateProject(ctx(1), { updates: { priority: 'high' } } as never);
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/valid numeric projectId/i);
  });

  it('reports "no valid fields" rather than succeeding on an empty/garbage update', async () => {
    const res = await updateProject(ctx(1), { projectId: 1, updates: { not_a_column: 'x' } });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/no valid fields/i);
  });
});

describe('update_project — false-success guard', () => {
  it('does NOT report success when the project does not exist', async () => {
    const res = await updateProject(ctx(1), { projectId: 999, updates: { priority: 'high' } });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  it('is tenant-scoped: org 2 cannot update org 1s project, and reports failure', async () => {
    const before = await priorityOf(1);
    const res = await updateProject(ctx(2), { projectId: 1, updates: { priority: 'low' } });
    expect(res.success).toBe(false);
    // The victim row is untouched.
    expect(await priorityOf(1)).toBe(before);
  });
});
