/**
 * concept2cure_review_tasks.task_type domain repair — END-TO-END against
 * in-process PGlite (real Postgres, WASM), running the ACTUAL migration files.
 *
 * WHY THIS EXISTS
 * `0001_phase13_full.sql` set out to widen the task_type domain to include
 * 'approval_task', but it ADDED a named CHECK rather than replacing the inline
 * one phase13 created. Postgres applies every check on a column, so the
 * effective domain stayed the INTERSECTION — the original three values — and
 * 'approval_task' was never insertable.
 *
 * That is invisible from the ORM, invisible from the route, and invisible to any
 * test using a mocked pool, because a stub accepts whatever it is handed. It is
 * only visible when a real engine enforces both constraints at once. The
 * consequence shipped: the my-queue endpoint's `approvalsNeeded` counter selects
 * on task_type = 'approval_task', so it has always been 0.
 *
 * This test reproduces the broken state from the real migration text, asserts
 * the insert fails, applies the repair migration, and asserts it then succeeds.
 * If someone reverts the repair, the "after" case fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

let pg: PGlite;

const REPAIR_SQL = readFileSync(
  resolve(__dirname, '../../../migrations/20260814h_review_task_type_domain_repair.sql'),
  'utf8'
);

/** The table exactly as phase13_review_threads_tasks.sql declares it (inline,
 *  unnamed CHECK on task_type), reduced to the columns this test needs. The
 *  FK-bearing columns are kept NOT NULL so nothing here is more permissive than
 *  production. */
const PHASE13_DDL = `
CREATE TABLE concept2cure_review_tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE,
  org_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  artifact_id INTEGER NOT NULL,
  created_by_id INTEGER NOT NULL,
  created_by_name TEXT NOT NULL,
  assigned_to_id INTEGER,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'review_task'
    CHECK (task_type IN ('change_request', 'follow_up', 'review_task')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

/** The widening 0001_phase13_full.sql actually performs — an ADD, not a replace.
 *  This is the bug, reproduced rather than described. */
const PHASE13_FULL_WIDENING = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'c2c_task_type_chk') THEN
    ALTER TABLE concept2cure_review_tasks
      ADD CONSTRAINT c2c_task_type_chk
      CHECK (task_type IN ('change_request', 'follow_up', 'review_task', 'approval_task'));
  END IF;
END $$;
`;

let seq = 0;
async function insertTask(taskType: string) {
  seq += 1;
  return pg.query(
    `INSERT INTO concept2cure_review_tasks
       (task_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, task_type)
     VALUES ($1, 7, 1, 1, 1, 'JM Smith', 'probe', $2)`,
    [`probe-${seq}`, taskType]
  );
}

async function taskTypeChecks(): Promise<string[]> {
  const r = await pg.query<{ def: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS def
       FROM pg_constraint c
      WHERE c.conrelid = 'public.concept2cure_review_tasks'::regclass
        AND c.contype = 'c'`
  );
  return r.rows.map(x => x.def).filter(d => d.includes('task_type'));
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(PHASE13_DDL);
  await pg.exec(PHASE13_FULL_WIDENING);
});
afterAll(async () => { await pg?.close(); });

describe('the broken state, reproduced from the real migration text', () => {
  it('carries TWO checks on task_type, not one', async () => {
    // This is the whole bug in one assertion: the widening added a constraint
    // beside the narrow one instead of replacing it.
    expect(await taskTypeChecks()).toHaveLength(2);
  });

  it("rejects 'approval_task' even though 0001 tried to allow it", async () => {
    await expect(insertTask('approval_task')).rejects.toThrow();
  });

  it('accepts the three original values', async () => {
    for (const t of ['change_request', 'follow_up', 'review_task']) {
      await expect(insertTask(t)).resolves.toBeDefined();
    }
  });
});

describe('after the repair migration', () => {
  beforeAll(async () => {
    await pg.exec(REPAIR_SQL);
  });

  it('leaves exactly one check on task_type', async () => {
    const checks = await taskTypeChecks();
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain('approval_task');
  });

  it("accepts 'approval_task', so approvalsNeeded can be non-zero", async () => {
    await expect(insertTask('approval_task')).resolves.toBeDefined();

    // The my-queue counter (server/routes/concept2cure.ts) derives
    // approvalsNeeded from exactly this predicate. Before the repair it could
    // only ever be 0.
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM concept2cure_review_tasks WHERE task_type = 'approval_task'`
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('still rejects a value outside the widened domain', async () => {
    // The repair widens; it must not remove the domain altogether.
    await expect(insertTask('anything_at_all')).rejects.toThrow();
  });

  it('is idempotent — re-running changes nothing', async () => {
    await pg.exec(REPAIR_SQL);
    await pg.exec(REPAIR_SQL);
    const checks = await taskTypeChecks();
    expect(checks).toHaveLength(1);
    expect(checks[0]).toContain('approval_task');
    await expect(insertTask('approval_task')).resolves.toBeDefined();
  });

  it('does not drop the unrelated status check', async () => {
    // The repair targets only checks that constrain task_type. A blanket drop
    // would have taken this one with it.
    await expect(
      pg.query(
        `INSERT INTO concept2cure_review_tasks
           (task_id, org_id, project_id, artifact_id, created_by_id, created_by_name, title, status)
         VALUES ('probe-status', 7, 1, 1, 1, 'JM Smith', 'probe', 'not_a_status')`
      )
    ).rejects.toThrow();
  });
});
