/**
 * The database half of finding B1 (RR1a, docs/design/REVIEW_ROUTING_2026-10-23.md
 * §2.2): unified_tasks_route_rows_guard, from migrations/20261023_review_routes.sql,
 * as founder decision P-59 left it (2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/).
 *
 * On the deploy-shaped database, as the runtime role (app_service: NOSUPERUSER,
 * NOBYPASSRLS) with RLS enforced and the caller's tenant set: the connection
 * every route uses. A route member is a unified_tasks row carrying
 * review_route_id. The guard admits a write to one only when current_user is
 * review_route_writer, a NOLOGIN, NOINHERIT role the runtime role is not a
 * member of, which is true only inside that role's SECURITY DEFINER doors.
 * It refuses, from the runtime role:
 *
 *   - a raw UPDATE of a route row's status, assignee, archive, blockers, due
 *     date, dependencies or route columns;
 *   - a DELETE of a route row;
 *   - an INSERT naming any route column;
 *   - an INSERT into task_dependencies or cross_module_task_links naming a
 *     route member;
 *   - each of those on a transaction that set c2c.review_route_writer, the
 *     setting the guard used to read and the runtime role could set itself
 *     (docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/guc-probe.txt).
 *
 * The runtime role cannot become the route writer (SET ROLE is refused). It
 * admits: a door's own transition (a member enlisted, a step opened, a task
 * closed on the member's own signature), refused outside the caller's tenant
 * and outside what the transition allows (another signer's signature, the
 * wrong meaning, another content digest); a
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
/** Two more members: one member per assignee on a route (unified_tasks_review_route_member_key). */
let approver: number;
let second: number;
const ROUTE = randomUUID();
const MEMBER = (assignee: number) => `ROUTE-${ROUTE.slice(0, 8)}-${assignee}`;
const GUC_PROBE = `SELECT set_config('c2c.review_route_writer','on',true)`;

async function asTenant<T>(organization: number, fn: (c: PoolClient) => Promise<T>, prelude?: string): Promise<T> {
  const c = await runtime.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `SELECT set_config('app.current_tenant_id',$1,true), set_config('app.current_org_id','',true),
              set_config('app.current_user_role','member',true), set_config('app.rls_enforce','on',true)`,
      [String(organization)],
    );
    if (prelude) await c.query(prelude);
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
  const more = await owner.query(`INSERT INTO users (email, name, password_hash) VALUES ($1, 'Avery Approver', 'x'), ($2, 'Sasha Second', 'x') RETURNING id`,
    [`${RUN}-a@example.test`, `${RUN}-s@example.test`]);
  approver = Number(more.rows[0].id); second = Number(more.rows[1].id);
  // The route, and a member laid down as the route writer's doors leave one
  // (the fixture skips the trigger for this one row: the doors are exercised
  // below, on their own).
  await asTenant(org, (c) => c.query(
    `INSERT INTO review_routes (id, organization_id, subject_type, subject_id, round, sender_id, sender_name, review_order, approval_due_at, content_digest)
     VALUES ($1, $2, 'canonical_document', $3, 1, $4, 'Rita Reviewer', 'parallel', now() + interval '7 days', 'digest')`,
    [ROUTE, org, randomUUID(), user]));
  const lay = await owner.connect();
  try {
    await lay.query('BEGIN');
    await lay.query('SET LOCAL session_replication_role = replica');
    await lay.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, due_date, review_route_id, review_role, review_step)
       VALUES ($1, $2, 'Vault', 'Review: overview', 'pending', $3, now() + interval '3 days', $4, 'reviewer', 1)`,
      [`${RUN}-R`, org, user, ROUTE]);
    await lay.query('COMMIT');
  } finally {
    lay.release();
  }
  await asTenant(org, (c) => c.query(
    `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status) VALUES ($1, $2, 'IND', 'Ordinary', 'pending')`,
    [`${RUN}-T`, org]));
}, 60_000);

afterAll(async () => {
  await runtime?.end().catch(() => undefined);
  await owner?.end().catch(() => undefined);
});

describe('unified_tasks_route_rows_guard refuses the runtime role outside the route writer’s doors', () => {
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

  it('a door’s own transition: members enlisted, a step opened when its turn has come and not before', async () => {
    const enlist = (taskId: string, assignee: number, role: string, step: number, status: string) => asTenant(org, async (c) => {
      await c.query(
        `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id) VALUES ($1, $2, 'Vault', 'Route member', $3, $4)`,
        [taskId, org, status, assignee]);
      await c.query('SELECT public.review_route_enlist_member($1, $2::uuid, $3, $4, $5)', [org, ROUTE, taskId, role, step]);
    });
    await enlist(MEMBER(approver), approver, 'approver', 2, 'blocked');
    expect(await routeRow(MEMBER(approver))).toMatchObject({ status: 'blocked', review_role: 'approver' });
    // Its step has not come: the reviewer at step 1 has not signed.
    await refusedBy(asTenant(org, (c) => c.query('SELECT public.review_route_open_step($1, $2::uuid, $3)', [org, ROUTE, MEMBER(approver)])));
    expect((await routeRow(MEMBER(approver))).status).toBe('blocked');
    // A reviewer added at step 1, waiting: nothing comes before it, so its step opens.
    const added = `${MEMBER(second)}-1`;
    await enlist(added, second, 'reviewer', 1, 'blocked');
    const opened = await asTenant(org, (c) => c.query('SELECT public.review_route_open_step($1, $2::uuid, $3) AS opened', [org, ROUTE, added]));
    expect(opened.rows[0].opened).toBe(true);
    expect(await routeRow(added)).toMatchObject({ status: 'pending', review_role: 'reviewer' });
  });
});

describe('the route writer is a role, never a setting (P-59)', () => {
  it('the setting the guard used to read is still settable by the runtime role, and admits nothing', async () => {
    const shown = await asTenant(org, (c) => c.query(`SELECT current_setting('c2c.review_route_writer', true) AS v`), GUC_PROBE);
    expect(shown.rows[0].v).toBe('on');
    const before = await routeRow(`${RUN}-R`);
    await refusedBy(asTenant(org, (c) => c.query(`UPDATE unified_tasks SET status = 'completed' WHERE task_id = $1`, [`${RUN}-R`]), GUC_PROBE));
    await refusedBy(asTenant(org, (c) => c.query('DELETE FROM unified_tasks WHERE task_id = $1', [`${RUN}-R`]), GUC_PROBE));
    await refusedBy(asTenant(org, (c) => c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id, review_route_id, review_role)
       VALUES ($1, $2, 'Vault', 'Smuggled', 'pending', $3, $4, 'reviewer')`, [`${RUN}-G`, org, user, ROUTE]), GUC_PROBE));
    expect(await routeRow(`${RUN}-R`)).toEqual(before);
    expect(await routeRow(`${RUN}-G`)).toBeUndefined();
  });

  it('the runtime role cannot become the route writer', async () => {
    await expect(asTenant(org, (c) => c.query('SET ROLE review_route_writer'))).rejects.toThrow(/permission denied/);
    const r = await runtime.query(
      `SELECT pg_has_role(current_user, 'review_route_writer', 'MEMBER') AS member, w.rolcanlogin, w.rolinherit, w.rolsuper, w.rolbypassrls
         FROM pg_roles w WHERE w.rolname = 'review_route_writer'`);
    expect(r.rows[0]).toEqual({ member: false, rolcanlogin: false, rolinherit: false, rolsuper: false, rolbypassrls: false });
  });

  it('each door is a definer function owned by the route writer, with a pinned search_path, that PUBLIC cannot run', async () => {
    const doors = (await owner.query(
      `SELECT p.proname, p.prosecdef, pg_get_userbyid(p.proowner) AS owner, p.proconfig,
              has_function_privilege('public', p.oid, 'EXECUTE') AS public_runs, has_function_privilege('app_service', p.oid, 'EXECUTE') AS app_runs
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prosecdef AND pg_get_userbyid(p.proowner) = 'review_route_writer' ORDER BY p.proname`)).rows;
    expect(doors.map((d) => d.proname)).toEqual([
      'review_route_cancel_member', 'review_route_enlist_member', 'review_route_open_step', 'review_route_reassign_member',
      'review_route_record_authoring_signature', 'review_route_record_signature', 'review_route_restep_approver', 'review_route_stamp_act',
    ]);
    for (const d of doors) {
      expect(d, d.proname).toMatchObject({ prosecdef: true, owner: 'review_route_writer', public_runs: false, app_runs: true });
      expect(d.proconfig, d.proname).toContain('search_path=pg_catalog, public');
    }
  });

  it('a door refuses another tenant’s scope, and a task that is not the route writer’s own', async () => {
    await asTenant(otherOrg, (c) => c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id) VALUES ($1, $2, 'Vault', 'Theirs', 'pending', $3)`,
      [`${RUN}-O`, otherOrg, user]));
    await expect(asTenant(otherOrg, (c) => c.query('SELECT public.review_route_enlist_member($1, $2::uuid, $3, $4, $5)',
      [org, ROUTE, `${RUN}-O`, 'reviewer', 1]))).rejects.toThrow(/written in its organization's own scope/);
    await asTenant(org, (c) => c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id) VALUES ($1, $2, 'Vault', 'Not a member', 'pending', $3)`,
      [`${RUN}-N`, org, user]));
    await refusedBy(asTenant(org, (c) => c.query('SELECT public.review_route_enlist_member($1, $2::uuid, $3, $4, $5)',
      [org, ROUTE, `${RUN}-N`, 'reviewer', 1])));
    expect(await routeRow(`${RUN}-N`)).toMatchObject({ review_role: null });
  });

  it('a signature closes a member’s task only when it is the member’s own, with the role’s meaning, over the route’s content', async () => {
    const route = (await owner.query('SELECT subject_type, subject_id, content_digest FROM review_routes WHERE id = $1', [ROUTE])).rows[0];
    const sign = async (signer: number, meaning: string, digest: string) => Number((await owner.query(
      `INSERT INTO electronic_signatures (organization_id, signed_target, signature_type, signature_purpose, signature_meaning, signer_id,
         signer_name, signer_email, authentication_method, authentication_timestamp, signature_hash, is_valid, signed_at, bound_payload_digest)
       VALUES ($1, $2, 'governed-action', 'Route review', $3, $4, 'Route signer', 'route@example.test', 'password', now(), $5, true, now(), $6)
       RETURNING id`,
      [org, `${route.subject_type}:${route.subject_id}`, meaning, signer, 'e'.repeat(64), digest])).rows[0].id);
    const close = (signature: number) => asTenant(org, (c) => c.query(
      'SELECT public.review_route_record_signature($1, $2::uuid, $3, $4, $5) AS status', [org, ROUTE, `${RUN}-R`, signature, user]));
    const before = await routeRow(`${RUN}-R`);
    await refusedBy(close(await sign(approver, 'REVIEWED', route.content_digest)));
    await refusedBy(close(await sign(user, 'APPROVED', route.content_digest)));
    await refusedBy(close(await sign(user, 'REVIEWED', 'not-the-routed-content')));
    expect(await routeRow(`${RUN}-R`)).toEqual(before);
    // The control: the member's own REVIEWED signature over the routed content closes it.
    const closed = await close(await sign(user, 'REVIEWED', route.content_digest));
    expect(closed.rows[0].status).toBe('completed');
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
    // The route writer's door, in the other tenant's own scope, cannot name the route either.
    const theirs = `${MEMBER(user)}-9`;
    await asTenant(otherOrg, (c) => c.query(
      `INSERT INTO unified_tasks (task_id, organization_id, module_type, title, status, assignee_id) VALUES ($1, $2, 'Vault', 'Cross-tenant', 'pending', $3)`,
      [theirs, otherOrg, user]));
    await expect(asTenant(otherOrg, (c) => c.query('SELECT public.review_route_enlist_member($1, $2::uuid, $3, $4, $5)',
      [otherOrg, ROUTE, theirs, 'reviewer', 1]))).rejects.toThrow(/is not an open route of organization/);
    expect(await routeRow(theirs)).toMatchObject({ review_role: null });
  });
});
