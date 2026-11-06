/**
 * Integration test for the tenant-scope enforcement PRIMITIVE added to
 * instrumentPool (server/db/poolInstrumentation.ts).
 *
 * `rlsPolicy.integration.test.ts` proves the 0021 policy filters correctly when
 * the session vars are set *by hand*. THIS test proves the primitive actually
 * sets them from the AsyncLocalStorage scope, end-to-end, over a real pooled
 * connection — and, most importantly, that the transaction-LOCAL `set_config`
 * does NOT leak a tenant onto a reused pooled connection (the one catastrophic
 * failure mode). Queries run through the shared `pool.query` with ZERO manual
 * set_config; the only tenant signal is `runWithTenantScope`.
 *
 * Runs only where a real non-superuser-capable Postgres is reachable (CI's
 * Integration Tests job). Skips with a note otherwise. Superuser BYPASSRLS, so
 * the pool connects then `SET ROLE`s into a throwaway non-superuser role.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.unmock('pg');

import { Pool } from 'pg';
import { instrumentPool } from '../poolInstrumentation';
import { buildRlsStartupOptions } from '../rlsEnforcement';
import { runWithTenantScope } from '../tenantStore';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const isSentinelTestUrl =
  databaseUrl === 'postgresql://test:test@localhost:5432/test' &&
  !process.env.RUN_INTEGRATION_TESTS;
const skip = !databaseUrl || isSentinelTestUrl;
const describeIfDb = skip ? describe.skip : describe;

if (skip) {
  console.warn('[pool-primitive-integration] skipping — set TEST_DATABASE_URL or DATABASE_URL to run');
}

// Byte-equal (modulo identifiers) to migrations/0021_enable_rls_everywhere.sql.
function policySql(table: string, col: string): string {
  return `
    CREATE POLICY tenant_isolation_policy ON ${table}
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR ${col} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR ${col} = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR ${col} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR ${col} = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
  `;
}

describeIfDb('pool-instrumentation tenant-scope primitive — integration', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const TABLE = `rls_prim_int_${suffix}`;
  const ROLE = `rls_prim_role_${suffix}`;
  let setupPool: Pool; // superuser: DDL + fixtures + cleanup
  let pool: Pool; // instrumented, SET ROLE non-superuser, rls_enforce=on
  const prevEnforce = process.env.RLS_ENFORCE;

  beforeAll(async () => {
    setupPool = new Pool({ connectionString: databaseUrl });
    // Committed fixtures (NOT a temp table) so the instrumented pool's separate
    // connections can see them.
    await setupPool.query(`CREATE TABLE ${TABLE} (id SERIAL PRIMARY KEY, organization_id INTEGER NOT NULL, payload TEXT NOT NULL)`);
    await setupPool.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
    await setupPool.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);
    await setupPool.query(policySql(TABLE, 'organization_id'));
    await setupPool.query(`INSERT INTO ${TABLE} (organization_id, payload) VALUES (1, 'tenant-1-row'), (2, 'tenant-2-row')`);
    // Throwaway non-superuser role; grant table access so it can read/write
    // (RLS still filters — the role is not the table owner).
    await setupPool.query(`CREATE ROLE ${ROLE} NOLOGIN`);
    await setupPool.query(`GRANT SELECT, INSERT ON ${TABLE} TO ${ROLE}`);
    await setupPool.query(`GRANT USAGE, SELECT ON SEQUENCE ${TABLE}_id_seq TO ${ROLE}`);

    // The primitive only activates when RLS_ENFORCE=on (read at query time).
    process.env.RLS_ENFORCE = 'on';

    // max:1 → every query reuses the single physical connection, so the
    // no-leak assertion is meaningful.
    pool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      // Both settings complete during the PostgreSQL startup handshake, before
      // the pool can expose the client to the first application query.
      options: buildRlsStartupOptions(process.env, `-c role=${ROLE}`),
    } as any);
    instrumentPool(pool); // the primitive under test
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (setupPool) {
      await setupPool.query(`DROP TABLE IF EXISTS ${TABLE}`);
      await setupPool.query(`DROP ROLE IF EXISTS ${ROLE}`);
      await setupPool.end();
    }
    if (prevEnforce === undefined) delete process.env.RLS_ENFORCE;
    else process.env.RLS_ENFORCE = prevEnforce;
  });

  it('exposes RLS enforcement to the first query on concurrent startup connections', async () => {
    const concurrent = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: buildRlsStartupOptions({ NODE_ENV: 'production', RLS_ENFORCE: 'on' }),
    } as any);
    try {
      const results = await Promise.all(Array.from({ length: 8 }, () =>
        concurrent.query("SELECT current_setting('app.rls_enforce', true) AS mode"),
      ));
      expect(results.every(result => result.rows[0]?.mode === 'on')).toBe(true);
    } finally {
      await concurrent.end();
    }
  });

  it('rejects malformed startup options before application SQL executes', async () => {
    const malformed = new Pool({ connectionString: databaseUrl, max: 1, options: '-c' } as any);
    try {
      await expect(malformed.query('SELECT 1')).rejects.toBeDefined();
    } finally {
      await malformed.end().catch(() => undefined);
    }
  });

  it('scope tenant 1 → sees only tenant-1 rows (vars applied automatically)', async () => {
    const rows = await runWithTenantScope(
      { tenantId: '1', source: 'job', caller: 'test' },
      () => pool.query(`SELECT payload FROM ${TABLE}`),
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].payload).toBe('tenant-1-row');
  });

  it('scope tenant 2 → sees only tenant-2 rows', async () => {
    const rows = await runWithTenantScope(
      { tenantId: '2', source: 'job', caller: 'test' },
      () => pool.query(`SELECT payload FROM ${TABLE}`),
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].payload).toBe('tenant-2-row');
  });

  it('super-admin scope → sees all rows', async () => {
    const rows = await runWithTenantScope(
      { tenantId: '0', role: 'app_super_admin', source: 'job', caller: 'test' },
      () => pool.query(`SELECT id FROM ${TABLE} ORDER BY id`),
    );
    expect(rows.rowCount).toBe(2);
  });

  it('NO-LEAK: rejects an unscoped query after scoped connection reuse', async () => {
    // Tenant 2 scope populates current_tenant_id LOCAL to its micro-transaction.
    await runWithTenantScope(
      { tenantId: '2', source: 'job', caller: 'test' },
      () => pool.query(`SELECT id FROM ${TABLE}`),
    );
    // Missing tenant context is rejected before SQL reaches the reused
    // connection; callers cannot mistake an empty RLS result for authorized
    // access or execute a policy-misconfigured table unscoped.
    await expect(pool.query(`SELECT id FROM ${TABLE}`)).rejects.toThrow(
      /requires an active tenant scope/,
    );
  });

  it('NO-LEAK: reused connection switches from tenant 2 to tenant 1', async () => {
    await runWithTenantScope(
      { tenantId: '2', source: 'job', caller: 'test' },
      () => pool.query(`SELECT id FROM ${TABLE}`),
    );
    const tenantOne = await runWithTenantScope(
      { tenantId: '1', source: 'job', caller: 'test' },
      () => pool.query(`SELECT organization_id FROM ${TABLE}`),
    );
    expect(tenantOne.rows).toEqual([{ organization_id: 1 }]);
  });

  it('WITH CHECK rejects an insert under a mismatched tenant scope', async () => {
    await expect(
      runWithTenantScope(
        { tenantId: '1', source: 'job', caller: 'test' },
        () => pool.query(`INSERT INTO ${TABLE} (organization_id, payload) VALUES (2, 'should-fail')`),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

// Actual private-profile creators, on a separate disposable database. This does
// not migrate the shared fixture used by the live browser or alter app_service.
const ownerDatabaseUrl = process.env.DATABASE_OWNER_URL;
const appDatabaseUrl = process.env.APP_DATABASE_URL;
const describePrivateOwner = ownerDatabaseUrl && appDatabaseUrl ? describe : describe.skip;

describePrivateOwner('private profiles — native app_service owner boundary', () => {
  const databaseName = `private_profiles_${process.pid}_${Date.now()}`;
  const tables = ['user_intelligence_profiles', 'ana_relational_profiles'] as const;
  const creators = ['migrations/0013_ana_intelligence_system.sql', 'migrations/20260612_ana_relational_external_intel.sql'];
  let admin: Pool;
  let owner: Pool;
  let runtime: Pool;
  let sessions: Pool;
  let creatorSql: string[];
  const previousEnforce = process.env.RLS_ENFORCE;
  const asOwner = (accountId: number | null, sql: string, organizationId = 1) => runWithTenantScope(
    { tenantId: String(organizationId), accountId, source: 'request', caller: 'native-private-profile-proof' },
    () => runtime.query(sql),
  );

  beforeAll(async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    creatorSql = await Promise.all(creators.map(file => readFile(resolve(process.cwd(), file), 'utf8')));
    admin = new Pool({ connectionString: ownerDatabaseUrl, max: 1 });
    await admin.query(`CREATE DATABASE ${databaseName}`);
    const ownerUrl = new URL(ownerDatabaseUrl!);
    const runtimeUrl = new URL(appDatabaseUrl!);
    ownerUrl.pathname = `/${databaseName}`;
    runtimeUrl.pathname = `/${databaseName}`;
    owner = new Pool({ connectionString: ownerUrl.toString(), max: 1 });
    await owner.query('CREATE TABLE organizations(id integer PRIMARY KEY); CREATE TABLE users(id integer PRIMARY KEY); CREATE TABLE projects(id integer PRIMARY KEY)');
    await owner.query('INSERT INTO organizations VALUES(1),(2); INSERT INTO users VALUES(7),(8),(9); INSERT INTO projects VALUES(1)');
    for (const sql of creatorSql) await owner.query(sql);
    await owner.query("INSERT INTO user_intelligence_profiles(user_id,organization_id,personal_instructions) VALUES(7,1,'owner-seven-secret'),(8,1,'owner-eight-secret'),(9,2,'other-tenant-secret')");
    await owner.query("INSERT INTO ana_relational_profiles(user_id,organization_id,profile_summary) VALUES(7,1,'owner-seven-secret'),(8,1,'owner-eight-secret'),(9,2,'other-tenant-secret')");
    const appRole = decodeURIComponent(runtimeUrl.username);
    if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error('Invalid fixture runtime role');
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${appRole}; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`);
    process.env.RLS_ENFORCE = 'on';
    const options = buildRlsStartupOptions({ NODE_ENV: 'production', RLS_ENFORCE: 'on' });
    const runtimeConfig = { connectionString: runtimeUrl.toString(), max: 1, options };
    sessions = new Pool(runtimeConfig);
    runtime = new Pool(runtimeConfig);
    instrumentPool(runtime);
  }, 30000);

  afterAll(async () => {
    await runtime?.end();
    await sessions?.end();
    await owner?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
      await admin.end();
    }
    if (previousEnforce === undefined) delete process.env.RLS_ENFORCE;
    else process.env.RLS_ENFORCE = previousEnforce;
  });

  it('uses a real non-superuser, non-bypass runtime role and FORCE RLS', async () => {
    const role = await asOwner(7, 'SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
    expect(role.rows[0]).toMatchObject({ current_user: 'app_service', rolsuper: false, rolbypassrls: false });
    const state = await owner.query('SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname=ANY($1)', [tables]);
    expect(state.rows).toHaveLength(2);
    expect(state.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it.each(tables)('%s admits only its owner within the tenant, including trusted owner-targeted reads', async table => {
    expect((await asOwner(7, `SELECT user_id FROM ${table} ORDER BY user_id`)).rows).toEqual([{ user_id: 7 }]);
    expect((await asOwner(8, `SELECT user_id FROM ${table} ORDER BY user_id`)).rows).toEqual([{ user_id: 8 }]);
    expect((await runWithTenantScope({ tenantId: '1', accountId: 7, source: 'job', caller: 'trusted-owner-target' }, () => runtime.query(`SELECT user_id FROM ${table}`))).rows).toEqual([{ user_id: 7 }]);
    expect((await asOwner(7, `SELECT user_id FROM ${table}`, 2)).rows).toEqual([]);
    expect((await asOwner(9, `SELECT user_id FROM ${table}`, 2)).rows).toEqual([{ user_id: 9 }]);
  });

  it.each(tables)('%s refuses same-tenant forged writes and owner reassignment', async table => {
    expect((await asOwner(7, `UPDATE ${table} SET organization_id=1 WHERE user_id=8`)).rowCount).toBe(0);
    expect((await asOwner(7, `DELETE FROM ${table} WHERE user_id=8`)).rowCount).toBe(0);
    await expect(asOwner(7, `INSERT INTO ${table}(user_id,organization_id) VALUES(8,1)`)).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(7, `INSERT INTO ${table}(user_id,organization_id) VALUES(8,2)`)).rejects.toMatchObject({ code: '42501' });
    await expect(asOwner(7, `UPDATE ${table} SET user_id=8 WHERE user_id=7`)).rejects.toMatchObject({ code: '42501' });
    expect((await asOwner(7, `UPDATE ${table} SET updated_at=now() WHERE user_id=7`)).rowCount).toBe(1);
  });

  it.each(tables)('%s denies unknown/missing owners after pooled connection reuse', async table => {
    const first = await asOwner(7, `SELECT pg_backend_pid() AS pid, user_id FROM ${table}`);
    const second = await asOwner(8, `SELECT pg_backend_pid() AS pid, user_id FROM ${table}`);
    expect(first.rows[0].pid).toBe(second.rows[0].pid);
    expect(second.rows[0].user_id).toBe(8);
    expect((await asOwner(null, `SELECT user_id FROM ${table}`)).rows).toEqual([]);
    expect((await asOwner(999, `SELECT user_id FROM ${table}`)).rows).toEqual([]);
    const unbound = await asOwner(null, "SELECT current_setting('app.current_account_id',true) AS owner");
    expect(unbound.rows).toEqual([{ owner: '' }]);
  });

  it('session-level owner is cleared before the next borrower of the physical connection', async () => {
    const { applySessionScope, clearSessionScope } = await import('../sessionScope');
    const client = await sessions.connect();
    let firstPid: number;
    try {
      await applySessionScope(client, { tenantId: '1', accountId: 7 });
      const result = await client.query('SELECT pg_backend_pid() AS pid,user_id FROM ana_relational_profiles');
      firstPid = result.rows[0].pid;
      expect(result.rows[0].user_id).toBe(7);
      await clearSessionScope(client);
    } finally { client.release(); }
    const reused = await sessions.connect();
    try {
      const result = await reused.query("SELECT pg_backend_pid() AS pid, current_setting('app.current_account_id',true) AS owner");
      expect(result.rows).toEqual([{ pid: firstPid!, owner: '' }]);
      expect((await reused.query('SELECT user_id FROM ana_relational_profiles')).rows).toEqual([]);
      await applySessionScope(reused, { tenantId: '1', accountId: 8 });
      expect((await reused.query('SELECT user_id FROM ana_relational_profiles')).rows).toEqual([{ user_id: 8 }]);
      await clearSessionScope(reused);
    } finally { reused.release(); }
  });

  it.each(tables)('%s cannot OR-bypass owner privacy through permissive policies, switches or the platform role', async table => {
    await owner.query(`CREATE POLICY broad_legacy_tenant_read ON ${table} USING(true) WITH CHECK(true)`);
    expect((await asOwner(7, `SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: 7 }]);
    const client = await sessions.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant_id','1',false),set_config('app.current_account_id','7',false),set_config('app.current_user_role','app_super_admin',false),set_config('app.rls_enforce','off',false)");
      expect((await client.query(`SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: 7 }]);
      await client.query("SELECT set_config('app.current_tenant_id','0',false),set_config('app.current_account_id','',false),set_config('app.current_user_role','app_super_admin',false),set_config('app.rls_enforce','off',false)");
      expect((await client.query(`SELECT user_id FROM ${table}`)).rows).toEqual([]);
    } finally {
      const { clearSessionScope } = await import('../sessionScope');
      await clearSessionScope(client);
      client.release();
    }
  });

  it('actual creators replay twice and restore disabled RLS and drifted owner expressions without rewriting data', async () => {
    for (const table of tables) {
      await owner.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY; ALTER TABLE ${table} NO FORCE ROW LEVEL SECURITY; ALTER POLICY ${table}_owner_boundary ON ${table} USING(true) WITH CHECK(true)`);
    }
    for (let replay = 0; replay < 2; replay++) for (const sql of creatorSql) await owner.query(sql);
    for (const table of tables) {
      expect((await asOwner(7, `SELECT user_id FROM ${table}`)).rows).toEqual([{ user_id: 7 }]);
      expect((await asOwner(null, `SELECT user_id FROM ${table}`)).rows).toEqual([]);
      expect((await owner.query(`SELECT count(*)::integer AS n FROM ${table}`)).rows).toEqual([{ n: 3 }]);
    }
    const state = await owner.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname=ANY($1)', [tables]);
    expect(state.rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
});
