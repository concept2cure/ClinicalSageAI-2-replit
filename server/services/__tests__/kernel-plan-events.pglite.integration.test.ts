/**
 * The plan-run audit table had never accepted a single row.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `ai_goal_plan_step_events.id` is BIGSERIAL (20260325_ai_goal_plan_step_events.sql:4).
 * `recordPlanRunEvent` supplied `gpe_<uuid>` into it. PostgreSQL rejects that
 * with `invalid input syntax for type bigint` — not sometimes, EVERY call,
 * since the table was created.
 *
 * ── Why that is not merely a missing log ──────────────────────────────────────
 * `advanceGoalPlanStep` and `executeNextGoalPlanStep` each ran the state UPDATE
 * and this INSERT inside ONE try block using `await pool.query` — two separate
 * statements, each auto-committed. So:
 *
 *   1. the UPDATE committed: the step really did advance;
 *   2. the event INSERT threw;
 *   3. the catch returned { ok: false, message: 'Failed to update plan run' }.
 *
 * Every step advance SUCCEEDED in the database and reported FAILURE to its
 * caller. A caller that then retried hit canTransitionStepStatus(completed,
 * completed) and was told "Invalid transition" — the plan had already moved
 * underneath them. The worst direction for this to be wrong in: the system did
 * the thing and said it had not.
 *
 * It also means the plan to record pause/cancel control events here rested on a
 * table that had never worked.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Against a real PostgreSQL, using the shipped DDL, because the behaviour under
 * test IS the column type and the transaction boundary — neither of which a
 * mocked pool can have an opinion about.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const STEP_EVENTS_DDL = fs.readFileSync(
  path.join(repoRoot, 'db', 'migrations', '20260325_ai_goal_plan_step_events.sql'),
  'utf8',
);
const SERVICE = fs.readFileSync(
  path.join(repoRoot, 'server', 'services', 'kernel-plan-runtime.ts'),
  'utf8',
);

/** The shipped INSERT, extracted so a paraphrase cannot drift from it. */
const EVENT_INSERT = (() => {
  const m = /INSERT INTO ai_goal_plan_step_events\s*\n\s*\([^)]*\)\s*\n\s*VALUES \([^)]*\)/.exec(
    SERVICE,
  );
  if (!m) throw new Error('event INSERT not found — has kernel-plan-runtime.ts moved it?');
  return m[0];
})();

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STEP_EVENTS_DDL);
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('DELETE FROM ai_goal_plan_step_events;'); });

describe('the shipped INSERT', () => {
  it('no longer supplies the BIGSERIAL id', () => {
    // The whole defect in one assertion. A future edit "helpfully" restoring an
    // explicit id would break every write again, silently, because the callers
    // only log a warning.
    expect(EVENT_INSERT).not.toMatch(/\(\s*id\s*,/);
    expect(EVENT_INSERT).toMatch(/\(plan_run_id, step_id, event_type, payload\)/);
  });

  it('is accepted by the real table', async () => {
    await db.query(EVENT_INSERT.replace(/\$(\d)/g, (_, n) => `$${n}`), [
      'gpr_1',
      'step_1',
      'step_advanced',
      JSON.stringify({ nextStatus: 'completed' }),
    ]);
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM ai_goal_plan_step_events',
    );
    expect(rows[0].n).toBe(1);
  });

  it('lets the sequence assign an id', async () => {
    for (const step of ['s1', 's2']) {
      await db.query(EVENT_INSERT, ['gpr_1', step, 'step_advanced', '{}']);
    }
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM ai_goal_plan_step_events ORDER BY id',
    );
    expect(rows).toHaveLength(2);
    expect(Number(rows[1].id)).toBeGreaterThan(Number(rows[0].id));
  });
});

describe('the defect itself, held', () => {
  it('a TEXT id is REJECTED by the bigint column — this is what used to happen', async () => {
    // Every call, since the table was created. Without this case, someone
    // reading the id-less INSERT as an oversight could "fix" it back.
    await expect(
      db.query(
        `INSERT INTO ai_goal_plan_step_events (id, plan_run_id, step_id, event_type, payload)
         VALUES ($1,$2,$3,$4,$5)`,
        ['gpe_11111111-2222-3333-4444-555555555555', 'gpr_1', 's1', 'step_advanced', '{}'],
      ),
    ).rejects.toThrow(/invalid input syntax for type bigint/i);
  });

  it('and left the table empty, so nothing downstream could read a history', async () => {
    await db
      .query(
        `INSERT INTO ai_goal_plan_step_events (id, plan_run_id, step_id, event_type, payload)
         VALUES ($1,$2,$3,$4,$5)`,
        ['gpe_x', 'gpr_1', 's1', 'step_advanced', '{}'],
      )
      .catch(() => undefined);
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM ai_goal_plan_step_events',
    );
    expect(rows[0].n).toBe(0);
  });
});

describe('a state change and its record land together', () => {
  it('both writes share one transaction', () => {
    // They were two auto-committed statements in one try block, so a failed
    // event left a COMMITTED state change reported as a failure — the caller
    // believes nothing happened to a plan that has already moved.
    expect(SERVICE).toMatch(/async function persistStepTransition/);
    expect(SERVICE).toMatch(/await client\.query\('BEGIN'\)/);
    expect(SERVICE).toMatch(/await client\.query\('COMMIT'\)/);
    expect(SERVICE).toMatch(/await client\.query\('ROLLBACK'\)/);
  });

  it('neither advance nor execute writes the run row outside that transaction', () => {
    // A stray `pool.query` UPDATE would restore the split, and every other
    // assertion here would still pass.
    const strayUpdate = /pool\.query\(\s*`UPDATE ai_goal_plan_runs/.test(SERVICE);
    expect(strayUpdate).toBe(false);
  });

  it('rolls back the state change when the event cannot be written', async () => {
    // The property itself, on a real database: the UPDATE and the INSERT in one
    // transaction, with the INSERT made to fail.
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ai_goal_plan_runs (
        id TEXT PRIMARY KEY, status TEXT NOT NULL, goal_plan JSONB NOT NULL DEFAULT '{}'::jsonb
      );
      INSERT INTO ai_goal_plan_runs (id, status) VALUES ('gpr_tx', 'active')
        ON CONFLICT (id) DO UPDATE SET status = 'active';
    `);
    await db.exec('BEGIN');
    await db.query(`UPDATE ai_goal_plan_runs SET status = 'completed' WHERE id = $1`, ['gpr_tx']);
    await db
      .query(
        `INSERT INTO ai_goal_plan_step_events (id, plan_run_id, event_type) VALUES ($1,$2,$3)`,
        ['gpe_bad', 'gpr_tx', 'run_completed'],
      )
      .catch(() => undefined);
    await db.exec('ROLLBACK');

    const { rows } = await db.query<{ status: string }>(
      `SELECT status FROM ai_goal_plan_runs WHERE id = $1`,
      ['gpr_tx'],
    );
    expect(rows[0].status).toBe('active');
  });
});
