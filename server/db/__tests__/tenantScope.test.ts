import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

import { getTenantScope, runWithTenantScope } from '../tenantStore';
import { instrumentPool, __resetWarnRateLimitForTests } from '../poolInstrumentation';
import { tenantSessionVarMissing, tenantSessionVarPresent } from '../tenantSessionMetrics';

// Minimal `pg.Pool`-shaped fake. We only need `query` and `connect` for the
// instrumentation surface; both record their invocations so we can assert.
class FakePool extends EventEmitter {
  public queries: Array<{ text?: string; values?: unknown[] }> = [];
  public connects = 0;

  // Mirror pg.Pool#query overload: (text, params?) | ({text, values})
  query(textOrConfig: any, values?: unknown[]) {
    if (typeof textOrConfig === 'string') {
      this.queries.push({ text: textOrConfig, values });
    } else if (textOrConfig && typeof textOrConfig === 'object') {
      this.queries.push({ text: textOrConfig.text, values: textOrConfig.values });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  }

  connect() {
    this.connects += 1;
    return Promise.resolve({
      release: () => undefined,
      query: () => Promise.resolve({ rows: [], rowCount: 0 }),
    });
  }
}

function counterValue(metric: any, labels: Record<string, string>): number {
  const data = metric.hashMap ?? {};
  for (const key of Object.keys(data)) {
    const entry = data[key];
    if (!entry?.labels) continue;
    const match = Object.entries(labels).every(([k, v]) => entry.labels[k] === v);
    if (match) return entry.value;
  }
  return 0;
}

describe('tenantStore', () => {
  it('exposes the scope set by runWithTenantScope', () => {
    const inside = runWithTenantScope(
      { tenantId: '7', source: 'request' },
      () => getTenantScope()
    );
    expect(inside?.tenantId).toBe('7');
    expect(inside?.source).toBe('request');
    // Outside any scope, getter returns undefined.
    expect(getTenantScope()).toBeUndefined();
  });

  it('propagates the scope across async boundaries', async () => {
    const result = await runWithTenantScope(
      { tenantId: '99', source: 'job', caller: 'unit-test' },
      async () => {
        await Promise.resolve();
        await new Promise(resolve => setImmediate(resolve));
        return getTenantScope();
      }
    );
    expect(result?.tenantId).toBe('99');
    expect(result?.source).toBe('job');
    expect(result?.caller).toBe('unit-test');
  });
});

describe('instrumentPool', () => {
  beforeEach(() => {
    tenantSessionVarPresent.reset();
    tenantSessionVarMissing.reset();
    __resetWarnRateLimitForTests();
  });

  it('counts queries inside a tenant scope as present', async () => {
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);

    await runWithTenantScope({ tenantId: '1', source: 'request' }, async () => {
      await (pool as any).query('SELECT * FROM widgets WHERE id = $1', [42]);
    });

    expect(counterValue(tenantSessionVarPresent, { source: 'request', op: 'pool.query' })).toBe(1);
    expect(counterValue(tenantSessionVarMissing, { op: 'pool.query', caller: 'unknown' })).toBe(0);
  });

  it('counts queries with no tenant scope as missing', async () => {
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);

    await (pool as any).query('SELECT * FROM widgets');

    // We do not assert on the exact `caller` label — the stack walk picks up
    // vitest internals here. We just assert *some* missing increment fired.
    const missingTotal = Object.values((tenantSessionVarMissing as any).hashMap || {})
      .reduce((acc: number, entry: any) => acc + (entry?.value ?? 0), 0);
    expect(missingTotal).toBeGreaterThanOrEqual(1);
  });

  it('does not double-count when called twice on the same pool', async () => {
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);
    instrumentPool(pool as unknown as any); // idempotent

    await runWithTenantScope({ tenantId: '1', source: 'request' }, async () => {
      await (pool as any).query('SELECT 1 FROM real_table');
    });

    expect(counterValue(tenantSessionVarPresent, { source: 'request', op: 'pool.query' })).toBe(1);
  });

  it('skips only inert infrastructure probes; unscoped BEGIN/set_config-with-value still count', async () => {
    // The exemption list is deliberately exact-match (fix: reject unscoped
    // pool access, 2026-07-29): an unscoped BEGIN or a set_config carrying a
    // REAL tenant value is exactly the activity the instrumentation must
    // surface, so only inert probes and the empty-value CLEAR variants are
    // exempt. The strict side of this contract is pinned in
    // poolInstrumentation-tenant-scope.test.ts; this test pins the exemptions.
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);

    const missingTotalNow = () =>
      Object.values((tenantSessionVarMissing as any).hashMap || {})
        .reduce((acc: number, entry: any) => acc + (entry?.value ?? 0), 0);
    const presentTotalNow = () =>
      Object.values((tenantSessionVarPresent as any).hashMap || {})
        .reduce((acc: number, entry: any) => acc + (entry?.value ?? 0), 0);

    const missingBase = missingTotalNow();
    const presentBase = presentTotalNow();

    // Exempt: inert probes + the empty-value CLEAR bootstrap variants.
    await (pool as any).query('SELECT 1');
    await (pool as any).query('SELECT NOW()');
    await (pool as any).query("SELECT set_config('app.current_tenant_id', '', false)");
    expect(presentTotalNow()).toBe(presentBase);
    expect(missingTotalNow()).toBe(missingBase);

    // NOT exempt: unscoped transaction control and value-carrying set_config.
    await (pool as any).query('BEGIN');
    await (pool as any).query("SELECT set_config('app.current_tenant_id', '42', false)");
    expect(presentTotalNow()).toBe(presentBase);
    expect(missingTotalNow()).toBe(missingBase + 2);
  });

  it('counts pool.connect checkouts', async () => {
    const pool = new FakePool();
    instrumentPool(pool as unknown as any);

    await runWithTenantScope({ tenantId: '1', source: 'request' }, async () => {
      await (pool as any).connect();
    });

    expect(counterValue(tenantSessionVarPresent, { source: 'request', op: 'pool.connect' })).toBe(1);
  });
});
