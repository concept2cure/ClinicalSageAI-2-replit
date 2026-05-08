/**
 * Integration test for the tenant-isolation policy installed by
 * migrations/0021_enable_rls_everywhere.sql.
 *
 * The migration's CREATE POLICY string is built dynamically from a
 * `format()` call. The shape tests in `rlsMigrationShape.test.ts`
 * verify the string LOOKS right. This test verifies it actually
 * BEHAVES right against a real Postgres:
 *
 *   - Without app.rls_enforce='on' (shadow mode), every row passes.
 *   - With app.rls_enforce='on' and no tenant scope, the table is
 *     effectively empty.
 *   - With app.rls_enforce='on' and app.current_tenant_id matching
 *     a row, that row is visible.
 *   - With app.rls_enforce='on' and app.current_user_role='app_super_admin',
 *     all rows are visible regardless of tenant id.
 *
 * We don't run the actual migration (which scans information_schema and
 * would touch every existing tenant-keyed table). Instead we apply a
 * policy of the same shape to a synthetic table inside a transaction
 * we roll back at the end — so the production schema is never modified.
 *
 * Required infrastructure: a Postgres reachable at DATABASE_URL or
 * TEST_DATABASE_URL. When neither is set, the suite skips with a clear
 * note. The user must have CREATE TABLE / CREATE POLICY privileges on
 * the search-path schema (any throwaway schema works).
 *
 * IMPORTANT: the connecting user must NOT be a SUPERUSER. Postgres
 * BYPASSRLS for superusers regardless of FORCE ROW LEVEL SECURITY, so a
 * superuser test will silently pass the shadow-mode cases and silently
 * fail the enforce cases (all rows visible everywhere). If `SELECT
 * current_setting('is_superuser')` returns 'on', the test is misconfigured.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// `tests/setup.ts` installs a global `vi.mock('pg', ...)` that replaces
// Pool with a stub for every test in the suite. This integration test
// needs the REAL pg driver — without unmocking, client.query() returns
// `undefined` (the mock's vi.fn() default) and every assertion fails
// inscrutably. Unmock has to come before the import.
vi.unmock('pg');

// eslint-disable-next-line import/first
import { Pool, type PoolClient } from 'pg';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const skip = !databaseUrl;
const describeIfDb = skip ? describe.skip : describe;

if (skip) {
  // eslint-disable-next-line no-console
  console.warn(
    '[rls-integration] skipping — set TEST_DATABASE_URL or DATABASE_URL to run'
  );
}

// Same policy template as 0021_enable_rls_everywhere.sql, parameterised on
// table + column name. Must stay byte-equal (modulo identifiers) to the
// migration's CREATE POLICY body — this is the contract the test is
// pinning.
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

describeIfDb('RLS policy — integration', () => {
  let pool: Pool;
  let client: PoolClient;
  const TABLE = `rls_integration_${Date.now()}`;

  beforeAll(async () => {
    try {
      pool = new Pool({ connectionString: databaseUrl });
      client = await pool.connect();

      // Build the synthetic table inside a transaction we keep open for
      // the whole test — afterAll rolls back, so even a crash leaves the
      // schema untouched.
      await client.query('BEGIN');
      await client.query(`
        CREATE TEMP TABLE ${TABLE} (
          id              SERIAL PRIMARY KEY,
          organization_id INTEGER NOT NULL,
          payload         TEXT NOT NULL
        ) ON COMMIT DROP
      `);
      await client.query(`ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE ${TABLE} FORCE ROW LEVEL SECURITY`);
      await client.query(policySql(TABLE, 'organization_id'));

      // Two tenants, one row each. Inserts run BEFORE we set rls_enforce=on,
      // so the WITH CHECK clause's bypass is active and the rows land.
      await client.query(
        `INSERT INTO ${TABLE} (organization_id, payload) VALUES (1, 'tenant-1-row')`
      );
      await client.query(
        `INSERT INTO ${TABLE} (organization_id, payload) VALUES (2, 'tenant-2-row')`
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[rls-integration] beforeAll failed:', err);
      throw err;
    }
  });

  afterAll(async () => {
    if (client) {
      await client.query('ROLLBACK');
      client.release();
    }
    if (pool) {
      await pool.end();
    }
  });

  async function clearSession() {
    await client.query("SELECT set_config('app.rls_enforce', '', false)");
    await client.query("SELECT set_config('app.current_tenant_id', '', false)");
    await client.query("SELECT set_config('app.current_org_id', '', false)");
    await client.query("SELECT set_config('app.current_user_role', '', false)");
  }

  it('shadow mode (rls_enforce unset) — all rows visible', async () => {
    await clearSession();
    const r = await client.query(`SELECT id FROM ${TABLE} ORDER BY id`);
    expect(r.rowCount).toBe(2);
  });

  it('shadow mode with rls_enforce=shadow — still all rows visible', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'shadow', false)");
    const r = await client.query(`SELECT id FROM ${TABLE}`);
    expect(r.rowCount).toBe(2);
  });

  it('rls_enforce=on with no tenant scope — zero rows', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    const r = await client.query(`SELECT id FROM ${TABLE}`);
    expect(r.rowCount).toBe(0);
  });

  it('rls_enforce=on with app.current_tenant_id=1 — only tenant 1 row', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    await client.query("SELECT set_config('app.current_tenant_id', '1', false)");
    const r = await client.query(`SELECT payload FROM ${TABLE}`);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].payload).toBe('tenant-1-row');
  });

  it('rls_enforce=on with app.current_org_id=2 (the other session-var name) — only tenant 2 row', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    await client.query("SELECT set_config('app.current_org_id', '2', false)");
    const r = await client.query(`SELECT payload FROM ${TABLE}`);
    expect(r.rowCount).toBe(1);
    expect(r.rows[0].payload).toBe('tenant-2-row');
  });

  it('rls_enforce=on with app.current_user_role=app_super_admin — all rows', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    await client.query("SELECT set_config('app.current_user_role', 'app_super_admin', false)");
    const r = await client.query(`SELECT id FROM ${TABLE} ORDER BY id`);
    expect(r.rowCount).toBe(2);
  });

  it('rls_enforce=on with mismatching tenant id — zero rows', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    await client.query("SELECT set_config('app.current_tenant_id', '999', false)");
    const r = await client.query(`SELECT id FROM ${TABLE}`);
    expect(r.rowCount).toBe(0);
  });

  it('rls_enforce=on with empty-string tenant id — zero rows (NULLIF guard)', async () => {
    // The NULLIF(..., '') in the policy means an empty string becomes NULL,
    // which never equals an integer, so the row is filtered.
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    await client.query("SELECT set_config('app.current_tenant_id', '', false)");
    const r = await client.query(`SELECT id FROM ${TABLE}`);
    expect(r.rowCount).toBe(0);
  });

  it('WITH CHECK rejects an insert under wrong tenant scope', async () => {
    await clearSession();
    await client.query("SELECT set_config('app.rls_enforce', 'on', false)");
    await client.query("SELECT set_config('app.current_tenant_id', '1', false)");
    // Tenant 1 trying to insert as tenant 2 — must be blocked by WITH CHECK.
    await expect(
      client.query(`INSERT INTO ${TABLE} (organization_id, payload) VALUES (2, 'should-fail')`)
    ).rejects.toThrow(/row-level security/i);
  });
});
