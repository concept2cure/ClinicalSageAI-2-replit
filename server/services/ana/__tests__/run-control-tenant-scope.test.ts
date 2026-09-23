/**
 * Background run-control queries open their own tenant scope.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Pool access in this codebase is scoped by AsyncLocalStorage, not by the
 * connection: `poolInstrumentation.runQueryScoped` reads `getTenantScope()` at
 * QUERY time and pins `app.current_tenant_id` from it, and once RLS_ENFORCE=on —
 * which production is the only permitted setting for — an unscoped query is
 * rejected fail-closed. So a query's correctness depends on the context it RUNS
 * in, not the one it was written in.
 *
 * Three of this module's paths have no ambient request scope, or worse, the
 * wrong one:
 *
 *   the poll fallback   `setInterval` carries the context the TIMER was created
 *                       in. It is armed from inside the first turn after boot
 *                       that fails to open a listener, so every later firing
 *                       stayed pinned to that first tenant — asking about every
 *                       run this process owns while able to see only one org's.
 *   the NOTIFY handler  runs in the LISTEN socket's creation context, not the
 *                       notifying request's.
 *   reapOrphanedRuns    is estate-wide by design (the runs that most need
 *                       reaping belong to an instance that is gone) but is
 *                       called from inside a request, whose scope would narrow
 *                       it to one org and return a reassuring small number.
 *
 * In every case RLS returns ZERO ROWS rather than an error, so nothing reports
 * it and cross-instance control silently stops working — the one capability the
 * durable record exists to deliver.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 * Not that a scope helper was called, but that `getTenantScope()` observed from
 * INSIDE the query — where the instrumentation reads it — is the right one. A
 * wrapper around the wrong statement would pass the first check and fail this.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { getTenantScope, runWithTenantScope, type TenantScope } from '../../../db/tenantStore.js';
import {
  reapOrphanedRuns,
  stopRunInternally,
  readRun,
  _resetLocalRunsForTest,
} from '../run-control.js';

/** A pool that records the tenant scope in force when each query runs. */
function recordingPool() {
  const scopes: Array<TenantScope | undefined> = [];
  return {
    scopes,
    pool: {
      query: vi.fn(async () => {
        scopes.push(getTenantScope());
        return { rows: [], rowCount: 0 };
      }),
    } as any,
  };
}

const REQUEST_SCOPE: TenantScope = {
  tenantId: '7',
  role: 'member',
  source: 'request',
  caller: 'test',
} as TenantScope;

beforeEach(() => _resetLocalRunsForTest());

describe('the estate-wide sweep is estate-wide', () => {
  it('reaps under the system scope even when called from inside a tenant request', async () => {
    // This is the real call site: stream.ts sweeps opportunistically from inside
    // a turn. Inheriting that turn's scope is what reduced the sweep to one org.
    const { pool, scopes } = recordingPool();
    await runWithTenantScope(REQUEST_SCOPE, () => reapOrphanedRuns(pool));
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.tenantId).toBe('0');
    expect(scopes[0]?.role).toBe('app_super_admin');
  });

  it('does not inherit the caller tenant — the bug this replaces', async () => {
    const { pool, scopes } = recordingPool();
    await runWithTenantScope(REQUEST_SCOPE, () => reapOrphanedRuns(pool));
    expect(scopes[0]?.tenantId).not.toBe('7');
  });
});

describe('a write about one run takes that run tenant, not a super-admin bypass', () => {
  it('scopes the disconnect write to the run own organization', async () => {
    // Reached from a socket 'close', which runs in the context of whoever called
    // emit rather than the context it was registered in — so it cannot rely on
    // inheriting the request scope, and is given the run's tenant explicitly.
    const { pool, scopes } = recordingPool();
    await stopRunInternally(pool, 'run_1', 'client_disconnected', 42);
    expect(scopes[0]?.tenantId).toBe('42');
    // Deliberately NOT app_super_admin: settling one known run needs no policy
    // bypass, and taking one for convenience is how a bypass becomes the norm.
    expect(scopes[0]?.role).not.toBe('app_super_admin');
  });

  it('aborts the local run even when the row write cannot be made', async () => {
    // A dropped socket should stop the work whether or not the database is
    // reachable; the abort is local and needs no query.
    const pool = { query: vi.fn(async () => { throw new Error('unreachable'); }) } as any;
    await expect(stopRunInternally(pool, 'run_missing', 'client_disconnected', 42)).resolves
      .toBeUndefined();
  });
});

describe('request-time reads inherit the caller scope rather than widening it', () => {
  it('reads a run under the request own tenant', async () => {
    // The counterpart assertion. If these opened a system scope too, the module
    // would be handing every ordinary read a policy bypass.
    const { pool, scopes } = recordingPool();
    await runWithTenantScope(REQUEST_SCOPE, () => readRun(pool, 'run_1', 7));
    expect(scopes[0]?.tenantId).toBe('7');
    expect(scopes[0]?.role).not.toBe('app_super_admin');
  });
});
