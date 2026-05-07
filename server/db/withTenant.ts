/**
 * `withTenant` — establish a tenant scope for code that does NOT run inside
 * an HTTP request. Use this in:
 *
 *   - Cron jobs / scheduled work (e.g., periodicReview, memory-consolidation-job)
 *   - Background workers
 *   - One-off scripts under `scripts/` that issue tenant-scoped queries
 *   - Tests that exercise tenant-keyed code paths
 *
 * Example:
 *
 *   await withTenant(
 *     { tenantId: '42', source: 'job', caller: 'periodicReview' },
 *     async () => {
 *       // every query issued from inside this callback runs with the
 *       // tenant scope set, so the eventual RLS policy will match.
 *       await runReview();
 *     }
 *   );
 *
 * PR A: this only sets the AsyncLocalStorage scope. The pool instrumentation
 * reads it for observability. PR B will additionally have the pool emit
 * `set_config('app.current_tenant_id', ...)` from this scope so the policy
 * actually filters.
 */

import { runWithTenantScope, type TenantScope, type TenantScopeSource } from './tenantStore';

export interface WithTenantOptions {
  /** Stringified tenant id. Pass the integer organization id as a string. */
  tenantId: string | number;
  /** Optional org UUID, if the caller has it. */
  orgUuid?: string | null;
  /** Optional role for `app.current_user_role`. */
  role?: string | null;
  /** Where this scope is being established from. Defaults to 'job'. */
  source?: TenantScopeSource;
  /** Job name, script name, etc. Surfaced in observability metrics. */
  caller?: string;
}

export function withTenant<T>(opts: WithTenantOptions, fn: () => Promise<T>): Promise<T>;
export function withTenant<T>(opts: WithTenantOptions, fn: () => T): T;
export function withTenant<T>(opts: WithTenantOptions, fn: () => T | Promise<T>): T | Promise<T> {
  const tenantId = String(opts.tenantId);
  if (!tenantId) {
    throw new Error('withTenant: tenantId is required');
  }

  const scope: TenantScope = {
    tenantId,
    orgUuid: opts.orgUuid ?? null,
    role: opts.role ?? null,
    source: opts.source ?? 'job',
    caller: opts.caller,
  };

  return runWithTenantScope(scope, fn);
}
