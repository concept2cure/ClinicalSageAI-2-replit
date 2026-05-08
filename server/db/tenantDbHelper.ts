/**
 * Tenant database helper — backwards-compatible alias for `requestDb`.
 *
 * History: this module used to return a `TenantDb` class instance that
 * wrapped a SEPARATE `postgres-js` connection (different driver, different
 * pool) and applied tenant filtering by injecting `eq(table.organizationId,
 * orgId)` into every query. In practice the constructor was being called
 * with a string id where it expected a `TenantContext` object, so
 * `this.orgId` was always `undefined` and the filter never engaged —
 * meaning every "tenant-scoped" query was actually unfiltered. The only
 * reason this didn't surface as a security issue was that all the
 * consumers chained Drizzle's API (`.select().from(...).where(...)`)
 * which only worked through the fallback `db` branch.
 *
 * Today: `getDb(req)` returns a Drizzle instance bound to the
 * request-scoped Postgres client (`req.dbClient`) loaded by
 * `requireTenantContext` middleware. Same `pg.Pool` everything else uses
 * — observability counters track it, RLS policy filters it.
 *
 * Existing callers (`tenant-traceability`, `traceability-mapping-routes`,
 * `tenant-quality-validation`, `tenant-ctq-factors`) keep working without
 * any change because they already chain Drizzle methods on the result.
 *
 * Prefer `requestDb(req)` directly for new code — the indirection through
 * this helper exists only to avoid churn in the four legacy route files.
 */

import type { Request } from 'express';
import { requestDb, type RequestDb } from './requestDb';

/**
 * Get a request-scoped Drizzle instance. The returned db routes its
 * queries through the connection that has `app.current_tenant_id` and
 * `app.current_user_role` already set, so the RLS policy from
 * `0021_enable_rls_everywhere.sql` recognises the scope.
 */
export function getDb(req: Request): RequestDb {
  return requestDb(req);
}

/**
 * Return the resolved tenant id for the request, throwing if it is not
 * set. Unchanged from the previous implementation — this guard fires
 * before queries run, so a missing tenant id surfaces as a 500 rather
 * than silently flowing through.
 */
export function ensureTenantId(req: Request): number {
  const fromContext = req.tenantContext?.organizationId;
  const fromTop = (req as Request & { tenantId?: number | string }).tenantId;
  const resolved = fromContext ?? fromTop;
  if (resolved == null || resolved === '') {
    throw new Error('Tenant ID is required but not set in the request');
  }
  return typeof resolved === 'number' ? resolved : Number(resolved);
}
