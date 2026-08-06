/**
 * Pool instrumentation for the RLS rollout observability window (PR A).
 *
 * Wraps a `pg.Pool` instance so every call to `pool.query(...)` and
 * `pool.connect(...)` reads the AsyncLocalStorage tenant scope and:
 *
 *   - Increments `tenant_session_var_present_total` if a scope is set.
 *   - Increments `tenant_session_var_missing_total` and logs WARN
 *     (rate-limited) if no scope is set.
 *
 * No DB behavior changes. The point is to surface the gap before PR B
 * turns on policy enforcement, when "no scope" turns into "silent empty
 * results".
 *
 * `pool.connect()` is also instrumented because lots of code paths grab
 * a client and run several queries on it — we want the checkout itself
 * counted, not just the first query.
 */

import type { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';
import { getTenantScope, type TenantScope } from './tenantStore';
import { readEnforcementMode } from './rlsEnforcement';
import { tenantSessionVarMissing, tenantSessionVarPresent } from './tenantSessionMetrics';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('tenant-rls-observability');

const WARN_RATE_LIMIT_MS = 30_000;
const lastWarnedByCaller = new Map<string, number>();

/**
 * Some queries are infrastructure-level and legitimately run outside any
 * tenant scope. Don't count or warn about these — they would just create
 * noise. We match by exact text or simple prefix.
 */
const INFRASTRUCTURE_QUERIES = new Set<string>([
  'SELECT 1',
  'SELECT NOW()',
  "SELECT set_config('app.current_tenant_id', '', false)",
  "SELECT set_config('app.current_user_role', '', false)",
  "SELECT set_config('app.current_org_id', '', false)",
]);

// DELIBERATELY EXACT-MATCH ONLY. BEGIN/COMMIT/ROLLBACK and any set_config
// that carries a REAL value are NOT exempt: an unscoped transaction open or
// an unscoped tenant-var write is precisely the activity this instrumentation
// exists to surface (fix: reject unscoped pool access, 2026-07-29, and its
// contract test poolInstrumentation-tenant-scope.test.ts). Only inert probes
// and the empty-value CLEAR variants are noise.
function isInfrastructureQuery(text: string | undefined): boolean {
  if (!text) return false;
  if (INFRASTRUCTURE_QUERIES.has(text)) return true;
  // The set above is written in upper case, but callers are not. The readiness
  // probe in server/startup/inline-endpoints.ts issues `select 1` in lower
  // case, so an exact, case-sensitive match missed it — and with
  // RLS_ENFORCE=on (the only value production accepts) that liveness probe was
  // blocked and /readyz reported the database "down" on a perfectly healthy
  // connection.
  //
  // Case is normalised rather than the literal being added, because the same
  // miss applies to every entry here. Surrounding whitespace goes too, for the
  // same reason. Nothing else is relaxed: this stays an exact match on inert
  // probes and the empty-value CLEAR variants, so an unscoped transaction open
  // or a set_config carrying a real value is still surfaced.
  const normalized = text.trim().toUpperCase();
  for (const known of INFRASTRUCTURE_QUERIES) {
    if (known.toUpperCase() === normalized) return true;
  }
  return false;
}

function extractQueryText(arg: unknown): string | undefined {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'text' in (arg as QueryConfig)) {
    return (arg as QueryConfig).text;
  }
  return undefined;
}

function shortenQueryForLog(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 160 ? collapsed.slice(0, 157) + '...' : collapsed;
}

function recordCheck(op: 'pool.query' | 'pool.connect', queryText: string | undefined): void {
  if (isInfrastructureQuery(queryText)) return;

  const scope = getTenantScope();
  if (scope) {
    tenantSessionVarPresent.inc({ source: scope.source, op });
    return;
  }

  const caller = inferCaller();
  tenantSessionVarMissing.inc({ op, caller });

  const now = Date.now();
  const lastWarn = lastWarnedByCaller.get(caller) ?? 0;
  if (now - lastWarn >= WARN_RATE_LIMIT_MS) {
    lastWarnedByCaller.set(caller, now);
    const enforcement = readEnforcementMode();
    logger.warn(
      enforcement === 'on'
        ? 'Database operation blocked because tenant scope is missing'
        : 'Query issued without tenant scope (will be blocked once RLS is enabled)', {
      op,
      caller,
      queryPreview: queryText ? shortenQueryForLog(queryText) : undefined,
      enforcement,
    });
  }
}

/**
 * Walk the stack to find the first frame outside `node_modules`, the pg
 * driver, and our own instrumentation/runtime files. That frame is almost
 * always the offending caller — surfacing it in the metric label and log
 * tells operators exactly which file to fix.
 */
function inferCaller(): string {
  const err = new Error();
  const stack = err.stack || '';
  const lines = stack.split('\n').slice(2); // drop "Error" + this frame
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('at ')) continue;
    if (line.includes('node_modules')) continue;
    if (line.includes('poolInstrumentation')) continue;
    if (line.includes('db/runtime')) continue;
    if (line.includes('async_hooks')) continue;
    // Pull the file:line from "at funcName (/abs/path.ts:42:7)" or
    // "at /abs/path.ts:42:7"
    const match = line.match(/\(([^)]+)\)$/) || line.match(/at (.+)$/);
    if (!match) continue;
    const location = match[1];
    // Trim absolute prefix to keep label cardinality bounded.
    return location.replace(/.*\/(server|scripts|shared)\//, '$1/').slice(0, 120);
  }
  return 'unknown';
}

// ── Tenant-scope enforcement primitive (RLS rollout PR B) ────────────────────
//
// When RLS_ENFORCE=on, a query on the shared pool must run on a connection
// whose `app.current_tenant_id` matches the active scope, or the 0021 policy
// returns zero rows. The observability layer above already intercepts every
// `pool.query`/`pool.connect`; this layer additionally *applies* the scope.
//
// Settings are written with `set_config(..., true)` — the `true` (is_local)
// makes them TRANSACTION-scoped, so they vanish at COMMIT/ROLLBACK and the
// connection returns to the pool carrying no tenant. Reset-on-release is thus a
// Postgres guarantee, not application discipline: cross-tenant reuse is
// structurally impossible, even if a query throws.

// One round-trip that sets all three vars LOCAL to the current transaction.
const TENANT_SET_CONFIG_SQL =
  "SELECT set_config('app.current_tenant_id', $1, true), " +
  "set_config('app.current_org_id', $2, true), " +
  "set_config('app.current_user_role', $3, true)";

function scopeParams(scope: TenantScope): [string, string, string] {
  return [scope.tenantId, scope.orgUuid ?? '', scope.role ?? ''];
}

/**
 * The scope to APPLY, or null when the primitive must stay inert. Inert unless
 * RLS is actually enforcing AND a tenant scope is set AND the statement is not
 * an infrastructure query. While RLS_ENFORCE≠'on' this short-circuits before
 * any wrapping, so runtime behavior is byte-for-byte today's.
 */
function enforcingScope(queryText: string | undefined): TenantScope | null {
  if (readEnforcementMode() !== 'on') return null;
  if (isInfrastructureQuery(queryText)) return null;
  return getTenantScope() ?? null;
}

function missingTenantScopeError(op: 'pool.query' | 'pool.connect'): Error {
  return new Error(
    `[tenant-rls] FAIL-CLOSED: ${op} requires an active tenant scope while RLS_ENFORCE=on`
  );
}

/**
 * Run a single pooled statement inside a micro-transaction that first applies
 * the tenant vars LOCAL. Used for the `pool.query` path (drizzle's
 * non-transactional statements).
 */
async function runQueryScoped(
  originalConnect: Pool['connect'],
  scope: TenantScope,
  args: any[],
): Promise<QueryResult> {
  const client = (await (originalConnect as any)()) as PoolClient;
  let releaseError: Error | undefined;
  try {
    await client.query('BEGIN');
    await client.query(TENANT_SET_CONFIG_SQL, scopeParams(scope));
    const result = (await (client.query as any)(...args)) as QueryResult;
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      // pg only destroys a checked-out connection when release receives an
      // error. A bare release would recycle a connection whose transaction and
      // tenant-local state are now unknown.
      releaseError = rollbackError instanceof Error
        ? rollbackError
        : new Error('tenant-scoped rollback failed');
    }
    throw err;
  } finally {
    client.release(releaseError);
  }
}

/**
 * Wrap a checked-out client so the drizzle-issued `BEGIN` is immediately
 * followed by the LOCAL tenant vars, inside that same transaction. Used for the
 * `pool.connect` path (drizzle's `db.transaction()`). Restored on release.
 */
function wrapClientForScope(client: PoolClient, scope: TenantScope): PoolClient {
  const anyClient = client as any;
  if (anyClient.__tenantScopeWrapped) return client;
  anyClient.__tenantScopeWrapped = true;

  const originalClientQuery = client.query.bind(client) as PoolClient['query'];
  const originalRelease = client.release.bind(client) as PoolClient['release'];
  let transactionOpen = false;
  let poisonError: Error | undefined;

  anyClient.query = function scopedClientQuery(...qargs: any[]): any {
    const text = extractQueryText(qargs[0]);
    const isBegin = !!text && /^\s*(?:BEGIN|START\s+TRANSACTION)\b/i.test(text);
    const isEnd = !!text && /^\s*(?:COMMIT|END|ROLLBACK|ABORT)\b/i.test(text);
    const hasCallback = typeof qargs[qargs.length - 1] === 'function';
    if (hasCallback) {
      const callback = qargs[qargs.length - 1] as (error: Error | null, result?: QueryResult) => void;
      const queryArgs = qargs.slice(0, -1);
      if (isBegin) {
        return (originalClientQuery as any)(...queryArgs, (beginError: Error | null, result: QueryResult) => {
          if (beginError) {
            poisonError = beginError;
            callback(beginError);
            return;
          }
          transactionOpen = true;
          (originalClientQuery as any)(TENANT_SET_CONFIG_SQL, scopeParams(scope)).then(
            () => callback(null, result),
            (error: unknown) => {
              poisonError = error instanceof Error
                ? error
                : new Error('tenant context initialization failed');
              callback(poisonError);
            },
          );
        });
      }
      if (isEnd) {
        return (originalClientQuery as any)(...queryArgs, (error: Error | null, result: QueryResult) => {
          if (error) poisonError = error;
          else transactionOpen = false;
          callback(error, result);
        });
      }
      return (originalClientQuery as any)(...qargs);
    }

    if (!isBegin) {
      const result = (originalClientQuery as any)(...qargs);
      if (!isEnd || !result || typeof result.then !== 'function') return result;
      return result.then(
        (value: QueryResult) => {
          transactionOpen = false;
          return value;
        },
        (error: unknown) => {
          poisonError = error instanceof Error
            ? error
            : new Error('tenant-scoped transaction cleanup failed');
          throw error;
        },
      );
    }
    // Inject the LOCAL tenant vars right after BEGIN, within the transaction.
    return (originalClientQuery as any)(...qargs).then(
      async (res: QueryResult) => {
        transactionOpen = true;
        try {
          await (originalClientQuery as any)(TENANT_SET_CONFIG_SQL, scopeParams(scope));
          return res;
        } catch (error) {
          poisonError = error instanceof Error
            ? error
            : new Error('tenant context initialization failed');
          throw error;
        }
      },
      (error: unknown) => {
        poisonError = error instanceof Error
          ? error
          : new Error('tenant-scoped transaction initialization failed');
        throw error;
      },
    );
  };

  anyClient.release = function scopedRelease(...rargs: any[]): any {
    anyClient.query = originalClientQuery;
    anyClient.release = originalRelease;
    anyClient.__tenantScopeWrapped = false;
    const callerSignal = rargs[0] as Error | boolean | undefined;
    const unsafeRelease = transactionOpen
      ? new Error('tenant-scoped client released with an open transaction')
      : undefined;
    return (originalRelease as any)(callerSignal ?? poisonError ?? unsafeRelease);
  };

  return client;
}

/**
 * Apply observability instrumentation to a `pg.Pool` instance, plus the
 * tenant-scope enforcement layer (dormant unless RLS_ENFORCE=on). Idempotent —
 * a second call on the same pool is a no-op.
 */
export function instrumentPool(pool: Pool): Pool {
  const tagged = pool as Pool & { __tenantInstrumented?: boolean };
  if (tagged.__tenantInstrumented) return pool;
  tagged.__tenantInstrumented = true;

  const originalQuery = pool.query.bind(pool) as Pool['query'];
  const originalConnect = pool.connect.bind(pool) as Pool['connect'];

  // pg's Pool#query has many overloads (string, QueryConfig, with/without
  // params, with/without callback). We don't try to retype it — we keep the
  // original signature, observe, then apply tenant scope when enforcing.
  (pool as any).query = function instrumentedQuery(...args: any[]): any {
    const queryText = extractQueryText(args[0]);
    recordCheck('pool.query', queryText);
    const hasCallback = typeof args[args.length - 1] === 'function';
    const scope = enforcingScope(queryText);
    if (readEnforcementMode() === 'on' && !isInfrastructureQuery(queryText) && !scope) {
      const error = missingTenantScopeError('pool.query');
      if (hasCallback) {
        const callback = args[args.length - 1] as (error: Error) => void;
        queueMicrotask(() => callback(error));
        return undefined;
      }
      return Promise.reject(error);
    }
    if (!scope) return (originalQuery as any)(...args);
    if (hasCallback) {
      const callback = args[args.length - 1] as (error: Error | null, result?: QueryResult) => void;
      runQueryScoped(originalConnect, scope, args.slice(0, -1)).then(
        result => callback(null, result),
        error => callback(error),
      );
      return undefined;
    }
    return runQueryScoped(originalConnect, scope, args);
  };

  (pool as any).connect = function instrumentedConnect(...args: any[]): any {
    recordCheck('pool.connect', undefined);
    const hasCallback = typeof args[args.length - 1] === 'function';
    const scope = enforcingScope(undefined);
    if (readEnforcementMode() === 'on' && !scope) {
      const error = missingTenantScopeError('pool.connect');
      if (hasCallback) {
        const callback = args[args.length - 1] as Function;
        queueMicrotask(() => callback(error, undefined, undefined));
        return undefined;
      }
      return Promise.reject(error);
    }
    if (scope && hasCallback) {
      const callback = args[args.length - 1] as Function;
      const connectArgs = args.slice(0, -1);
      return (originalConnect as any)(...connectArgs, (error: Error | null, client: PoolClient) => {
        if (error || !client) {
          callback(error, client, undefined);
          return;
        }
        const wrapped = wrapClientForScope(client, scope);
        callback(null, wrapped, (releaseError?: Error | boolean) => wrapped.release(releaseError));
      });
    }
    const result = (originalConnect as any)(...args);
    if (!scope || !result || typeof result.then !== 'function') return result;
    return result.then((client: PoolClient) => wrapClientForScope(client, scope));
  };

  return pool;
}

/**
 * Test-only: reset the warn rate-limit memory so a unit test can assert on
 * repeated warnings without waiting 30 seconds.
 */
export function __resetWarnRateLimitForTests(): void {
  lastWarnedByCaller.clear();
}

export type { Pool, PoolClient, QueryResult };
