/**
 * Platform scope is a role (P-72 slice 1a): the deploy set runs on a
 * NON-SUPERUSER applier, the pre-auth lookups still answer, no function's SET
 * clause names a custom setting, and organization_users.role refuses the
 * platform role string.
 *
 * Rows D1 (the deploy) and D6 (tenant isolation). Evidence:
 * docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/.
 *
 * PostgreSQL 15 and later refuse a function whose SET clause names a custom
 * setting (`SET app.current_user_role = 'app_super_admin'`) to any creator that
 * is not a superuser. Production's applier is the RDS master, a CREATEROLE
 * non-superuser, so the deploy halted at migrations/20260928_users_membership_rls.sql.
 * CI's applier is a superuser and never showed it. PGlite refuses the same
 * clause to a non-superuser role, so this file applies the files the way the
 * RDS master does: `SET ROLE` to a CREATEROLE role that owns the tables, the
 * schema and the database, and nothing more.
 *
 * Every file is read from disk and applied in the order C2C_MIGRATION_FILES
 * runs it, and replayed, because the applier re-runs every entry on every
 * deploy (CLAUDE.md Rule 1).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { C2C_MIGRATION_FILES } from '../../../scripts/db/migration-set.mjs';

const T = 120_000;
const ROOT = process.cwd();
const ROLE_WRITES = 'migrations/20260926_organization_users_own_writes.sql';
const USERS_RLS = 'migrations/20260928_users_membership_rls.sql';
const INVITATIONS = 'migrations/20260928_invitations_for_member.sql';
const CONVERGE = 'migrations/20261030b_platform_scope_role.sql';

const sql = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The files, in the order the applier runs them: never a hand-kept order. */
function inSetOrder(files: string[]): string[] {
  const ordered = (C2C_MIGRATION_FILES as string[]).filter((f) => files.includes(f));
  expect(ordered, 'every file this case applies is on the applier').toEqual(
    [...files].sort((a, b) => (C2C_MIGRATION_FILES as string[]).indexOf(a) - (C2C_MIGRATION_FILES as string[]).indexOf(b)),
  );
  expect(ordered).toHaveLength(files.length);
  return ordered;
}

/**
 * The tables these files police, as the base schema has them (shared/schema.ts),
 * owned by a CREATEROLE non-superuser that also owns schema public and the
 * database, as the RDS master does. organization_invitations carries the tenant
 * policy the isolation sweep gives it. app_service is the runtime role.
 */
const BASE = `
  CREATE ROLE app_service NOLOGIN;
  CREATE ROLE c2c_test_applier LOGIN NOSUPERUSER CREATEROLE NOBYPASSRLS;
  ALTER DATABASE postgres OWNER TO c2c_test_applier;
  ALTER SCHEMA public OWNER TO c2c_test_applier;
  SET ROLE c2c_test_applier;
  CREATE TABLE public.organizations (id serial PRIMARY KEY, name text NOT NULL);
  CREATE TABLE public.users (
    id serial PRIMARY KEY, email text NOT NULL UNIQUE, name text, password_hash text,
    reset_token text, reset_token_expires_at timestamp
  );
  CREATE TABLE public.organization_users (
    id serial PRIMARY KEY, organization_id integer NOT NULL, user_id integer NOT NULL,
    role text NOT NULL DEFAULT 'member', persona text, UNIQUE (organization_id, user_id)
  );
  CREATE TABLE public.organization_invitations (
    id serial PRIMARY KEY, organization_id integer NOT NULL, user_id integer, email text NOT NULL,
    role text NOT NULL DEFAULT 'member', invited_by_id integer, status text NOT NULL DEFAULT 'pending',
    created_at timestamp NOT NULL DEFAULT now(), responded_at timestamp
  );
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.organization_users, public.organization_invitations TO app_service;
  INSERT INTO public.organizations (id, name) VALUES (7, 'A'), (8, 'B');
  INSERT INTO public.users (id, email, reset_token) VALUES
    (1, 'a-admin@example.invalid', NULL), (2, 'b-admin@example.invalid', 'reset-hash-b'), (3, 'a-legacy@example.invalid', NULL);
  INSERT INTO public.organization_users (organization_id, user_id, role) VALUES
    (7, 1, 'admin'), (8, 2, 'admin'), (7, 3, 'legacy_reviewer');
  INSERT INTO public.organization_invitations (organization_id, user_id, email, role, status, invited_by_id)
    VALUES (7, 2, 'b-admin@example.invalid', 'member', 'pending', 1);
  ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.organization_invitations FORCE ROW LEVEL SECURITY;
  CREATE POLICY tenant_isolation_policy ON public.organization_invitations
    USING (organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer)
    WITH CHECK (organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer);
  RESET ROLE;
`;

const ALL = [ROLE_WRITES, USERS_RLS, INVITATIONS, CONVERGE];

let db: PGlite | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

async function boot(): Promise<PGlite> {
  const d = new PGlite();
  await d.exec(BASE);
  return d;
}

/** Apply `files` as the non-superuser applier, as deploy-migrate does: no session settings. */
async function applyAsApplier(d: PGlite, files: string[]): Promise<void> {
  await d.exec('SET ROLE c2c_test_applier');
  try {
    for (const f of files) {
      try {
        await d.exec(sql(f));
      } catch (error) {
        throw new Error(`${f}: ${(error as Error).message}`, { cause: error });
      }
    }
  } finally {
    await d.exec('RESET ROLE');
  }
}

/** Run `query` as the runtime role with enforcement on, in the given scope, then return to the superuser. */
async function asRuntime<T>(d: PGlite, scope: { tenantId: string; role?: string }, query: string, params: unknown[] = []) {
  await d.exec('SET ROLE app_service');
  try {
    await d.query(
      `SELECT set_config('app.rls_enforce', 'on', false), set_config('app.current_tenant_id', $1, false),
              set_config('app.current_user_role', $2, false), set_config('app.current_account_id', '', false)`,
      [scope.tenantId, scope.role ?? ''],
    );
    return (await d.query<T>(query, params)).rows;
  } finally {
    await d.exec(`RESET ROLE; SELECT set_config('app.rls_enforce', '', false), set_config('app.current_tenant_id', '', false),
                  set_config('app.current_user_role', '', false)`);
  }
}

/** Every policy on the three tables, the three functions and the role check, by name and content (no oids). */
async function catalog(d: PGlite) {
  const policies = await d.query<{ k: string }>(
    `SELECT c.relname || '.' || p.polname || ':' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
            coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') AS k
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname IN ('users', 'organization_users', 'organization_invitations') ORDER BY 1`,
  );
  const functions = await d.query<{ k: string }>(
    `SELECT p.oid::regprocedure::text || ':' || pg_get_userbyid(p.proowner) || ':' ||
            coalesce(array_to_string(p.proconfig, ','), '') || ':' || md5(p.prosrc) || ':' || coalesce(p.proacl::text, '') AS k
       FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1`,
  );
  const constraints = await d.query<{ k: string }>(
    `SELECT conname || ':' || pg_get_constraintdef(oid) || ':' || convalidated AS k FROM pg_constraint
      WHERE conrelid = 'public.organization_users'::regclass ORDER BY 1`,
  );
  return { policies: policies.rows.map((r) => r.k), functions: functions.rows.map((r) => r.k), constraints: constraints.rows.map((r) => r.k) };
}

async function lookupOwners(d: PGlite) {
  return (await d.query<{ fn: string; owner: string; config: string[] | null }>(
    `SELECT p.oid::regprocedure::text AS fn, pg_get_userbyid(p.proowner) AS owner, p.proconfig AS config
       FROM pg_proc p WHERE p.proname IN ('user_id_for_email', 'user_id_for_reset_token', 'invitations_for_member')
      ORDER BY 1`,
  )).rows;
}

describe('the deploy set on a non-superuser applier (D1, P-72 slice 1a)', () => {
  it('applies the three creators and the converge file, and a replay changes nothing', async () => {
    db = await boot();
    // The creators first: the step at which the RDS master's deploy halted ("permission denied to set parameter").
    await applyAsApplier(db, inSetOrder([ROLE_WRITES, USERS_RLS, INVITATIONS]));
    const files = inSetOrder(ALL);
    await applyAsApplier(db, [CONVERGE]);
    const first = await catalog(db);
    await applyAsApplier(db, files);
    const second = await catalog(db);
    await applyAsApplier(db, files);
    expect(await catalog(db)).toEqual(second);
    expect(second).toEqual(first);

    expect(await lookupOwners(db)).toEqual([
      { fn: 'invitations_for_member(integer)', owner: 'c2c_platform_scope', config: ['search_path=pg_catalog, public'] },
      { fn: 'user_id_for_email(text)', owner: 'c2c_platform_scope', config: ['search_path=pg_catalog, public'] },
      { fn: 'user_id_for_reset_token(text)', owner: 'c2c_platform_scope', config: ['search_path=pg_catalog, public'] },
    ]);
    const role = (await db.query<Record<string, boolean>>(
      `SELECT rolcanlogin, rolsuper, rolinherit, rolbypassrls,
              pg_has_role('app_service', 'c2c_platform_scope', 'MEMBER') AS runtime_member,
              has_column_privilege('c2c_platform_scope', 'public.users', 'password_hash', 'SELECT') AS reads_password_hash,
              has_table_privilege('c2c_platform_scope', 'public.users', 'UPDATE') AS updates_users,
              has_schema_privilege('c2c_platform_scope', 'public', 'CREATE') AS creates_in_public
         FROM pg_roles WHERE rolname = 'c2c_platform_scope'`,
    )).rows[0];
    expect(role).toEqual({
      rolcanlogin: false, rolsuper: false, rolinherit: false, rolbypassrls: false, runtime_member: false,
      reads_password_hash: false, updates_users: false, creates_in_public: false,
    });
  }, T);

  it('answers sign-in, password-reset and invitation lookups for the runtime role, and nothing else', async () => {
    db = await boot();
    await applyAsApplier(db, inSetOrder(ALL));
    // The pre-auth scope: tenant '0', no role, no bound account.
    const preAuth = { tenantId: '0' };
    expect(await asRuntime(db, preAuth, `SELECT public.user_id_for_email('b-admin@example.invalid') AS id`)).toEqual([{ id: 2 }]);
    expect(await asRuntime(db, preAuth, `SELECT public.user_id_for_email('nobody@example.invalid') AS id`)).toEqual([{ id: null }]);
    expect(await asRuntime(db, preAuth, `SELECT public.user_id_for_reset_token('reset-hash-b') AS id`)).toEqual([{ id: 2 }]);
    expect(await asRuntime(db, preAuth, `SELECT public.user_id_for_reset_token(NULL) AS id`)).toEqual([{ id: null }]);
    // The lookups answer with the id only; the pre-auth scope itself still reads no row of users.
    expect(await asRuntime(db, preAuth, 'SELECT count(*)::int AS n FROM public.users')).toEqual([{ n: 0 }]);
    // An invitee finds the invitation another organization sent, from their own organization only.
    expect(await asRuntime(db, { tenantId: '8', role: 'admin' },
      'SELECT organization_id, status FROM public.invitations_for_member(2)')).toEqual([{ organization_id: 7, status: 'pending' }]);
    expect(await asRuntime(db, { tenantId: '7', role: 'admin' },
      'SELECT organization_id FROM public.invitations_for_member(2)')).toEqual([]);
    // The runtime role holds no path to the owner (PGlite's session user is its bootstrap superuser, so SET ROLE
    // itself is measured on PostgreSQL 16 as the app_service login: evidence 61-preauth-*.json).
    expect((await db.query(`SELECT pg_has_role('app_service', 'c2c_platform_scope', 'MEMBER') AS m`)).rows).toEqual([{ m: false }]);
  }, T);

  it('converges a database whose stored lookups still carry the custom SET clause', async () => {
    db = await boot();
    await applyAsApplier(db, inSetOrder(ALL));
    // What a deploy before 2026-10-30 left behind, where a creator did not run again: the two with
    // SET app.current_user_role (a superuser could create that; the RDS master never could).
    await db.exec(`
      CREATE OR REPLACE FUNCTION public.user_id_for_email(p_email text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public SET app.current_user_role = 'app_super_admin'
        AS $b$ SELECT id FROM public.users WHERE email = p_email $b$;
      CREATE OR REPLACE FUNCTION public.user_id_for_reset_token(p_token_hash text) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = pg_catalog, public SET app.current_user_role = 'app_super_admin'
        AS $b$ SELECT id FROM public.users WHERE reset_token = p_token_hash AND p_token_hash IS NOT NULL $b$;
    `);
    const stale = await lookupOwners(db);
    expect(stale.filter((o) => (o.config ?? []).some((c) => c.startsWith('app.')))).toHaveLength(2);
    const storedText = `SELECT proname, prosrc, prosecdef, proacl::text AS acl FROM pg_proc
                         WHERE proname IN ('user_id_for_email', 'user_id_for_reset_token') ORDER BY proname`;
    const before = (await db.query(storedText)).rows;
    await applyAsApplier(db, [CONVERGE]); // the converge file alone, as the non-superuser applier
    expect(await lookupOwners(db)).toEqual([
      { fn: 'invitations_for_member(integer)', owner: 'c2c_platform_scope', config: ['search_path=pg_catalog, public'] },
      { fn: 'user_id_for_email(text)', owner: 'c2c_platform_scope', config: ['search_path=pg_catalog, public'] },
      { fn: 'user_id_for_reset_token(text)', owner: 'c2c_platform_scope', config: ['search_path=pg_catalog, public'] },
    ]);
    // Re-created from its own stored text: body, SECURITY DEFINER and grants unchanged; only the clause is gone.
    expect((await db.query(storedText)).rows).toEqual(before);
    const converged = await catalog(db);
    await applyAsApplier(db, [CONVERGE]);
    expect(await catalog(db)).toEqual(converged);
    expect(await asRuntime(db, { tenantId: '0' }, `SELECT public.user_id_for_email('a-admin@example.invalid') AS id`)).toEqual([{ id: 1 }]);
  }, T);
});

describe('the deploy refuses what would bring the regression back', () => {
  it('fails on any function whose SET clause names a custom setting, whoever created it', async () => {
    db = await boot();
    await applyAsApplier(db, inSetOrder(ALL));
    // A superuser can still create one; the next deploy must name it and stop.
    await db.exec(`CREATE FUNCTION public.p72_probe_sets_a_setting() RETURNS integer LANGUAGE sql
                     SET search_path = pg_catalog SET app.rls_enforce = 'off' AS 'SELECT 1'`);
    await expect(applyAsApplier(db, [CONVERGE])).rejects.toThrow(
      /SET clause names a custom setting: function p72_probe_sets_a_setting\(\) sets app\.rls_enforce/,
    );
  }, T);

  it('fails if the runtime role is a member of c2c_platform_scope', async () => {
    db = await boot();
    await applyAsApplier(db, inSetOrder(ALL));
    await db.exec('GRANT c2c_platform_scope TO app_service');
    await expect(applyAsApplier(db, [CONVERGE])).rejects.toThrow(/app_service is a member of c2c_platform_scope/);
  }, T);

  it('fails if a policy the lookups read does not admit their owner', async () => {
    db = await boot();
    await applyAsApplier(db, inSetOrder(ALL));
    // As if a creator lost the arm: the lookups, owned by the role, would answer NULL and sign-in would find no one.
    await db.exec(`ALTER POLICY users_member_read ON public.users USING (id = 0)`);
    await expect(applyAsApplier(db, [CONVERGE])).rejects.toThrow(/no read policy on public\.users admits c2c_platform_scope/);
  }, T);
});

describe('organization_users.role refuses the platform role string (D6, P-72 slice 1a)', () => {
  async function setRole(d: PGlite, userId: number, role: string, scope?: { tenantId: string; role?: string }) {
    const statement = `UPDATE public.organization_users SET role = '${role}' WHERE user_id = ${userId}`;
    if (scope) return asRuntime(d, scope, `${statement} RETURNING role`);
    return (await d.query(`${statement} RETURNING role`)).rows;
  }

  it('admits every assignable role and the values rows already hold, and never app_super_admin', async () => {
    db = await boot();
    await applyAsApplier(db, inSetOrder([ROLE_WRITES]));
    const check = (await db.query<{ def: string; valid: boolean }>(
      `SELECT pg_get_constraintdef(oid) AS def, convalidated AS valid FROM pg_constraint
        WHERE conrelid = 'public.organization_users'::regclass AND conname = 'organization_users_role_known'`)).rows;
    expect(check).toHaveLength(1);
    expect(check[0].valid).toBe(true);
    expect(check[0].def).toContain(`'legacy_reviewer'::text`);
    expect(check[0].def).not.toContain('app_super_admin');

    // An administrator's assignments still land (shared/constants/org-roles.ts ASSIGNABLE_ORG_ROLES).
    for (const role of ['admin', 'approver', 'manager', 'reviewer', 'member', 'viewer']) {
      expect(await setRole(db, 3, role, { tenantId: '7', role: 'admin' })).toEqual([{ role }]);
    }
    // Refused from every writer: the superuser, and the slice-0 self-grant (tenant A's scope carrying the string,
    // which the staff-role trigger lets through because it reads the setting).
    await expect(setRole(db, 1, 'app_super_admin')).rejects.toThrow(/organization_users_role_known/);
    await expect(setRole(db, 1, 'app_super_admin', { tenantId: '7', role: 'app_super_admin' }))
      .rejects.toThrow(/organization_users_role_known/);
    await expect(setRole(db, 1, ' APP_SUPER_ADMIN', { tenantId: '7', role: 'admin' })).rejects.toThrow(/organization_users_role_known/);
    await expect(db.query(`INSERT INTO public.organization_users (organization_id, user_id, role) VALUES (8, 1, 'app_super_admin')`))
      .rejects.toThrow(/organization_users_role_known/);
    // A value no list names is refused too.
    await expect(setRole(db, 1, 'owner_of_everything')).rejects.toThrow(/organization_users_role_known/);
  }, T);

  it('keeps a database whose rows already hold the platform role deployable, and refuses to keep the value', async () => {
    db = await boot();
    await db.exec(`INSERT INTO public.users (id, email) VALUES (4, 'minted@example.invalid');
                   INSERT INTO public.organization_users (organization_id, user_id, role) VALUES (8, 4, 'app_super_admin')`);
    await applyAsApplier(db, inSetOrder([ROLE_WRITES]));
    const state = async () => (await db!.query<{ def: string; valid: boolean }>(
      `SELECT pg_get_constraintdef(oid) AS def, convalidated AS valid FROM pg_constraint
        WHERE conrelid = 'public.organization_users'::regclass AND conname = 'organization_users_role_known'`)).rows[0];
    expect((await state()).valid).toBe(false);
    expect((await state()).def).not.toContain('app_super_admin');
    // The row cannot be written keeping the value; correcting it works; other rows are untouched.
    await expect(db.query(`UPDATE public.organization_users SET persona = 'qa' WHERE user_id = 4`)).rejects.toThrow(/organization_users_role_known/);
    expect(await setRole(db, 3, 'member', { tenantId: '7', role: 'admin' })).toEqual([{ role: 'member' }]);
    expect(await setRole(db, 4, 'admin')).toEqual([{ role: 'admin' }]);
    // The next deploy validates it.
    await applyAsApplier(db, inSetOrder([ROLE_WRITES]));
    expect((await state()).valid).toBe(true);
  }, T);
});
