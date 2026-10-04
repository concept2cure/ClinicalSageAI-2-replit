/**
 * Shared setup for the scheduler dbtests (scheduled-once-lease,
 * scheduler-jobs-under-rls).
 *
 * Production shape, not an approximation of it:
 *   - a freshly minted NOSUPERUSER NOBYPASSRLS runtime role, provisioned by the
 *     real scripts/db/provision-app-role.mjs, reached through APP_DATABASE_URL;
 *   - RLS_ENFORCE=on, so server/db/runtime.ts puts `app.rls_enforce=on` in the
 *     startup packet and instrumentPool fails closed on unscoped access;
 *   - every tenant table carries ENABLE + FORCE ROW LEVEL SECURITY and the
 *     canonical 0021 policy (tests/db/harness.ts tenantIsolationPolicySql).
 *
 * Tables live in a disposable schema that the runtime pool reaches through
 * `search_path` (PGOPTIONS, which runtime.ts forwards alongside the RLS
 * option), so the job code under test runs its unqualified SQL unchanged and a
 * shared CI database is never touched outside that schema.
 *
 * The caller imports server/db/runtime AFTER `setupSchedulerDb` resolves — the
 * pool is built at import time from the environment this function sets.
 */
import { Pool } from 'pg';
import { provisionAppServiceRole, resolveAppServiceRole } from '../../scripts/db/provision-app-role.mjs';
import { tenantIsolationPolicySql } from './harness';

export interface SchedulerDb {
  schema: string;
  runtimeRole: string;
  owner: Pool;
  /** Qualified name of a table in the scratch schema. */
  t(table: string): string;
  destroy(): Promise<void>;
}

const RUNTIME_PASSWORD = 'dbsched-runtime-role-password';

async function provisionWithRetry(owner: Pool, role: string): Promise<void> {
  // Role DDL is cluster-global; a concurrent run elsewhere can race it.
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await provisionAppServiceRole(owner, {
        env: { APP_SERVICE_DB_ROLE: role, APP_SERVICE_DB_PASSWORD: RUNTIME_PASSWORD },
      });
      if (result.skipped) throw new Error('[dbsched] provisionAppServiceRole skipped — no runtime role.');
      return;
    } catch (err) {
      if (attempt >= 5 || !/tuple concurrently updated/.test((err as Error).message)) throw err;
      await new Promise(r => setTimeout(r, 250 * attempt));
    }
  }
}

/**
 * Create the scratch schema, run `ddl` inside it, put the canonical tenant
 * policy on every table in `rlsTables`, mint the runtime role, and point the
 * runtime env at it.
 */
export async function setupSchedulerDb(
  databaseUrl: string,
  prefix: string,
  ddl: string,
  rlsTables: string[],
): Promise<SchedulerDb> {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const schema = `${prefix}_${suffix}`;
  const runtimeRole = resolveAppServiceRole({ APP_SERVICE_DB_ROLE: `${prefix}_rt_${suffix}` });
  const owner = new Pool({ connectionString: databaseUrl, max: 4 });

  await owner.query(`CREATE SCHEMA ${schema}`);
  const c = await owner.connect();
  try {
    await c.query(`SET search_path TO ${schema}`);
    await c.query(ddl);
    for (const table of rlsTables) {
      await c.query(`ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY`);
      await c.query(`ALTER TABLE ${schema}.${table} FORCE ROW LEVEL SECURITY`);
      await c.query(tenantIsolationPolicySql(`${schema}.${table}`));
    }
  } finally {
    await c.query('RESET search_path').catch(() => undefined);
    c.release();
  }

  await provisionWithRetry(owner, runtimeRole);
  await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole}`);
  await owner.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtimeRole}`);
  await owner.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtimeRole}`);

  const runtimeUrl = new URL(databaseUrl);
  runtimeUrl.username = runtimeRole;
  runtimeUrl.password = RUNTIME_PASSWORD;
  process.env.APP_DATABASE_URL = runtimeUrl.toString();
  process.env.RLS_ENFORCE = 'on';
  process.env.PGOPTIONS = `-c search_path=${schema}`;

  return {
    schema,
    runtimeRole,
    owner,
    t: table => `${schema}.${table}`,
    async destroy() {
      await owner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
      for (let attempt = 1; ; attempt++) {
        try {
          await owner.query(`REASSIGN OWNED BY ${runtimeRole} TO CURRENT_USER; DROP OWNED BY ${runtimeRole}`);
          await owner.query(`DROP ROLE IF EXISTS ${runtimeRole}`);
          break;
        } catch (err) {
          if (attempt >= 5) {
            console.warn('[dbsched] runtime role left behind:', (err as Error).message);
            break;
          }
          await new Promise(r => setTimeout(r, 250 * attempt));
        }
      }
      delete process.env.PGOPTIONS;
      await owner.end();
    },
  };
}

/**
 * Poll until `predicate` holds or `timeoutMs` passes. Measured on
 * performance.now(), not Date: a suite that fakes Date freezes Date.now().
 */
export async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (await predicate()) return true;
    await new Promise(r => setTimeout(r, 25));
  }
  return predicate();
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
