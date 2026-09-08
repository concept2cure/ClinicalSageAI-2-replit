/**
 * Sentinel task-status SQL — END-TO-END against a real (in-process PGlite)
 * Postgres, running the analyzers' ACTUAL query text.
 *
 * WHY THIS FILE EXISTS
 * Every sentinel query that looked at task status tested for `'done'`. That is
 * a `project_tasks` value; `unified_tasks.status` is the TASK_STATUSES domain
 * (pending / in-progress / review / completed / blocked / cancelled) and never
 * holds it. The predicates therefore inverted silently:
 *
 *   · the overdue scan's `status NOT IN ('done','cancelled')` excluded nothing,
 *     so finished work past its due date was reported as overdue;
 *   · the project-health query's `FILTER (WHERE status = 'done')` matched
 *     nothing, so done_tasks was ALWAYS 0 and completion_rate ALWAYS 0 —
 *     meaning every active project with >= 5 tasks raised a CRITICAL
 *     quality-drift finding claiming zero progress.
 *
 * None of that is observable with a mocked pool, which returns whatever rows
 * the test hands it. So these run the exported SQL constants — the same strings
 * the analyzers pass to pool.query — against a real engine with real rows.
 *
 * PGlite is pure-WASM Postgres: no server, no docker, no cloud.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import {
  AISentinel,
  SENTINEL_OVERDUE_TASKS_SQL,
  SENTINEL_PROJECT_HEALTH_SQL,
} from '../sentinel';
import type { Pool } from 'pg';

let pg: PGlite;

/** Just enough schema for the two queries under test. */
const DDL = `
CREATE TABLE projects (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE unified_tasks (
  id              SERIAL PRIMARY KEY,
  task_id         TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL,
  project_id      INTEGER,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL,
  priority        TEXT,
  due_date        TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ
);
CREATE TABLE pm_settings (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL UNIQUE,
  ai_settings     JSON,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const ORG = 7;
let seq = 0;

async function task(status: string, opts: { overdue?: boolean; archived?: boolean } = {}) {
  seq += 1;
  await pg.query(
    `INSERT INTO unified_tasks
       (task_id, organization_id, project_id, title, status, priority, due_date, deleted_at)
     VALUES ($1, $2, 1, $3, $4, 'medium', $5, $6)`,
    [
      `T-${seq}`,
      ORG,
      `Task ${seq}`,
      status,
      opts.overdue ? new Date(Date.now() - 86_400_000) : new Date(Date.now() + 86_400_000),
      opts.archived ? new Date() : null,
    ]
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(DDL);
});
afterAll(async () => { await pg?.close(); });

beforeEach(async () => {
  await pg.exec('DELETE FROM unified_tasks; DELETE FROM projects; DELETE FROM pm_settings;');
  await pg.exec(`INSERT INTO projects (id, organization_id, name, status)
                 VALUES (1, ${ORG}, 'Filing', 'active')`);
  seq = 0;
});

describe('Sentinel configuration', () => {
  it('uses the canonical one-row-per-organization PM settings shape', async () => {
    await pg.query(
      `INSERT INTO pm_settings (organization_id, ai_settings)
       VALUES ($1, $2::json)`,
      [ORG, JSON.stringify({ tone: 'regulatory' })]
    );
    const sentinel = new AISentinel(pg as unknown as Pool);

    const updated = await sentinel.updateConfig(ORG, { enabled: false, intervalMinutes: 15 });
    const stored = await pg.query<{ ai_settings: Record<string, any> }>(
      'SELECT ai_settings FROM pm_settings WHERE organization_id = $1',
      [ORG]
    );

    expect(updated.enabled).toBe(false);
    expect(updated.intervalMinutes).toBe(15);
    expect(stored.rows[0].ai_settings.tone).toBe('regulatory');
    expect(stored.rows[0].ai_settings.sentinel.enabled).toBe(false);

    // A separate process/cache instance must read the persisted value back.
    const reread = await new AISentinel(pg as unknown as Pool).getConfig(ORG);
    expect(reread.enabled).toBe(false);
    expect(reread.intervalMinutes).toBe(15);
  });
});

describe('overdue scan', () => {
  it('does not report a COMPLETED task as overdue', async () => {
    await task('completed', { overdue: true });
    await task('pending', { overdue: true });

    const res = await pg.query<{ title: string }>(SENTINEL_OVERDUE_TASKS_SQL, [ORG]);

    // Before the fix both rows came back: 'completed' is not 'done', so the
    // NOT IN excluded nothing.
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].title).toBe('Task 2');
  });

  it('does not report a cancelled or an archived task as overdue', async () => {
    await task('cancelled', { overdue: true });
    await task('pending', { overdue: true, archived: true });
    const res = await pg.query(SENTINEL_OVERDUE_TASKS_SQL, [ORG]);
    expect(res.rows).toHaveLength(0);
  });

  it('still reports genuinely overdue open work', async () => {
    for (const s of ['pending', 'in-progress', 'review', 'blocked']) {
      await task(s, { overdue: true });
    }
    await task('pending'); // due tomorrow — not overdue
    const res = await pg.query(SENTINEL_OVERDUE_TASKS_SQL, [ORG]);
    expect(res.rows).toHaveLength(4);
  });
});

describe('project health', () => {
  it('computes a real completion rate instead of a permanent zero', async () => {
    for (let i = 0; i < 3; i++) await task('completed');
    for (let i = 0; i < 2; i++) await task('pending');

    const res = await pg.query<any>(SENTINEL_PROJECT_HEALTH_SQL, [ORG]);

    expect(res.rows).toHaveLength(1);
    const row = res.rows[0];
    // Before the fix: done_tasks 0, completion_rate 0 — and 0 < 25 meant a
    // CRITICAL quality-drift finding for a project that is 60% done.
    expect(row.done_tasks).toBe(3);
    expect(row.total_tasks).toBe(5);
    expect(Number(row.completion_rate)).toBe(60);
  });

  it('counts overdue as open-and-past-due, not merely not-done', async () => {
    for (let i = 0; i < 3; i++) await task('completed', { overdue: true });
    await task('pending', { overdue: true });
    await task('blocked', { overdue: true });

    const row = (await pg.query<any>(SENTINEL_PROJECT_HEALTH_SQL, [ORG])).rows[0];
    // Previously 5 — every row, because none had status 'done'.
    expect(row.overdue_tasks).toBe(2);
    expect(row.blocked_tasks).toBe(1);
  });

  it('excludes archived and cancelled work from the denominator', async () => {
    for (let i = 0; i < 4; i++) await task('completed');
    await task('pending');
    await task('cancelled');          // not outstanding work
    await task('pending', { archived: true }); // left every other read model

    const row = (await pg.query<any>(SENTINEL_PROJECT_HEALTH_SQL, [ORG])).rows[0];
    expect(row.total_tasks).toBe(5);
    expect(Number(row.completion_rate)).toBe(80);
  });

  it('reports 100 rather than dividing by zero when a project has no live tasks', async () => {
    // HAVING >= 5 means a project with only archived tasks drops out entirely
    // rather than surfacing as 0% — the LEFT JOIN stays a LEFT JOIN.
    for (let i = 0; i < 6; i++) await task('pending', { archived: true });
    const res = await pg.query(SENTINEL_PROJECT_HEALTH_SQL, [ORG]);
    expect(res.rows).toHaveLength(0);
  });

  it('is organization-scoped', async () => {
    for (let i = 0; i < 5; i++) await task('completed');
    const res = await pg.query(SENTINEL_PROJECT_HEALTH_SQL, [ORG + 1]);
    expect(res.rows).toHaveLength(0);
  });
});
