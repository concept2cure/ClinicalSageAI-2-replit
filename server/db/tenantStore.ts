/**
 * Tenant scope — AsyncLocalStorage propagation of the active tenant for the
 * current request, job, or script.
 *
 * PR A of the RLS rollout uses this store strictly for *observability*: pool
 * instrumentation reads the store and counts queries that ran without one.
 * No DB behavior changes here. PR B (the policy migration) will rely on the
 * same store to populate `app.current_tenant_id` on every connection.
 *
 * The store is established by:
 *   - `requireTenantContext` middleware (request scope)
 *   - `withTenantConnection(opts, fn)` (workers, cron, scripts — also
 *     acquires a dedicated client with the session vars set)
 *
 * Reading: `getTenantScope()` returns the current scope, or `undefined` when
 * code is running outside a tenant boundary (legitimate cases: health checks,
 * migrations, super-admin tooling).
 */

import { AsyncLocalStorage } from 'async_hooks';

export type TenantScopeSource = 'request' | 'job' | 'cli' | 'test';

export interface TenantScope {
  /**
   * Tenant identifier as a string. For this codebase that is the integer
   * organization id stringified — matches what JWT claims and the existing
   * `set_config('app.current_tenant_id', ...)` call already use.
   */
  tenantId: string;

  /**
   * Optional UUID of the organization. Some surfaces use UUIDs; others use
   * the integer id. Both are accepted by the policy in PR B via OR.
   */
  orgUuid?: string | null;

  /**
   * Resolved role for the actor in the tenant. May be empty for non-request
   * sources. Mirrors `app.current_user_role`.
   */
  role?: string | null;

  /**
   * Where this scope was established. Used for metrics labels — lets us tell
   * "request" coverage from "background job" coverage.
   */
  source: TenantScopeSource;

  /**
   * Free-form caller hint — route path for requests, job name for cron,
   * script filename for one-offs. Used in metrics labels.
   */
  caller?: string;
}

const tenantStorage = new AsyncLocalStorage<TenantScope>();

/**
 * Run `fn` inside a tenant scope. Returns whatever `fn` returns. Used by
 * the request middleware (so `next()` runs in scope) and by
 * `withTenantConnection` (which adds session-var setup on top).
 */
export function runWithTenantScope<T>(scope: TenantScope, fn: () => T): T {
  return tenantStorage.run(scope, fn);
}

/**
 * Read the active tenant scope, or `undefined` if none is set. Pool
 * instrumentation calls this on every query.
 */
export function getTenantScope(): TenantScope | undefined {
  return tenantStorage.getStore();
}

/**
 * Bind a *fresh* property onto the current scope (e.g., `caller` once the
 * route is resolved). No-op if there is no active scope. Returns the
 * updated scope (same identity) for convenience.
 */
export function annotateTenantScope(patch: Partial<Pick<TenantScope, 'caller'>>): TenantScope | undefined {
  const scope = tenantStorage.getStore();
  if (!scope) return undefined;
  if (patch.caller !== undefined) scope.caller = patch.caller;
  return scope;
}
