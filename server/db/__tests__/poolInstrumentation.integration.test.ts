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
        OR ${col} = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR ${col} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR ${col} = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
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
