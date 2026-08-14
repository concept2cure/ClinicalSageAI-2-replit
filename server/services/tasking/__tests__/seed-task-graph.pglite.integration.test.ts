/**
 * GA demo task graph — END-TO-END against in-process PGlite (real Postgres, WASM).
 *
 * WHAT THIS PROVES, AND WHY IT IS NOT A MOCK TEST
 * The seed modules are only worth anything if the rows they write are the rows
 * production actually reads. A stubbed pool cannot tell you that: it returns
 * whatever the test hands it, so a seed that writes an unreachable state still
 * "passes". Here the seed SQL runs against a real engine, and the assertions go
 * through the REAL production function — `cascadeUnblockOnCompletion` from
 * server/services/tasking/task-side-effects.ts, with its own Drizzle queries,
 * bound to PGlite via drizzle-orm/pglite. Nothing about the cascade is re-typed
 * into this file.
 *
 * The property under test is the one the demo data exists to show: task
 * ga-demo-utask-007 has TWO blocking predecessors, so completing either one
 * alone must leave it blocked. That is the cascade's reverse-edge read
 * (task-side-effects.ts:121), and it is invisible unless the graph has a fan-in
 * — which is exactly why 21-task-graph.mjs seeds one.
 *
 * PGlite is pure-WASM Postgres: no server, no docker, no DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../../../shared/schema';

let pg: PGlite;
let drz: ReturnType<typeof drizzle>;

// The cascade imports `db` from server/db and writes notifications as a side
// effect. Point `db` at PGlite; silence the notifier (it is a different
// subsystem with its own tests, and its tables are not part of this DDL).
vi.mock('../../../db', () => ({
  get db() {
    return drz;
  },
}));
vi.mock('../../notifications/notification-service', () => ({
  createNotification: vi.fn(async () => 1),
}));

/** The seed modules are untyped ESM JS with no .d.ts. Import through a
 *  string-typed specifier so tsc treats it as a runtime dynamic import rather
 *  than statically resolving it — a string-literal import (static OR dynamic)
 *  trips TS7016 under noImplicitAny. Same idiom as the changeControl PGlite test. */
type SeedFn = (client: unknown, ctx: unknown) => Promise<void>;
const SEED_20: string = '../../../../scripts/seed/ga-demo.d/20-tasks-approvals.mjs';
const SEED_21: string = '../../../../scripts/seed/ga-demo.d/21-task-graph.mjs';
async function loadSeed(p: string): Promise<SeedFn> {
  return ((await import(p)) as { default: SeedFn }).default;
}

// A pg-style client for the seed modules: PGlite returns { rows, affectedRows },
// the seeds expect { rows, rowCount }.
const client = {
  query: async (sql: string, params?: unknown[]) => {
    const r = await pg.query(sql, params as unknown[]);
    return {
      rows: r.rows as Array<Record<string, unknown>>,
      rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
    };
  },
};

const ORG = { id: 42, name: 'Concept2Cure Therapeutics' };
const ADMIN = { id: 1, name: 'JM Smith' };

/**
 * Faithful to the real DDL, including the constraints that matter:
 *   - unified_tasks.task_id UNIQUE  (migrations/0000_sweet_joseph.sql — the
 *     ON CONFLICT target both seed modules rely on)
 *   - task_dependencies.dependency_id UNIQUE  (:5997) — 21's only idempotency key
 *   - both dependency endpoints FK to unified_tasks(task_id), which is why 21
 *     screens endpoints before inserting
 *   - status/priority NOT NULL DEFAULTs, and the nullable soft-delete columns
 *     from db/migrations/20260807_unified_tasks_soft_delete.sql
 */
const DDL = `
CREATE TABLE organizations (id serial PRIMARY KEY, name text);
CREATE TABLE users (id serial PRIMARY KEY, email text, name text);
CREATE TABLE projects (id serial PRIMARY KEY, organization_id integer NOT NULL, name text);

-- Every column in the Drizzle model, because the cascade calls .select() with
-- no projection and Drizzle then names all of them. A DDL missing any column
-- fails loudly here rather than in production — which is the point of running
-- against a real engine instead of a stub that accepts whatever it is given.
CREATE TABLE unified_tasks (
  id serial PRIMARY KEY,
  task_id text NOT NULL UNIQUE,
  organization_id integer NOT NULL,
  client_workspace_id integer,
  project_id integer,
  module_type text, module_icon text, module_color text,
  source_entity_id text, source_entity_type text,
  title text NOT NULL, description text, category text, task_type text,
  assignee_id integer, assignee_name text, assigned_by integer, assigned_at timestamp,
  team_id integer,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  progress integer DEFAULT 0,
  completion_percentage integer DEFAULT 0,
  start_date timestamp, due_date timestamp, completed_at timestamp,
  estimated_hours real, actual_hours real,
  linked_tasks json, dependencies json,
  blocked_by text[], blocks text[],
  module_source text, module_data json, cross_module_links json,
  automation_rules json, escalation_path json,
  approval_required boolean DEFAULT false,
  approvers json,
  approval_status text,
  approval_history json,
  impact_score real,
  risk_level text, critical_path boolean, regulatory_impact boolean,
  notification_settings json,
  automation_enabled boolean DEFAULT true,
  ai_suggestions json,
  tags text[], attachments json, comments json, metadata json,
  lifecycle_phase text, market text, filing_type text,
  study_id integer, deliverable_id integer, client_visibility text,
  created_by_id integer, last_modified_by integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by integer
);

CREATE TABLE task_dependencies (
  id serial PRIMARY KEY,
  dependency_id text NOT NULL UNIQUE,
  organization_id integer,
  predecessor_task_id text NOT NULL REFERENCES unified_tasks(task_id),
  successor_task_id text NOT NULL REFERENCES unified_tasks(task_id),
  dependency_type text NOT NULL,
  lag_time integer DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  is_critical boolean DEFAULT false,
  is_blocking boolean DEFAULT true,
  impact_score real, risk_level text,
  cascade_effect json, validation_rules json,
  violation_reason text, bypass_reason text,
  bypassed_by integer, bypassed_at timestamp,
  metadata json,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
`;

async function statusOf(taskId: string): Promise<string> {
  const r = await pg.query<{ status: string }>(
    'SELECT status FROM unified_tasks WHERE task_id = $1',
    [taskId]
  );
  return r.rows[0]?.status;
}

async function runSeeds() {
  await (await loadSeed(SEED_20))(client, { org: ORG, admin: ADMIN });
  await (await loadSeed(SEED_21))(client, { org: ORG, admin: ADMIN });
}

beforeAll(async () => {
  pg = new PGlite();
  drz = drizzle(pg, { schema }) as unknown as ReturnType<typeof drizzle>;
  await pg.exec(DDL);
  await pg.exec(`INSERT INTO organizations (id, name) VALUES (${ORG.id}, 'Concept2Cure')`);
  await pg.exec(`INSERT INTO users (id, email, name) VALUES (1, 'admin@concept2cure.pro', 'JM Smith')`);
  await pg.exec(`INSERT INTO projects (id, organization_id, name) VALUES (9, ${ORG.id}, 'BX-099 BLA')`);
  await runSeeds();
});
afterAll(async () => { await pg?.close(); });

describe('seed shape', () => {
  it('writes the dependency edges over the tasks module 20 seeded', async () => {
    const r = await pg.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM task_dependencies WHERE dependency_id LIKE 'ga-demo-dep-%'"
    );
    expect(r.rows[0].n).toBe(7);
  });

  it('org-stamps every edge on the column the write path populates', async () => {
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM task_dependencies WHERE organization_id IS DISTINCT FROM ${ORG.id}`
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('leaves every edge status "active" — the cascade never writes "satisfied"', async () => {
    // A seeded 'satisfied' row would be a state no code path produces. This
    // guards against someone "tidying" the seed into fiction later.
    const r = await pg.query<{ status: string }>(
      'SELECT DISTINCT status FROM task_dependencies'
    );
    expect(r.rows.map(x => x.status)).toEqual(['active']);
  });

  it('never pairs a blocking edge with a non-blocked successor', async () => {
    // The coherence rule the seed header states. Creating a blocking edge is
    // what blocks the successor, so any other combination is unreachable.
    const r = await pg.query<{ dependency_id: string }>(
      `SELECT d.dependency_id
         FROM task_dependencies d
         JOIN unified_tasks p ON p.task_id = d.predecessor_task_id
         JOIN unified_tasks s ON s.task_id = d.successor_task_id
        WHERE (d.is_blocking IS NULL OR d.is_blocking = true)
          AND p.status <> 'completed'
          AND s.status <> 'blocked'`
    );
    expect(r.rows).toEqual([]);
  });
});

describe('archive + e-signature examples', () => {
  it('archives exactly the superseded rows, and the live read excludes them', async () => {
    const archived = await pg.query<{ task_id: string }>(
      'SELECT task_id FROM unified_tasks WHERE deleted_at IS NOT NULL ORDER BY task_id'
    );
    expect(archived.rows.map(r => r.task_id)).toEqual([
      'ga-demo-utask-014',
      'ga-demo-utask-015',
    ]);

    // The predicate every read model applies. Before the seed added archived
    // rows this filter matched every row vacuously and proved nothing.
    const live = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM unified_tasks
        WHERE organization_id = ${ORG.id} AND deleted_at IS NULL`
    );
    const all = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM unified_tasks WHERE organization_id = ${ORG.id}`
    );
    expect(all.rows[0].n - live.rows[0].n).toBe(2);
  });

  it('stores a §11.50 manifestation in the shape task-signoff.ts writes', async () => {
    const r = await pg.query<{ approval_status: string; approval_history: unknown }>(
      "SELECT approval_status, approval_history FROM unified_tasks WHERE task_id = 'ga-demo-utask-016'"
    );
    expect(r.rows[0].approval_status).toBe('approved');
    const history = r.rows[0].approval_history as Array<Record<string, unknown>>;
    expect(Array.isArray(history)).toBe(true);
    expect(history).toHaveLength(1);
    // Field-for-field against SignoffManifestation (task-signoff.ts:41-48).
    expect(Object.keys(history[0]).sort()).toEqual(
      ['meaning', 'method', 'reason', 'signedAt', 'signedById', 'signedByName'].sort()
    );
    expect(history[0].method).toBe('pin');
    // TASK_SIGNATURE_MEANINGS — part11/pin-verification.ts:99.
    expect(['APPROVED', 'REVIEWED', 'RESPONSIBILITY', 'AUTHORSHIP']).toContain(history[0].meaning);
    expect(String(history[0].reason).length).toBeGreaterThan(20);
    expect(Number.isNaN(Date.parse(String(history[0].signedAt)))).toBe(false);
  });

  it('anchors the demo tasks to a project so the critical-path read is not empty', async () => {
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM unified_tasks
        WHERE organization_id = ${ORG.id} AND project_id IS NULL`
    );
    expect(r.rows[0].n).toBe(0);
  });
});

describe('the real unblock cascade over the seeded fan-in', () => {
  // These run the PRODUCTION function against the seeded graph. Order matters:
  // the first completion must NOT wake 007, the second must.
  it('starts with 007 blocked behind two blocking predecessors', async () => {
    expect(await statusOf('ga-demo-utask-007')).toBe('blocked');
    const r = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM task_dependencies
        WHERE successor_task_id = 'ga-demo-utask-007'
          AND (is_blocking IS NULL OR is_blocking = true)`
    );
    expect(r.rows[0].n).toBe(2);
  });

  it('does NOT wake 007 when only the first predecessor completes', async () => {
    const { cascadeUnblockOnCompletion } = await import('../task-side-effects');
    await pg.exec(
      "UPDATE unified_tasks SET status = 'completed' WHERE task_id = 'ga-demo-utask-008'"
    );
    await cascadeUnblockOnCompletion(ORG.id, 'ga-demo-utask-008');
    // ga-demo-utask-013 is still in-progress. A single-predecessor graph would
    // have hidden this: the reverse-edge read is the only thing holding it.
    expect(await statusOf('ga-demo-utask-007')).toBe('blocked');
  });

  it('wakes 007 once the second predecessor completes too', async () => {
    const { cascadeUnblockOnCompletion } = await import('../task-side-effects');
    await pg.exec(
      "UPDATE unified_tasks SET status = 'completed' WHERE task_id = 'ga-demo-utask-013'"
    );
    await cascadeUnblockOnCompletion(ORG.id, 'ga-demo-utask-013');
    expect(await statusOf('ga-demo-utask-007')).toBe('pending');
  });

  it('ignores non-blocking edges — 003 is untouched by its predecessors completing', async () => {
    const { cascadeUnblockOnCompletion } = await import('../task-side-effects');
    const before = await statusOf('ga-demo-utask-003');
    await pg.exec(
      "UPDATE unified_tasks SET status = 'completed' WHERE task_id = 'ga-demo-utask-011'"
    );
    await cascadeUnblockOnCompletion(ORG.id, 'ga-demo-utask-011');
    // dep-005 is is_blocking=false, so the cascade must not have gated 003 and
    // must not now touch it.
    expect(await statusOf('ga-demo-utask-003')).toBe(before);
  });
});

describe('idempotency', () => {
  it('re-running both seed modules writes nothing new', async () => {
    const count = async (t: string) =>
      (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
    const before = { tasks: await count('unified_tasks'), deps: await count('task_dependencies') };

    await runSeeds();

    expect(await count('unified_tasks')).toBe(before.tasks);
    expect(await count('task_dependencies')).toBe(before.deps);
  });

  it('does not resurrect an archived row on re-run', async () => {
    // The archive UPDATE is guarded by `deleted_at IS NULL`, so a second pass
    // must not restamp deleted_at (which would move the tombstone date) and the
    // INSERT ... ON CONFLICT DO NOTHING must not undelete anything.
    const r = await pg.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM unified_tasks WHERE deleted_at IS NOT NULL'
    );
    expect(r.rows[0].n).toBe(2);
  });
});
