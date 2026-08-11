/**
 * Health probe vs. RLS fail-closed.
 *
 * Under RLS_ENFORCE=on (the only value production accepts) the instrumented
 * pool rejects any non-infrastructure statement issued with no active tenant
 * scope. A Kubernetes / load-balancer health probe legitimately runs with no
 * tenant, so its DB probe MUST be one the instrumentation exempts — otherwise
 * `checkDatabase()` catches the fail-closed rejection and reports the database
 * "unhealthy" on a perfectly healthy connection, turning /health/full and
 * /health/ready into false 503s.
 *
 * This pins the fix (probe = `SELECT NOW()`, which is in INFRASTRUCTURE_QUERIES)
 * and, by directly exercising the pre-fix probe string against the same
 * instrumented pool, records that the guard catches a regression: revert the
 * probe to the aliased form and the readiness assertion below goes red.
 */

import { describe, it, expect, afterEach } from 'vitest';

import { HealthCheckService } from '../health-check';
import { instrumentPool } from '../../db/poolInstrumentation';

// Minimal pg.Pool-shaped fake. `SELECT NOW()` returns a row so serverTime is
// populated; the instrumentation decides whether the call is even allowed.
class FakePool {
  public totalCount = 1;
  public idleCount = 1;
  public waitingCount = 0;

  // Shared query semantics: `SELECT NOW()` returns a row so serverTime is
  // populated. Used by BOTH pool.query and a checked-out client's query,
  // because on a real pg pool those are equivalent — and the instrumentation
  // runs exempt infrastructure probes on a connection from pool.connect(), so
  // the client must answer NOW() exactly as the pool does.
  private run(textOrConfig: any) {
    const text = typeof textOrConfig === 'string' ? textOrConfig : textOrConfig?.text;
    if (typeof text === 'string' && /NOW\(\)/i.test(text)) {
      return Promise.resolve({ rows: [{ now: new Date('2026-08-07T00:00:00.000Z') }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  query(textOrConfig: any, _values?: unknown[]) {
    return this.run(textOrConfig);
  }

  connect() {
    return Promise.resolve({
      release: () => undefined,
      query: (textOrConfig: any) => this.run(textOrConfig),
    });
  }
}

const priorEnforce = process.env.RLS_ENFORCE;

afterEach(() => {
  if (priorEnforce === undefined) delete process.env.RLS_ENFORCE;
  else process.env.RLS_ENFORCE = priorEnforce;
});

describe('HealthCheckService database probe under RLS_ENFORCE=on', () => {
  it('reports the database healthy from outside any tenant scope', async () => {
    process.env.RLS_ENFORCE = 'on';
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);

    // No runWithTenantScope wrapper — exactly the state a health probe runs in.
    const result = await new HealthCheckService(pool as unknown as any).checkReadiness();

    expect(result.status).toBe('healthy');
    expect(result.checks?.database.status).toBe('healthy');
    expect(result.checks?.database.details?.serverTime).toBeInstanceOf(Date);
  });

  it('the pre-fix aliased probe would fail closed on the same pool (mutation record)', async () => {
    process.env.RLS_ENFORCE = 'on';
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);

    // The exact string the probe used before the fix. It is not in
    // INFRASTRUCTURE_QUERIES (the `as` aliases defeat the exact-match
    // exemption), so with no scope active it is rejected — which is what drove
    // the false "unhealthy" 503. If a regression restores this probe, the test
    // above flips to unhealthy.
    await expect(
      (pool as any).query('SELECT 1 as check, NOW() as time'),
    ).rejects.toThrow(/FAIL-CLOSED/);

    // And the fixed probe is allowed through from the same unscoped state.
    await expect((pool as any).query('SELECT NOW()')).resolves.toBeTruthy();
  });
});
