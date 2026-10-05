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

  /**
   * The one account a pre-auth scope may act as, once the server has
   * established it: from a verified token, a server-signed challenge, or the
   * account found for this sign-in. Mirrors `app.current_account_id`, which the
   * `public.users` policy admits in place of the whole table (D3, 2026-10-04;
   * migrations/20260928_users_membership_rls.sql). Set only through
   * `bindPreAuthAccount` or `runAsAccount`.
   */
  accountId?: number | null;
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

/** Explicit scope for audited estate-wide schedulers and workers. */
export function runWithSystemTenantScope<T>(caller: string, fn: () => T): T {
  if (!caller.trim()) throw new Error('runWithSystemTenantScope: caller is required');
  return runWithTenantScope({ tenantId: '0', role: 'app_super_admin', source: 'job', caller }, fn);
}

/**
 * Scope for background work done ON BEHALF OF ONE organization — a scheduled
 * job's per-org handler. Tenant id is the org, no role (no super-admin arm), so
 * the handler's pooled queries are admitted by the fail-closed instrumentation
 * and filtered to that org by RLS.
 *
 * One definition for every trigger of the same per-org work: the Bull
 * scheduler (services/automation/scheduled-jobs.ts) and the Redis-free digest
 * heartbeat (services/digest/digest-heartbeat.ts) both run the proactive digest
 * through it. The heartbeat used to run it with NO scope, so under
 * RLS_ENFORCE=on no proactive digest was ever created on a Redis-less deploy.
 */
export function runWithOrgJobScope<T>(organizationId: number, caller: string, fn: () => T): T {
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    throw new Error(`runWithOrgJobScope: a positive integer organization id is required (got ${organizationId})`);
  }
  if (!caller.trim()) throw new Error('runWithOrgJobScope: caller is required');
  return runWithTenantScope(
    { tenantId: String(organizationId), orgUuid: null, role: null, source: 'job', caller },
    fn,
  );
}

/**
 * Scope for work that runs BEFORE a tenant can be known — resolving an identity
 * from an email address, verifying a password, exchanging a refresh token.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * Pool instrumentation blocks any query issued with no tenant scope once
 * RLS_ENFORCE=on. Authentication cannot satisfy that: there is no tenant until
 * the user has been identified, which is the very query being blocked. And
 * production permits ONLY RLS_ENFORCE=on (server/db/rlsEnforcement.ts — unset,
 * invalid, `off` and `shadow` all refuse startup), so with enforcement on, the
 * login user-lookup
 *
 *   select ... from "users" where "users"."email" = $1 limit $2
 *
 * was blocked and login returned 500 "Login failed". Confirmed against
 * PostgreSQL 16: the block is logged one millisecond before the auth error, at
 * enforcement "on", by tenant-rls-observability.
 *
 * ── Why NOT runWithSystemTenantScope ──────────────────────────────────────────
 * That helper sets role `app_super_admin`, which satisfies the super-admin arm
 * of every RLS policy. Handing unauthenticated request handling a policy bypass
 * to fix an observability check would trade a broken login for a much worse
 * problem.
 *
 * This scope deliberately carries NO role. It exists to say "this query is
 * intentionally tenant-less", which is exactly what the instrumentation wants
 * to distinguish from "somebody forgot". It satisfies no other table's tenant
 * policy: a role-less tenantId '0' matches no organization.
 *
 * Nor does it read `public.users` (D3, 2026-10-04): that table's policy admits
 * this scope to no row at all, only to the one account it has been bound to
 * (`bindPreAuthAccount`). Sign-in, password reset, email OTP and token refresh
 * resolve an email or reset token to an id through a definer function
 * (`public.user_id_for_email`, `public.user_id_for_reset_token`), then bind;
 * a request that holds a verified access token is bound to that token's
 * account when the pre-auth mount opens. Until 2026-10-04 the policy admitted
 * this scope to the whole table, and only application code kept a handler from
 * another person's row (docs/evidence/D3/2026-09-29-pre-auth-scope/).
 *
 * Nesting is safe: AsyncLocalStorage gives the innermost scope, so a request
 * that goes on to authenticate runs its remaining work in the real tenant scope
 * installed by the auth boundary.
 */
export function runWithPreAuthScope<T>(caller: string, fn: () => T): T {
  if (!caller.trim()) throw new Error('runWithPreAuthScope: caller is required');
  return runWithTenantScope({ tenantId: '0', role: null, source: 'request', caller }, fn);
}

function isPreAuthScope(scope: TenantScope | undefined): scope is TenantScope {
  return !!scope && scope.tenantId === '0' && !scope.role;
}

function assertAccountId(userId: number, fn: string): void {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error(`${fn}: a positive integer account id is required (got ${userId})`);
  }
}

/** Whether the current scope is a pre-auth scope (tenant '0', no role). */
export function inPreAuthScope(): boolean {
  return isPreAuthScope(tenantStorage.getStore());
}

/**
 * Bind the current pre-auth scope to the one account the request has
 * established — the account a verified token names, or the account found for
 * this sign-in. From then on the request's statements reach that account's
 * `public.users` row and no other (D3, 2026-10-04).
 *
 * The pre-auth scope no longer reads the whole of `users`: it resolves an email
 * or reset token to an id through a definer function, and acts as that id
 * through here. A pre-auth request acts as at most ONE account: binding a
 * second, different id throws, so a handler cannot be steered from one person's
 * row to another's. In a tenant or system scope this throws too — that scope
 * already decides what `users` it reaches. With no scope it does nothing.
 */
export function bindPreAuthAccount(userId: number): void {
  assertAccountId(userId, 'bindPreAuthAccount');
  const scope = tenantStorage.getStore();
  // No scope at all: nothing to narrow. Under RLS_ENFORCE=on the pool refuses
  // every unscoped statement anyway; with enforcement off no policy applies.
  if (!scope) return;
  if (!isPreAuthScope(scope)) {
    throw new Error('bindPreAuthAccount: only a pre-auth scope can be bound to an account');
  }
  if (scope.accountId != null && scope.accountId !== userId) {
    throw new Error('bindPreAuthAccount: this request is already bound to another account');
  }
  scope.accountId = userId;
}

/**
 * Run `fn` in a pre-auth scope bound to one account: for services that act on
 * an account they were handed an id for (account standing, token revocation),
 * with no request scope of their own to bind.
 */
export function runAsAccount<T>(userId: number, caller: string, fn: () => T): T {
  assertAccountId(userId, 'runAsAccount');
  if (!caller.trim()) throw new Error('runAsAccount: caller is required');
  return runWithTenantScope({ tenantId: '0', role: null, source: 'request', caller, accountId: userId }, fn);
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
export function annotateTenantScope(
  patch: Partial<Pick<TenantScope, 'caller'>>
): TenantScope | undefined {
  const scope = tenantStorage.getStore();
  if (!scope) return undefined;
  if (patch.caller !== undefined) scope.caller = patch.caller;
  return scope;
}
