/**
 * Real-PostgreSQL harness for the `*.dbtest.ts` suite.
 *
 * Provides the two things a tenant-isolation test needs and a mocked pool can
 * never supply: a table carrying the CANONICAL policy this repo installs (the
 * shape migrations/0021_enable_rls_everywhere.sql writes), and a connection as
 * the NON-SUPERUSER runtime role, minted by the real
 * scripts/db/provision-app-role.mjs rather than by a copy of it written for the
 * test. A harness that re-implements the thing under test agrees with itself
 * and not with production.
 *
 * Everything is created inside a disposable schema whose name is unique per
 * run, so the suite is safe against a database that already holds application
 * tables and leaves nothing behind.
 */

import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../scripts/db/provision-app-role.mjs';

/** Password used for the throwaway runtime role. Long enough to clear the script's floor. */
const RUNTIME_ROLE_PASSWORD = 'dbtest-runtime-role-password';

/**
 * The tenant-isolation policy exactly as migrations/0021_enable_rls_everywhere.sql
 * writes it: a shadow-mode bypass clause first, then the tenant match on either
 * session variable, then the super-admin escape hatch.
 *
 * Copied deliberately and pinned by a test that diffs it against the migration
 * (see rls-tenant-isolation.dbtest.ts) — the migration's version is generated
 * inside a PL/pgSQL loop over the live catalog, so it cannot simply be executed
 * against one scratch table.
 */
export function tenantIsolationPolicySql(qualifiedTable: string, tenantColumn = 'organization_id'): string {
  return `
    CREATE POLICY tenant_isolation_policy ON ${qualifiedTable}
    FOR ALL
    USING (
      NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
      OR ${tenantColumn} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
      OR ${tenantColumn} = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
      OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
    )
    WITH CHECK (
      NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
      OR ${tenantColumn} = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
      OR ${tenantColumn} = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
      OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
    )`;
}

export interface ScratchSchema {
  /** Unique schema name holding every object this harness created. */
  readonly schema: string;
  /** Owner/admin pool — the connection migrations and installers use. */
  readonly ownerPool: Pool;
  /** Runtime pool connected as the non-superuser role, or null before provisioning. */
  runtimePool: Pool | null;
  /** Name of the non-superuser runtime role. */
  readonly runtimeRole: string;
  /** Create a tenant-keyed table with RLS + FORCE + the canonical policy. */
  createTenantTable(table: string, tenantColumn?: string): Promise<string>;
  /** Connect as the non-superuser runtime role, provisioning it if needed. */
  connectAsRuntimeRole(): Promise<Pool>;
  /** Drop the schema and close every pool. */
  destroy(): Promise<void>;
}

/**
 * Run `fn` on a client with the given session settings applied, then release it.
 *
 * Session GUCs (`app.rls_enforce`, `app.current_tenant_id`) live on a
 * CONNECTION, not on a pool — which is precisely why production sets
 * `app.rls_enforce` in the startup packet instead of with a SET. A test that
 * ran `SET` through `pool.query` and then asserted through a second
 * `pool.query` could get a different pooled connection and silently test
 * nothing, so scoping is explicit here.
 *
 * The `RESET ALL` pair is load-bearing, not hygiene. `set_config(k, v, false)`
 * sets the value for the whole SESSION, and `release()` returns that session to
 * the pool with the value still on it — so the next checkout inherits the
 * previous test's tenant scope. That is not a hypothetical: the first run of
 * this suite had the "unscoped connection sees nothing" test pass a scoped
 * connection and read a row, because it recycled the client the preceding test
 * had scoped to tenant A. Resetting on both sides makes each block's scope
 * exactly what it declares.
 */
export async function withSession<T>(
  pool: Pool,
  settings: Record<string, string>,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('RESET ALL');
    for (const [key, value] of Object.entries(settings)) {
      // set_config is parameterized; SET is not, and these values include
      // caller-supplied tenant ids.
      await client.query('SELECT set_config($1, $2, false)', [key, value]);
    }
    return await fn(client);
  } finally {
    await client.query('RESET ALL').catch(() => {/* connection may be broken */});
    client.release();
  }
}

/** Build a disposable schema on `databaseUrl` and return handles to it. */
export async function createScratchSchema(databaseUrl: string): Promise<ScratchSchema> {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const schema = `dbtest_${suffix}`;
  const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `dbtest_runtime_${suffix}` });

  const ownerPool = new Pool({ connectionString: databaseUrl, max: 4 });
  await ownerPool.query(`CREATE SCHEMA ${schema}`);

  const state: ScratchSchema = {
    schema,
    ownerPool,
    runtimePool: null,
    runtimeRole,

    async createTenantTable(table, tenantColumn = 'organization_id') {
      const qualified = `${schema}.${table}`;
      await ownerPool.query(`
        CREATE TABLE ${qualified} (
          id              SERIAL PRIMARY KEY,
          ${tenantColumn} INTEGER NOT NULL,
          title           TEXT NOT NULL
        )`);
      await ownerPool.query(`ALTER TABLE ${qualified} ENABLE ROW LEVEL SECURITY`);
      // Without FORCE, the table OWNER skips RLS even as a non-superuser. Every
      // sweep in this repo sets it; the harness must too or the runtime-role
      // assertions below would be measuring the wrong thing.
      await ownerPool.query(`ALTER TABLE ${qualified} FORCE ROW LEVEL SECURITY`);
      await ownerPool.query(tenantIsolationPolicySql(qualified, tenantColumn));
      // Re-grant so a runtime role provisioned earlier can reach a later table.
      if (state.runtimePool) {
        await ownerPool.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ${qualified} TO ${runtimeRole}`
        );
      }
      return qualified;
    },

    async connectAsRuntimeRole() {
      if (state.runtimePool) return state.runtimePool;

      // The REAL provisioning script, not a test-local imitation: this is also
      // the only place in CI where that script executes against a live server.
      const result = await provisionAppServiceRole(ownerPool, {
        env: {
          APP_SERVICE_DB_ROLE: runtimeRole,
          APP_SERVICE_DB_PASSWORD: RUNTIME_ROLE_PASSWORD,
        },
      });
      if (result.skipped) {
        throw new Error('[db-harness] provisionAppServiceRole skipped — the role was not created.');
      }

      // The script grants on the schemas that existed when it ran; the scratch
      // schema is one of them, but its tables are granted explicitly so the
      // harness does not depend on ordering.
      await ownerPool.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole}`);
      await ownerPool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtimeRole}`
      );
      await ownerPool.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtimeRole}`
      );

      const url = new URL(databaseUrl);
      url.username = runtimeRole;
      url.password = RUNTIME_ROLE_PASSWORD;
      state.runtimePool = new Pool({ connectionString: url.toString(), max: 4 });
      return state.runtimePool;
    },

    async destroy() {
      if (state.runtimePool) await state.runtimePool.end();
      await ownerPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      // Roles are cluster-global: leaving one behind would leak between runs.
      await ownerPool.query(
        `REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`
      ).catch(() => {/* role may not have been provisioned */});
      await ownerPool.query(`DROP ROLE IF EXISTS ${runtimeRole}`).catch(() => {});
      await ownerPool.end();
    },
  };

  return state;
}
