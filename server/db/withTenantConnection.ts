/**
 * `withTenantConnection` — acquire a Postgres client, set the tenant
 * session variables on it, run the callback with that client, release.
 *
 * This is the "actually executes RLS-aware queries" version of
 * `withTenant`. Use it from any code path that needs queries to be
 * filtered by the policy installed in 0021_enable_rls_everywhere.sql:
 *
 *   - Background workers / cron jobs (e.g. memory-consolidation-job).
 *   - One-off scripts under `scripts/` that touch tenant data.
 *   - Tests that exercise tenant-scoped behavior end-to-end.
 *
 * Difference from `withTenant`:
 *
 *   withTenant            — ALS only. Sets the AsyncLocalStorage scope so
 *                           pool instrumentation can count coverage. Does
 *                           NOT touch the database. Use when you want the
 *                           observability tag but don't issue queries
 *                           inside the scope (or when queries flow through
 *                           code that already takes its own client).
 *
 *   withTenantConnection  — ALS + a dedicated client where
 *                           app.current_tenant_id, app.current_org_id,
 *                           and app.current_user_role are set. Use when
 *                           you DO issue queries inside and need the RLS
 *                           policy to recognize the scope. Mirrors the
 *                           per-request connection that
 *                           `requireTenantContext` middleware sets up.
 *
 * Super-admin pattern:
 *
 *   For code that legitimately needs to span tenants (admin dashboards,
 *   billing aggregations, the cross-tenant scan in
 *   memory-consolidation-job), pass `role: 'app_super_admin'`. The
 *   policy's super-admin clause (see 0021) makes every row visible to
 *   that role, regardless of tenant id. The tenant id is still required
 *   so the audit trail records WHICH actor invoked the cross-tenant
 *   read.
 */

import type { PoolClient } from 'pg';
import { getPool } from './runtime';
import { runWithTenantScope, type TenantScope, type TenantScopeSource } from './tenantStore';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('with-tenant-connection');

export interface WithTenantConnectionOptions {
  tenantId: string | number;
  orgUuid?: string | null;
  /**
   * Postgres role label written to `app.current_user_role`. Set to
   * `'app_super_admin'` when this scope intentionally spans tenants.
   * Defaults to empty (no super-admin bypass).
   */
  role?: string | null;
  source?: TenantScopeSource;
  caller?: string;
}

export async function withTenantConnection<T>(
  opts: WithTenantConnectionOptions,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const tenantId = String(opts.tenantId);
  if (!tenantId) {
    throw new Error('withTenantConnection: tenantId is required');
  }

  const scope: TenantScope = {
    tenantId,
    orgUuid: opts.orgUuid ?? null,
    role: opts.role ?? null,
    source: opts.source ?? 'job',
    caller: opts.caller,
  };

  const pool = getPool();
  const client = await pool.connect();

  try {
    // Set session vars on the dedicated connection. `false` makes them
    // session-level (persists for the connection's life), matching the
    // pattern in tenantContext middleware. They are cleared in the
    // `finally` below to be safe in case the connection comes back into
    // the pool (it does — release() returns it).
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId]);
    await client.query("SELECT set_config('app.current_org_id', $1, false)", [opts.orgUuid ?? '']);
    await client.query("SELECT set_config('app.current_user_role', $1, false)", [opts.role ?? '']);

    return await runWithTenantScope(scope, () => fn(client));
  } finally {
    try {
      await client.query("SELECT set_config('app.current_tenant_id', '', false)");
      await client.query("SELECT set_config('app.current_org_id', '', false)");
      await client.query("SELECT set_config('app.current_user_role', '', false)");
    } catch (cleanupErr) {
      // Best-effort. If the connection is already broken the release will
      // discard it anyway.
      logger.warn('Failed to clear tenant session vars on release', {
        error: (cleanupErr as Error).message,
      });
    }
    client.release();
  }
}
