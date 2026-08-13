/**
 * Every query the AI audit logger issues must declare a tenant scope.
 *
 * ── The regression this pins ─────────────────────────────────────────────────
 * Pool instrumentation refuses ANY unscoped `pool.query` once RLS_ENFORCE=on,
 * and production permits no other value. The audit store probe was written
 * without a scope, so on the shipped build it threw
 *
 *   [tenant-rls] FAIL-CLOSED: pool.query requires an active tenant scope
 *
 * which checkStore() reported as "probe failed", which the boot invariant
 * turned into a fail-closed error — and the production build shut down before
 * it ever listened. Caught by the production-boot-smoke job on 262f349, one
 * commit after the ledger fix that introduced it.
 *
 * ── Why this test rather than the real-DB suite ──────────────────────────────
 * tests/db/ai-gateway-audit-log.dbtest.ts exercises a plain pg.Pool, which has
 * no instrumentation and therefore cannot fail this way — it passed throughout
 * the outage. The property that actually broke is "a tenant scope is active at
 * the moment the query is issued", and that is observable directly, without a
 * database, by asking the scope store from inside a fake pool's query().
 *
 * The INSERT path is covered as well as the probe. An AI call can originate
 * outside a request — schedulers, workers, queue consumers — where no ambient
 * scope exists, so an unscoped write would be refused in exactly the places it
 * is hardest to notice.
 */

import { describe, it, expect } from 'vitest';
import { GatewayAuditLogger } from '../audit';
import { getTenantScope } from '../../../db/tenantStore';
import type { AuditLogEntry } from '../types';

/** A pool that records the tenant scope in force for each query it receives. */
function scopeRecordingPool() {
  const scopes: Array<{ sql: string; tenantId?: string; caller?: string }> = [];
  return {
    scopes,
    query: async (sql: string) => {
      const scope = getTenantScope();
      scopes.push({
        sql: String(sql).slice(0, 40),
        tenantId: scope?.tenantId,
        caller: scope?.caller,
      });
      if (String(sql).includes('to_regclass')) return { rows: [{ present: true }] };
      if (String(sql).includes('has_table_privilege')) {
        return { rows: [{ role: 'app_service', can_insert: true }] };
      }
      return { rows: [] };
    },
  };
}

const entry: AuditLogEntry = {
  requestId: '00000000-0000-4000-8000-00000000aaaa',
  timestamp: new Date(),
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  taskType: 'general' as AuditLogEntry['taskType'],
  strategy: 'task_based' as AuditLogEntry['strategy'],
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  estimatedCostUsd: 0,
  latencyMs: 1,
  success: true,
  cached: false,
  deterministic: false,
};

describe('GatewayAuditLogger — tenant scope on every query', () => {
  it('runs the store probe inside a tenant scope', async () => {
    const pool = scopeRecordingPool();
    await new GatewayAuditLogger(pool).initialize();

    expect(pool.scopes.length).toBeGreaterThan(0);
    for (const q of pool.scopes) {
      // undefined tenantId is precisely the condition instrumentation rejects.
      expect(q.tenantId, `unscoped query: ${q.sql}`).toBeDefined();
      expect(q.caller).toBe('ai-gateway:audit-store-probe');
    }
  });

  it('runs the INSERT inside a tenant scope, with no ambient request scope', async () => {
    const pool = scopeRecordingPool();
    await new GatewayAuditLogger(pool).log(entry);

    const insert = pool.scopes.find((q) => q.sql.includes('INSERT INTO ai.gateway_audit_log'));
    expect(insert, 'the ledger INSERT was never issued').toBeDefined();
    expect(insert!.tenantId).toBeDefined();
    expect(insert!.caller).toBe('ai-gateway:audit-write');
  });

  it('leaves no scope leaked behind after logging', async () => {
    const pool = scopeRecordingPool();
    await new GatewayAuditLogger(pool).log(entry);
    // AsyncLocalStorage.run must not leak into the caller's context.
    expect(getTenantScope()).toBeUndefined();
  });
});

describe('GatewayAuditLogger — which failures latch', () => {
  /**
   * Structural problems are operator-fixable and will not resolve on their own,
   * so re-probing per AI call is noise. Anything else must keep retrying: an
   * earlier revision latched on everything, which meant one dropped connection
   * could silently stop the Part 11 ledger for the life of the process — the
   * exact failure mode this work exists to remove, one level up.
   */
  it('keeps retrying after a transient failure', async () => {
    let calls = 0;
    const flaky = {
      query: async (sql: string) => {
        calls += 1;
        if (calls <= 2) throw new Error('connection terminated unexpectedly');
        if (String(sql).includes('to_regclass')) return { rows: [{ present: true }] };
        if (String(sql).includes('has_table_privilege')) {
          return { rows: [{ role: 'app_service', can_insert: true }] };
        }
        return { rows: [] };
      },
    };

    const logger = new GatewayAuditLogger(flaky);
    await logger.log(entry); // fails transiently
    const afterFirst = calls;
    await logger.log(entry); // must try again, not stay latched off
    expect(calls).toBeGreaterThan(afterFirst);
  });

  it('stops re-probing once the table is known absent', async () => {
    let probes = 0;
    const empty = {
      query: async () => {
        probes += 1;
        return { rows: [{ present: false }] };
      },
    };

    const logger = new GatewayAuditLogger(empty);
    await logger.log(entry);
    const afterFirst = probes;
    await logger.log(entry);
    await logger.log(entry);
    expect(probes).toBe(afterFirst);
  });
});
