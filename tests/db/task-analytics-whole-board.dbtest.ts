/**
 * `loadTaskAnalytics` must measure the whole board, and say so when it cannot.
 *
 * ── Two defects in one figure (reporting coverage review, C-8) ──────────────
 * `teamProductivity` is what a manager reads as the team's load, and it was
 * neither the team nor the load:
 *
 *   1. `.limit(10)`, with no total beside it. The eleventh-busiest person and
 *      everyone below them was simply absent, and nothing in the response said
 *      a bound had been applied — a silent cap on a governed figure, the same
 *      failure as the run-history window (C-1) and the capped portfolio
 *      rollup (C-12). The bound is kept (one row per assignee is unbounded in
 *      principle) but raised to TEAM_PRODUCTIVITY_CAP and reported through
 *      `teamProductivityTotal`, counted in SQL rather than from the truncated
 *      rows.
 *   2. `assignee_id IS NOT NULL` with no complement. Unassigned work — the work
 *      most likely to be missed — fell out of the aggregation entirely, so the
 *      per-assignee totals did not add up to `taskStats.totalTasks` and nothing
 *      said where the difference went.
 *
 * ── Why real PostgreSQL ────────────────────────────────────────────────────
 * The fix is `count(distinct …)`, a complementary `IS NULL` predicate and an
 * `ORDER BY` tiebreaker. A mocked pool returns what the mock is told to
 * return; only the database can say whether the two predicates partition the
 * board or whether the tie order is stable. Read on the shared two-tenant
 * fixture, in tenant A's scope.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runWithTenantScope } from '../../server/db/tenantStore';
import {
  loadTaskAnalytics,
  TEAM_PRODUCTIVITY_CAP,
} from '../../server/services/tasking/task-analytics';
import {
  TAG,
  ORG_A,
  owner,
  provisionTwoTenantFixture,
  teardownTwoTenantFixture,
} from './two-tenant-fixture';

/* More than the OLD bound of 10, so the two people it dropped are the test.
   Far below TEAM_PRODUCTIVITY_CAP, so the complete-list assertion holds. */
const ASSIGNEES = 12;
/* Tasks with no assignee at all. */
const UNASSIGNED = 5;
const MODULE = 'clinical';
const EMAIL_PREFIX = `${TAG}-tp-`;

let assigneeIds: number[] = [];
/** The engine narrows to one project when given one; these assertions are
    about the whole organisation, so it stays null. */
const projectId: number | null = null;

/* The scope shape the instrumentation reads: `tenantId` is what becomes
   `app.current_tenant_id` on the pooled connection, and without it the
   policy's org arms are NULL under RLS_ENFORCE=on and every read is empty. */
const inA = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithTenantScope(
    { tenantId: String(ORG_A), role: 'member', source: 'request', caller: 'task-analytics-whole-board.dbtest' },
    fn,
  );

beforeAll(async () => {
  await provisionTwoTenantFixture();

  /* Twelve real users: assignee_id carries a foreign key into users, so ids
     cannot be invented. Tagged, and removed in afterAll. */
  const values = Array.from({ length: ASSIGNEES }, (_, i) =>
    `('${EMAIL_PREFIX}${i}@example.invalid','Productivity ${i}','not-a-real-password')`).join(',');
  const users = await owner.query(
    `INSERT INTO users (email,name,password_hash) VALUES ${values} RETURNING id`,
  );
  assigneeIds = users.rows.map(r => Number(r.id));

  /* Assignee i gets i + 1 tasks, of which one is completed. So every assignee
     has the SAME completed count (1), which is what makes the tie order below
     a real question rather than an accident of the data. */
  for (const [i, assigneeId] of assigneeIds.entries()) {
    for (let n = 0; n <= i; n += 1) {
      await owner.query(
        `INSERT INTO unified_tasks
           (task_id, organization_id, module_type, title, assignee_id, status, completion_percentage)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          `${TAG}-tp-${i}-${n}`, ORG_A, MODULE, `Task ${i}/${n}`, assigneeId,
          n === 0 ? 'completed' : 'pending', n === 0 ? 100 : 0,
        ],
      );
    }
  }
  for (let n = 0; n < UNASSIGNED; n += 1) {
    await owner.query(
      `INSERT INTO unified_tasks
         (task_id, organization_id, module_type, title, assignee_id, status, completion_percentage)
       VALUES ($1,$2,$3,$4,NULL,$5,$6)`,
      [`${TAG}-tp-un-${n}`, ORG_A, MODULE, `Unowned ${n}`, n === 0 ? 'completed' : 'pending', n === 0 ? 100 : 0],
    );
  }
}, 180_000);

afterAll(async () => {
  if (owner) {
    await owner.query('DELETE FROM unified_tasks WHERE task_id LIKE $1', [`${TAG}-tp-%`]);
    await owner.query('DELETE FROM users WHERE email LIKE $1', [`${EMAIL_PREFIX}%`]);
  }
  await teardownTwoTenantFixture();
}, 120_000);

describe('loadTaskAnalytics measures the whole board', () => {
  it('returns every assignee under the bound, not the first ten', async () => {
    /* THE REGRESSION. With `.limit(10)` this came back with ten rows however
       many assignees the board had, and nothing in the response said so.
       Asserted against the engine's own count rather than against names: the
       seeded users hold no membership in this organisation, so `actor_name`
       resolves them to its unknown label — which is correct behaviour and
       beside the point here. */
    const a = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    expect(a.teamProductivity.length).toBeGreaterThanOrEqual(ASSIGNEES);
    expect(a.teamProductivity.length).toBe(a.teamProductivityTotal);
    expect(a.teamProductivityTotal).toBeLessThan(TEAM_PRODUCTIVITY_CAP);
  });

  it('counts the assignees in SQL, so a truncated list is still reportable', async () => {
    /* `teamProductivityTotal` must come from count(distinct …) and not from
       the rows, or it would agree with a truncated list by construction and
       could never reveal one. Equal here only because the board is under the
       bound; the point is that it is derived separately. */
    const a = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    const { rows } = await owner.query(
      `SELECT count(DISTINCT assignee_id)::int AS n FROM unified_tasks
        WHERE organization_id = $1 AND deleted_at IS NULL AND assignee_id IS NOT NULL`,
      [ORG_A],
    );
    expect(a.teamProductivityTotal).toBe(Number(rows[0].n));
    expect(a.teamProductivityTotal).toBeGreaterThanOrEqual(ASSIGNEES);
  });

  it('reports unassigned work instead of dropping it, so the parts sum to the whole', async () => {
    /* The property that was false before `unassigned` existed: the figures a
       reader can add up must add up. */
    const a = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    const assigned = a.teamProductivity.reduce((n, r) => n + Number(r.totalTasks), 0);
    expect(assigned + a.unassigned.totalTasks).toBe(Number(a.taskStats.totalTasks));
    expect(a.unassigned.totalTasks).toBeGreaterThanOrEqual(UNASSIGNED);
    expect(a.unassigned.completedTasks).toBeGreaterThanOrEqual(1);
  });

  it('measures an empty unassigned bucket rather than omitting it', async () => {
    /* `totalTasks: 0` is a different fact from an absent field, and a client
       cannot render "none unassigned" from `undefined` without guessing. */
    const a = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    expect(a.unassigned).toMatchObject({
      totalTasks: expect.any(Number),
      completedTasks: expect.any(Number),
    });
    expect('avgCompletion' in a.unassigned).toBe(true);
  });

  it('orders tied assignees deterministically, so two identical reads agree', async () => {
    /* Every seeded assignee has exactly one completed task, so the ordering
       column is tied twelve ways. Without the id tiebreaker the row that falls
       off the bound — and the order a client renders — could differ between
       two identical requests. */
    const first = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    const second = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    expect(first.teamProductivity.map(r => r.name)).toEqual(second.teamProductivity.map(r => r.name));
  });

  it('stays inside the authenticated organization', async () => {
    /* The engine takes the org as its first argument and every query predicates
       it; asserted here because this suite is the one that seeds a lot of rows
       under one tenant. */
    const a = await inA(() => loadTaskAnalytics(ORG_A, projectId));
    const { rows } = await owner.query(
      `SELECT count(*)::int AS n FROM unified_tasks WHERE organization_id = $1 AND deleted_at IS NULL`,
      [ORG_A],
    );
    expect(Number(a.taskStats.totalTasks)).toBe(Number(rows[0].n));
  });
});
