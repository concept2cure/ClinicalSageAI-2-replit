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
import { applySessionScope, clearSessionScope } from './sessionScope';
import { currentTenantOrgUuid } from './currentTenant';

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
  /** Explicit trusted target owner; never inherited or used as the human audit actor. */
  accountId?: number | null;
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
    accountId: opts.accountId ?? null,
  };

  // The scope is entered BEFORE the checkout, and everything — connect,
  // session setup, callback, cleanup — runs inside it.
  //
  // It used to be entered only around the callback, after `pool.connect()`.
  // Under RLS_ENFORCE=on the instrumented pool refuses a checkout with no
  // active scope ("FAIL-CLOSED: pool.connect"), so a caller that brings none —
  // the nightly memory-consolidation job, a script — failed on every run.
  // Callers already inside a scope (request paths) never noticed, because the
  // checkout silently borrowed THEIR scope; that also meant a transaction opened
  // in `fn` got the ambient request's LOCAL tenant vars instead of the ones
  // this function was asked for. Entering `scope` first fixes both. For those
  // request-path callers nothing else changes: `fn` already ran in `scope`, the
  // session set_config/cleanup sequence is identical, and the ambient scope is
  // back in force when this returns (AsyncLocalStorage nesting).
  return runWithTenantScope(scope, () => runOnScopedClient(opts, tenantId, fn));
}

/**
 * The organization has no uuid, so its full tenant scope cannot be opened. Its
 * Vault (and every uuid-keyed schema) reads through `app.current_org_id`
 * (`identity.current_org_id()`), so work on its behalf is refused rather than
 * run in the integer scope alone, where those rows read as absent.
 */
export class TenantScopeUnavailableError extends Error {
  readonly code = 'TENANT_SCOPE_UNAVAILABLE';
  constructor(readonly organizationId: number, caller: string) {
    super(`${caller}: organization ${organizationId} has no uuid, so its tenant scope cannot be established`);
    this.name = 'TenantScopeUnavailableError';
  }
}

function requireOrganizationId(organizationId: number, where: string): void {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new Error(`${where}: a positive integer organization id is required (got ${organizationId})`);
  }
}

/**
 * One organization's uuid, for work done on its behalf outside a request (a
 * queued worker, the boot sweep). Read on a connection in that organization's
 * own integer scope, through currentTenantOrgUuid (db/currentTenant.ts), the
 * one derivation of a scope's organization uuid. Throws
 * TenantScopeUnavailableError when the organization has none.
 */
export async function readOrganizationTenantUuid(organizationId: number, caller: string): Promise<string> {
  requireOrganizationId(organizationId, 'readOrganizationTenantUuid');
  const orgUuid = await withTenantConnection({ tenantId: organizationId, source: 'job', caller }, client => currentTenantOrgUuid(client));
  if (!orgUuid) throw new TenantScopeUnavailableError(organizationId, caller);
  return orgUuid;
}

/**
 * Run `fn` on a dedicated connection in ONE organization's full tenant scope:
 * its integer id and its uuid, no role. This is the scope a request of that
 * organization carries (establishRequestTenantScope: organizations.uuid from
 * the membership lookup), opened for a job that acts for it. The integer id
 * alone is not enough: the Vault's row security admits a program through the
 * organization's uuid only, so a worker opened with the id alone reads the
 * Vault as empty (B1, docs/evidence/D2-CSR/2026-11-05-worker-tenant-scope/).
 *
 * When the organization has no uuid, `fn` never runs. If `unavailable` is
 * given, it runs instead, on the lookup's connection (the organization's
 * integer scope, which admits its own public rows and none of its Vault), so
 * the caller can record the refusal on its own job row; otherwise
 * TenantScopeUnavailableError is thrown.
 */
export async function withOrganizationTenantConnection<T>(
  organizationId: number,
  caller: string,
  fn: (client: PoolClient) => Promise<T>,
  unavailable?: (client: PoolClient, error: TenantScopeUnavailableError) => Promise<T>,
): Promise<T> {
  requireOrganizationId(organizationId, 'withOrganizationTenantConnection');
  type Lookup = { scoped: true; orgUuid: string } | { scoped: false; refused: T };
  const lookup = await withTenantConnection({ tenantId: organizationId, source: 'job', caller }, async (client): Promise<Lookup> => {
    const orgUuid = await currentTenantOrgUuid(client);
    if (orgUuid) return { scoped: true, orgUuid };
    const error = new TenantScopeUnavailableError(organizationId, caller);
    if (!unavailable) throw error;
    return { scoped: false, refused: await unavailable(client, error) };
  });
  if (!lookup.scoped) return lookup.refused;
  return withTenantConnection({ tenantId: organizationId, orgUuid: lookup.orgUuid, role: null, source: 'job', caller }, fn);
}

async function runOnScopedClient<T>(
  opts: WithTenantConnectionOptions,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  let releaseError: Error | undefined;

  try {
    // Set session vars on the dedicated connection. `false` makes them
    // session-level (persists for the connection's life), matching the
    // pattern in tenantContext middleware. They are cleared in the
    // `finally` below to be safe in case the connection comes back into
    // the pool (it does — release() returns it).
    await applySessionScope(client, { tenantId, orgUuid: opts.orgUuid ?? '', role: opts.role ?? '', accountId: opts.accountId ?? null });

    return await fn(client);
  } catch (error) {
    // The callback may fail without contaminating session state, but session
    // setup can fail partway through. Conservatively evict unless setup and
    // cleanup both complete successfully.
    releaseError = error instanceof Error ? error : new Error(String(error));
    throw error;
  } finally {
    try {
      await clearSessionScope(client);
    } catch (cleanupErr) {
      releaseError = cleanupErr instanceof Error
        ? cleanupErr
        : new Error('Failed to clear tenant session variables');
      logger.warn('Failed to clear tenant session vars on release', {
        error: releaseError.message,
      });
    }
    client.release(releaseError);
  }
}
