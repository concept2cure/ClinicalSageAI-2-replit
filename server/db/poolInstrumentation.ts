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
import { getTenantScope } from './tenantStore';
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
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
]);

function isInfrastructureQuery(text: string | undefined): boolean {
  if (!text) return false;
  if (INFRASTRUCTURE_QUERIES.has(text)) return true;
  // Tenant-context bootstrap calls — these run BEFORE the scope is in place
  // by definition.
  if (text.startsWith("SELECT set_config('app.current_")) return true;
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
    logger.warn('Query issued without tenant scope (will return zero rows once RLS is enabled)', {
      op,
      caller,
      queryPreview: queryText ? shortenQueryForLog(queryText) : undefined,
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

/**
 * Apply observability instrumentation to a `pg.Pool` instance. Idempotent —
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
  // original signature and just observe before delegating.
  (pool as any).query = function instrumentedQuery(...args: any[]): any {
    recordCheck('pool.query', extractQueryText(args[0]));
    return (originalQuery as any)(...args);
  };

  (pool as any).connect = function instrumentedConnect(...args: any[]): any {
    recordCheck('pool.connect', undefined);
    return (originalConnect as any)(...args);
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
