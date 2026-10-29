/**
 * The database half of finding B1 (RR1a, docs/design/REVIEW_ROUTING_2026-10-23.md
 * §2.2): unified_tasks_route_rows_guard, from migrations/20261023_review_routes.sql.
 *
 * On the deploy-shaped database, as the runtime role (app_service: NOSUPERUSER,
 * NOBYPASSRLS) with RLS enforced and the caller's tenant set — the connection
 * every route uses. A route member is a unified_tasks row carrying
 * review_route_id. Without `SET LOCAL c2c.review_route_writer = 'on'` (which only
 * server/services/review/review-route.ts sets), the database refuses:
 *
 *   - a raw UPDATE of a route row's status, assignee, archive, blockers, due
 *     date, dependencies or route columns;
 *   - a DELETE of a route row;
 *   - an INSERT naming any route column;
 *   - an INSERT into task_dependencies or cross_module_task_links naming a
 *     route member.
 *
 * It admits: the same writes on a transaction that set the route writer; a
 * metadata-only UPDATE (the due-date sweep's markers); and every write to a
 * task that is not a route member. Also read here: review_routes is policed
 * (pg_policies) and FORCE RLS, and another tenant cannot see the route.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { databaseUrl } from '../setup.db';

let owner: Pool;
let runtime: Pool;
const RUN = `rr1a-${process.pid}-${Date.now().toString(36)}`;
let org: number;
let otherOrg: number;
let user: number;
const ROUTE = randomUUID();

async function asTenant<T>(organization: number, fn: (c: PoolClient) => Promise<T>, writer = false): Promise<T> {
  const c = await runtime.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.current_tenant_id',$1,true), set_config('app.current_org_id','',true),
              set_config('app.current_user_role','member',true), set_config('app.rls_enforce','on',true)`,
      [String(organization)],
    );
    if (writer) await c.query(`SELECT set_config('c2c.review_route_writer','on',true)`);
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (err) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

const refusedBy = async (p: Promise<unknown>) => {
  await expect(p).rejects.toThrow(/ROUTE_TASK_OWNED_BY_ROUTE/);
};
const routeRow = async (taskId: string) =>
  (await owner.query('SELECT status, assignee_id, deleted_at, due_date, review_role, metadata FROM unified_tasks WHERE task_id = $1', [taskId])).rows[0];

beforeAll(async () => {
  if (!process.env.APP_DATABASE_URL) throw new Error('An independently provisioned runtime database role (APP_DATABASE_URL) is required.');
  owner = new Pool({ connectionString: databaseUrl, max: 2 });
  runtime = new Pool({ connectionString: process.env.APP_DATABASE_URL, max: 2 });
  const role = (await runtime.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0];
  expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  const o = await owner.query(`INSERT INTO organizations (name, slug) VALUES ($1, $2), ($3, $4) RETURNING id`,
    [`${RUN} mine`, `${RUN}-mine`, `${RUN} theirs`, `${RUN}-theirs`]);
  org = Number(o.rows[0].id); otherOrg = Number(o.rows[1].id);
  const u = await owner.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'Rita Reviewer', 'x') RETURNING id`, [`${RUN}@example.test`]);
  user = Number(u.rows[0].id);
  // The route and its member, written as the route writer writes them.
  await asTenant(org, async (c) => {
    await c.query(
      `INSERT INTO review_routes (id, organization_id, subject_type, subject_id, round, sender_id, sender_name, review_order, approval_due_at, content_digest)
       VALUES ($1, $2, 'canonical_document', $3, 1, $4, 'Rita Reviewer', 'parallel', now() + interval '7 days', 'digest')`,
      [ROUTE, org, randomUUID(), user]);
    await c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, due_date, review_route_id, review_role, review_step)
       VALUES ($1, $2, 'Vault', 'Review: overview', 'pending', $3, now() + interval '3 days', $4, 'reviewer', 1)`,
      [`${RUN}-R`, org, user, ROUTE]);
  }, true);
  await asTenant(org, (c) => c.query(
    `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status) VALUES ($1, $2, 'IND', 'Ordinary', 'pending')`,
    [`${RUN}-T`, org]));
}, 60_000);

afterAll(async () => {
  await runtime?.end().catch(() => undefined);
  await owner?.end().catch(() => undefined);
});

describe('unified_tasks_route_rows_guard refuses the app role without the route writer', () => {
  it.each([
    ['status', `status = 'completed'`],
    ['assignee', 'assignee_id = NULL'],
    ['archive', 'deleted_at = now()'],
    ['blockers', `blocked_by = ARRAY['X']`],
    ['due date', `due_date = now()`],
    ['dependencies', `dependencies = '[]'::json`],
    ['route columns', `review_role = 'approver'`],
  ])('a raw UPDATE of a route row’s %s', async (_what, set) => {
    const before = await routeRow(`${RUN}-R`);
    await refusedBy(asTenant(org, (c) => c.query(`UPDATE unified_tasks SET ${set} WHERE task_id = $1`, [`${RUN}-R`])));
    expect(await routeRow(`${RUN}-R`)).toEqual(before);
  });

  it('a DELETE of a route row', async () => {
    await refusedBy(asTenant(org, (c) => c.query('DELETE FROM unified_tasks WHERE task_id = $1', [`${RUN}-R`])));
    expect(await routeRow(`${RUN}-R`)).toBeDefined();
  });

  it('an INSERT naming a route column', async () => {
    await refusedBy(asTenant(org, (c) => c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, review_route_id, review_role)
       VALUES ($1, $2, 'Vault', 'Smuggled', 'pending', $3, $4, 'reviewer')`, [`${RUN}-S`, org, user, ROUTE])));
    expect(await routeRow(`${RUN}-S`)).toBeUndefined();
  });

  it.each([
    ['task_dependencies', `INSERT INTO task_dependencies (dependency_id, organization_id, predecessor_task_id, successor_task_id, dependency_type) VALUES ($1, $2, $3, $4, 'finish-to-start')`],
    ['cross_module_task_links', `INSERT INTO cross_module_task_links (link_id, organization_id, source_task_id, source_module, target_task_id, target_module, link_type) VALUES ($1, $2, $3, 'IND', $4, 'Vault', 'dependency')`],
  ])('an INSERT into %s naming a route member', async (_table, statement) => {
    await refusedBy(asTenant(org, (c) => c.query(statement, [`${RUN}-D`, org, `${RUN}-T`, `${RUN}-R`])));
  });
});

describe('what the guard admits', () => {
  it('a metadata-only UPDATE (the due-date sweep’s marker)', async () => {
    await asTenant(org, (c) => c.query(
      `UPDATE unified_tasks SET metadata = '{"dueSoonNotifiedAt":"2026-10-29T00:00:00Z"}'::json, updated_at = now() WHERE task_id = $1`, [`${RUN}-R`]));
    expect((await routeRow(`${RUN}-R`)).metadata).toEqual({ dueSoonNotifiedAt: '2026-10-29T00:00:00Z' });
  });

  it('every write to a task that is not a route member', async () => {
    await asTenant(org, (c) => c.query(`UPDATE unified_tasks SET status = 'in-progress', due_date = now() WHERE task_id = $1`, [`${RUN}-T`]));
    expect((await routeRow(`${RUN}-T`)).status).toBe('in-progress');
  });

  it('the route writer’s own transaction', async () => {
    await asTenant(org, (c) => c.query(`UPDATE unified_tasks SET status = 'completed' WHERE task_id = $1`, [`${RUN}-R`]), true);
    expect((await routeRow(`${RUN}-R`)).status).toBe('completed');
  });
});

describe('review_routes is a policed tenant table', () => {
  it('carries the tenant policy and FORCE RLS', async () => {
    const policies = (await owner.query(`SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_routes'`)).rows;
    expect(policies.map((p) => p.policyname)).toContain('tenant_isolation_policy');
    const rls = (await owner.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'public.review_routes'::regclass`)).rows[0];
    expect(rls).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it('another tenant cannot see the route, nor name it from a task', async () => {
    const seen = await asTenant(otherOrg, (c) => c.query('SELECT id FROM review_routes WHERE id = $1', [ROUTE]));
    expect(seen.rows).toEqual([]);
    // The composite member key refuses another organization's route, even to the route writer.
    await expect(asTenant(otherOrg, (c) => c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, review_route_id, review_role)
       VALUES ($1, $2, 'Vault', 'Cross-tenant', 'pending', $3, $4, 'reviewer')`, [`${RUN}-X`, otherOrg, user, ROUTE]), true))
      .rejects.toThrow(/unified_tasks_review_route_fk|violates foreign key/);
  });
});
